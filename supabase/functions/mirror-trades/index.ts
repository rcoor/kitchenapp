// Copy-trading engine. For each enabled follow: refresh the user's congress
// signals, then mirror new disclosed buys/sells proportionally into sim/paper.
// Auth: a cron secret (service-role, processes all follows) OR a user JWT
// (processes only that user's follows, for manual sync).
import { handleOptions, json } from "../_shared/cors.ts";
import { requireUser, adminClient } from "../_shared/auth.ts";
import { resolveBroker, type Mode, type Side } from "../_shared/broker.ts";
import { getQuotes } from "../_shared/quotes.ts";
import { runPipeline, type Pipeline } from "../_shared/pipeline.ts";

type Db = ReturnType<typeof adminClient>;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const db = adminClient();

    // ---- authorize ----
    const cronSecret = req.headers.get("x-cron-secret");
    let scopeUserId: string | null = null;
    if (cronSecret) {
      const { data } = await db.from("app_secrets").select("value").eq("key", "cron_secret").single();
      if (!data || data.value !== cronSecret) return json({ error: "unauthorized" }, 401);
    } else {
      const user = await requireUser(req);
      scopeUserId = user.id;
    }

    let q = db.from("follows").select("*").eq("enabled", true);
    if (scopeUserId) q = q.eq("user_id", scopeUserId);
    const { data: follows } = await q;

    const userIds = [...new Set((follows ?? []).map((f) => f.user_id))];
    for (const uid of userIds) await refreshUserCongressSignals(db, uid);

    const results = [];
    for (const f of follows ?? []) results.push(await processFollow(db, f));

    return json({ ok: true, follows: (follows ?? []).length, results });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: (e as Error).message }, 500);
  }
});

function parseMidpoint(s: string | null): number | null {
  if (!s) return null;
  const nums = String(s).replace(/[$,]/g, "").match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map(Number);
  return vals.length === 1 ? vals[0] : (vals[0] + vals[1]) / 2;
}

async function refreshUserCongressSignals(db: Db, userId: string) {
  const { data: installs } = await db
    .from("data_source_installations")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true);

  for (const inst of installs ?? []) {
    const { data: skill } = await db.from("data_source_skills").select("*").eq("id", inst.skill_id).single();
    if (!skill || skill.signal_kind !== "senator_trade") continue;

    const config: Record<string, unknown> = {};
    for (const f of (skill.config_schema as Array<Record<string, unknown>>) ?? []) {
      if (f.default !== undefined) config[String(f.key)] = f.default;
    }
    Object.assign(config, (inst.config as Record<string, unknown>) ?? {});

    try {
      const result = await runPipeline(skill.pipeline as Pipeline, config, {
        signalKind: skill.signal_kind,
        allowCustomCode: skill.is_builtin || skill.author_id === userId,
      });
      const rows = result.signals
        .filter((s) => s.symbol)
        .map((s) => ({
          user_id: userId,
          installation_id: inst.id,
          skill_id: skill.id,
          skill_slug: skill.slug,
          signal_kind: s.signal_kind,
          symbol: s.symbol,
          event_type: s.event_type,
          observed_at: s.observed_at,
          numeric_value: s.numeric_value,
          confidence: s.confidence,
          payload: s.payload,
          dedupe_key: s.dedupe_key,
        }));
      if (rows.length) {
        await db.from("signals").upsert(rows, { onConflict: "installation_id,dedupe_key", ignoreDuplicates: true });
      }
      await db
        .from("data_source_installations")
        .update({ last_run_at: new Date().toISOString(), last_status: "ok", last_error: null })
        .eq("id", inst.id);
    } catch (e) {
      await db
        .from("data_source_installations")
        .update({ last_run_at: new Date().toISOString(), last_status: "error", last_error: (e as Error).message })
        .eq("id", inst.id);
    }
  }
}

type Follow = {
  id: string;
  user_id: string;
  member_name: string;
  allocation_usd: number;
  max_position_pct: number;
  scale_reference_usd: number;
  mode: Mode;
  mirror_buys: boolean;
  mirror_sells: boolean;
  deployed_usd: number;
};

