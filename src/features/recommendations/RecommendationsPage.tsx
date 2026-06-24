import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles, Check, X, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/common";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { SignalsFeed } from "./SignalsFeed";
import { OrderTicket } from "@/features/trading/OrderTicket";
import { useRecommendations, useGenerateRecommendations, useDismissRecommendation } from "./hooks";
import { useRealtimeRefresh } from "@/features/trading/hooks";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";
import type { Action } from "@/lib/types";

const actionMeta: Record<Action, { variant: "up" | "down" | "default"; icon: React.ReactNode; label: string }> = {
  buy: { variant: "up", icon: <ArrowUpRight className="h-3.5 w-3.5" />, label: "Buy" },
  sell: { variant: "down", icon: <ArrowDownRight className="h-3.5 w-3.5" />, label: "Sell" },
  hold: { variant: "default", icon: <Minus className="h-3.5 w-3.5" />, label: "Hold" },
};

export function RecommendationsPage() {
  const { data: recs, isLoading } = useRecommendations();
  const generate = useGenerateRecommendations();
  useRealtimeRefresh("recommendations", "recommendations");
  useRealtimeRefresh("signals", "signals");

  async function run() {
    try {
      const res = await generate.mutateAsync(undefined);
      toast.success("Analysis complete", `Reasoned with ${res.model}.`);
    } catch (e) {
      toast.error("Could not generate", (e as Error).message);
    }
  }

  const pending = (recs ?? []).filter((r) => r.status === "pending");
  const resolved = (recs ?? []).filter((r) => r.status !== "pending");

  return (
    <div>
      <PageHeader
        title="Signals & AI"
        subtitle="Generate reasoned buy/sell calls over your watchlist and alternative signals."
        action={
          <Button onClick={run} disabled={generate.isPending}>
            {generate.isPending ? <Spinner /> : <Sparkles className="h-4 w-4" />}
            Generate recommendations
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : pending.length === 0 && resolved.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title="No recommendations yet"
              description="Add tickers to your watchlist, then generate AI recommendations."
              action={
                <Button onClick={run} disabled={generate.isPending}>
                  {generate.isPending ? <Spinner /> : "Generate now"}
                </Button>
              }
            />
          ) : (
            <>
              {pending.map((r) => (
                <RecommendationCard key={r.id} rec={r} />
              ))}
              {resolved.length > 0 && (
                <div className="pt-2">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">
                    Resolved
                  </div>
                  <div className="space-y-2">
                    {resolved.map((r) => (
                      <RecommendationCard key={r.id} rec={r} compact />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Live signal feed</CardTitle>
            </CardHeader>
            <SignalsFeed limit={30} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({ rec, compact }: { rec: Tables<"recommendations">; compact?: boolean }) {
  const dismiss = useDismissRecommendation();
  const [ticketOpen, setTicketOpen] = React.useState(false);
  const meta = actionMeta[rec.action as Action];
  const conf = Math.round((rec.confidence ?? 0) * 100);
  const supporting = (rec.supporting_signals ?? []) as string[];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn(compact && "p-4")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-elevated)] font-semibold">
              {rec.symbol}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={meta.variant}>
                  {meta.icon}
                  {meta.label}
                </Badge>
                <span className="text-xs text-[var(--color-muted)]">{conf}% confidence</span>
                {rec.status !== "pending" && (
                  <Badge variant={rec.status === "executed" ? "accent" : "default"}>{rec.status}</Badge>
                )}
              </div>
              {!compact && (
                <div className="mt-0.5 h-1.5 w-32 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      rec.action === "buy" ? "bg-[var(--color-up)]" : rec.action === "sell" ? "bg-[var(--color-down)]" : "bg-[var(--color-faint)]",
                    )}
                    style={{ width: `${conf}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {rec.status === "pending" && rec.action !== "hold" && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => dismiss.mutate(rec.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={rec.action === "buy" ? "success" : "danger"} onClick={() => setTicketOpen(true)}>
                <Check className="h-3.5 w-3.5" /> Accept
              </Button>
            </div>
          )}
        </div>

        {!compact && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">{rec.rationale}</p>
            {supporting.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {supporting.map((s, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <OrderTicket
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        symbol={rec.symbol}
        defaultSide={rec.action === "sell" ? "sell" : "buy"}
        recommendationId={rec.id}
        decisionId={rec.decision_id}
      />
    </motion.div>
  );
}
