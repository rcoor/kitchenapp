import * as React from "react";
import { Plus, X, TrendingUp, TrendingDown, Search } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { PriceChart } from "./PriceChart";
import { OrderTicket } from "@/features/trading/OrderTicket";
import { useWatchlist, useWatchlistMutations, useQuotes, useCandles } from "./hooks";
import { formatUsd, formatPct, cn } from "@/lib/utils";
import type { Quote } from "@/lib/types";

export function MarketsPage() {
  const { data: watchlist, isLoading } = useWatchlist();
  const { add, remove } = useWatchlistMutations();
  const symbols = (watchlist ?? []).map((w) => w.symbol);
  const { data: quotes } = useQuotes(symbols);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [ticketOpen, setTicketOpen] = React.useState(false);

  React.useEffect(() => {
    if (!selected && symbols.length) setSelected(symbols[0]);
  }, [symbols, selected]);

  const quoteBySym = new Map((quotes ?? []).map((q) => [q.symbol, q]));
  const selectedQuote = selected ? quoteBySym.get(selected) : undefined;
  const { data: candles, isLoading: candlesLoading } = useCandles(selected);

  async function addSymbol(e: React.FormEvent) {
    e.preventDefault();
    const sym = input.toUpperCase().trim();
    if (!sym) return;
    try {
      await add.mutateAsync(sym);
      setInput("");
      setSelected(sym);
    } catch (err) {
      toast.error("Could not add", (err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Markets"
        subtitle="Track tickers, inspect price action, and place orders in your active mode."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        {/* watchlist */}
        <div className="space-y-3">
          <form onSubmit={addSymbol} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Add symbol (e.g. AAPL)"
                className="pl-9 uppercase"
              />
            </div>
            <Button type="submit" size="icon" disabled={add.isPending}>
              {add.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
            </Button>
          </form>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : symbols.length === 0 ? (
            <EmptyState title="Empty watchlist" description="Add a ticker symbol to begin tracking prices." />
          ) : (
            <div className="space-y-1.5">
              {(watchlist ?? []).map((w) => {
                const q = quoteBySym.get(w.symbol);
                const up = (q?.change ?? 0) >= 0;
                return (
                  <button
                    key={w.id}
                    onClick={() => setSelected(w.symbol)}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors",
                      selected === w.symbol
                        ? "border-[var(--color-accent)]/40 bg-[var(--color-elevated)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border)]/80",
                    )}
                  >
                    <div>
                      <div className="font-medium">{w.symbol}</div>
                      <div className="tnum text-xs text-[var(--color-faint)]">
                        {q ? formatUsd(q.price) : "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {q && (
                        <span className={cn("tnum text-xs", up ? "text-[var(--color-up)]" : "text-[var(--color-down)]")}>
                          {formatPct(q.changePct)}
                        </span>
                      )}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          remove.mutate(w.id);
                          if (selected === w.symbol) setSelected(null);
                        }}
                        className="text-[var(--color-faint)] opacity-0 transition-opacity hover:text-[var(--color-down)] group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* detail */}
        <div>
          {selected ? (
            <Card className="p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{selected}</h2>
                    {selectedQuote && (
                      <Badge variant={selectedQuote.source === "alpaca" ? "accent" : "default"}>
                        {selectedQuote.source === "alpaca" ? "live data" : "demo data"}
                      </Badge>
                    )}
                  </div>
                  {selectedQuote && (
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="tnum text-2xl font-semibold">{formatUsd(selectedQuote.price)}</span>
                      <QuoteChange q={selectedQuote} />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="success" onClick={() => setTicketOpen(true)}>
                    Trade
                  </Button>
                </div>
              </div>

              {candlesLoading ? (
                <div className="flex h-[320px] items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <PriceChart candles={candles ?? []} />
              )}
            </Card>
          ) : (
            <EmptyState title="Select a symbol" description="Pick a ticker from your watchlist to view its chart." />
          )}
        </div>
      </div>

      {selected && (
        <OrderTicket
          open={ticketOpen}
          onClose={() => setTicketOpen(false)}
          symbol={selected}
          price={selectedQuote?.price}
        />
      )}
    </div>
  );
}

function QuoteChange({ q }: { q: Quote }) {
  const up = q.change >= 0;
  return (
    <span className={cn("flex items-center gap-1 text-sm", up ? "text-[var(--color-up)]" : "text-[var(--color-down)]")}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      <span className="tnum">
        {formatUsd(q.change)} ({formatPct(q.changePct)})
      </span>
    </span>
  );
}
