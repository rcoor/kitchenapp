import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFn } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Tables, TablesInsert } from "@/lib/database.types";

export function useSkills() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["skills", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"data_source_skills">[]> => {
      const { data, error } = await supabase
        .from("data_source_skills")
        .select("*")
        .order("is_builtin", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useInstallations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["installations", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Tables<"data_source_installations">[]> => {
      const { data, error } = await supabase
        .from("data_source_installations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInstallSkill() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ skillId, config }: { skillId: string; config: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("data_source_installations")
        .insert({ user_id: user!.id, skill_id: skillId, config: config as never, enabled: true });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["installations"] }),
  });
}

export function useUninstall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("data_source_installations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["installations"] }),
  });
}

export function useRunIngest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (installationId: string) => {
      return invokeFn<{ ok: boolean; produced: number; inserted: number; log: string[] }>(
        "ingest-source",
        { installation_id: installationId },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["installations"] });
      qc.invalidateQueries({ queryKey: ["signals"] });
    },
  });
}

export function useCreateSkill() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skill: Omit<TablesInsert<"data_source_skills">, "author_id">) => {
      const { data, error } = await supabase
        .from("data_source_skills")
        .insert({ ...skill, author_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useSetSkillVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, visibility }: { id: string; visibility: "private" | "shared" }) => {
      const { error } = await supabase.from("data_source_skills").update({ visibility }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
