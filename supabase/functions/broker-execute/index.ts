// Places an order through the resolved broker for the user's active mode,
// records the order + every lifecycle event, and updates positions on fill.
import { handleOptions, json } from "../_shared/cors.ts";
import { requireUser, adminClient } from "../_shared/auth.ts";
import { resolveBroker, type Mode, type Side } from "../_shared/broker.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const user = await requireUser(req);
    const db = adminClient();
    const body = await req.json();

    const symbol = String(body.symbol ?? "").toUpperCase();
    const side = body.side as Side;
    const qty = Number(body.qty);
    const type = (body.type ?? "market") as "market" | "limit";
    const limitPrice = body.limit_price != null ? Number(body.limit_price) : null;
    const source = (body.source ?? "manual") as "manual" | "recommendation" | "auto";

    if (!symbol || (side !== "buy" && side !== "sell") || !(qty > 0)) {
      return json({ error: "symbol, side (buy|sell) and qty>0 are required" }, 400);
    }

    // mode: explicit override or the user's active mode
    let mode = body.mode as Mode | undefined;
    if (!mode) {
      const { data: profile } = await db.from("profiles").select("active_mode").eq("id", user.id).single();
      mode = (profile?.active_mode as Mode) ?? "sim";
    }

    // create the order intent
    const { data: order, error: orderErr } = await db
      .from("orders")
      .insert({
        user_id: user.id,
        mode,
        symbol,
        side,
        type,
        qty,
        limit_price: limitPrice,
        source,
        status: "new",
        decision_id: body.decision_id ?? null,
        recommendation_id: body.recommendation_id ?? null,
      })
      .select()
      .single();
    if (orderErr || !order) return json({ error: orderErr?.message ?? "order insert failed" }, 500);

    await logEvent(db, order.id, user.id, "created", "new", { mode, symbol, side, qty, type });

    // resolve broker + submit
    const resolved = await resolveBroker(db, user.id, mode);
    if ("error" in resolved) {
      await db.from("orders").update({ status: "rejected" }).eq("id", order.id);
      await logEvent(db, order.id, user.id, "rejected", "rejected", { reason: resolved.error });
      return json({ error: resolved.error, order_id: order.id }, 422);
    }

    await logEvent(db, order.id, user.id, "submitted", "accepted", {});

    const fill = await resolveSubmit(resolved.adapter, { symbol, side, qty, type, limitPrice });

    await db
      .from("orders")
      .update({
        status: fill.status,
        broker_order_id: fill.brokerOrderId,
        filled_qty: fill.filledQty,
        filled_avg_price: fill.filledAvgPrice,
        fees: fill.fees,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await logEvent(db, order.id, user.id, fill.status === "filled" ? "fill" : fill.status, fill.status, {
      filled_qty: fill.filledQty,
      filled_avg_price: fill.filledAvgPrice,
      fees: fill.fees,
      broker_order_id: fill.brokerOrderId,
      raw: fill.raw,
    });

    if (fill.status === "rejected") {
      return json({ error: "Broker rejected the order", order_id: order.id, raw: fill.raw }, 422);
    }

    if (fill.filledQty > 0 && fill.filledAvgPrice) {
      await applyFill(db, user.id, mode, symbol, side, fill.filledQty, fill.filledAvgPrice);
    }

    if (order.recommendation_id) {
      await db
        .from("recommendations")
        .update({ status: "executed", order_id: order.id })
        .eq("id", order.recommendation_id);
    }

    return json({ ok: true, order_id: order.id, status: fill.status, fill });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: (e as Error).message }, 500);
  }
});

async function resolveSubmit(
  adapter: { submit: (r: { symbol: string; side: Side; qty: number; type: "market" | "limit"; limitPrice?: number | null }) => Promise<{ status: "filled" | "accepted" | "rejected"; brokerOrderId: string | null; filledQty: number; filledAvgPrice: number | null; fees: number; raw?: unknown }> },
  req: { symbol: string; side: Side; qty: number; type: "market" | "limit"; limitPrice: number | null },
) {
  return adapter.submit(req);
}

async function logEvent(
  db: ReturnType<typeof adminClient>,
  orderId: string,
  userId: string,
  eventType: string,
  status: string,
  payload: Record<string, unknown>,
) {
  await db.from("order_events").insert({
    order_id: orderId,
    user_id: userId,
    event_type: eventType,
    status,
    payload,
  });
}

async function applyFill(
  db: ReturnType<typeof adminClient>,
  userId: string,
  mode: Mode,
  symbol: string,
  side: Side,
  qty: number,
  price: number,
) {
  const { data: pos } = await db
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .eq("symbol", symbol)
    .maybeSingle();

  const prevQty = pos?.qty ?? 0;
  const prevAvg = pos?.avg_entry_price ?? 0;
  const delta = side === "buy" ? qty : -qty;
  const newQty = prevQty + delta;

  let newAvg = prevAvg;
  if (side === "buy") {
    newAvg = prevQty + qty > 0 ? (prevQty * prevAvg + qty * price) / (prevQty + qty) : price;
  } else if (newQty <= 0) {
    newAvg = 0;
  }

  if (Math.abs(newQty) < 1e-9) {
    if (pos) await db.from("positions").delete().eq("id", pos.id);
    return;
  }

  await db.from("positions").upsert(
    {
      user_id: userId,
      mode,
      symbol,
      qty: Math.round(newQty * 1e6) / 1e6,
      avg_entry_price: Math.round(newAvg * 100) / 100,
    },
    { onConflict: "user_id,mode,symbol" },
  );
}
