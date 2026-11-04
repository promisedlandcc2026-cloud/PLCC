-- Store DCB voucher id after Mark Paid HMAC ingest (Thanksgiving RSVP → DCB bridge)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_registrations'
      AND column_name = 'food_contribution_dcb_voucher_id'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN food_contribution_dcb_voucher_id TEXT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_registrations_dcb_voucher
  ON public.event_registrations (food_contribution_dcb_voucher_id)
  WHERE food_contribution_dcb_voucher_id IS NOT NULL;