async function processFollow(db: Db, follow: Follow) {
  const summary = { follow_id: follow.id, member: follow.member_name, buys: 0, sells: 0, skipped: 0, errors: 0 };

  const { data: existing } = await db.from("follow_trades").select("signal_id").eq("follow_id", follow.id);
  const seen = new Set((existing ?? []).map((r) => r.signal_id).filter(Boolean));

  const { data: sigs } = await db
    .from("signals")
    .select("*")
    .eq("user_id", follow.user_id)
    .eq("signal_kind", "senator_trade")
    .ilike("payload->>senator", `%${follow.member_name}%`)
    .order("observed_at", { ascending: true })
    .limit(400);

  let deployed = Number(follow.deployed_usd) || 0;
  const allocation = Number(follow.allocation_usd);
  const cap = allocation * (Number(follow.max_position_pct) / 100);
  const ref = Number(follow.scale_reference_usd) || 200000;

  for (const sig of sigs ?? []) {
    if (sig.id && seen.has(sig.id)) continue;
    const ev = String(sig.event_type ?? "").toLowerCase();
    const isBuy = ev.includes("purchase") || ev.includes("buy");
    const isSell = ev.includes("sale") || ev.includes("sell");
    const symbol: string | null = sig.symbol;
    if ((!isBuy && !isSell) || !symbol) continue;

    const amount = (sig.payload as Record<string, unknown>)?.amount
      ? String((sig.payload as Record<string, unknown>).amount)
      : null;
    const mid = parseMidpoint(amount);

    try {
      if (isBuy) {
        if (!follow.mirror_buys) {
          await record(db, follow, sig, "buy", amount, mid, null, null, null, null, "skipped", "buys disabled");
          summary.skipped++;
          continue;
        }
        const remaining = allocation - deployed;
        if (remaining <= 1) {
          await record(db, follow, sig, "buy", amount, mid, null, null, null, null, "skipped", "allocation exhausted");
          summary.skipped++;
          continue;
        }
        let target = mid ? allocation * (mid / ref) : allocation * 0.02;
        target = Math.min(target, cap, remaining);
        const [quote] = await getQuotes([symbol]);
        if (!quote?.price || target < 1) {
          await record(db, follow, sig, "buy", amount, mid, target, null, quote?.price ?? null, null, "skipped", "below minimum / no quote");
          summary.skipped++;
          continue;
        }
        const qty = Math.round((target / quote.price) * 10000) / 10000;
        if (qty <= 0) {
          await record(db, follow, sig, "buy", amount, mid, target, qty, quote.price, null, "skipped", "qty rounds to zero");
          summary.skipped++;
          continue;
        }
        const res = await placeOrder(db, follow.user_id, { mode: follow.mode, symbol, side: "buy", qty, followId: follow.id });
        const price = res.price ?? quote.price;
        const notional = price * qty;
        if (res.status === "rejected") {
          await record(db, follow, sig, "buy", amount, mid, notional, qty, price, res.order_id, "error", "broker rejected");
          summary.errors++;
        } else {
          deployed += notional;
          await record(db, follow, sig, "buy", amount, mid, notional, qty, price, res.order_id, "executed", null);
          summary.buys++;
        }
      } else {
        if (!follow.mirror_sells) {
          await record(db, follow, sig, "sell", amount, mid, null, null, null, null, "skipped", "sells disabled");
          summary.skipped++;
          continue;
        }
        const netQty = await followHolding(db, follow.id, symbol);
        if (netQty <= 0) {
          await record(db, follow, sig, "sell", amount, mid, null, null, null, null, "skipped", "no mirrored position to sell");
          summary.skipped++;
          continue;
        }
        const [quote] = await getQuotes([symbol]);
        const res = await placeOrder(db, follow.user_id, { mode: follow.mode, symbol, side: "sell", qty: netQty, followId: follow.id });
        const price = res.price ?? quote?.price ?? 0;
        const notional = price * netQty;
        if (res.status === "rejected") {
          await record(db, follow, sig, "sell", amount, mid, notional, netQty, price, res.order_id, "error", "broker rejected");
          summary.errors++;
        } else {
          deployed = Math.max(0, deployed - notional);
          await record(db, follow, sig, "sell", amount, mid, notional, netQty, price, res.order_id, "executed", null);
          summary.sells++;
        }
      }
    } catch (e) {
      await record(db, follow, sig, isBuy ? "buy" : "sell", amount, mid, null, null, null, null, "error", (e as Error).message.slice(0, 200));
      summary.errors++;
    }
  }

  await db
    .from("follows")
    .update({ deployed_usd: Math.round(deployed * 100) / 100, last_synced_at: new Date().toISOString() })
    .eq("id", follow.id);

  return summary;
}

