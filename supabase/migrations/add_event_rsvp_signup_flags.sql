-- Calendar events can opt into a public signup page (simple or fellowship meal).
-- Backfills Cookout + Thanksgiving fellowship kit rows.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_template text;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_close_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_rsvp_template_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_rsvp_template_check
      CHECK (
        rsvp_template IS NULL
        OR rsvp_template IN ('simple', 'fellowship')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.events.rsvp_enabled IS 'When true, public /events/:id/rsvp signup is available';
COMMENT ON COLUMN public.events.rsvp_template IS 'simple | fellowship — required when rsvp_enabled';
COMMENT ON COLUMN public.events.rsvp_close_at IS 'Public RSVP close instant; null = end of day before event date (ET)';

-- Fellowship Cookout
UPDATE public.events
SET
  rsvp_enabled = true,
  rsvp_template = 'fellowship',
  rsvp_close_at = COALESCE(rsvp_close_at, '2026-09-07T00:00:00-04:00'::timestamptz)
WHERE id = 'a1b2c3d4-e5f6-4789-a012-202609201400'::uuid
   OR (name = 'Fellowship Cookout' AND date = '2026-09-20');

-- PLCC Table of Thanksgiving 2026
UPDATE public.events
SET
  rsvp_enabled = true,
  rsvp_template = 'fellowship',
  rsvp_close_at = COALESCE(rsvp_close_at, '2026-11-16T23:59:00-05:00'::timestamptz)
WHERE id = 'a1b2c3d4-e5f6-4789-a012-202611221400'::uuid
   OR (name = 'Join us at PLCC Table of Thanksgiving 2026' AND date = '2026-11-22');
