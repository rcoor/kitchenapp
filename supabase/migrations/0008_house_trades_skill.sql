-- Built-in source skill: ticker-level US House trades ("tradeable information").
--
-- Unlike house-disclosures (which only emits PTR *filing* events), this skill
-- opens each Periodic Transaction Report PDF and parses the individual trades,
-- producing one signal per transaction with a real ticker, buy/sell type, and
-- dollar amount — the form the recommend engine reasons over per symbol.
--
-- Pipeline: fetch <YEAR>FD.zip -> unzip XML index -> select Member rows ->
-- shape (keep PTRs, build PDF URLs, most-recent N) -> parse_ptrs (delegate each
-- PTR PDF to the parse-ptr edge function) -> emit (signal_kind house_trade).
--
-- PDF parsing runs in a SEPARATE function invocation per PDF (parse-ptr), so a
-- pdf.js crash on one malformed PDF only fails that subrequest (skipped) and can
-- never take down this ingest run.
--
-- `limit` is kept small by default: each unit is a separate PDF fetch + parse,
-- so a run of 15 stays well inside the edge-function time budget. Re-runs are
-- deduped at upsert by the per-trade dedupe_key.
insert into public.data_source_skills
  (author_id, slug, name, description, version, visibility, is_builtin, signal_kind, config_schema, pipeline)
values (
  null,
  'house-trades',
  'US House Trades',
  'Ticker-level US House stock trades parsed directly from the official Office of the Clerk Periodic Transaction Report PDFs (disclosures-clerk.house.gov).',
  '1.0.0',
  'shared',
  true,
  'house_trade',
  '[
    {"key":"url","label":"Bulk ZIP URL","type":"string","required":false,"secret":false,
     "default":"https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2026FD.zip",
     "help":"Official House Clerk annual financial-disclosure ZIP. Change the year to backfill."},
    {"key":"limit","label":"Max PTRs per run","type":"number","required":false,"default":15,
     "help":"Most recent N Periodic Transaction Reports to fetch and parse. Each is a PDF download, so keep modest."}
  ]'::jsonb,
  '{"steps":[
    {"id":"fetch","type":"http_request","config":{"url":"{{config.url}}","method":"GET","as":"bytes"}},
    {"id":"unzip","type":"unzip","config":{"entry":"\\.xml$"}},
    {"id":"rows","type":"xml_select","config":{"path":"$.FinancialDisclosure.Member"}},
    {"id":"shape","type":"transform","config":{"limit":"{{config.limit}}","code":"const lim = Number(config.limit || 15); const rows = Array.isArray(input) ? input.slice() : []; const out = []; for (const r of rows) { const ft = String(r.FilingType || '''').trim().toUpperCase(); if (ft !== ''P'') continue; const year = String(r.Year || '''').trim(); const docId = String(r.DocID || '''').trim(); if (!docId || !year) continue; const name = [r.Prefix, r.First, r.Last, r.Suffix].map(function(x){ return x == null ? '''' : String(x).trim(); }).filter(Boolean).join('' '').trim(); out.push({ representative: name, state_district: r.StateDst || null, year: year, doc_id: docId, filing_date: r.FilingDate || null, doc_url: ''https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/'' + year + ''/'' + docId + ''.pdf'' }); } out.sort(function(a, b){ return (Date.parse(b.filing_date || '''') || 0) - (Date.parse(a.filing_date || '''') || 0); }); return out.slice(0, lim);"}},
    {"id":"parse","type":"parse_ptrs","config":{"fn":"parse-ptr"}},
    {"id":"emit","type":"emit","config":{"signal_kind":"house_trade"}}
  ]}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  version = excluded.version,
  signal_kind = excluded.signal_kind,
  config_schema = excluded.config_schema,
  pipeline = excluded.pipeline;
