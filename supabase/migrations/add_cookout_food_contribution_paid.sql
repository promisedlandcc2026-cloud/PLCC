-- Track whether cookout food contribution gifts have been paid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_contribution_paid'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_paid BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_contribution_paid_at'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_paid_at TIMESTAMPTZ NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_contribution_paid_by'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_paid_by TEXT NULL;
  END IF;
END $$;
