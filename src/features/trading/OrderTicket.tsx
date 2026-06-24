import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { usePlaceOrder } from "./hooks";
import { useMode } from "@/features/account/useProfile";
import { MODE_LABELS, type Side } from "@/lib/types";
import { formatUsd, cn } from "@/lib/utils";

export function OrderTicket({
  open,
  onClose,
  symbol,
  price,
  defaultSide = "buy",
  recommendationId,
  decisionId,
}: {
  open: boolean;
  onClose: () => void;
  symbol: string;
  price?: number;
  defaultSide?: Side;
  recommendationId?: string;
  decisionId?: string;
}) {
  const mode = useMode();
  const place = usePlaceOrder();
  const [side, setSide] = React.useState<Side>(defaultSide);
  const [qty, setQty] = React.useState("1");
  const [type, setType] = React.useState<"market" | "limit">("market");
  const [limit, setLimit] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setSide(defaultSide);
      setQty("1");
      setType("market");
      setLimit("");
    }
  }, [open, defaultSide]);

  const qtyNum = Number(qty) || 0;
  const ref = type === "limit" && Number(limit) ? Number(limit) : price ?? 0;
  const notional = qtyNum * ref;

  async function submit() {
    try {
      const res = await place.mutateAsync({
        symbol,
        side,
        qty: qtyNum,
        type,
        limit_price: type === "limit" ? Number(limit) : null,
        source: recommendationId ? "recommendation" : "manual",
        recommendation_id: recommendationId,
        decision_id: decisionId,
      });
      toast.success(`Order ${res.status}`, `${side.toUpperCase()} ${qtyNum} ${symbol} (${MODE_LABELS[mode]})`);
      onClose();
    } catch (e) {
      toast.error("Order failed", (e as Error).message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Trade ${symbol}`}>
      <div className="mb-4 flex items-center gap-2">
        <Badge variant={mode === "live" ? "down" : "accent"}>{MODE_LABELS[mode]} mode</Badge>
        {price != null && <span className="tnum text-sm text-[var(--color-muted)]">{formatUsd(price)}</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["buy", "sell"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              "rounded-lg border py-2 text-sm font-semibold capitalize transition-colors",
              side === s && s === "buy" && "border-[var(--color-up)]/50 bg-[var(--color-up)]/10 text-[var(--color-up)]",
              side === s && s === "sell" && "border-[var(--color-down)]/50 bg-[var(--color-down)]/10 text-[var(--color-down)]",
              side !== s && "border-[var(--color-border)] text-[var(--color-muted)]",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Quantity</Label>
          <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <Label>Order type</Label>
          <div className="flex gap-1 rounded-lg border border-[var(--color-border)] p-1">
            {(["market", "limit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 rounded-md py-1 text-xs font-medium capitalize",
                  type === t ? "bg-[var(--color-elevated)] text-[var(--color-fg)]" : "text-[var(--color-faint)]",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {type === "limit" && (
        <div className="mt-3">
          <Label>Limit price</Label>
          <Input type="number" min="0" step="any" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2.5 text-sm">
        <span className="text-[var(--color-muted)]">Est. notional</span>
        <span className="tnum font-medium">{formatUsd(notional)}</span>
      </div>

      <Button
        onClick={submit}
        disabled={place.isPending || qtyNum <= 0}
        variant={side === "buy" ? "success" : "danger"}
        size="lg"
        className="mt-4 w-full"
      >
        {place.isPending ? <Spinner /> : `${side === "buy" ? "Buy" : "Sell"} ${qtyNum || ""} ${symbol}`}
      </Button>
      <p className="mt-2 text-center text-[11px] text-[var(--color-faint)]">
        {mode === "sim"
          ? "Simulated fill with modeled fees & slippage."
          : mode === "paper"
            ? "Routed to Alpaca paper account."
            : "⚠ Real order with real money."}
      </p>
    </Modal>
  );
}
