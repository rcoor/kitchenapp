import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Mode } from "@/lib/types";
import type { Tables } from "@/lib/database.types";

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"profiles">> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useMode(): Mode {
  const { data } = useProfile();
  return (data?.active_mode as Mode) ?? "sim";
}

export function useSetMode() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: Mode) => {
      const { error } = await supabase
        .from("profiles")
        .update({ active_mode: mode })
        .eq("id", user!.id);
      if (error) throw error;
      return mode;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
