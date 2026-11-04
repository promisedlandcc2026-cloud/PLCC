-- Allow deleting calendar events that have RSVP signups.
-- Production FK was RESTRICT/NO ACTION; align with intentional event delete.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'event_registrations'
      AND constraint_name = 'event_registrations_event_id_fkey'
  ) THEN
    ALTER TABLE public.event_registrations
      DROP CONSTRAINT event_registrations_event_id_fkey;
  END IF;

  ALTER TABLE public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_fkey
    FOREIGN KEY (event_id)
    REFERENCES public.events(id)
    ON DELETE CASCADE;
END $$;
