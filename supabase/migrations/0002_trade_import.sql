-- Adds an external reference (MT5 position/ticket id) to trades so imported
-- rows can be de-duplicated on re-import. Run in the Supabase SQL Editor.

alter table public.trades add column if not exists ext_id text;

-- Fast lookup of existing imported tickets per user.
create index if not exists idx_trades_user_ext on public.trades (user_id, ext_id);
