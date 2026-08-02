-- Trade journaling (EdgeFlo-style review & reflection). One row per trade.
-- A trade counts as "journaled" once its review has a reflection or any chart
-- image. Tags are free-text arrays; catalogs are derived from usage, no extra
-- tables. strategy_name is snapshotted so reviews survive strategy deletion.
-- Run in Supabase SQL Editor. Apply before deploying the trade journal pages.

create table if not exists public.trade_reviews (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  trade_id       uuid not null references public.trades (id) on delete cascade,
  plan_followed  boolean,
  strategy_id    uuid references public.strategies (id) on delete set null,
  strategy_name  text,
  confluences    text[] not null default '{}',
  management     text[] not null default '{}',
  mistakes       text[] not null default '{}',
  entry_emotion  text,
  exit_emotion   text,
  reflection     text,
  htf_path       text,
  mtf_path       text,
  ltf_path       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (trade_id)
);

create trigger trade_reviews_updated_at
  before update on public.trade_reviews
  for each row execute function public.set_updated_at();

create index if not exists idx_trade_reviews_user on public.trade_reviews (user_id);
create index if not exists idx_trade_reviews_trade on public.trade_reviews (trade_id);

alter table public.trade_reviews enable row level security;
create policy trade_reviews_select on public.trade_reviews
  for select using (user_id = auth.uid());
create policy trade_reviews_insert on public.trade_reviews
  for insert with check (user_id = auth.uid());
create policy trade_reviews_update on public.trade_reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy trade_reviews_delete on public.trade_reviews
  for delete using (user_id = auth.uid());
