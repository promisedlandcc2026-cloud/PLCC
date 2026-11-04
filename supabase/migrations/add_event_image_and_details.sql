-- Event calendar enrichment: cover image, end time, description
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.events ADD COLUMN image_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'end_time'
  ) THEN
    ALTER TABLE public.events ADD COLUMN end_time TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'description'
  ) THEN
    ALTER TABLE public.events ADD COLUMN description TEXT;
  END IF;
END $$;
