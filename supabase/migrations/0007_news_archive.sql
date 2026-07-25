-- Headline archive. RSS feeds only carry ~2 days of items, so the app saves
-- every headline it sees; the Week/Month filters on the News page read from
-- this archive and get deeper the longer the app runs.
-- Run in the Supabase SQL Editor.

create table if not exists public.news_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  link         text not null,
  title        text not null,
  source       text,
  body         text,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, link)
);

create index if not exists idx_news_user_pub
  on public.news_items (user_id, published_at desc);

alter table public.news_items enable row level security;
create policy news_select on public.news_items for select using (user_id = auth.uid());
create policy news_insert on public.news_items for insert with check (user_id = auth.uid());
create policy news_update on public.news_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy news_delete on public.news_items for delete using (user_id = auth.uid());
