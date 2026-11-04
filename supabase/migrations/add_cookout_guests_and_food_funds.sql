-- Guests invited + optional food contribution funds for Fellowship Cookout RSVP
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'guests_invited'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN guests_invited INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_contribution_amount'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_amount NUMERIC(10, 2) NULL;
  END IF;
END $$;
