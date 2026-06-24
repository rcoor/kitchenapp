-- Trading + audit: frozen signal snapshots, AI decisions, recommendations,
-- orders, append-only order events, portfolio snapshots. The append-only
-- tables form the immutable audit trail powering "time travel".

-- frozen inputs a decision was made against
create table public.signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'sim',
  prices jsonb not null default '{}',
  signals jsonb not null default '[]',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.signal_snapshots enable row level security;
create policy snapshots_select on public.signal_snapshots for select using (auth.uid() = user_id);
create policy snapshots_insert on public.signal_snapshots for insert with check (auth.uid() = user_id);
create trigger snapshots_immutable before update or delete on public.signal_snapshots
  for each row execute function public.prevent_mutation();

-- AI reasoning runs
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'sim',
  symbols text[] not null default '{}',
  model text,
  system_prompt text,
  prompt text,
  response jsonb,
  signal_snapshot_id uuid references public.signal_snapshots(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.decisions enable row level security;
create policy decisions_select on public.decisions for select using (auth.uid() = user_id);
create policy decisions_insert on public.decisions for insert with check (auth.uid() = user_id);
create trigger decisions_immutable before update or delete on public.decisions
  for each row execute function public.prevent_mutation();

-- normalized per-symbol recommendations (mutable status; drives accept flow)
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  symbol text not null,
  action text not null check (action in ('buy','sell','hold')),
  confidence numeric,
  target_qty numeric,
  rationale text,
  supporting_signals jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending','accepted','dismissed','executed')),
  order_id uuid,
  created_at timestamptz not null default now()
);
alter table public.recommendations enable row level security;
create policy recommendations_all on public.recommendations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- order intents (mutable: status/fills evolve)
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid references public.decisions(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  mode text not null check (mode in ('sim','paper','live')),
  broker text not null default 'alpaca',
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  type text not null default 'market' check (type in ('market','limit')),
  qty numeric not null check (qty > 0),
  limit_price numeric,
  time_in_force text not null default 'day',
  status text not null default 'new'
    check (status in ('new','accepted','partially_filled','filled','canceled','rejected','expired','error')),
  broker_order_id text,
  filled_qty numeric not null default 0,
  filled_avg_price numeric,
  fees numeric not null default 0,
  source text not null default 'manual' check (source in ('manual','recommendation','auto')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create policy orders_all on public.orders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger orders_set_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- append-only order lifecycle log
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  status text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.order_events enable row level security;
create policy order_events_select on public.order_events for select using (auth.uid() = user_id);
create policy order_events_insert on public.order_events for insert with check (auth.uid() = user_id);
create trigger order_events_immutable before update or delete on public.order_events
  for each row execute function public.prevent_mutation();

-- periodic equity/positions snapshots for historical P&L
create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  equity numeric,
  cash numeric,
  positions jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.portfolio_snapshots enable row level security;
create policy portfolio_select on public.portfolio_snapshots for select using (auth.uid() = user_id);
create policy portfolio_insert on public.portfolio_snapshots for insert with check (auth.uid() = user_id);
create trigger portfolio_immutable before update or delete on public.portfolio_snapshots
  for each row execute function public.prevent_mutation();

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index order_events_order_idx on public.order_events (order_id, created_at);
create index decisions_user_created_idx on public.decisions (user_id, created_at desc);
create index recommendations_user_status_idx on public.recommendations (user_id, status);
