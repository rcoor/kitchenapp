// Pipeline runtime: executes a skill's ordered "bricks" and returns normalized
// signal rows. Bricks are plug-and-play; the `transform` brick runs custom JS.
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

export type Brick = { id: string; type: string; config: Record<string, unknown> };
export type Pipeline = { steps: Brick[] };

export type NormalizedSignal = {
  symbol: string | null;
  event_type: string | null;
  observed_at: string | null;
  numeric_value: number | null;
  confidence: number | null;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  signal_kind: string;
};

export type RunResult = {
  signals: NormalizedSignal[];
  log: string[];
};

// deep-resolve {{config.key}} templates against the installation config
function resolveTemplates<T>(value: T, config: Record<string, unknown>): T {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*config\.([\w.]+)\s*\}\}/g, (_m, k: string) => {
      const v = config[k];
      return v == null ? "" : String(v);
    }) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, config)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTemplates(v, config);
    return out as T;
  }
  return value;
}

function getPath(obj: unknown, path: string): unknown {
  if (path === "$" || path === "$.") return obj;
  const clean = path.replace(/^\$\.?/, "");
  if (!clean) return obj;
  return clean.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function resolveMapping(mapping: unknown, row: unknown): unknown {
  if (typeof mapping === "string") {
    if (mapping.startsWith("$.") || mapping === "$") return getPath(row, mapping);
    return mapping; // literal
  }
  if (Array.isArray(mapping)) return mapping.map((m) => resolveMapping(m, row));
  if (mapping && typeof mapping === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapping)) out[k] = resolveMapping(v, row);
    return out;
  }
  return mapping;
}

function extractField(el: unknown, selector: string): string | null {
  // "selector@attr" → attribute, otherwise textContent
  const [sel, attr] = selector.split("@");
  const node = sel
    ? (el as { querySelector: (s: string) => unknown }).querySelector(sel)
    : el;
  if (!node) return null;
  if (attr) return (node as { getAttribute: (a: string) => string | null }).getAttribute(attr);
  return ((node as { textContent?: string }).textContent ?? "").trim();
}

async function runHttpRequest(cfg: Record<string, unknown>, log: string[]): Promise<unknown> {
  const url = String(cfg.url ?? "");
  const method = String(cfg.method ?? "GET");
  const headers = (cfg.headers as Record<string, string>) ?? {};
  log.push(`http_request ${method} ${url}`);
  const res = await fetch(url, { method, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("json") ? await res.json() : await res.text();
}

async function runScrape(cfg: Record<string, unknown>, log: string[]): Promise<unknown[]> {
  const url = String(cfg.url ?? "");
  const rowSelector = String(cfg.rowSelector ?? cfg.row_selector ?? "");
  const idTarget = cfg.idTarget ? String(cfg.idTarget) : "";
  const fields = (cfg.fields as Record<string, string>) ?? {};
  log.push(`scrape ${url} target=${idTarget || "(page)"} rows=${rowSelector}`);
  const res = await fetch(url, { headers: { "user-agent": "HelmBot/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const html = await res.text();
  const document = new DOMParser().parseFromString(html, "text/html");
  if (!document) throw new Error("Failed to parse HTML");
  const scope = idTarget ? document.querySelector(idTarget) : document;
  if (!scope) {
    log.push(`scrape: idTarget "${idTarget}" not found`);
    return [];
  }
  const rowEls = rowSelector
    ? Array.from(scope.querySelectorAll(rowSelector))
    : [scope];
  return rowEls.map((el) => {
    const obj: Record<string, unknown> = {};
    for (const [name, sel] of Object.entries(fields)) obj[name] = extractField(el, sel);
    return obj;
  });
}

function runTransform(
  cfg: Record<string, unknown>,
  input: unknown,
  allowCustomCode: boolean,
): Promise<unknown> {
  if (!allowCustomCode) {
    throw new Error(
      "Custom-code brick blocked: you may only run custom code from built-in skills or skills you authored.",
    );
  }
  const code = String(cfg.code ?? "return input;");
  // Async so brick code may `await fetch(...)`. Receives (input, config).
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as
    new (...args: string[]) => (input: unknown, config: unknown) => Promise<unknown>;
  const fn = new AsyncFunction("input", "config", code);
  return fn(input, cfg);
}

export async function runPipeline(
  pipeline: Pipeline,
  config: Record<string, unknown>,
  opts: { signalKind: string; allowCustomCode: boolean },
): Promise<RunResult> {
  const log: string[] = [];
  const steps = (resolveTemplates(pipeline.steps ?? [], config) as Brick[]) ?? [];
  let data: unknown = null;
  let signalKind = opts.signalKind;

  for (const step of steps) {
    const cfg = step.config ?? {};
    switch (step.type) {
      case "http_request":
        data = await runHttpRequest(cfg, log);
        break;
      case "scrape":
        data = await runScrape(cfg, log);
        break;
      case "json_select":
        data = getPath(data, String(cfg.path ?? "$"));
        break;
      case "slice": {
        const limit = Number(cfg.limit ?? 100);
        data = Array.isArray(data) ? data.slice(0, limit) : data;
        log.push(`slice ${limit}`);
        break;
      }
      case "map": {
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        data = rows.map((r) => resolveMapping(cfg.mapping, r));
        log.push(`map ${rows.length} rows`);
        break;
      }
      case "filter": {
        const rows = Array.isArray(data) ? data : [];
        const key = String(cfg.field ?? "");
        const equals = cfg.equals;
        data = rows.filter((r) => (key ? (r as Record<string, unknown>)[key] === equals : true));
        break;
      }
      case "dedupe": {
        const rows = Array.isArray(data) ? data : [];
        const seen = new Set<string>();
        const tmpl = String(cfg.key ?? "");
        data = rows.filter((r) => {
          const k = tmpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, p: string) =>
            String(getPath(r, p) ?? ""),
          );
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        break;
      }
      case "transform":
        data = await runTransform(cfg, data, opts.allowCustomCode);
        break;
      case "emit":
        if (cfg.signal_kind) signalKind = String(cfg.signal_kind);
        break;
      default:
        log.push(`unknown brick "${step.type}" skipped`);
    }
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const signals = rows.map((r) => normalize(r as Record<string, unknown>, signalKind));
  log.push(`emit ${signals.length} signals (${signalKind})`);
  return { signals, log };
}

function normalize(r: Record<string, unknown>, signalKind: string): NormalizedSignal {
  const symbol = r.symbol != null ? String(r.symbol).toUpperCase() : null;
  const event_type = r.event_type != null ? String(r.event_type) : null;
  const observed_at = r.observed_at != null ? coerceDate(String(r.observed_at)) : null;
  const numeric_value = r.numeric_value != null && r.numeric_value !== "" ? Number(r.numeric_value) : null;
  const confidence = r.confidence != null ? Number(r.confidence) : null;
  const payload = (r.payload as Record<string, unknown>) ?? {};
  const computedKey = [symbol, event_type, observed_at, payload.senator, payload.amount, payload.score]
    .filter((x) => x != null)
    .join("|");
  const dedupe_key = (r.dedupe_key as string) ?? (computedKey || null);
  return {
    symbol,
    event_type,
    observed_at,
    numeric_value: Number.isFinite(numeric_value as number) ? numeric_value : null,
    confidence: Number.isFinite(confidence as number) ? confidence : null,
    payload,
    dedupe_key,
    signal_kind: signalKind,
  };
}

function coerceDate(s: string): string | null {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}
