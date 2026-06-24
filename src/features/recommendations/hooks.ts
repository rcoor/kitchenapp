import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFn } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Tables } from "@/lib/database.types";

export function useRecommendations(limit = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["recommendations", user?.id, limit],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"recommendations">[]> => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useSignals(limit = 60) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["signals", user?.id, limit],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"signals">[]> => {
      const { data, error } = await supabase
        .from("signals")
        .select("*")
        .order("observed_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useGenerateRecommendations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (symbols?: string[]) => {
      return invokeFn<{ ok: boolean; decision_id: string; model: string }>("recommend", {
        symbols: symbols ?? [],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      qc.invalidateQueries({ queryKey: ["decisions"] });
    },
  });
}

export function useDismissRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("recommendations")
        .update({ status: "dismissed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });
}
