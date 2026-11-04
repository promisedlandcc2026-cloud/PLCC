-- T-shirt sizes for fellowship cookout RSVPs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'tshirt_sizes'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN tshirt_sizes TEXT;
  END IF;
END $$;
