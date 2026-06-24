import * as React from "react";
import { History, Brain, Receipt, Clock, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useDecisions, useDecisionDetail, useOrderEvents } from "./hooks";
import { useOrders } from "@/features/trading/hooks";
import { formatUsd, relativeTime, cn } from "@/lib/utils";

type Tab = "decisions" | "orders";

export function HistoryPage() {
  const [tab, setTab] = React.useState<Tab>("decisions");
  const [decisionId, setDecisionId] = React.useState<string | null>(null);
  const [orderId, setOrderId] = React.useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="History"
        subtitle="Every decision and order is recorded immutably. Open one to travel back to exactly what happened."
      />

      <div className="mb-4 flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        {(["decisions", "orders"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-[var(--color-elevated)] text-[var(--color-fg)]" : "text-[var(--color-faint)]",
            )}
          >
            {t === "decisions" ? <Brain className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
            {t}
          </button>
        ))}
      </div>

      {tab === "decisions" ? (
        <DecisionsList onOpen={setDecisionId} />
      ) : (
        <OrdersList onOpen={setOrderId} />
      )}

      <DecisionDetailModal decisionId={decisionId} onClose={() => setDecisionId(null)} />
      <OrderDetailModal orderId={orderId} onClose={() => setOrderId(null)} />
    </div>
  );
}

function DecisionsList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: decisions, isLoading } = useDecisions();
  if (isLoading) return <Centered />;
  if (!decisions?.length)
    return <EmptyState icon={<History className="h-6 w-6" />} title="No decisions yet" description="Generate AI recommendations to create your first decision record." />;

  return (
    <div className="space-y-2">
      {decisions.map((d) => {
        const recs = (d.response as { recommendations?: unknown[] })?.recommendations ?? [];
        return (
          <button
            key={d.id}
            onClick={() => onOpen(d.id)}
            className="group flex w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 text-left transition-colors hover:border-[var(--color-accent)]/40"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-elevated)] text-[var(--color-accent)]">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{(d.symbols ?? []).join(", ") || "—"}</span>
                  <Badge>{recs.length} call(s)</Badge>
                  <Badge variant="accent">{d.mode}</Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-faint)]">
                  <Clock className="h-3 w-3" /> {relativeTime(d.created_at)} · {d.model}
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--color-faint)] transition-transform group-hover:translate-x-0.5" />
          </button>
        );
      })}
    </div>
  );
}

function OrdersList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: orders, isLoading } = useOrders(100);
  if (isLoading) return <Centered />;
  if (!orders?.length)
    return <EmptyState icon={<Receipt className="h-6 w-6" />} title="No orders yet" description="Place a trade to see it recorded here." />;

  return (
    <div className="space-y-2">
      {orders.map((o) => (
        <button
          key={o.id}
          onClick={() => onOpen(o.id)}
          className="group flex w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left transition-colors hover:border-[var(--color-accent)]/40"
        >
          <div className="flex items-center gap-3">
            <Badge variant={o.side === "buy" ? "up" : "down"}>{o.side}</Badge>
            <span className="tnum font-medium">
              {o.qty} {o.symbol}
            </span>
            <span className="text-xs text-[var(--color-faint)]">
              {o.filled_avg_price ? `@ ${formatUsd(o.filled_avg_price)}` : o.type}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
            <span className="text-xs text-[var(--color-faint)]">{relativeTime(o.created_at)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function DecisionDetailModal({ decisionId, onClose }: { decisionId: string | null; onClose: () => void }) {
  const { data, isLoading } = useDecisionDetail(decisionId);

  return (
    <Modal open={!!decisionId} onClose={onClose} title="Decision record" className="max-w-2xl">
      {isLoading || !data?.decision ? (
        <Centered />
      ) : (
        <div className="max-h-[64vh] space-y-4 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">{data.decision.model}</Badge>
            <Badge>{data.decision.mode}</Badge>
            <span className="text-xs text-[var(--color-faint)]">{relativeTime(data.decision.created_at)}</span>
          </div>

          <Section title="Recommendations">
            <div className="space-y-2">
              {data.recommendations.map((r) => (
                <div key={r.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.action === "buy" ? "up" : r.action === "sell" ? "down" : "default"}>{r.action}</Badge>
                    <span className="font-medium">{r.symbol}</span>
                    <span className="text-xs text-[var(--color-muted)]">{Math.round((r.confidence ?? 0) * 100)}%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--color-muted)]">{r.rationale}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Frozen inputs — prices (${Object.keys((data.snapshot?.prices as object) ?? {}).length})`}>
            <CodeBlock value={data.snapshot?.prices ?? {}} />
          </Section>

          <Section title={`Frozen inputs — signals (${((data.snapshot?.signals as unknown[]) ?? []).length})`}>
            <CodeBlock value={data.snapshot?.signals ?? []} />
          </Section>

          <Section title="Prompt sent to the model">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--color-surface-2)] p-3 text-[11px] text-[var(--color-muted)]">
              {data.decision.prompt}
            </pre>
          </Section>
        </div>
      )}
    </Modal>
  );
}

function OrderDetailModal({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { data: events, isLoading } = useOrderEvents(orderId);
  return (
    <Modal open={!!orderId} onClose={onClose} title="Order lifecycle" className="max-w-xl">
      {isLoading ? (
        <Centered />
      ) : (
        <div className="max-h-[60vh] space-y-0 overflow-y-auto">
          {(events ?? []).map((e, i) => (
            <div key={e.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
                {i < (events?.length ?? 0) - 1 && <div className="w-px flex-1 bg-[var(--color-border)]" />}
              </div>
              <div className="pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">{e.event_type}</span>
                  {e.status && <Badge>{e.status}</Badge>}
                </div>
                <div className="text-[11px] text-[var(--color-faint)]">{new Date(e.created_at).toLocaleString()}</div>
                {Object.keys((e.payload as object) ?? {}).length > 0 && <CodeBlock value={e.payload} small />}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">{title}</div>
      {children}
    </div>
  );
}

function CodeBlock({ value, small }: { value: unknown; small?: boolean }) {
  return (
    <pre
      className={cn(
        "mt-1 max-h-44 overflow-auto rounded-lg bg-[var(--color-surface-2)] p-3 text-[var(--color-muted)]",
        small ? "text-[10px]" : "text-[11px]",
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function statusVariant(status: string): "up" | "down" | "warn" | "default" {
  if (status === "filled") return "up";
  if (status === "rejected" || status === "error" || status === "canceled") return "down";
  if (status === "new" || status === "accepted" || status === "partially_filled") return "warn";
  return "default";
}

function Centered() {
  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}
