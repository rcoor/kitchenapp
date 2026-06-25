-- Built-in source skill: US House financial disclosures, sourced directly from
-- the official Office of the Clerk bulk feed (no third-party reseller).
--
-- The Clerk publishes one ZIP per year at
--   https://disclosures-clerk.house.gov/public_disc/financial-pdfs/<YEAR>FD.zip
-- containing an XML index of every filing. We fetch the ZIP, unzip the XML, and
-- emit one signal per Periodic Transaction Report (FilingType "P") — the STOCK
-- Act trade disclosures. The index carries the representative, filing date, and
-- a link to the PTR PDF; ticker-level line items live inside those PDFs and are
-- a documented follow-up (PDF parsing / OCR).
insert into public.data_source_skills
  (author_id, slug, name, description, version, visibility, is_builtin, signal_kind, config_schema, pipeline)
values (
  null,
  'house-disclosures',
  'US House Disclosures',
  'Tracks US House Periodic Transaction Report filings directly from the official Office of the Clerk bulk feed (disclosures-clerk.house.gov).',
  '1.0.0',
  'shared',
  true,
  'house_disclosure',
  '[
    {"key":"url","label":"Bulk ZIP URL","type":"string","required":false,"secret":false,
     "default":"https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2026FD.zip",
     "help":"Official House Clerk annual financial-disclosure ZIP. Change the year to backfill."},
    {"key":"limit","label":"Max filings per run","type":"number","required":false,"default":200,
     "help":"Most recent N PTR filings to ingest."}
  ]'::jsonb,
  '{"steps":[
    {"id":"fetch","type":"http_request","config":{"url":"{{config.url}}","method":"GET","as":"bytes"}},
    {"id":"unzip","type":"unzip","config":{"entry":"\\.xml$"}},
    {"id":"rows","type":"xml_select","config":{"path":"$.FinancialDisclosure.Member"}},
    {"id":"shape","type":"transform","config":{"limit":"{{config.limit}}","code":"const lim = Number(config.limit || 200); const rows = Array.isArray(input) ? input.slice() : []; const out = []; for (const r of rows) { const ft = String(r.FilingType || '''').trim().toUpperCase(); if (ft !== ''P'') continue; const year = String(r.Year || '''').trim(); const docId = String(r.DocID || '''').trim(); const name = [r.Prefix, r.First, r.Last, r.Suffix].map(function(x){ return x == null ? '''' : String(x).trim(); }).filter(Boolean).join('' '').trim(); const docUrl = (docId && year) ? (''https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/'' + year + ''/'' + docId + ''.pdf'') : null; out.push({ symbol: null, event_type: ''ptr_filed'', observed_at: r.FilingDate || null, payload: { representative: name, state_district: r.StateDst || null, filing_type: ft, year: year, doc_id: docId, doc_url: docUrl }, dedupe_key: docId || (name + ''|'' + (r.FilingDate || '''')) }); } out.sort(function(a, b){ return (Date.parse(b.observed_at || '''') || 0) - (Date.parse(a.observed_at || '''') || 0); }); return out.slice(0, lim);"}},
    {"id":"emit","type":"emit","config":{"signal_kind":"house_disclosure"}}
  ]}'::jsonb
);
