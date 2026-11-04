-- Store DCB voucher ids (e.g. PLCC-VOUCH-…) as well as local giving_transactions UUIDs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_registrations'
      AND column_name = 'food_contribution_posted_tx_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.event_registrations
      ALTER COLUMN food_contribution_posted_tx_id TYPE TEXT
      USING food_contribution_posted_tx_id::text;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_registrations'
      AND column_name = 'food_contribution_posted_tx_id'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_posted_tx_id TEXT NULL;
  END IF;
END $$;
