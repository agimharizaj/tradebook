-- Day-level journal: plan-followed verdict, a day note, and which pre-market
-- routine items were ticked that day (item text, snapshotted from settings).
-- Guardrail violations are computed live from trades + settings, not stored,
-- so they can never go stale. One row per user per day, created lazily.
-- Run in Supabase SQL Editor. Apply with 0014 before deploying the journal panel.

create table if not exists public.day_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  day           date not null,
  plan_followed text check (plan_followed in ('yes', 'partial', 'no')),
  note          text,
  routine_done  text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, day)
);

create trigger day_reviews_updated_at
  before update on public.day_reviews
  for each row execute function public.set_updated_at();

create index if not exists idx_day_reviews_user_day on public.day_reviews (user_id, day);

alter table public.day_reviews enable row level security;
create policy day_reviews_select on public.day_reviews
  for select using (user_id = auth.uid());
create policy day_reviews_insert on public.day_reviews
  for insert with check (user_id = auth.uid());
create policy day_reviews_update on public.day_reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy day_reviews_delete on public.day_reviews
  for delete using (user_id = auth.uid());
