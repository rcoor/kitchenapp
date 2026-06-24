-- Data sources as installable, shareable "skills". A skill carries a
-- customizable PIPELINE: an ordered list of bricks (http_request, scrape,
-- json_select, map, filter, dedupe, emit) plus an optional custom-code
-- (transform) brick. All skills normalize into the shared `signals` table.

-- skill / plugin manifest (also serves as the shareable catalog)
create table public.data_source_skills (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  slug text not null unique,
  name text not null,
  description text,
  version text not null default '1.0.0',
  visibility text not null default 'private' check (visibility in ('private','shared')),
  is_builtin boolean not null default false,
  signal_kind text not null default 'custom',
  -- params an installer must provide, e.g. [{key,label,type,required,secret}]
  config_schema jsonb not null default '[]',
  -- ordered bricks: { steps: [ { id, type, config }, ... ] }
  pipeline jsonb not null default '{"steps":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.data_source_skills enable row level security;
-- visible if built-in, shared, or authored by the viewer
create policy skills_select on public.data_source_skills for select
  using (is_builtin or visibility = 'shared' or author_id = auth.uid());
create policy skills_insert on public.data_source_skills for insert
  with check (author_id = auth.uid());
create policy skills_update on public.data_source_skills for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy skills_delete on public.data_source_skills for delete
  using (author_id = auth.uid());
create trigger skills_set_updated before update on public.data_source_skills
  for each row execute function public.set_updated_at();

-- a user enabling a skill with their config
create table public.data_source_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.data_source_skills(id) on delete cascade,
  config jsonb not null default '{}',
  schedule text,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, skill_id)
);
alter table public.data_source_installations enable row level security;
create policy installations_all on public.data_source_installations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger installations_set_updated before update on public.data_source_installations
  for each row execute function public.set_updated_at();

-- normalized signal output from any skill
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid references public.data_source_installations(id) on delete cascade,
  skill_id uuid references public.data_source_skills(id) on delete set null,
  skill_slug text,
  signal_kind text not null default 'custom',
  symbol text,
  event_type text,
  observed_at timestamptz,
  numeric_value numeric,
  confidence numeric,
  payload jsonb not null default '{}',
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (installation_id, dedupe_key)
);
alter table public.signals enable row level security;
create policy signals_all on public.signals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index signals_user_symbol_idx on public.signals (user_id, symbol);
create index signals_user_observed_idx on public.signals (user_id, observed_at desc);

-- realtime for live UI updates
alter publication supabase_realtime add table
  public.orders,
  public.order_events,
  public.positions,
  public.recommendations,
  public.decisions,
  public.signals;
