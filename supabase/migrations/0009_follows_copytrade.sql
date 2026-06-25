-- Politician copy-trading: follow a member of congress, allocate a budget, and
-- mirror their disclosed buys/sells proportionally in sim/paper.
-- NOTE: migration numbers 0007/0008 collide with a parallel line of work on
-- master (House Clerk sourcing). This file documents what was applied to the
-- shared project; reconcile numbering when integrating onto master.

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null,
  member_key text not null,
  chamber text,
  allocation_usd numeric not null check (allocation_usd > 0),
  max_position_pct numeric not null default 20 check (max_position_pct > 0 and max_position_pct <= 100),
  scale_reference_usd numeric not null default 200000 check (scale_reference_usd > 0),
  mode text not null default 'sim' check (mode in ('sim','paper')),
  mirror_buys boolean not null default true,
  mirror_sells boolean not null default true,
  enabled boolean not null default true,
  deployed_usd numeric not null default 0,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, member_key, mode)
);
alter table public.follows enable row level security;
create policy follows_all on public.follows for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger follows_set_updated before update on public.follows
  for each row execute function public.set_updated_at();

create table public.follow_trades (
  id uuid primary key default gen_random_uuid(),
  follow_id uuid not null references public.follows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid references public.signals(id) on delete set null,
  member_name text,
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  rep_amount text,
  rep_midpoint numeric,
  target_notional numeric,
  qty numeric,
  price numeric,
  order_id uuid references public.orders(id) on delete set null,
  status text not null default 'executed' check (status in ('executed','skipped','error')),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.follow_trades enable row level security;
create policy follow_trades_select on public.follow_trades for select using (auth.uid() = user_id);
create policy follow_trades_insert on public.follow_trades for insert with check (auth.uid() = user_id);
create index follow_trades_follow_idx on public.follow_trades (follow_id, created_at desc);

alter publication supabase_realtime add table public.follows, public.follow_trades;

-- service-role-only secret store (RLS on, no policies => only service role reads)
create table public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (key, value)
values ('cron_secret', encode(gen_random_bytes(24), 'hex'));

-- schedule the mirror engine every 15 minutes; reads the cron secret at runtime
select cron.schedule(
  'mirror-follows',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://xhscpwtvvjalfpzfarqw.supabase.co/functions/v1/mirror-trades',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.settings.anon_key', true),
      'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
