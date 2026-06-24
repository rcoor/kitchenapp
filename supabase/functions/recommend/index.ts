// Produces buy/sell/hold recommendations for the user's watchlist. Freezes the
// exact inputs into a signal_snapshot, reasons with Claude (structured output),
// and persists an immutable decision plus normalized recommendations. Falls
// back to a transparent heuristic when ANTHROPIC_API_KEY is not configured.
import { handleOptions, json } from "../_shared/cors.ts";
import { requireUser, adminClient } from "../_shared/auth.ts";
import { getQuotes } from "../_shared/quotes.ts";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-4-8";

type Rec = {
  symbol: string;
  action: "buy" | "sell" | "hold";
  confidence: number;
  target_qty?: number;
  rationale: string;
  supporting_signals: string[];
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const user = await requireUser(req);
    const db = adminClient();
    const body = await req.json().catch(() => ({}));

    const { data: profile } = await db.from("profiles").select("active_mode").eq("id", user.id).single();
    const mode = (profile?.active_mode as string) ?? "sim";

    // resolve target symbols (request override or the watchlist)
    let symbols: string[] = (body.symbols ?? []).map((s: string) => s.toUpperCase());
    if (symbols.length === 0) {
      const { data: wl } = await db.from("watchlist_items").select("symbol").eq("user_id", user.id);
      symbols = (wl ?? []).map((w) => w.symbol.toUpperCase());
    }
    if (symbols.length === 0) {
      return json({ error: "Add symbols to your watchlist first." }, 400);
    }

    // freeze inputs
    const quotes = await getQuotes(symbols);
    const { data: signalRows } = await db
      .from("signals")
      .select("symbol,signal_kind,event_type,numeric_value,observed_at,payload,skill_slug")
      .eq("user_id", user.id)
      .in("symbol", symbols)
      .order("observed_at", { ascending: false })
      .limit(120);

    const pricesObj: Record<string, unknown> = {};
    for (const q of quotes) pricesObj[q.symbol] = q;

    const { data: snapshot } = await db
      .from("signal_snapshots")
      .insert({
        user_id: user.id,
        mode,
        prices: pricesObj,
        signals: signalRows ?? [],
        meta: { symbols, signal_count: signalRows?.length ?? 0, source: quotes[0]?.source ?? "synthetic" },
      })
      .select()
      .single();

    // reason
    const { recommendations, model, prompt, system } = await reason(symbols, quotes, signalRows ?? []);

    // persist immutable decision
    const { data: decision, error: decErr } = await db
      .from("decisions")
      .insert({
        user_id: user.id,
        mode,
        symbols,
        model,
        system_prompt: system,
        prompt,
        response: { recommendations },
        signal_snapshot_id: snapshot?.id ?? null,
      })
      .select()
      .single();
    if (decErr || !decision) return json({ error: decErr?.message ?? "decision insert failed" }, 500);

    const recRows = recommendations.map((r) => ({
      user_id: user.id,
      decision_id: decision.id,
      symbol: r.symbol.toUpperCase(),
      action: r.action,
      confidence: r.confidence,
      target_qty: r.target_qty ?? null,
      rationale: r.rationale,
      supporting_signals: r.supporting_signals ?? [],
      status: "pending",
    }));
    if (recRows.length) await db.from("recommendations").insert(recRows);

    return json({ ok: true, decision_id: decision.id, model, recommendations });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: (e as Error).message }, 500);
  }
});

