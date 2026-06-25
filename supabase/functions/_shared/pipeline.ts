// Pipeline runtime: executes a skill's ordered "bricks" and returns normalized
// signal rows. Bricks are plug-and-play; the `transform` brick runs custom JS.
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { unzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { extractText, getDocumentProxy } from "npm:unpdf@^0.12.0";

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
  // `as: "bytes"` returns raw binary (e.g. a ZIP) for the unzip brick.
  if (String(cfg.as ?? "") === "bytes") return new Uint8Array(await res.arrayBuffer());
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("json") ? await res.json() : await res.text();
}

// Decompress a ZIP (Uint8Array/ArrayBuffer from a `bytes` http_request) and
// return one entry as text. `entry` is a case-insensitive regex (default: the
// first .xml file). Used by the House Clerk bulk financial-disclosure feed.
function runUnzip(cfg: Record<string, unknown>, input: unknown, log: string[]): string {
  const bytes = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : null;
  if (!bytes) throw new Error("unzip: expected binary input (set http_request `as: \"bytes\"`)");
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  const pat = cfg.entry ? new RegExp(String(cfg.entry), "i") : /\.xml$/i;
  const name = names.find((n) => pat.test(n)) ?? names[0];
  log.push(`unzip ${names.length} entries, picked ${name ?? "(none)"}`);
  if (!name) return "";
  return new TextDecoder().decode(files[name]);
}

// Parse XML text into objects and select a repeating node as an array of rows.
// `path` is a $.dotted.path to the repeated element (e.g. the House feed's
// "$.FinancialDisclosure.Member"). Keys preserve the original XML tag names.
function runXmlSelect(cfg: Record<string, unknown>, input: unknown, log: string[]): unknown[] {
  const text = typeof input === "string" ? input : String(input ?? "");
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const obj = parser.parse(text);
  const path = String(cfg.path ?? "$");
  const sel = getPath(obj, path);
  const arr = Array.isArray(sel) ? sel : sel == null ? [] : [sel];
  log.push(`xml_select ${path} -> ${arr.length} rows`);
  return arr;
}

// Resolve {{field}} / {{a.b}} templates against a single row object.
function resolveRowTemplate(tmpl: string, row: Record<string, unknown>): string {
  return tmpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, p: string) => String(getPath(row, p) ?? ""));
}

// For each row in the input array, fetch a per-row URL (templated against the
// row) and attach the response under `into`. `as: "bytes"` keeps binary (PDFs);
// otherwise text. Errors are recorded per row instead of aborting the run.
async function runHttpEach(
  cfg: Record<string, unknown>,
  input: unknown,
  log: string[],
): Promise<unknown[]> {
  const rows = Array.isArray(input) ? (input as Record<string, unknown>[]) : [];
  const tmpl = String(cfg.url ?? "");
  const into = String(cfg.into ?? "_fetched");
  const asBytes = String(cfg.as ?? "") === "bytes";
  const headers = {
    "user-agent": "HelmBot/1.0",
    ...((cfg.headers as Record<string, string>) ?? {}),
  };
  const limit = Number(cfg.limit ?? rows.length);
  const slice = rows.slice(0, limit);
  let ok = 0;
  for (const row of slice) {
    const url = resolveRowTemplate(tmpl, row);
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        row[into] = null;
        row[`${into}_error`] = `HTTP ${res.status}`;
      } else {
        row[into] = asBytes ? new Uint8Array(await res.arrayBuffer()) : await res.text();
        ok++;
      }
    } catch (e) {
      row[into] = null;
      row[`${into}_error`] = (e as Error).message;
    }
  }
  log.push(`http_each ${ok}/${slice.length} fetched (${asBytes ? "bytes" : "text"})`);
  return slice;
}

// For each row, extract text from a PDF held under `from` (Uint8Array) into
// `into`, then drop the heavy bytes. Powered by unpdf (serverless pdf.js).
async function runPdfText(
  cfg: Record<string, unknown>,
  input: unknown,
  log: string[],
): Promise<unknown[]> {
  const rows = Array.isArray(input) ? (input as Record<string, unknown>[]) : [];
  const from = String(cfg.from ?? "_fetched");
  const into = String(cfg.into ?? "_text");
  let ok = 0;
  for (const row of rows) {
    const bytes = row[from];
    if (!(bytes instanceof Uint8Array)) {
      row[into] = "";
      continue;
    }
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      row[into] = Array.isArray(text) ? text.join("\n") : String(text ?? "");
      ok++;
    } catch (e) {
      row[into] = "";
      row[`${into}_error`] = (e as Error).message;
    }
    delete row[from];
  }
  log.push(`pdf_text extracted ${ok}/${rows.length}`);
  return rows;
}

