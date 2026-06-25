-- The free Senate/House Stock Watcher S3 datasets were locked down
-- (now return AccessDenied), so the original senator-trades pipeline fetched a
-- dead URL and produced zero signals. Re-point the built-in skill at a
-- self-contained custom-code demo pipeline so the source works end-to-end with
-- no external dependency, clearly labelled as sample data. A live, keyed source
-- (e.g. Financial Modeling Prep / Quiver) can replace this pipeline later.

update public.data_source_skills
set
  name = 'US Congress Trades (demo data)',
  description = 'The free public disclosure feed went offline, so this loads illustrative sample congressional trades via a custom-code pipeline — enough to see signals flow into the AI end-to-end. Ask to connect a live source (API key) for real data.',
  signal_kind = 'senator_trade',
  config_schema = '[]'::jsonb,
  pipeline = $json$
  {"steps":[
    {"id":"gen","type":"transform","config":{"code":"const rows=[['NVDA','Purchase','$100,001 - $250,000'],['AAPL','Sale','$15,001 - $50,000'],['MSFT','Purchase','$50,001 - $100,000'],['TSLA','Sale','$1,001 - $15,000'],['AMZN','Purchase','$15,001 - $50,000'],['GOOGL','Purchase','$1,001 - $15,000'],['META','Sale','$50,001 - $100,000'],['AMD','Purchase','$15,001 - $50,000']];const members=['Sen. A. Sample','Rep. B. Example','Sen. C. Demo','Rep. D. Placeholder'];const out=[];for(let i=0;i<rows.length;i++){const d=new Date();d.setDate(d.getDate()-(i+1)*2);out.push({ticker:rows[i][0],type:rows[i][1],date:d.toISOString().slice(0,10),member:members[i%members.length],amount:rows[i][2]});}return out;"}},
    {"id":"map","type":"map","config":{"mapping":{"symbol":"$.ticker","event_type":"$.type","observed_at":"$.date","payload":{"senator":"$.member","amount":"$.amount","demo":true}}}},
    {"id":"emit","type":"emit","config":{"signal_kind":"senator_trade"}}
  ]}
  $json$::jsonb
where slug = 'senator-trades';
