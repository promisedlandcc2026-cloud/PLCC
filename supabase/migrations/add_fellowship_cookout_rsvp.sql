-- Fellowship Cookout RSVP (Sept 20, 2026, 2–6 PM)
-- Extends event_registrations and seeds the calendar event.

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  rsvp_status TEXT DEFAULT 'Going',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN phone TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'household_size'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN household_size INTEGER DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'children_count'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN children_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'allergies'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN allergies TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN notes TEXT;
  END IF;
END $$;

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_registrations' AND policyname = 'Allow insert on event_registrations'
  ) THEN
    CREATE POLICY "Allow insert on event_registrations"
      ON public.event_registrations FOR INSERT TO anon WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_registrations' AND policyname = 'Allow authenticated read event_registrations'
  ) THEN
    CREATE POLICY "Allow authenticated read event_registrations"
      ON public.event_registrations FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Fixed id so the app can always find this cookout
INSERT INTO public.events (id, name, date, time, location, type, starts_at)
VALUES (
  'a1b2c3d4-e5f6-4789-a012-202609201400'::uuid,
  'Fellowship Cookout',
  '2026-09-20',
  '2:00 PM',
  'Church grounds',
  'Fellowship',
  '2026-09-20T18:00:00+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  date = EXCLUDED.date,
  time = EXCLUDED.time,
  type = EXCLUDED.type;

-- Enrichment columns if present (from add_event_image_and_details.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'end_time'
  ) THEN
    UPDATE public.events
    SET end_time = '6:00 PM',
        description = 'Church fellowship cookout. Sign up at /#/fellowship-cookout'
    WHERE id = 'a1b2c3d4-e5f6-4789-a012-202609201400'::uuid;
  END IF;
END $$;
