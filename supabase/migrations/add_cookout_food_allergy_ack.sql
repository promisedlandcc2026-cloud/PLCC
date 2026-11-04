-- Store Food Allergy Consent acknowledgment on cookout RSVPs (when children > 0)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_allergy_acknowledged'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN food_allergy_acknowledged BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_allergy_signed_name'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN food_allergy_signed_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_allergy_signed_at'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN food_allergy_signed_at TIMESTAMPTZ;
  END IF;
END $$;
