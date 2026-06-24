// Fee + slippage model used by the simulator broker so the "test" face
// reflects realistic execution costs.

export type FeeModel = {
  perShare: number; // commission per share
  minTicket: number; // minimum commission per order
  slippageBps: number; // basis points of adverse price movement
  secFeeBps: number; // SEC fee on sells (bps of notional)
};

export const DEFAULT_FEES: FeeModel = {
  perShare: 0.005,
  minTicket: 0,
  slippageBps: 2,
  secFeeBps: 0.08,
};

export function applySlippage(price: number, side: "buy" | "sell", model: FeeModel): number {
  const factor = model.slippageBps / 10_000;
  return side === "buy" ? price * (1 + factor) : price * (1 - factor);
}

export function commission(qty: number, notional: number, side: "buy" | "sell", model: FeeModel): number {
  let fee = Math.max(qty * model.perShare, model.minTicket);
  if (side === "sell") fee += (notional * model.secFeeBps) / 10_000;
  return Math.round(fee * 100) / 100;
}
