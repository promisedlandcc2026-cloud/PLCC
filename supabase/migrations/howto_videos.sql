-- How To Videos library (external hotlinks + thumbnails; no video file storage)
-- DO NOT apply automatically; review before live apply.

BEGIN;

CREATE TABLE IF NOT EXISTS public.howto_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  provider TEXT NULL CHECK (provider IS NULL OR provider IN ('youtube', 'vimeo', 'direct', 'other')),
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS howto_videos_created_at_idx
  ON public.howto_videos (created_at DESC);

ALTER TABLE public.howto_videos ENABLE ROW LEVEL SECURITY;

-- Reads: any signed-in member
DROP POLICY IF EXISTS "howto_videos_select_authenticated" ON public.howto_videos;
CREATE POLICY "howto_videos_select_authenticated" ON public.howto_videos
  FOR SELECT TO authenticated
  USING (true);

-- Writes: any signed-in member (library is open; API also uses service role)
DROP POLICY IF EXISTS "howto_videos_insert_authenticated" ON public.howto_videos;
CREATE POLICY "howto_videos_insert_authenticated" ON public.howto_videos
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "howto_videos_update_authenticated" ON public.howto_videos;
CREATE POLICY "howto_videos_update_authenticated" ON public.howto_videos
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "howto_videos_delete_authenticated" ON public.howto_videos;
CREATE POLICY "howto_videos_delete_authenticated" ON public.howto_videos
  FOR DELETE TO authenticated
  USING (true);

COMMIT;
