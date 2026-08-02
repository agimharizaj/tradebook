-- Trade open time, for EdgeFlo-style durations. traded_on keeps being the
-- close time (import convention since 0004); opened_at is optional and comes
-- from the broker report's Open Time column or the manual form. The app
-- degrades gracefully until applied (writes retry without the column).
-- Run in Supabase SQL Editor.

alter table public.trades
  add column if not exists opened_at timestamptz;
