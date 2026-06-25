// On-demand parser for a single US House Periodic Transaction Report.
// Given a PTR PDF URL (from a house_disclosure / house_trade signal payload),
// fetches the official PDF, extracts its text, and returns the individual
// trades. Lets the UI drill from a "PTR filed" signal into the actual trades
// without re-running the whole ingest. Same tolerant parser as the
// `house_ptr_parse` pipeline brick.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Trade = {
  ticker: string;
  type: string | null;
  txnDate: string | null;
  amount: string;
  amountMid: number | null;
  snippet: string;
};

function parseHousePtr(text: string): Trade[] {
  const out: Trade[] = [];
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
    if (!ticker) continue;
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
      amount: `$${m[1]} - $${m[2]}`,
      amountMid: Number.isFinite(low) && Number.isFinite(high) ? Math.round((low + high) / 2) : null,
      snippet: win.slice(-90).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { doc_url } = await req.json();
    if (!doc_url) return json({ error: "doc_url required" }, 400);

    // SSRF guard: only fetch official House Clerk PTR PDFs.
    let host = "";
    try {
      host = new URL(String(doc_url)).hostname.toLowerCase();
    } catch {
      return json({ error: "invalid doc_url" }, 400);
    }
    if (host !== "disclosures-clerk.house.gov") {
      return json({ error: "only disclosures-clerk.house.gov PTR PDFs are allowed" }, 400);
    }

    const res = await fetch(String(doc_url), { headers: { "user-agent": "HelmBot/1.0" } });
    if (!res.ok) return json({ error: `HTTP ${res.status} fetching PDF` }, 502);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const { extractText, getDocumentProxy } = await import("npm:unpdf@^0.12.0");
    // isEvalSupported:false stops pdf.js compiling embedded PostScript functions
    // via `new Function` (can throw "unsupported Unicode escape sequence" here).
    const pdf = await getDocumentProxy(bytes, { isEvalSupported: false });
    const { text } = await extractText(pdf, { mergePages: true });
    const full = Array.isArray(text) ? text.join("\n") : String(text ?? "");

    const trades = parseHousePtr(full);
    return json({ ok: true, doc_url, count: trades.length, trades });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
