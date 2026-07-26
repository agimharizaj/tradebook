-- Conversation list controls for Sidekick: pin, unread marker, archive.
-- Run in the Supabase SQL Editor. RLS from 0009 covers the new columns
-- (policies are row-scoped).

alter table public.ai_conversations
  add column if not exists pinned   boolean not null default false,
  add column if not exists unread   boolean not null default false,
  add column if not exists archived boolean not null default false;

-- updated_at is set explicitly by the app when a message arrives. The
-- auto-bump trigger from 0009 would also fire on pin/rename/archive and
-- shuffle the list order, so it goes.
drop trigger if exists ai_conversations_updated_at on public.ai_conversations;
