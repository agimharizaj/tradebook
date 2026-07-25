-- Turns trades.traded_on into a full timestamp so time-of-day and session
-- analytics become possible, and stores fees separately from net PnL.
-- Existing date values become midnight UTC of the same day, so no history
-- changes meaning. The app reads the date part either way, so it is safe to
-- run this before or after deploying the matching code.
-- Run in the Supabase SQL Editor.

alter table public.trades alter column traded_on drop default;

alter table public.trades
  alter column traded_on type timestamptz
  using traded_on::timestamptz;

alter table public.trades alter column traded_on set default now();

-- Commissions + swap for the trade. pnl stays net of fees, so all existing
-- analytics keep working; this column enables "what did fees cost me" reports.
alter table public.trades add column if not exists commission numeric;

comment on column public.trades.commission is
  'Commissions plus swap, stored negative for costs. pnl is net of fees.';
