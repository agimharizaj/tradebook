-- Sidekick chat history. Run in the Supabase SQL Editor.
-- Conversations + messages, owner-only via RLS. Chart screenshots are NOT
-- stored (only a has_image flag); replaying old images to the model isn't
-- needed and keeping them would bloat the table.

create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'model')),
  content         text not null,
  strategy_name   text,
  has_image       boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_conversations_user
  on public.ai_conversations (user_id, updated_at desc);
create index if not exists idx_ai_messages_conversation
  on public.ai_messages (conversation_id, created_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy ai_conversations_select on public.ai_conversations for select using (user_id = auth.uid());
create policy ai_conversations_insert on public.ai_conversations for insert with check (user_id = auth.uid());
create policy ai_conversations_update on public.ai_conversations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_conversations_delete on public.ai_conversations for delete using (user_id = auth.uid());

create policy ai_messages_select on public.ai_messages for select using (user_id = auth.uid());
create policy ai_messages_insert on public.ai_messages for insert with check (user_id = auth.uid());
create policy ai_messages_update on public.ai_messages for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_messages_delete on public.ai_messages for delete using (user_id = auth.uid());
