-- Optional photo on a Canaan News post.
-- Run this in PLCC Canaan Supabase SQL editor after vault_news.sql.

ALTER TABLE public.vault_news
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.vault_news.image_url IS
  'Public photo URL for a Canaan News post. Uploads go through PLCC Canaan API.';
