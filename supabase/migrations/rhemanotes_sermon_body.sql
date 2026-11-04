-- Sermon message body and RhemaNotes session link.
-- Additive. Safe to re-run. Does not create the sermons table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sermons'
  ) THEN
    ALTER TABLE public.sermons ADD COLUMN IF NOT EXISTS body text;
    ALTER TABLE public.sermons ADD COLUMN IF NOT EXISTS rhemanotes_session_url text;

    ALTER TABLE public.sermons DROP CONSTRAINT IF EXISTS sermons_body_len_chk;
    ALTER TABLE public.sermons
      ADD CONSTRAINT sermons_body_len_chk
      CHECK (body IS NULL OR char_length(body) <= 50000);

    ALTER TABLE public.sermons DROP CONSTRAINT IF EXISTS sermons_rhemanotes_url_len_chk;
    ALTER TABLE public.sermons
      ADD CONSTRAINT sermons_rhemanotes_url_len_chk
      CHECK (rhemanotes_session_url IS NULL OR char_length(rhemanotes_session_url) <= 500);
  END IF;
END $$;
