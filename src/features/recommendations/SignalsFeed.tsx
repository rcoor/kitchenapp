import { Landmark, Activity, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common";
import { relativeTime } from "@/lib/utils";
import { useSignals } from "./hooks";
import type { Tables } from "@/lib/database.types";

function iconFor(kind: string) {
  if (kind === "senator_trade") return <Landmark className="h-4 w-4 text-[var(--color-accent)]" />;
  if (kind === "news") return <Newspaper className="h-4 w-4 text-[var(--color-accent)]" />;
  return <Activity className="h-4 w-4 text-[var(--color-accent)]" />;
}

export function SignalsFeed({ limit = 40 }: { limit?: number }) {
  const { data: signals, isLoading } = useSignals(limit);

  if (isLoading) return <div className="py-8 text-center text-sm text-[var(--color-muted)]">Loading signals…</div>;
  if (!signals?.length)
    return (
      <EmptyState
        title="No signals yet"
        description="Install and run a data source (e.g. US Senator Trades) to populate signals."
      />
    );

  return (
    <div className="space-y-1.5">
      {signals.map((s) => (
        <SignalRow key={s.id} s={s} />
      ))}
    </div>
  );
}

function SignalRow({ s }: { s: Tables<"signals"> }) {
  const payload = (s.payload ?? {}) as Record<string, unknown>;
  const who = payload.senator ? String(payload.senator) : null;
  const amount = payload.amount ? String(payload.amount) : null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-3.5 py-2.5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--color-elevated)]">
        {iconFor(s.signal_kind)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {s.symbol && <span className="font-medium">{s.symbol}</span>}
          {s.event_type && <Badge>{s.event_type}</Badge>}
        </div>
        <div className="truncate text-xs text-[var(--color-muted)]">
          {who ? `${who}` : s.skill_slug}
          {amount ? ` · ${amount}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-[var(--color-faint)]">
        {relativeTime(s.observed_at ?? s.created_at)}
      </div>
    </div>
  );
}
