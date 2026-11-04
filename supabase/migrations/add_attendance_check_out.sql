-- Track when children leave (checkout) after kids / youth ministry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'check_out_time'
  ) THEN
    ALTER TABLE public.attendance ADD COLUMN check_out_time TIMESTAMPTZ;
  END IF;
END $$;
