-- Core: extensions, helpers, profiles, automation settings, watchlist,
-- broker accounts, positions. RLS keyed to auth.uid().

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- append-only guard for audit tables
create or replace function public.prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '%.% is append-only; % is not allowed',
    tg_table_schema, tg_table_name, tg_op;
end$$;

-- profiles (1:1 auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  active_mode text not null default 'sim' check (active_mode in ('sim','paper','live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (auth.uid() = id);
create policy profiles_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create trigger profiles_set_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- per-user automation config
create table public.automation_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'sim' check (mode in ('sim','paper','live')),
  min_confidence numeric not null default 0.70,
  max_position_usd numeric not null default 1000,
  max_orders_per_day int not null default 5,
  allowed_symbols text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.automation_settings enable row level security;
create policy automation_all on public.automation_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger automation_set_updated before update on public.automation_settings
  for each row execute function public.set_updated_at();

-- provision profile + automation row for each new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  insert into public.automation_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- watchlist
create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);
alter table public.watchlist_items enable row level security;
create policy watchlist_all on public.watchlist_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- broker credentials (values live in Vault; we store secret references)
create table public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null default 'alpaca',
  mode text not null check (mode in ('paper','live')),
  label text,
  key_secret_id uuid,
  secret_secret_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, broker, mode)
);
alter table public.broker_accounts enable row level security;
create policy broker_accounts_all on public.broker_accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- current positions per mode (sim positions are maintained by us)
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('sim','paper','live')),
  symbol text not null,
  qty numeric not null default 0,
  avg_entry_price numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, mode, symbol)
);
alter table public.positions enable row level security;
create policy positions_all on public.positions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger positions_set_updated before update on public.positions
  for each row execute function public.set_updated_at();
