-- Switch the built-in congress source from the demo pipeline to a live
-- Financial Modeling Prep integration: an async custom-code brick fetches the
-- latest Senate AND House disclosures, merges them, and normalizes to signals.
-- The installer supplies their own FMP API key (stored per-installation).
-- Requires the async-transform support added to the ingest-source runtime.

update public.data_source_skills
set
  name = 'US Congress Trades (FMP live)',
  description = 'Live Senate + House trading disclosures from Financial Modeling Prep. Requires an FMP API key on a plan that includes the senate/house trading endpoints.',
  signal_kind = 'senator_trade',
  config_schema = '[
    {"key":"apikey","label":"FMP API key","type":"secret","required":true,"secret":true,"help":"Financial Modeling Prep key (financialmodelingprep.com). Plan must include Senate/House trading endpoints."},
    {"key":"limit","label":"Max rows per chamber","type":"number","required":false,"default":100}
  ]'::jsonb,
  pipeline = $j$
  {"steps":[
    {"id":"fetch","type":"transform","config":{
      "apikey":"{{config.apikey}}",
      "limit":"{{config.limit}}",
      "code":"const key=config.apikey;const lim=Math.min(Number(config.limit||100),250);const eps=[['senate','https://financialmodelingprep.com/stable/senate-latest'],['house','https://financialmodelingprep.com/stable/house-latest']];const out=[];let err=null;for(const pair of eps){const chamber=pair[0];const base=pair[1];try{const r=await fetch(base+'?page=0&limit='+lim+'&apikey='+key);if(!r.ok){err=chamber+' HTTP '+r.status+': '+(await r.text()).slice(0,160);continue;}const arr=await r.json();if(Array.isArray(arr)){for(const t of arr){out.push({symbol:t.symbol,event_type:t.type,observed_at:t.transactionDate,payload:{senator:((t.firstName||'')+' '+(t.lastName||'')).trim(),amount:t.amount,office:t.office,asset:t.assetDescription,owner:t.owner,chamber:chamber,disclosed:t.disclosureDate,link:t.link}});}}}catch(e){err=chamber+' '+e.message;}}if(out.length===0&&err){throw new Error('FMP fetch failed — '+err);}return out;"
    }},
    {"id":"emit","type":"emit","config":{"signal_kind":"senator_trade"}}
  ]}
  $j$::jsonb
where slug = 'senator-trades';
