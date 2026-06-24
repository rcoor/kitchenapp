import * as React from "react";
import { Boxes, Plus, Play, Trash2, Landmark, Code2, Globe, Share2, Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { SkillAuthor } from "./SkillAuthor";
import {
  useSkills,
  useInstallations,
  useInstallSkill,
  useUninstall,
  useRunIngest,
  useSetSkillVisibility,
} from "./hooks";
import { relativeTime } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";
import type { ConfigField } from "@/lib/types";

function skillIcon(slug: string, kind: string) {
  if (slug.includes("senator") || kind === "senator_trade") return <Landmark className="h-5 w-5" />;
  if (slug.includes("code")) return <Code2 className="h-5 w-5" />;
  return <Globe className="h-5 w-5" />;
}

export function SourcesPage() {
  const { data: skills, isLoading } = useSkills();
  const { data: installs } = useInstallations();
  const [authorOpen, setAuthorOpen] = React.useState(false);
  const [installSkill, setInstallSkill] = React.useState<Tables<"data_source_skills"> | null>(null);

  const installedSkillIds = new Set((installs ?? []).map((i) => i.skill_id));

  return (
    <div>
      <PageHeader
        title="Data Sources"
        subtitle="Install, run, share, and build pluggable signal sources. Pipelines support bricks, scraping, and custom code."
        action={
          <Button onClick={() => setAuthorOpen(true)}>
            <Plus className="h-4 w-4" /> Create source
          </Button>
        }
      />

      {/* installed */}
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-muted)]">Installed</h2>
      {(installs ?? []).length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title="No sources installed"
          description="Install a source from the catalog below to start ingesting signals."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(installs ?? []).map((inst) => {
            const skill = skills?.find((s) => s.id === inst.skill_id);
            return <InstalledCard key={inst.id} inst={inst} skill={skill} />;
          })}
        </div>
      )}

      {/* catalog */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-[var(--color-muted)]">Catalog</h2>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(skills ?? []).map((skill) => (
            <CatalogCard
              key={skill.id}
              skill={skill}
              installed={installedSkillIds.has(skill.id)}
              onInstall={() => setInstallSkill(skill)}
            />
          ))}
        </div>
      )}

      <SkillAuthor open={authorOpen} onClose={() => setAuthorOpen(false)} />
      <InstallModal skill={installSkill} onClose={() => setInstallSkill(null)} />
    </div>
  );
}

function CatalogCard({
  skill,
  installed,
  onInstall,
}: {
  skill: Tables<"data_source_skills">;
  installed: boolean;
  onInstall: () => void;
}) {
  const setVisibility = useSetSkillVisibility();
  const isOwner = !skill.is_builtin;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-elevated)] text-[var(--color-accent)]">
          {skillIcon(skill.slug, skill.signal_kind)}
        </div>
        <div className="flex items-center gap-1.5">
          {skill.is_builtin && <Badge variant="accent">built-in</Badge>}
          <Badge variant={skill.visibility === "shared" ? "up" : "default"}>
            {skill.visibility === "shared" ? <Share2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {skill.visibility}
          </Badge>
        </div>
      </div>
      <div className="mt-3 flex-1">
        <div className="font-medium">{skill.name}</div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{skill.description}</p>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant={installed ? "secondary" : "default"} disabled={installed} onClick={onInstall}>
          {installed ? "Installed" : "Install"}
        </Button>
        {isOwner && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setVisibility.mutate(
                { id: skill.id, visibility: skill.visibility === "shared" ? "private" : "shared" },
                { onSuccess: () => toast.success(skill.visibility === "shared" ? "Made private" : "Shared to catalog") },
              )
            }
          >
            {skill.visibility === "shared" ? "Make private" : "Share"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function InstalledCard({
  inst,
  skill,
}: {
  inst: Tables<"data_source_installations">;
  skill?: Tables<"data_source_skills">;
}) {
  const run = useRunIngest();
  const uninstall = useUninstall();

  async function doRun() {
    try {
      const res = await run.mutateAsync(inst.id);
      toast.success("Ingest complete", `${res.inserted} new signal(s) from ${res.produced} produced.`);
    } catch (e) {
      toast.error("Ingest failed", (e as Error).message);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-elevated)] text-[var(--color-accent)]">
            {skillIcon(skill?.slug ?? "", skill?.signal_kind ?? "")}
          </div>
          <div>
            <div className="font-medium">{skill?.name ?? "Unknown skill"}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-faint)]">
              {inst.last_status === "ok" ? (
                <CheckCircle2 className="h-3 w-3 text-[var(--color-up)]" />
              ) : inst.last_status === "error" ? (
                <AlertTriangle className="h-3 w-3 text-[var(--color-down)]" />
              ) : null}
              {inst.last_run_at ? `Ran ${relativeTime(inst.last_run_at)}` : "Never run"}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={doRun} disabled={run.isPending}>
            {run.isPending ? <Spinner /> : <Play className="h-3.5 w-3.5" />} Run
          </Button>
          <Button size="sm" variant="ghost" onClick={() => uninstall.mutate(inst.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {inst.last_error && (
        <div className="mt-3 rounded-lg border border-[var(--color-down)]/30 bg-[var(--color-down)]/5 px-3 py-2 text-xs text-[var(--color-down)]">
          {inst.last_error}
        </div>
      )}
    </Card>
  );
}

function InstallModal({
  skill,
  onClose,
}: {
  skill: Tables<"data_source_skills"> | null;
  onClose: () => void;
}) {
  const install = useInstallSkill();
  const [config, setConfig] = React.useState<Record<string, unknown>>({});
  const fields = (skill?.config_schema as unknown as ConfigField[]) ?? [];

  React.useEffect(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) if (f.default !== undefined) init[f.key] = f.default;
    setConfig(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill?.id]);

  if (!skill) return null;

  async function submit() {
    try {
      await install.mutateAsync({ skillId: skill!.id, config });
      toast.success("Installed", `${skill!.name} added. Run it to ingest signals.`);
      onClose();
    } catch (e) {
      toast.error("Install failed", (e as Error).message);
    }
  }

  return (
    <Modal open={!!skill} onClose={onClose} title={`Install ${skill.name}`} description={skill.description ?? undefined}>
      <div className="space-y-3">
        {fields.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">This source needs no configuration.</p>
        )}
        {fields.map((f) => (
          <div key={f.key}>
            <Label>
              {f.label}
              {f.required && <span className="text-[var(--color-down)]"> *</span>}
            </Label>
            <Input
              type={f.type === "number" ? "number" : f.secret ? "password" : "text"}
              value={String(config[f.key] ?? "")}
              onChange={(e) =>
                setConfig((c) => ({ ...c, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value }))
              }
            />
            {f.help && <p className="mt-1 text-[11px] text-[var(--color-faint)]">{f.help}</p>}
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={install.isPending}>
          {install.isPending ? <Spinner /> : "Install"}
        </Button>
      </div>
    </Modal>
  );
}
