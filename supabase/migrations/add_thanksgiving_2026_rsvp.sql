-- Seed PLCC Table of Thanksgiving 2026 for fellowship RSVP kit.
-- Fixed id matches THANKSGIVING_2026_EVENT_ID in fellowshipEventConfig.ts.
-- If a calendar event already exists with the same name+date, leave it alone —
-- the API resolves RSVPs by name+date when the fixed UUID is not present.

DO $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id
  FROM public.events
  WHERE name = 'Join us at PLCC Table of Thanksgiving 2026'
    AND date = '2026-11-22'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    -- Align status / end_time on the live calendar row when columns exist
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'end_time'
    ) THEN
      UPDATE public.events
      SET end_time = COALESCE(end_time, '7:00 PM'),
          description = COALESCE(
            NULLIF(TRIM(description), ''),
            'PLCC Table of Thanksgiving. Sign up at /#/thanksgiving-rsvp'
          )
      WHERE id = existing_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'status'
    ) THEN
      UPDATE public.events
      SET status = 'approved'
      WHERE id = existing_id
        AND (status IS NULL OR status = '' OR lower(status) = 'pending');
    END IF;

    RETURN;
  END IF;

  INSERT INTO public.events (id, name, date, time, location, type, starts_at)
  VALUES (
    'a1b2c3d4-e5f6-4789-a012-202611221400'::uuid,
    'Join us at PLCC Table of Thanksgiving 2026',
    '2026-11-22',
    '2:00 PM',
    '2nd Floor Sanctuary',
    'Fellowship',
    '2026-11-22T19:00:00+00'::timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    date = EXCLUDED.date,
    time = EXCLUDED.time,
    location = EXCLUDED.location,
    type = EXCLUDED.type,
    starts_at = EXCLUDED.starts_at;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'end_time'
  ) THEN
    UPDATE public.events
    SET end_time = '7:00 PM',
        description = 'PLCC Table of Thanksgiving. Sign up at /#/thanksgiving-rsvp'
    WHERE id = 'a1b2c3d4-e5f6-4789-a012-202611221400'::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'status'
  ) THEN
    UPDATE public.events
    SET status = 'approved'
    WHERE id = 'a1b2c3d4-e5f6-4789-a012-202611221400'::uuid
      AND (status IS NULL OR status = '');
  END IF;
END $$;
