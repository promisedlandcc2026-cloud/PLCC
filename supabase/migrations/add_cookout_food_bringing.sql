-- What dish each cookout family is bringing (potluck planning)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_bringing'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN food_bringing TEXT;
  END IF;
END $$;
