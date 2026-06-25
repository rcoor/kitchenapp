import * as React from "react";
import { Landmark, Activity, Newspaper, Building2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { relativeTime } from "@/lib/utils";
import { useSignals, useParsePtr } from "./hooks";
import type { Tables } from "@/lib/database.types";

function iconFor(kind: string) {
  if (kind === "senator_trade") return <Landmark className="h-4 w-4 text-[var(--color-accent)]" />;
  if (kind === "house_disclosure" || kind === "house_trade") return <Building2 className="h-4 w-4 text-[var(--color-accent)]" />;
  if (kind === "news") return <Newspaper className="h-4 w-4 text-[var(--color-accent)]" />;
  return <Activity className="h-4 w-4 text-[var(--color-accent)]" />;
}

export function SignalsFeed({ limit = 40 }: { limit?: number }) {
  const { data: signals, isLoading } = useSignals(limit);
  const [selected, setSelected] = React.useState<Tables<"signals"> | null>(null);

  if (isLoading) return <div className="py-8 text-center text-sm text-[var(--color-muted)]">Loading signals…</div>;
  if (!signals?.length)
    return (
      <EmptyState
        title="No signals yet"
        description="Install and run a data source (e.g. US Senator Trades) to populate signals."
      />
    );

  return (
    <>
      <div className="space-y-1.5">
        {signals.map((s) => (
          <SignalRow key={s.id} s={s} onOpen={setSelected} />
        ))}
      </div>
      <PtrTradesModal signal={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function SignalRow({ s, onOpen }: { s: Tables<"signals">; onOpen: (s: Tables<"signals">) => void }) {
  const payload = (s.payload ?? {}) as Record<string, unknown>;
  const who = payload.senator
    ? String(payload.senator)
    : payload.representative
    ? String(payload.representative)
    : null;
  const amount = payload.amount ? String(payload.amount) : null;
  // House filings carry a link to the official PTR PDF — make those rows drill in.
  const hasPtr = !!payload.doc_url;

  return (
    <div
      onClick={hasPtr ? () => onOpen(s) : undefined}
      className={
        "flex items-center gap-3 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-3.5 py-2.5" +
        (hasPtr ? " cursor-pointer transition-colors hover:bg-[var(--color-elevated)]/50" : "")
      }
    >
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
      <div className="flex shrink-0 items-center gap-2 text-right text-[11px] text-[var(--color-faint)]">
        {relativeTime(s.observed_at ?? s.created_at)}
        {hasPtr && <ChevronRight className="h-4 w-4 text-[var(--color-muted)]" />}
      </div>
    </div>
  );
}

// Drill-down: parse the clicked filing's PTR PDF and list its trades.
function PtrTradesModal({ signal, onClose }: { signal: Tables<"signals"> | null; onClose: () => void }) {
  const payload = (signal?.payload ?? {}) as Record<string, unknown>;
  const docUrl = payload.doc_url ? String(payload.doc_url) : null;
  const who = payload.representative ? String(payload.representative) : signal?.skill_slug ?? "";
  const { data, isLoading, error } = useParsePtr(signal ? docUrl : null);

  return (
    <Modal open={!!signal} onClose={onClose} title="Periodic Transaction Report" className="max-w-xl">
      {signal && (
        <div className="space-y-3">
          <div className="text-sm text-[var(--color-muted)]">
            {who}
            {signal.observed_at ? ` · ${new Date(signal.observed_at).toLocaleDateString()}` : ""}
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-muted)]">
              <Spinner /> Reading the PTR PDF…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-[var(--color-down)]/30 bg-[var(--color-down)]/5 px-3 py-2 text-sm text-[var(--color-down)]">
              Couldn’t parse this PTR: {(error as Error).message}
            </div>
          )}

          {data && !isLoading && data.trades.length === 0 && (
            <div className="text-sm text-[var(--color-muted)]">
              No stock trades parsed from this filing — it may hold non-equity assets (funds, real
              estate) or be a scanned PDF. Use the official PDF below.
            </div>
          )}

          {data && data.trades.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border-soft)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-2)] text-left text-[11px] uppercase text-[var(--color-faint)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Ticker</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trades.map((t, i) => (
                    <tr key={i} className="border-t border-[var(--color-border-soft)]">
                      <td className="px-3 py-2 font-medium">{t.ticker}</td>
                      <td className="px-3 py-2">
                        <Badge variant={t.type === "purchase" ? "up" : t.type === "sale" ? "down" : "default"}>
                          {t.type ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-muted)]">{t.txnDate ?? "—"}</td>
                      <td className="tnum px-3 py-2 text-right">{t.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-[var(--color-accent)] hover:underline"
            >
              Open official PTR PDF ↗
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}
