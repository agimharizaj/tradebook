-- Tradebook schema. Run in Supabase SQL Editor (or via CLI).
-- Every table is scoped to the signed-in user via Row Level Security.

-- ---------------------------------------------------------------------------
-- Helper: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- STRATEGIES (Phase 2)
-- ---------------------------------------------------------------------------
create table if not exists public.strategies (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  plan_type          text,
  trading_notes      text,
  is_active          boolean not null default false,
  sort_order         int not null default 0,
  -- risk controls (mirrors the EdgeFlo panel)
  max_trades_per_day int,
  max_daily_loss     numeric,
  max_daily_profit   numeric,
  risk_per_trade_pct numeric,
  trading_window     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger strategies_updated_at
  before update on public.strategies
  for each row execute function public.set_updated_at();

-- Ordered child lists. `content` is the line text; `sort_order` drives order.
create table if not exists public.charting_steps (
  id          uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  sort_order  int not null default 0
);

create table if not exists public.entry_criteria (
  id          uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  is_checked  boolean not null default false,
  sort_order  int not null default 0
);

create table if not exists public.trade_management_rules (
  id          uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  sort_order  int not null default 0
);

create table if not exists public.exit_criteria (
  id          uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  is_checked  boolean not null default false,
  sort_order  int not null default 0
);

-- Entry-model screenshots. `image_path` points at an object in the
-- `entry-models` storage bucket.
create table if not exists public.entry_models (
  id          uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  image_path  text not null,
  caption     text,
  sort_order  int not null default 0
);

-- ---------------------------------------------------------------------------
-- TRADES (Phase 3 - journal)
-- ---------------------------------------------------------------------------
create table if not exists public.trades (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  strategy_id  uuid references public.strategies (id) on delete set null,
  pair         text,
  direction    text check (direction in ('long', 'short')),
  traded_on    date not null default (now() at time zone 'utc')::date,
  entry_price  numeric,
  stop_price   numeric,
  exit_price   numeric,
  size_lots    numeric,
  pnl          numeric,
  r_multiple   numeric,
  emotion      text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trades_updated_at
  before update on public.trades
  for each row execute function public.set_updated_at();

-- Helpful indexes
create index if not exists idx_strategies_user     on public.strategies (user_id);
create index if not exists idx_charting_strategy   on public.charting_steps (strategy_id);
create index if not exists idx_entry_crit_strategy on public.entry_criteria (strategy_id);
create index if not exists idx_tmr_strategy        on public.trade_management_rules (strategy_id);
create index if not exists idx_exit_crit_strategy  on public.exit_criteria (strategy_id);
create index if not exists idx_models_strategy     on public.entry_models (strategy_id);
create index if not exists idx_trades_user_date    on public.trades (user_id, traded_on);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY: owner-only access on every table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'strategies','charting_steps','entry_criteria','trade_management_rules',
    'exit_criteria','entry_models','trades'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy %1$s_select on public.%1$s
        for select using (user_id = auth.uid());
    $f$, t);
    execute format($f$
      create policy %1$s_insert on public.%1$s
        for insert with check (user_id = auth.uid());
    $f$, t);
    execute format($f$
      create policy %1$s_update on public.%1$s
        for update using (user_id = auth.uid()) with check (user_id = auth.uid());
    $f$, t);
    execute format($f$
      create policy %1$s_delete on public.%1$s
        for delete using (user_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- STORAGE: private bucket for entry-model screenshots
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('entry-models', 'entry-models', false)
on conflict (id) do nothing;

-- Users can only touch files under a folder named after their user id:
--   entry-models/<user_id>/<strategy_id>/<file>
create policy "entry_models_read" on storage.objects
  for select using (
    bucket_id = 'entry-models'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "entry_models_write" on storage.objects
  for insert with check (
    bucket_id = 'entry-models'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "entry_models_delete" on storage.objects
  for delete using (
    bucket_id = 'entry-models'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
