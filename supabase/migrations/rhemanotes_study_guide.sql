-- Study guide link pushed from RhemaNotes onto the matching sermon.
-- Additive. Safe to re-run. Does not create the sermons table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sermons'
  ) THEN
    ALTER TABLE public.sermons ADD COLUMN IF NOT EXISTS rhemanotes_study_url text;
    ALTER TABLE public.sermons ADD COLUMN IF NOT EXISTS rhemanotes_study_title text;

    ALTER TABLE public.sermons DROP CONSTRAINT IF EXISTS sermons_rhemanotes_study_url_len_chk;
    ALTER TABLE public.sermons
      ADD CONSTRAINT sermons_rhemanotes_study_url_len_chk
      CHECK (rhemanotes_study_url IS NULL OR char_length(rhemanotes_study_url) <= 500);

    ALTER TABLE public.sermons DROP CONSTRAINT IF EXISTS sermons_rhemanotes_study_title_len_chk;
    ALTER TABLE public.sermons
      ADD CONSTRAINT sermons_rhemanotes_study_title_len_chk
      CHECK (rhemanotes_study_title IS NULL OR char_length(rhemanotes_study_title) <= 200);
  END IF;
END $$;
