import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFn } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Quote, Candle } from "@/lib/types";
import type { Tables } from "@/lib/database.types";

export function useWatchlist() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["watchlist", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"watchlist_items">[]> => {
      const { data, error } = await supabase
        .from("watchlist_items")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useWatchlistMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["watchlist"] });

  const add = useMutation({
    mutationFn: async (symbol: string) => {
      const { error } = await supabase
        .from("watchlist_items")
        .insert({ user_id: user!.id, symbol: symbol.toUpperCase().trim() });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("watchlist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, remove };
}

export function useQuotes(symbols: string[]) {
  return useQuery({
    queryKey: ["quotes", [...symbols].sort()],
    enabled: symbols.length > 0,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Quote[]> => {
      const { quotes } = await invokeFn<{ quotes: Quote[] }>("market-data", { symbols });
      return quotes;
    },
  });
}

export function useCandles(symbol: string | null, days = 90) {
  return useQuery({
    queryKey: ["candles", symbol, days],
    enabled: !!symbol,
    queryFn: async (): Promise<Candle[]> => {
      const { candles } = await invokeFn<{ candles: Candle[] }>("market-data", {
        symbols: [symbol],
        candleSymbol: symbol,
        days,
      });
      return candles ?? [];
    },
  });
}
