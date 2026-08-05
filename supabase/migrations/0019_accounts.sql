-- Prop-firm account tracking. Each row is one account instance (a 10K
-- challenge, its funded successor, a personal live account...). Accounts are
-- never deleted on failure - status records the outcome and successor_of
-- links the journey (10K failed -> 10K passed -> 100K funded). Guardrails
-- live PER ACCOUNT (prop firms differ); user_settings keeps the defaults
-- that prefill new accounts and the fallback for trades with no account.
-- trades.account_id scopes the journal, dashboard and trading-day panel.
-- Run in Supabase SQL Editor. Code deploys safely first: consumers fall back
-- until this is applied (trade writes retry without account_id).

create table if not exists public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  firm               text,
  phase              text check (phase in ('challenge', 'verification', 'funded', 'personal', 'demo')),
  size               numeric,
  currency           text,
  status             text not null default 'active' check (status in ('active', 'passed', 'failed', 'closed')),
  -- per-account guardrails (same figure-or-% convention as 0013/0016)
  max_trades_per_day int,
  max_daily_loss     text,
  max_daily_profit   text,
  trading_window     text,
  trading_window_2   text,
  started_on         date not null default (now() at time zone 'utc')::date,
  ended_on           date,
  successor_of       uuid references public.accounts (id) on delete set null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create index if not exists idx_accounts_user on public.accounts (user_id);

alter table public.accounts enable row level security;
create policy accounts_select on public.accounts
  for select using (user_id = auth.uid());
create policy accounts_insert on public.accounts
  for insert with check (user_id = auth.uid());
create policy accounts_update on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_delete on public.accounts
  for delete using (user_id = auth.uid());

alter table public.trades
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

create index if not exists idx_trades_user_account on public.trades (user_id, account_id);
