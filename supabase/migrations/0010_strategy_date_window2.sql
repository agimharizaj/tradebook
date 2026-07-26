-- Strategy extras: an optional date (created / last reviewed / valid from,
-- whatever the trader wants it to mean) and a second trading window so a
-- plan can cover two sessions (e.g. London + New York).
-- Both nullable; existing rows are untouched. RLS on strategies already
-- covers these columns (policies are row-scoped, not column-scoped).
alter table public.strategies
  add column if not exists strategy_date date,
  add column if not exists trading_window_2 text;