// Parse the text of a US House Periodic Transaction Report into individual
// trades. The official PDFs have no machine-readable schema, so this is a
// tolerant, best-effort parser keyed off the amount-range column that anchors
// each transaction line. Returns signal-shaped rows (one per trade).
function parseHousePtr(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (!text) return out;
  const norm = text.replace(/ /g, " ").replace(/[–—]/g, "-");
  const amountRe = /\$([\d,]+)\s*-\s*\$([\d,]+)/g;
  let m: RegExpExecArray | null;
  let prevEnd = 0; // each amount range ends a transaction line; window = text since the last one
  while ((m = amountRe.exec(norm)) !== null) {
    const win = norm.slice(prevEnd, m.index);
    prevEnd = m.index + m[0].length;
    const tickers = [...win.matchAll(/\(([A-Z]{1,5})\)/g)];
    const ticker = tickers.length ? tickers[tickers.length - 1][1] : null;
    if (!ticker) continue; // skip non-ticker assets (real estate, funds w/o symbol)
    let type: string | null = null;
    if (/\bpurchase\b/i.test(win)) type = "purchase";
    else if (/\bsale\b/i.test(win)) type = "sale";
    else if (/\bexchange\b/i.test(win)) type = "exchange";
    else {
      const codes = win.match(/(?<![A-Za-z])[PSE](?![A-Za-z)])/g);
      const code = codes ? codes[codes.length - 1] : null;
      type = code === "P" ? "purchase" : code === "S" ? "sale" : code === "E" ? "exchange" : null;
    }
    const dates = [...win.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g)];
    const txnDate = dates.length ? dates[0][1] : null;
    const low = Number(m[1].replace(/,/g, ""));
    const high = Number(m[2].replace(/,/g, ""));
    out.push({
      ticker,
      type,
      txnDate,
      amountRange: `$${m[1]} - $${m[2]}`,
      amountLow: low,
      amountHigh: high,
      amountMid: Number.isFinite(low) && Number.isFinite(high) ? Math.round((low + high) / 2) : null,
      snippet: win.slice(-90).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

// Flatten an array of House filings (each carrying `_text` + member metadata)
// into ticker-level trade signals via parseHousePtr.
function runHousePtrParse(input: unknown, log: string[]): Array<Record<string, unknown>> {
  const rows = Array.isArray(input) ? (input as Record<string, unknown>[]) : [];
  const out: Array<Record<string, unknown>> = [];
  for (const f of rows) {
    const txns = parseHousePtr(String(f._text ?? ""));
    txns.forEach((t, i) => {
      out.push({
        symbol: t.ticker,
        event_type: t.type ?? "transaction",
        observed_at: t.txnDate ?? f.filing_date ?? null,
        numeric_value: t.amountMid,
        payload: {
          representative: f.representative ?? null,
          state_district: f.state_district ?? null,
          transaction_type: t.type,
          amount: t.amountRange,
          amount_low: t.amountLow,
          amount_high: t.amountHigh,
          doc_id: f.doc_id ?? null,
          doc_url: f.doc_url ?? null,
          year: f.year ?? null,
          snippet: t.snippet,
        },
        dedupe_key:
          [f.doc_id, t.ticker, t.type, t.txnDate, t.amountMid].filter((x) => x != null).join("|") ||
          `${f.doc_id}|${i}`,
      });
    });
    log.push(`house_ptr_parse ${f.doc_id}: ${txns.length} trades`);
  }
  return out;
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
): unknown {
  if (!allowCustomCode) {
    throw new Error(
      "Custom-code brick blocked: you may only run custom code from built-in skills or skills you authored.",
    );
  }
  const code = String(cfg.code ?? "return input;");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function("input", "config", `"use strict";\n${code}`);
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
      case "unzip":
        data = runUnzip(cfg, data, log);
        break;
      case "xml_select":
        data = runXmlSelect(cfg, data, log);
        break;
      case "http_each":
        data = await runHttpEach(cfg, data, log);
        break;
      case "pdf_text":
        data = await runPdfText(cfg, data, log);
        break;
      case "house_ptr_parse":
        data = runHousePtrParse(data, log);
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
        data = runTransform(cfg, data, opts.allowCustomCode);
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
