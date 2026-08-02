-- Account-level settings: trading guardrails (drive journal violations and the
-- Charts trading-day panel), the pre-market routine, and the tutorial flag.
-- Money limits follow the 0013 convention: text holding a figure ("200") or a
-- percent of account ("5%"). Account size / currency stay in auth metadata
-- (Profile "Trading profile" moved to Settings but keeps writing metadata).
-- One row per user. The app degrades gracefully if this migration is not
-- applied yet (defaults, no persistence), but apply it before relying on
-- guardrails, routine, or the tutorial.

create table if not exists public.user_settings (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  max_trades_per_day int,
  max_daily_loss     text,
  max_daily_profit   text,
  trading_window     text,
  trading_window_2   text,
  routine_items      jsonb not null default '["Meditate 15 mins", "Review your trading plan", "Review charts"]',
  routine_notify     boolean not null default false,
  routine_remind_at  text,
  warn_on_charts     boolean not null default true,
  tutorial_done      boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
create policy user_settings_select on public.user_settings
  for select using (user_id = auth.uid());
create policy user_settings_insert on public.user_settings
  for insert with check (user_id = auth.uid());
create policy user_settings_update on public.user_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_settings_delete on public.user_settings
  for delete using (user_id = auth.uid());
