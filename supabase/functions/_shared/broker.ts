// Broker adapters behind one interface. SimBroker fills locally with a fee
// model; AlpacaBroker submits to Alpaca's paper or live endpoint.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getQuotes } from "./quotes.ts";
import { DEFAULT_FEES, applySlippage, commission } from "./fees.ts";

export type Mode = "sim" | "paper" | "live";
export type Side = "buy" | "sell";

export type OrderRequest = {
  symbol: string;
  side: Side;
  qty: number;
  type: "market" | "limit";
  limitPrice?: number | null;
};

export type FillResult = {
  status: "filled" | "accepted" | "rejected";
  brokerOrderId: string | null;
  filledQty: number;
  filledAvgPrice: number | null;
  fees: number;
  raw?: unknown;
};

export interface BrokerAdapter {
  submit(req: OrderRequest): Promise<FillResult>;
}

export class SimBroker implements BrokerAdapter {
  async submit(req: OrderRequest): Promise<FillResult> {
    const [quote] = await getQuotes([req.symbol]);
    if (!quote) return { status: "rejected", brokerOrderId: null, filledQty: 0, filledAvgPrice: null, fees: 0 };
    const ref = req.type === "limit" && req.limitPrice ? req.limitPrice : quote.price;
    const fill = applySlippage(ref, req.side, DEFAULT_FEES);
    const notional = fill * req.qty;
    const fees = commission(req.qty, notional, req.side, DEFAULT_FEES);
    return {
      status: "filled",
      brokerOrderId: `sim_${crypto.randomUUID()}`,
      filledQty: req.qty,
      filledAvgPrice: Math.round(fill * 100) / 100,
      fees,
      raw: { ref, slippageApplied: true },
    };
  }
}

export class AlpacaBroker implements BrokerAdapter {
  constructor(
    private key: string,
    private secret: string,
    private mode: "paper" | "live",
  ) {}

  private base() {
    return this.mode === "live"
      ? "https://api.alpaca.markets"
      : "https://paper-api.alpaca.markets";
  }

  async submit(req: OrderRequest): Promise<FillResult> {
    const res = await fetch(`${this.base()}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": this.key,
        "APCA-API-SECRET-KEY": this.secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: req.symbol,
        qty: req.qty,
        side: req.side,
        type: req.type,
        time_in_force: "day",
        ...(req.type === "limit" ? { limit_price: req.limitPrice } : {}),
      }),
    });
    const raw = await res.json();
    if (!res.ok) {
      return {
        status: "rejected",
        brokerOrderId: null,
        filledQty: 0,
        filledAvgPrice: null,
        fees: 0,
        raw,
      };
    }
    const filledQty = Number(raw.filled_qty ?? 0);
    return {
      status: filledQty > 0 ? "filled" : "accepted",
      brokerOrderId: raw.id ?? null,
      filledQty,
      filledAvgPrice: raw.filled_avg_price ? Number(raw.filled_avg_price) : null,
      fees: 0, // Alpaca US equities are commission-free
      raw,
    };
  }
}

/** Resolve a broker adapter for a user + mode, sourcing keys from Vault or env. */
export async function resolveBroker(
  db: SupabaseClient,
  userId: string,
  mode: Mode,
): Promise<{ adapter: BrokerAdapter } | { error: string }> {
  if (mode === "sim") return { adapter: new SimBroker() };

  // per-user keys from Vault
  const { data: acct } = await db
    .from("broker_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("broker", "alpaca")
    .eq("mode", mode)
    .eq("is_active", true)
    .maybeSingle();

  let key: string | null = null;
  let secret: string | null = null;

  if (acct?.key_secret_id && acct?.secret_secret_id) {
    const { data: k } = await db.rpc("vault_reveal_secret", { p_id: acct.key_secret_id });
    const { data: s } = await db.rpc("vault_reveal_secret", { p_id: acct.secret_secret_id });
    key = k as string | null;
    secret = s as string | null;
  }

  // fall back to global env keys for paper convenience
  if ((!key || !secret) && mode === "paper") {
    key = Deno.env.get("ALPACA_API_KEY") ?? null;
    secret = Deno.env.get("ALPACA_API_SECRET") ?? null;
  }

  if (!key || !secret) {
    return {
      error:
        mode === "live"
          ? "No live Alpaca keys connected. Connect live keys in Settings to trade live."
          : "No paper Alpaca keys connected. Connect keys in Settings (or use Simulator mode).",
    };
  }

  return { adapter: new AlpacaBroker(key, secret, mode) };
}