async function followHolding(db: Db, followId: string, symbol: string): Promise<number> {
  const { data } = await db
    .from("follow_trades")
    .select("side,qty,status")
    .eq("follow_id", followId)
    .eq("symbol", symbol)
    .eq("status", "executed");
  let net = 0;
  for (const t of data ?? []) {
    if (t.qty == null) continue;
    net += t.side === "buy" ? Number(t.qty) : -Number(t.qty);
  }
  return Math.round(net * 10000) / 10000;
}

// deno-lint-ignore no-explicit-any
async function record(db: Db, follow: Follow, sig: any, side: Side, amount: string | null, mid: number | null, notional: number | null, qty: number | null, price: number | null, orderId: string | null, status: string, reason: string | null) {
  await db.from("follow_trades").insert({
    follow_id: follow.id,
    user_id: follow.user_id,
    signal_id: sig.id ?? null,
    member_name: follow.member_name,
    symbol: sig.symbol,
    side,
    rep_amount: amount,
    rep_midpoint: mid,
    target_notional: notional,
    qty,
    price,
    order_id: orderId,
    status,
    reason,
  });
}

async function placeOrder(
  db: Db,
  userId: string,
  p: { mode: Mode; symbol: string; side: Side; qty: number; followId: string },
): Promise<{ order_id: string; status: string; price: number | null }> {
  const { data: order } = await db
    .from("orders")
    .insert({ user_id: userId, mode: p.mode, symbol: p.symbol, side: p.side, type: "market", qty: p.qty, source: "auto", status: "new" })
    .select()
    .single();
  await logEvent(db, order!.id, userId, "created", "new", { follow_id: p.followId });

  const resolved = await resolveBroker(db, userId, p.mode);
  if ("error" in resolved) {
    await db.from("orders").update({ status: "rejected" }).eq("id", order!.id);
    await logEvent(db, order!.id, userId, "rejected", "rejected", { reason: resolved.error });
    return { order_id: order!.id, status: "rejected", price: null };
  }
  await logEvent(db, order!.id, userId, "submitted", "accepted", {});
  const fill = await resolved.adapter.submit({ symbol: p.symbol, side: p.side, qty: p.qty, type: "market", limitPrice: null });
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
    .eq("id", order!.id);
  await logEvent(db, order!.id, userId, fill.status === "filled" ? "fill" : fill.status, fill.status, {
    filled_qty: fill.filledQty,
    filled_avg_price: fill.filledAvgPrice,
    fees: fill.fees,
  });
  if (fill.filledQty > 0 && fill.filledAvgPrice) {
    await applyFill(db, userId, p.mode, p.symbol, p.side, fill.filledQty, fill.filledAvgPrice);
  }
  return { order_id: order!.id, status: fill.status, price: fill.filledAvgPrice };
}

async function logEvent(db: Db, orderId: string, userId: string, eventType: string, status: string, payload: Record<string, unknown>) {
  await db.from("order_events").insert({ order_id: orderId, user_id: userId, event_type: eventType, status, payload });
}

async function applyFill(db: Db, userId: string, mode: Mode, symbol: string, side: Side, qty: number, price: number) {
  const { data: pos } = await db
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .eq("symbol", symbol)
    .maybeSingle();
  const prevQty = pos?.qty ?? 0;
  const prevAvg = pos?.avg_entry_price ?? 0;
  const newQty = prevQty + (side === "buy" ? qty : -qty);
  let newAvg = prevAvg;
  if (side === "buy") newAvg = prevQty + qty > 0 ? (prevQty * prevAvg + qty * price) / (prevQty + qty) : price;
  else if (newQty <= 0) newAvg = 0;

  if (Math.abs(newQty) < 1e-9) {
    if (pos) await db.from("positions").delete().eq("id", pos.id);
    return;
  }
  await db.from("positions").upsert(
    { user_id: userId, mode, symbol, qty: Math.round(newQty * 1e6) / 1e6, avg_entry_price: Math.round(newAvg * 100) / 100 },
    { onConflict: "user_id,mode,symbol" },
  );
}
