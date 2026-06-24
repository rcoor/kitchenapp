import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Tables } from "@/lib/database.types";

export function useDecisions(limit = 50) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["decisions", user?.id, limit],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"decisions">[]> => {
      const { data, error } = await supabase
        .from("decisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useDecisionDetail(decisionId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["decision-detail", decisionId],
    enabled: !!user && !!decisionId,
    queryFn: async () => {
      const [{ data: decision }, { data: recs }] = await Promise.all([
        supabase.from("decisions").select("*").eq("id", decisionId!).single(),
        supabase.from("recommendations").select("*").eq("decision_id", decisionId!),
      ]);
      let snapshot: Tables<"signal_snapshots"> | null = null;
      if (decision?.signal_snapshot_id) {
        const { data } = await supabase
          .from("signal_snapshots")
          .select("*")
          .eq("id", decision.signal_snapshot_id)
          .single();
        snapshot = data;
      }
      return { decision, recommendations: recs ?? [], snapshot };
    },
  });
}

export function useOrderEvents(orderId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["order-events", orderId],
    enabled: !!user && !!orderId,
    queryFn: async (): Promise<Tables<"order_events">[]> => {
      const { data, error } = await supabase
        .from("order_events")
        .select("*")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
