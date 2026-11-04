-- Optional photo on a Vault News post.
-- Run this in the Vault Supabase SQL editor after vault_news.sql.

ALTER TABLE public.vault_news
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.vault_news.image_url IS
  'Public photo URL for a Vault News post. Uploads go through the Vault API.';
