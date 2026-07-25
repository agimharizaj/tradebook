-- Saved chart analyses. Run in the Supabase SQL Editor.
-- Screenshots reuse the existing private `entry-models` storage bucket,
-- stored under <user_id>/analysis/<file>, so no new bucket is needed.

create table if not exists public.chart_analyses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  symbol     text not null,
  timeframe  text,
  direction  text check (direction in ('long', 'short', 'neutral')),
  notes      text,
  image_path text,
  created_at timestamptz not null default now()
);

create index if not exists idx_analyses_user on public.chart_analyses (user_id, created_at desc);

alter table public.chart_analyses enable row level security;
create policy analyses_select on public.chart_analyses for select using (user_id = auth.uid());
create policy analyses_insert on public.chart_analyses for insert with check (user_id = auth.uid());
create policy analyses_update on public.chart_analyses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy analyses_delete on public.chart_analyses for delete using (user_id = auth.uid());
