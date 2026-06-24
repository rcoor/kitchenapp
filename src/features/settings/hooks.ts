import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFn } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Tables, TablesUpdate } from "@/lib/database.types";

export function useAutomation() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["automation", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"automation_settings">> => {
      const { data, error } = await supabase
        .from("automation_settings")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateAutomation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<"automation_settings">) => {
      const { error } = await supabase
        .from("automation_settings")
        .update(patch)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation"] }),
  });
}

export function useBrokerAccounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["broker-accounts", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"broker_accounts">[]> => {
      const { data, error } = await supabase.from("broker_accounts").select("*");
      if (error) throw error;
      return data;
    },
  });
}

export function useConnectBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mode: "paper" | "live"; api_key: string; api_secret: string }) => {
      return invokeFn("connect-broker", input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-accounts"] }),
  });
}
