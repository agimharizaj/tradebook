-- Public share links for journaled trades (EdgeFlo "Share Trade").
-- A share is a random token pointing at one trade. The public page
-- (/share/trade/<token>) resolves it server-side with the service-role key,
-- so no public RLS policy is needed - owner-only policies like every other
-- table. Deleting the row (Revoke in the share dialog) kills the link;
-- deleting the trade or the account cascades. One share per trade.
-- Run in Supabase SQL Editor. The share dialog degrades gracefully until applied.

create table if not exists public.trade_shares (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  trade_id   uuid not null references public.trades (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (trade_id)
);

create index if not exists idx_trade_shares_user on public.trade_shares (user_id);

alter table public.trade_shares enable row level security;
create policy trade_shares_select on public.trade_shares
  for select using (user_id = auth.uid());
create policy trade_shares_insert on public.trade_shares
  for insert with check (user_id = auth.uid());
create policy trade_shares_delete on public.trade_shares
  for delete using (user_id = auth.uid());
