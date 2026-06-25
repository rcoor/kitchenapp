import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useCreateSkill } from "./hooks";
import { cn } from "@/lib/utils";

type Template = "http_json" | "scrape" | "zip_xml" | "custom";

const TEMPLATES: Record<Template, { label: string; blurb: string; signalKind: string; configSchema: string; pipeline: string }> = {
  http_json: {
    label: "HTTP / JSON",
    blurb: "Fetch a JSON endpoint and map fields to signals.",
    signalKind: "custom",
    configSchema: JSON.stringify(
      [{ key: "url", label: "API URL", type: "string", required: true, default: "https://api.example.com/data" }],
      null,
      2,
    ),
    pipeline: JSON.stringify(
      {
        steps: [
          { id: "fetch", type: "http_request", config: { url: "{{config.url}}", method: "GET" } },
          { id: "rows", type: "json_select", config: { path: "$.results" } },
          { id: "map", type: "map", config: { mapping: { symbol: "$.ticker", event_type: "signal", numeric_value: "$.value", payload: { raw: "$" } } } },
          { id: "emit", type: "emit", config: { signal_kind: "custom" } },
        ],
      },
      null,
      2,
    ),
  },
  scrape: {
    label: "Scrape (by id)",
    blurb: "Load a page, target a specific element id, extract rows by selector.",
    signalKind: "custom",
    configSchema: JSON.stringify(
      [{ key: "url", label: "Page URL", type: "string", required: true, default: "https://example.com/table" }],
      null,
      2,
    ),
    pipeline: JSON.stringify(
      {
        steps: [
          {
            id: "scrape",
            type: "scrape",
            config: {
              url: "{{config.url}}",
              idTarget: "#target-table",
              rowSelector: "tbody tr",
              fields: { symbol: "td.ticker", event_type: "td.action", observed_at: "td.date@datetime" },
            },
          },
          { id: "map", type: "map", config: { mapping: { symbol: "$.symbol", event_type: "$.event_type", observed_at: "$.observed_at", payload: { raw: "$" } } } },
          { id: "emit", type: "emit", config: { signal_kind: "custom" } },
        ],
      },
      null,
      2,
    ),
  },
  zip_xml: {
    label: "ZIP / XML feed",
    blurb: "Fetch a ZIP (e.g. the House Clerk bulk feed), unzip an XML index, map rows.",
    signalKind: "custom",
    configSchema: JSON.stringify(
      [{ key: "url", label: "ZIP URL", type: "string", required: true, default: "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2026FD.zip" }],
      null,
      2,
    ),
    pipeline: JSON.stringify(
      {
        steps: [
          { id: "fetch", type: "http_request", config: { url: "{{config.url}}", method: "GET", as: "bytes" } },
          { id: "unzip", type: "unzip", config: { entry: "\\.xml$" } },
          { id: "rows", type: "xml_select", config: { path: "$.FinancialDisclosure.Member" } },
          { id: "map", type: "map", config: { mapping: { event_type: "$.FilingType", observed_at: "$.FilingDate", payload: { name: "$.Last", state: "$.StateDst", doc_id: "$.DocID" } } } },
          { id: "emit", type: "emit", config: { signal_kind: "custom" } },
        ],
      },
      null,
      2,
    ),
  },
  custom: {
    label: "Custom code",
    blurb: "Write JS that returns rows. Runs only for skills you author.",
    signalKind: "custom",
    configSchema: "[]",
    pipeline: JSON.stringify(
      {
        steps: [
          {
            id: "code",
            type: "transform",
            config: { code: "// return an array of rows\nreturn [{ ticker: 'AAPL', score: 0.7 }];" },
          },
          { id: "map", type: "map", config: { mapping: { symbol: "$.ticker", event_type: "custom", numeric_value: "$.score", payload: { raw: "$" } } } },
          { id: "emit", type: "emit", config: { signal_kind: "custom" } },
        ],
      },
      null,
      2,
    ),
  },
};

export function SkillAuthor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateSkill();
  const [template, setTemplate] = React.useState<Template>("http_json");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [signalKind, setSignalKind] = React.useState("custom");
  const [visibility, setVisibility] = React.useState<"private" | "shared">("private");
  const [configSchema, setConfigSchema] = React.useState(TEMPLATES.http_json.configSchema);
  const [pipeline, setPipeline] = React.useState(TEMPLATES.http_json.pipeline);

  function applyTemplate(t: Template) {
    setTemplate(t);
    setSignalKind(TEMPLATES[t].signalKind);
    setConfigSchema(TEMPLATES[t].configSchema);
    setPipeline(TEMPLATES[t].pipeline);
  }

  async function submit() {
    let pipelineJson: unknown;
    let configJson: unknown;
    try {
      pipelineJson = JSON.parse(pipeline);
      configJson = JSON.parse(configSchema);
    } catch (e) {
      toast.error("Invalid JSON", (e as Error).message);
      return;
    }
    const slug =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);
    try {
      await create.mutateAsync({
        slug,
        name: name.trim(),
        description: description.trim(),
        signal_kind: signalKind.trim() || "custom",
        visibility,
        is_builtin: false,
        config_schema: configJson as never,
        pipeline: pipelineJson as never,
      });
      toast.success("Source skill created", visibility === "shared" ? "Shared to the catalog." : "Saved privately.");
      onClose();
      setName("");
      setDescription("");
    } catch (e) {
      toast.error("Could not create", (e as Error).message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a source skill" className="max-w-2xl">
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(Object.keys(TEMPLATES) as Template[]).map((t) => (
          <button
            key={t}
            onClick={() => applyTemplate(t)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              template === t
                ? "border-[var(--color-accent)]/50 bg-[var(--color-elevated)]"
                : "border-[var(--color-border)] hover:bg-[var(--color-elevated)]/50",
            )}
          >
            <div className="text-sm font-medium">{TEMPLATES[t].label}</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{TEMPLATES[t].blurb}</div>
          </button>
        ))}
      </div>

      <div className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My data source" />
          </div>
          <div>
            <Label>Signal kind</Label>
            <Input value={signalKind} onChange={(e) => setSignalKind(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this source provides" />
        </div>
        <div>
          <Label>Config schema (JSON)</Label>
          <Textarea value={configSchema} onChange={(e) => setConfigSchema(e.target.value)} className="min-h-24 text-xs" />
        </div>
        <div>
          <Label>Pipeline — bricks (JSON)</Label>
          <Textarea value={pipeline} onChange={(e) => setPipeline(e.target.value)} className="min-h-48 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="mb-0">Visibility</Label>
          <div className="flex gap-1 rounded-lg border border-[var(--color-border)] p-1">
            {(["private", "shared"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize",
                  visibility === v ? "bg-[var(--color-elevated)] text-[var(--color-fg)]" : "text-[var(--color-faint)]",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={create.isPending || !name.trim()}>
          {create.isPending ? <Spinner /> : "Create skill"}
        </Button>
      </div>
    </Modal>
  );
}
