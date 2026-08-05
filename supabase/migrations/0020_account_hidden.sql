-- Hide accounts from everyday view (switcher, dashboard cards) without
-- deleting them. Cosmetic only: a hidden account's trades still count in
-- all-accounts stats, and Settings > Accounts can show and unhide it.
-- Run in Supabase SQL Editor.

alter table public.accounts
  add column if not exists hidden boolean not null default false;
