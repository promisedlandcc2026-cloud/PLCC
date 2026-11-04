-- Seed The Marrieds Dinner 2026 for fellowship RSVP kit (Pledge / Pay Now + Mark Paid → DCB).
-- Fixed id matches MARRIEDS_DINNER_2026_EVENT_ID in fellowshipEventConfig.ts.

DO $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id
  FROM public.events
  WHERE name = 'The Marrieds Dinner 2026'
    AND date = '2026-12-12'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'end_time'
    ) THEN
      UPDATE public.events
      SET end_time = COALESCE(end_time, '9:00 PM'),
          description = COALESCE(
            NULLIF(TRIM(description), ''),
            'The Marrieds Dinner 2026. Sign up at /#/marrieds-dinner-rsvp'
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

    UPDATE public.events
    SET
      rsvp_enabled = true,
      rsvp_template = 'fellowship',
      rsvp_close_at = COALESCE(rsvp_close_at, '2026-12-05T23:59:00-05:00'::timestamptz)
    WHERE id = existing_id;

    RETURN;
  END IF;

  INSERT INTO public.events (id, name, date, time, location, type, starts_at)
  VALUES (
    'a1b2c3d4-e5f6-4789-a012-202612121800'::uuid,
    'The Marrieds Dinner 2026',
    '2026-12-12',
    '6:00 PM',
    '2nd Floor Sanctuary',
    'Fellowship',
    '2026-12-12T23:00:00+00'::timestamptz
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
    SET end_time = '9:00 PM',
        description = 'The Marrieds Dinner 2026. Sign up at /#/marrieds-dinner-rsvp'
    WHERE id = 'a1b2c3d4-e5f6-4789-a012-202612121800'::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'status'
  ) THEN
    UPDATE public.events
    SET status = 'approved'
    WHERE id = 'a1b2c3d4-e5f6-4789-a012-202612121800'::uuid
      AND (status IS NULL OR status = '');
  END IF;

  UPDATE public.events
  SET
    rsvp_enabled = true,
    rsvp_template = 'fellowship',
    rsvp_close_at = COALESCE(rsvp_close_at, '2026-12-05T23:59:00-05:00'::timestamptz)
  WHERE id = 'a1b2c3d4-e5f6-4789-a012-202612121800'::uuid;
END $$;
