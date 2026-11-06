-- Allow Live Huddle as a Canaan News kind.
-- Run this in PLCC Canaan Supabase SQL editor after vault_news.sql.

ALTER TABLE public.vault_news
  DROP CONSTRAINT IF EXISTS vault_news_kind_check;

ALTER TABLE public.vault_news
  ADD CONSTRAINT vault_news_kind_check
  CHECK (kind IN ('church', 'database', 'celebration', 'sympathy', 'live_huddle'));
