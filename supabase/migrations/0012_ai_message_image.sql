-- Persist Sidekick chart screenshots so they still show when a chat is
-- reopened (previously only a has_image flag was stored, so the image was
-- lost on reload). The bytes live in the existing "entry-models" storage
-- bucket; this column holds the object path. Run in the Supabase SQL Editor.
--
-- No new RLS needed: ai_messages is already owner-only (see 0009), and the
-- storage bucket's policies already scope objects to the uploading user.

alter table public.ai_messages
  add column if not exists image_path text;
