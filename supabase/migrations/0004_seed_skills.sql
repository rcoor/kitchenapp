-- Built-in, shareable source skills. These are owned by the system
-- (author_id null, is_builtin true) and appear in every user's catalog.

-- 1) US Senator trades — declarative HTTP/JSON pipeline over the public
--    Senate Stock Watcher dataset.
insert into public.data_source_skills
  (author_id, slug, name, description, version, visibility, is_builtin, signal_kind, config_schema, pipeline)
values (
  null,
  'senator-trades',
  'US Senator Trades',
  'Tracks US senator stock transactions from public Senate financial disclosures (Senate Stock Watcher).',
  '1.0.0',
  'shared',
  true,
  'senator_trade',
  '[
    {"key":"url","label":"Dataset URL","type":"string","required":false,"secret":false,
     "default":"https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json",
     "help":"Public JSON feed of senator transactions."},
    {"key":"limit","label":"Max rows per run","type":"number","required":false,"default":200,
     "help":"Most recent N transactions to ingest."}
  ]'::jsonb,
  '{"steps":[
    {"id":"fetch","type":"http_request","config":{"url":"{{config.url}}","method":"GET"}},
    {"id":"rows","type":"json_select","config":{"path":"$"}},
    {"id":"recent","type":"slice","config":{"limit":"{{config.limit}}"}},
    {"id":"map","type":"map","config":{"mapping":{
      "symbol":"$.ticker",
      "event_type":"$.type",
      "observed_at":"$.transaction_date",
      "payload":{"senator":"$.senator","amount":"$.amount","asset":"$.asset_description","owner":"$.owner"}
    }}},
    {"id":"emit","type":"emit","config":{"signal_kind":"senator_trade"}}
  ]}'::jsonb
);

-- 2) Example custom-code skill — demonstrates the "custom code" brick and the
--    plug-and-play map/emit bricks without any external dependency.
insert into public.data_source_skills
  (author_id, slug, name, description, version, visibility, is_builtin, signal_kind, config_schema, pipeline)
values (
  null,
  'example-custom-code',
  'Example: Custom Code Signal',
  'Demo skill showing a fully custom-code pipeline brick feeding the map/emit bricks. Clone it as a starting point for your own source.',
  '1.0.0',
  'shared',
  true,
  'demo',
  '[]'::jsonb,
  '{"steps":[
    {"id":"gen","type":"transform","config":{"code":"return [{ticker:''AAPL'',score:0.8},{ticker:''NVDA'',score:0.6},{ticker:''TSLA'',score:0.4}];"}},
    {"id":"map","type":"map","config":{"mapping":{
      "symbol":"$.ticker",
      "event_type":"demo_signal",
      "numeric_value":"$.score",
      "payload":{"score":"$.score"}
    }}},
    {"id":"emit","type":"emit","config":{"signal_kind":"demo"}}
  ]}'::jsonb
);
