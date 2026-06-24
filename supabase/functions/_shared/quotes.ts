// Market data via Alpaca Data API, with a deterministic synthetic fallback so
// the app is fully usable before any broker keys are connected.

export type Quote = {
  symbol: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  asOf: string;
  source: "alpaca" | "synthetic";
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const DATA_BASE = "https://data.alpaca.markets/v2";

function alpacaHeaders() {
  const key = Deno.env.get("ALPACA_API_KEY");
  const secret = Deno.env.get("ALPACA_API_SECRET");
  if (!key || !secret) return null;
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

// Stable hash so synthetic prices are consistent per symbol.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function syntheticBase(symbol: string): number {
  return 20 + (hash(symbol) % 480) + (hash(symbol + "x") % 100) / 100;
}

function syntheticQuote(symbol: string): Quote {
  const base = syntheticBase(symbol);
  // intraday wobble keyed to the current hour so it moves but stays stable-ish
  const hour = new Date().getUTCHours();
  const drift = Math.sin((hash(symbol) % 360) + hour / 3) * (base * 0.012);
  const price = Math.round((base + drift) * 100) / 100;
  const prevClose = Math.round(base * 100) / 100;
  const change = Math.round((price - prevClose) * 100) / 100;
  return {
    symbol,
    price,
    prevClose,
    change,
    changePct: Math.round((change / prevClose) * 10000) / 100,
    asOf: new Date().toISOString(),
    source: "synthetic",
  };
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return [];
  const headers = alpacaHeaders();
  if (!headers) return unique.map(syntheticQuote);

  try {
    const url = `${DATA_BASE}/stocks/snapshots?symbols=${unique.join(",")}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`alpaca ${res.status}`);
    const data = await res.json();
    const snaps = data.snapshots ?? data;
    return unique.map((sym) => {
      const s = snaps[sym];
      const price = s?.latestTrade?.p ?? s?.minuteBar?.c ?? s?.dailyBar?.c;
      const prevClose = s?.prevDailyBar?.c ?? s?.dailyBar?.o ?? price;
      if (!price) return syntheticQuote(sym);
      const change = price - prevClose;
      return {
        symbol: sym,
        price,
        prevClose,
        change: Math.round(change * 100) / 100,
        changePct: Math.round((change / prevClose) * 10000) / 100,
        asOf: s?.latestTrade?.t ?? new Date().toISOString(),
        source: "alpaca" as const,
      };
    });
  } catch (_e) {
    return unique.map(syntheticQuote);
  }
}

export async function getCandles(symbol: string, days = 90): Promise<Candle[]> {
  const headers = alpacaHeaders();
  const sym = symbol.toUpperCase();
  if (headers) {
    try {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - days * 86400000).toISOString();
      const url = `${DATA_BASE}/stocks/${sym}/bars?timeframe=1Day&start=${start}&end=${end}&limit=${days}&adjustment=raw`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const bars = (data.bars ?? []) as Array<Record<string, number | string>>;
        if (bars.length) {
          return bars.map((b) => ({
            time: Math.floor(new Date(b.t as string).getTime() / 1000),
            open: b.o as number,
            high: b.h as number,
            low: b.l as number,
            close: b.c as number,
            volume: (b.v as number) ?? 0,
          }));
        }
      }
    } catch (_e) {
      // fall through to synthetic
    }
  }
  return syntheticCandles(sym, days);
}

function syntheticCandles(symbol: string, days: number): Candle[] {
  const out: Candle[] = [];
  let price = syntheticBase(symbol);
  const seed = hash(symbol);
  for (let i = days; i >= 0; i--) {
    const t = Math.floor((Date.now() - i * 86400000) / 1000);
    const wave = Math.sin((seed % 100) + (days - i) / 6) * (price * 0.01);
    const noise = (((seed * (days - i + 1)) % 100) / 100 - 0.5) * price * 0.02;
    const open = price;
    const close = Math.max(1, price + wave + noise);
    const high = Math.max(open, close) * 1.008;
    const low = Math.min(open, close) * 0.992;
    out.push({
      time: t,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: 1_000_000 + ((seed * (days - i + 7)) % 5_000_000),
    });
    price = close;
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