async function reason(
  symbols: string[],
  quotes: Awaited<ReturnType<typeof getQuotes>>,
  signals: Array<Record<string, unknown>>,
): Promise<{ recommendations: Rec[]; model: string; prompt: string; system: string }> {
  const system =
    "You are a disciplined equities analyst. Given live quotes and alternative signals " +
    "(including US senator trades), produce a concise buy/sell/hold call per symbol. Be " +
    "conservative: prefer 'hold' when evidence is weak. Confidence is 0..1. Cite the specific " +
    "signals you used. You are not a fiduciary; this is informational.";

  const prompt = buildPrompt(symbols, quotes, signals);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!apiKey) {
    return { recommendations: heuristic(symbols, quotes, signals), model: "heuristic-v1", prompt, system };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            name: "submit_recommendations",
            description: "Return one recommendation per symbol.",
            input_schema: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      symbol: { type: "string" },
                      action: { type: "string", enum: ["buy", "sell", "hold"] },
                      confidence: { type: "number" },
                      target_qty: { type: "number" },
                      rationale: { type: "string" },
                      supporting_signals: { type: "array", items: { type: "string" } },
                    },
                    required: ["symbol", "action", "confidence", "rationale"],
                  },
                },
              },
              required: ["recommendations"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "submit_recommendations" },
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const toolUse = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
    const recs = (toolUse?.input?.recommendations ?? []) as Rec[];
    if (!recs.length) throw new Error("no recommendations returned");
    return { recommendations: recs, model: MODEL, prompt, system };
  } catch (e) {
    // transparent fallback — record that we degraded to heuristic
    return {
      recommendations: heuristic(symbols, quotes, signals),
      model: `heuristic-v1 (fallback: ${(e as Error).message.slice(0, 120)})`,
      prompt,
      system,
    };
  }
}

function buildPrompt(
  symbols: string[],
  quotes: Awaited<ReturnType<typeof getQuotes>>,
  signals: Array<Record<string, unknown>>,
): string {
  const qLines = quotes
    .map((q) => `- ${q.symbol}: $${q.price} (${q.changePct >= 0 ? "+" : ""}${q.changePct}% today)`)
    .join("\n");
  const sLines = signals
    .slice(0, 60)
    .map((s) => {
      const p = (s.payload ?? {}) as Record<string, unknown>;
      const who = p.senator ? ` by ${p.senator}` : "";
      const amt = p.amount ? ` ${p.amount}` : "";
      return `- [${s.skill_slug}] ${s.symbol}: ${s.event_type}${who}${amt} @ ${s.observed_at ?? "?"}`;
    })
    .join("\n");
  return [
    `Symbols under consideration: ${symbols.join(", ")}`,
    ``,
    `Live quotes:\n${qLines || "(none)"}`,
    ``,
    `Recent alternative signals:\n${sLines || "(no alternative signals ingested yet)"}`,
    ``,
    `Give one recommendation per symbol via the submit_recommendations tool.`,
  ].join("\n");
}

// Transparent rule-based fallback so the flow works without an API key.
function heuristic(
  symbols: string[],
  quotes: Awaited<ReturnType<typeof getQuotes>>,
  signals: Array<Record<string, unknown>>,
): Rec[] {
  const qBySym = new Map(quotes.map((q) => [q.symbol, q]));
  return symbols.map((sym) => {
    const q = qBySym.get(sym);
    const symSignals = signals.filter((s) => s.symbol === sym);
    const buys = symSignals.filter((s) =>
      String(s.event_type ?? "").toLowerCase().includes("purchase"),
    ).length;
    const sells = symSignals.filter((s) =>
      String(s.event_type ?? "").toLowerCase().includes("sale"),
    ).length;
    const momentum = q?.changePct ?? 0;

    let action: Rec["action"] = "hold";
    let confidence = 0.4;
    const reasons: string[] = [];
    if (buys > sells) {
      action = "buy";
      confidence = Math.min(0.85, 0.5 + 0.1 * (buys - sells));
      reasons.push(`${buys} senator purchase signal(s) vs ${sells} sale(s)`);
    } else if (sells > buys) {
      action = "sell";
      confidence = Math.min(0.85, 0.5 + 0.1 * (sells - buys));
      reasons.push(`${sells} senator sale signal(s) vs ${buys} purchase(s)`);
    } else {
      reasons.push("no decisive alternative signal");
    }
    if (momentum > 1.5 && action === "buy") confidence = Math.min(0.9, confidence + 0.05);
    reasons.push(`intraday move ${momentum >= 0 ? "+" : ""}${momentum}%`);

    return {
      symbol: sym,
      action,
      confidence: Math.round(confidence * 100) / 100,
      rationale: `Rule-based: ${reasons.join("; ")}.`,
      supporting_signals: symSignals
        .slice(0, 4)
        .map((s) => `${s.event_type} (${s.skill_slug})`),
    };
  });
}
