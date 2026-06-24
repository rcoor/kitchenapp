import * as React from "react";
import { motion } from "framer-motion";
import { Bot, KeyRound, ShieldCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/common";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useAutomation, useUpdateAutomation, useBrokerAccounts, useConnectBroker } from "./hooks";
import { MODE_LABELS, type Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Automation guardrails and broker connections." />
      <div className="space-y-5">
        <AutomationCard />
        <BrokerCard />
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]",
      )}
    >
      <motion.span
        layout
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
        style={{ left: checked ? 22 : 2 }}
      />
    </button>
  );
}

function AutomationCard() {
  const { data, isLoading } = useAutomation();
  const update = useUpdateAutomation();
  const [form, setForm] = React.useState<Record<string, unknown>>({});

  React.useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !data) return <Card><Spinner /></Card>;

  function set<K extends string>(key: K, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    update.mutate(
      {
        enabled: form.enabled as boolean,
        mode: form.mode as string,
        min_confidence: Number(form.min_confidence),
        max_position_usd: Number(form.max_position_usd),
        max_orders_per_day: Number(form.max_orders_per_day),
      },
      {
        onSuccess: () => toast.success("Automation saved"),
        onError: (e) => toast.error("Save failed", (e as Error).message),
      },
    );
  }

  const autoMode = (form.mode as Mode) ?? "sim";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-[var(--color-accent)]" />
          <CardTitle>Auto mode</CardTitle>
        </div>
        <Toggle checked={!!form.enabled} onChange={(v) => set("enabled", v)} />
      </CardHeader>
      <CardDescription className="mb-4">
        When enabled, recommendations that clear your guardrails are executed automatically. Live auto-execution
        requires connected live keys and is intentionally conservative.
      </CardDescription>

      {autoMode === "live" && form.enabled ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-down)]/30 bg-[var(--color-down)]/5 px-3 py-2 text-xs text-[var(--color-down)]">
          <AlertTriangle className="h-4 w-4" /> Live auto-execution uses real money.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Execution mode</Label>
          <div className="flex gap-1 rounded-lg border border-[var(--color-border)] p-1">
            {(["sim", "paper", "live"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => set("mode", m)}
                className={cn(
                  "flex-1 rounded-md py-1 text-xs font-medium",
                  autoMode === m ? "bg-[var(--color-elevated)] text-[var(--color-fg)]" : "text-[var(--color-faint)]",
                )}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Min confidence (0–1)" value={form.min_confidence} onChange={(v) => set("min_confidence", v)} step="0.05" />
        <Field label="Max position (USD)" value={form.max_position_usd} onChange={(v) => set("max_position_usd", v)} />
        <Field label="Max orders / day" value={form.max_orders_per_day} onChange={(v) => set("max_orders_per_day", v)} />
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? <Spinner /> : "Save automation"}
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: unknown;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step={step} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function BrokerCard() {
  const { data: accounts } = useBrokerAccounts();
  const connect = useConnectBroker();
  const [mode, setMode] = React.useState<"paper" | "live">("paper");
  const [key, setKey] = React.useState("");
  const [secret, setSecret] = React.useState("");

  const connected = new Set((accounts ?? []).map((a) => a.mode));

  async function submit() {
    if (!key || !secret) {
      toast.error("Missing keys", "Enter both API key and secret.");
      return;
    }
    try {
      await connect.mutateAsync({ mode, api_key: key, api_secret: secret });
      toast.success("Broker connected", `Alpaca ${mode} keys stored securely.`);
      setKey("");
      setSecret("");
    } catch (e) {
      toast.error("Connection failed", (e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[var(--color-accent)]" />
          <CardTitle>Alpaca broker keys</CardTitle>
        </div>
        <div className="flex gap-1.5">
          <Badge variant={connected.has("paper") ? "up" : "default"}>paper {connected.has("paper") ? "✓" : "—"}</Badge>
          <Badge variant={connected.has("live") ? "down" : "default"}>live {connected.has("live") ? "✓" : "—"}</Badge>
        </div>
      </CardHeader>
      <CardDescription className="mb-4 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-up)]" />
        Keys are encrypted in Supabase Vault and never exposed to the browser.
      </CardDescription>

      <div className="mb-3 flex gap-1 rounded-lg border border-[var(--color-border)] p-1">
        {(["paper", "live"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-md py-1 text-xs font-medium capitalize",
              mode === m ? "bg-[var(--color-elevated)] text-[var(--color-fg)]" : "text-[var(--color-faint)]",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <Label>API key ID</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="PK..." autoComplete="off" />
        </div>
        <div>
          <Label>API secret</Label>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={submit} disabled={connect.isPending} variant={mode === "live" ? "danger" : "default"}>
          {connect.isPending ? <Spinner /> : `Connect ${mode} keys`}
        </Button>
      </div>
    </Card>
  );
}
