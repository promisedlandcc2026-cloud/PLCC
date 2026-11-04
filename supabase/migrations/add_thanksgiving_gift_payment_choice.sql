-- Thanksgiving RSVP: pledge vs pay-now intent + payment method + DCB post link
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_contribution_intent'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_intent TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_contribution_payment_method'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_payment_method TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'food_contribution_posted_tx_id'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_posted_tx_id TEXT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_registrations_food_contribution_intent_check'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD CONSTRAINT event_registrations_food_contribution_intent_check
      CHECK (
        food_contribution_intent IS NULL
        OR food_contribution_intent IN ('pledge', 'pay_now')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_registrations_food_contribution_payment_method_check'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD CONSTRAINT event_registrations_food_contribution_payment_method_check
      CHECK (
        food_contribution_payment_method IS NULL
        OR food_contribution_payment_method IN ('zelle', 'cashapp', 'venmo')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_registrations_gift_intent
  ON public.event_registrations (event_id, food_contribution_intent)
  WHERE food_contribution_intent IS NOT NULL;
