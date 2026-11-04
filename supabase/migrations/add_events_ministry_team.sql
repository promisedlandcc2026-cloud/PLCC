-- Add Events Ministry team for onboarding + Identity Profile ministry pickers
INSERT INTO public.teams (name, description, category, color, icon_name)
SELECT
  'Events Ministry',
  'Plan and serve church events, cookouts, and special gatherings.',
  'Events',
  'bg-burgundy',
  'Calendar'
WHERE NOT EXISTS (
  SELECT 1 FROM public.teams WHERE lower(name) = lower('Events Ministry')
);

-- Link to ministries catalog when that table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ministries'
  ) THEN
    INSERT INTO public.ministries (name, description)
    SELECT 'Events', 'Church events and special gatherings'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ministries WHERE lower(name) = lower('Events')
    );

    UPDATE public.teams t
    SET ministry_id = m.id
    FROM public.ministries m
    WHERE lower(t.name) = lower('Events Ministry')
      AND lower(m.name) = lower('Events')
      AND t.ministry_id IS NULL;
  END IF;
END $$;
