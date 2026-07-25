-- Notebook: free-form notes. Run in the Supabase SQL Editor.

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Untitled',
  content    text,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

create index if not exists idx_notes_user on public.notes (user_id, updated_at desc);

alter table public.notes enable row level security;
create policy notes_select on public.notes for select using (user_id = auth.uid());
create policy notes_insert on public.notes for insert with check (user_id = auth.uid());
create policy notes_update on public.notes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notes_delete on public.notes for delete using (user_id = auth.uid());
