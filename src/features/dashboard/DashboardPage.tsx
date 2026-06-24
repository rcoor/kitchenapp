import * as React from "react";
import { Link } from "react-router-dom";
import { Wallet, Sparkles, Boxes, ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import { PageHeader, StatTile, EmptyState } from "@/components/common";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignalsFeed } from "@/features/recommendations/SignalsFeed";
import { usePositions, useOrders, useRealtimeRefresh } from "@/features/trading/hooks";
import { useWatchlist, useQuotes } from "@/features/markets/hooks";
import { useRecommendations } from "@/features/recommendations/hooks";
import { useMode } from "@/features/account/useProfile";
import { MODE_LABELS } from "@/lib/types";
import { formatUsd, formatPct, relativeTime, cn } from "@/lib/utils";

export function DashboardPage() {
  const mode = useMode();
  const { data: positions } = usePositions();
  const { data: orders } = useOrders(8);
  const { data: watchlist } = useWatchlist();
  const { data: recs } = useRecommendations(8);
  useRealtimeRefresh("positions", "positions");
  useRealtimeRefresh("orders", "orders");

  const posSymbols = (positions ?? []).map((p) => p.symbol);
  const wlSymbols = (watchlist ?? []).map((w) => w.symbol);
  const allSymbols = [...new Set([...posSymbols, ...wlSymbols])];
  const { data: quotes } = useQuotes(allSymbols);
  const quoteBySym = new Map((quotes ?? []).map((q) => [q.symbol, q]));

  const { marketValue, costBasis } = React.useMemo(() => {
    let mv = 0;
    let cb = 0;
    for (const p of positions ?? []) {
      const q = quoteBySym.get(p.symbol);
      mv += (q?.price ?? p.avg_entry_price) * p.qty;
      cb += p.avg_entry_price * p.qty;
    }
    return { marketValue: mv, costBasis: cb };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, quotes]);

  const pnl = marketValue - costBasis;
  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const pendingRecs = (recs ?? []).filter((r) => r.status === "pending");

  const movers = (watchlist ?? [])
    .map((w) => quoteBySym.get(w.symbol))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${MODE_LABELS[mode]} desk overview`}
        action={
          <Link to="/recommendations">
            <Button>
              <Sparkles className="h-4 w-4" /> Get recommendations
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Open positions" value={(positions ?? []).length} sub={`${MODE_LABELS[mode]} mode`} />
        <StatTile label="Market value" value={formatUsd(marketValue)} />
        <StatTile
          label="Unrealized P&L"
          value={formatUsd(pnl)}
          tone={pnl >= 0 ? "up" : "down"}
          sub={formatPct(pnlPct)}
        />
        <StatTile label="Pending calls" value={pendingRecs.length} sub="awaiting your action" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* positions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[var(--color-accent)]" /> Positions
            </CardTitle>
            <Link to="/markets" className="text-xs text-[var(--color-accent)] hover:underline">
              Markets →
            </Link>
          </CardHeader>
          {(positions ?? []).length === 0 ? (
            <EmptyState title="No positions" description={`Place a trade in ${MODE_LABELS[mode]} mode to open a position.`} />
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border-soft)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-2)] text-left text-[11px] uppercase text-[var(--color-faint)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Symbol</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Avg</th>
                    <th className="px-3 py-2 text-right font-medium">Last</th>
                    <th className="px-3 py-2 text-right font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {(positions ?? []).map((p) => {
                    const q = quoteBySym.get(p.symbol);
                    const last = q?.price ?? p.avg_entry_price;
                    const pl = (last - p.avg_entry_price) * p.qty;
                    return (
                      <tr key={p.id} className="border-t border-[var(--color-border-soft)]">
                        <td className="px-3 py-2.5 font-medium">{p.symbol}</td>
                        <td className="tnum px-3 py-2.5 text-right">{p.qty}</td>
                        <td className="tnum px-3 py-2.5 text-right text-[var(--color-muted)]">{formatUsd(p.avg_entry_price)}</td>
                        <td className="tnum px-3 py-2.5 text-right">{formatUsd(last)}</td>
                        <td className={cn("tnum px-3 py-2.5 text-right", pl >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]")}>
                          {formatUsd(pl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* movers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--color-accent)]" /> Watchlist movers
            </CardTitle>
          </CardHeader>
          {movers.length === 0 ? (
            <EmptyState title="No watchlist" description="Add tickers in Markets." />
          ) : (
            <div className="space-y-1.5">
              {movers.map((q) => (
                <div key={q!.symbol} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                  <span className="font-medium">{q!.symbol}</span>
                  <span className="tnum text-sm text-[var(--color-muted)]">{formatUsd(q!.price)}</span>
                  <span className={cn("tnum flex items-center gap-1 text-xs", q!.change >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]")}>
                    {q!.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {formatPct(q!.changePct)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* pending recommendations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--color-accent)]" /> Pending calls
            </CardTitle>
            <Link to="/recommendations" className="text-xs text-[var(--color-accent)] hover:underline">
              All →
            </Link>
          </CardHeader>
          {pendingRecs.length === 0 ? (
            <EmptyState title="Nothing pending" description="Generate recommendations to see calls here." />
          ) : (
            <div className="space-y-1.5">
              {pendingRecs.slice(0, 5).map((r) => (
                <Link
                  key={r.id}
                  to="/recommendations"
                  className="flex items-center justify-between rounded-lg border border-[var(--color-border-soft)] px-3 py-2"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant={r.action === "buy" ? "up" : r.action === "sell" ? "down" : "default"}>{r.action}</Badge>
                    <span className="font-medium">{r.symbol}</span>
                  </span>
                  <span className="text-xs text-[var(--color-faint)]">{Math.round((r.confidence ?? 0) * 100)}%</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* signals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-[var(--color-accent)]" /> Latest signals
            </CardTitle>
            <Link to="/sources" className="text-xs text-[var(--color-accent)] hover:underline">
              Sources →
            </Link>
          </CardHeader>
          <SignalsFeed limit={6} />
        </Card>

        {/* recent orders */}
        <Card>
          <CardHeader>
            <CardTitle>Recent orders</CardTitle>
            <Link to="/history" className="text-xs text-[var(--color-accent)] hover:underline">
              History →
            </Link>
          </CardHeader>
          {(orders ?? []).length === 0 ? (
            <EmptyState title="No orders" description="Your fills will appear here." />
          ) : (
            <div className="space-y-1.5">
              {(orders ?? []).map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant={o.side === "buy" ? "up" : "down"}>{o.side}</Badge>
                    <span className="tnum">{o.qty} {o.symbol}</span>
                  </span>
                  <span className="text-xs text-[var(--color-faint)]">{relativeTime(o.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
