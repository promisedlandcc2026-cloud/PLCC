-- How To Videos: library sections (Vault / Connect / DCB / Tithe)
-- Apply on live after review.

BEGIN;

ALTER TABLE public.howto_videos
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'vault';

ALTER TABLE public.howto_videos
  DROP CONSTRAINT IF EXISTS howto_videos_category_check;

ALTER TABLE public.howto_videos
  ADD CONSTRAINT howto_videos_category_check
  CHECK (category IN ('vault', 'connect', 'dcb', 'tithe'));

CREATE INDEX IF NOT EXISTS howto_videos_category_created_at_idx
  ON public.howto_videos (category, created_at DESC);

-- Existing library entries belong under PLCC Vault
UPDATE public.howto_videos
SET category = 'vault'
WHERE category IS NULL OR category = '' OR category NOT IN ('vault', 'connect', 'dcb', 'tithe');

COMMIT;
