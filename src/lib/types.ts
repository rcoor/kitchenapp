import type { Tables } from "./database.types";

export type Mode = "sim" | "paper" | "live";
export type Side = "buy" | "sell";
export type Action = "buy" | "sell" | "hold";

export const MODE_LABELS: Record<Mode, string> = {
  sim: "Simulator",
  paper: "Paper",
  live: "Live",
};

export const MODE_BLURBS: Record<Mode, string> = {
  sim: "Offline fill engine with modeled fees & slippage. No broker needed.",
  paper: "Alpaca paper account — realistic fills, no real money.",
  live: "Real money through Alpaca. Disabled until explicitly enabled.",
};

export type Quote = {
  symbol: string;
  price: number;
  change?: number;
  changePct?: number;
  prevClose?: number;
  asOf?: string;
};

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/** A normalized signal row joined with light skill metadata for display. */
export type SignalRow = Tables<"signals">;

/** Structured recommendation produced by the `recommend` edge function. */
export type RecommendationItem = {
  symbol: string;
  action: Action;
  confidence: number;
  target_qty?: number | null;
  rationale: string;
  supporting_signals: string[];
};

// ---- Pipeline / brick model (mirrors the edge-function runtime) ----

export type BrickType =
  | "http_request"
  | "scrape"
  | "json_select"
  | "slice"
  | "map"
  | "filter"
  | "dedupe"
  | "transform"
  | "emit";

export type Brick = {
  id: string;
  type: BrickType;
  config: Record<string, unknown>;
};

export type Pipeline = { steps: Brick[] };

export type ConfigField = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "secret";
  required?: boolean;
  default?: unknown;
  secret?: boolean;
  help?: string;
};

export const BRICK_META: Record<BrickType, { label: string; blurb: string }> = {
  http_request: { label: "HTTP Request", blurb: "Fetch JSON/text from a URL." },
  scrape: { label: "Scrape", blurb: "Load a page, extract rows by selector / element id." },
  json_select: { label: "JSON Select", blurb: "Pick an array out of the response by path." },
  slice: { label: "Slice", blurb: "Keep the first N rows." },
  map: { label: "Map Fields", blurb: "Map raw rows to normalized signal fields." },
  filter: { label: "Filter", blurb: "Keep rows matching a condition." },
  dedupe: { label: "Dedupe", blurb: "Drop duplicates by a key template." },
  transform: { label: "Custom Code", blurb: "Run custom JS to produce/transform rows." },
  emit: { label: "Emit Signal", blurb: "Write normalized rows into the signals table." },
};
