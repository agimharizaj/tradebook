-- Optional pair tag on notes and strategies, so a note or playbook can be
-- linked to an instrument from the pair catalog. Both tables already have
-- full RLS; a new column inherits it. Run in the Supabase SQL Editor.

alter table public.notes add column if not exists pair text;
alter table public.strategies add column if not exists pair text;
