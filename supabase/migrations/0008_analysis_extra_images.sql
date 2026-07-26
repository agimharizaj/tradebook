-- Additional chart screenshots appended to an analysis after it was saved.
-- Paths into the entry-models bucket, same as image_path.
alter table public.chart_analyses
  add column if not exists extra_images text[] not null default '{}';
