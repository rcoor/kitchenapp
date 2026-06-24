import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { supabase, invokeFn } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { useMode } from "@/features/account/useProfile";
import type { Tables } from "@/lib/database.types";
import type { Side } from "@/lib/types";

export type OrderInput = {
  symbol: string;
  side: Side;
  qty: number;
  type?: "market" | "limit";
  limit_price?: number | null;
  source?: "manual" | "recommendation" | "auto";
  recommendation_id?: string;
  decision_id?: string;
};

export function usePositions() {
  const { user } = useAuth();
  const mode = useMode();
  return useQuery({
    queryKey: ["positions", user?.id, mode],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"positions">[]> => {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("mode", mode)
        .order("symbol");
      if (error) throw error;
      return data;
    },
  });
}

export function useOrders(limit = 50) {
  const { user } = useAuth();
  const mode = useMode();
  return useQuery({
    queryKey: ["orders", user?.id, mode, limit],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"orders">[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("mode", mode)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrderInput) => {
      return invokeFn<{ ok: boolean; order_id: string; status: string }>("broker-execute", input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

/** Subscribe to realtime changes on a table for the current user and refresh. */
export function useRealtimeRefresh(table: string, queryKey: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`rt-${table}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: [queryKey] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, table, queryKey, qc]);
}
