-- Manual backtesting (bar replay): sessions, backtest trades, and a candle
-- cache. Backtest results live in their OWN tables, never in public.trades,
-- so live expectancy, discipline score and dashboard stats are never polluted
-- by practice trades.
--
-- public.candles is deliberately NOT uid-scoped: it caches public market data
-- (OHLC candles from Twelve Data / Binance) so repeated replays of the same
-- pair/timeframe/range do not burn the free Twelve Data quota (800 req/day).
-- RLS still restricts reads/writes to signed-in users; there is no user data
-- in the table. App code degrades gracefully while this migration is missing
-- (replay works in-memory with a notice, nothing persists, no cache).

-- Replay sessions: one row per backtest run.
create table if not exists public.backtest_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  pair             text not null,                -- app label, e.g. "EUR/USD"
  timeframe        text not null,                -- "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
  replay_from      timestamptz not null,         -- first replayed bar
  replayed_to      timestamptz,                  -- how far the replay has advanced (resume point)
  name             text,
  strategy_id      uuid references public.strategies (id) on delete set null,
  strategy_name    text,                         -- snapshot so deleted plans still resolve
  starting_balance numeric not null default 10000,
  risk_pct         numeric not null default 1,   -- % of starting balance risked per trade (flat, not compounding)
  status           text not null default 'active' check (status in ('active', 'done')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger backtest_sessions_updated_at
  before update on public.backtest_sessions
  for each row execute function public.set_updated_at();

-- Hypothetical trades taken during a replay.
create table if not exists public.backtest_trades (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.backtest_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  direction  text not null check (direction in ('long', 'short')),
  entry      numeric not null,
  stop       numeric not null,
  target     numeric,
  exit       numeric,
  entered_at timestamptz not null,               -- bar time when placed
  exited_at  timestamptz,
  outcome    text not null default 'open' check (outcome in ('open', 'tp', 'sl', 'manual')),
  r          numeric,                            -- R multiple at exit
  pnl        numeric,                            -- risk_amount * r, in account currency
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists idx_backtest_sessions_user on public.backtest_sessions (user_id, created_at desc);
create index if not exists idx_backtest_trades_session on public.backtest_trades (session_id);
create index if not exists idx_backtest_trades_user on public.backtest_trades (user_id);

alter table public.backtest_sessions enable row level security;
create policy backtest_sessions_select on public.backtest_sessions
  for select using (user_id = auth.uid());
create policy backtest_sessions_insert on public.backtest_sessions
  for insert with check (user_id = auth.uid());
create policy backtest_sessions_update on public.backtest_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy backtest_sessions_delete on public.backtest_sessions
  for delete using (user_id = auth.uid());

alter table public.backtest_trades enable row level security;
create policy backtest_trades_select on public.backtest_trades
  for select using (user_id = auth.uid());
create policy backtest_trades_insert on public.backtest_trades
  for insert with check (user_id = auth.uid());
create policy backtest_trades_update on public.backtest_trades
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy backtest_trades_delete on public.backtest_trades
  for delete using (user_id = auth.uid());

-- Shared OHLC cache (public market data, no user rows; see header comment).
create table if not exists public.candles (
  symbol    text not null,                        -- app pair label, e.g. "EUR/USD"
  timeframe text not null,
  ts        timestamptz not null,                 -- bar open time, UTC
  o numeric not null,
  h numeric not null,
  l numeric not null,
  c numeric not null,
  primary key (symbol, timeframe, ts)
);

alter table public.candles enable row level security;
create policy candles_select on public.candles
  for select to authenticated using (true);
create policy candles_insert on public.candles
  for insert to authenticated with check (true);
