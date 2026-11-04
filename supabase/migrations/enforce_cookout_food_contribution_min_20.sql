-- Enforce cookout food gift minimum at the database (blocks under-$20 inserts/updates).
-- NOT VALID: existing rows under $20 (e.g. before the rule) are left as-is; new writes must pass.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_registrations'
      AND column_name = 'food_contribution_amount'
  ) THEN
    ALTER TABLE public.event_registrations
      DROP CONSTRAINT IF EXISTS event_registrations_food_contribution_min_20;

    ALTER TABLE public.event_registrations
      ADD CONSTRAINT event_registrations_food_contribution_min_20
      CHECK (
        food_contribution_amount IS NULL
        OR food_contribution_amount >= 20
      )
      NOT VALID;
  END IF;
END $$;
