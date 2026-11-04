-- Premises Injury & Parent Supervision Consent + cookout RSVP acknowledgment columns

DO $$
DECLARE
  has_audience boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consent_forms' AND column_name = 'audience'
  ) INTO has_audience;

  IF NOT EXISTS (SELECT 1 FROM public.consent_forms WHERE title = 'Premises Injury & Parent Supervision Consent') THEN
    IF has_audience THEN
      INSERT INTO public.consent_forms (
        title, form_type, content, is_required, requires_signature, valid_duration_days, is_active, audience
      ) VALUES (
        'Premises Injury & Parent Supervision Consent',
        'general_liability',
        E'PREMISES INJURY & PARENT SUPERVISION CONSENT\nPromised Land Christian Center (PLCC)\n\nDear Parent or Guardian,\n\nFellowship cookouts and church-campus gatherings include outdoor play, running, games, and shared spaces. Children may get scrapes, bumps, or other injuries while playing.\n\nPARENT SUPERVISION:\n• Parents / guardians are responsible for watching their own children on church grounds during fellowship cookouts and similar open events\n• PLCC does not provide one-to-one childcare for every child at open fellowship events unless a separate Kids Check-In / nursery program is running\n• You agree to keep your children in sight and follow leader directions about safe play areas\n\nIF A CHILD IS HURT:\n• You will be notified right away when possible\n• Basic first aid may be given\n• Emergency services (911) may be called for serious injury\n• You remain responsible for medical decisions and costs for your child\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You understand play and activity on church premises involve risk of injury\n• You are responsible for supervising your own children at this event\n• You will not hold Promised Land Christian Center, its leaders, staff, or volunteers liable for ordinary accidents or injuries that occur while your children are under your care on the premises\n• You will tell leaders about medical conditions that affect safe play\n• This does not replace other children''s ministry consents used during supervised Kids Check-In or nursery care\n\nThis consent is valid for one (1) year from the date signed, and applies to fellowship cookouts and similar campus gatherings.',
        true,
        true,
        365,
        true,
        'all'
      );
    ELSE
      INSERT INTO public.consent_forms (
        title, form_type, content, is_required, requires_signature, valid_duration_days, is_active
      ) VALUES (
        'Premises Injury & Parent Supervision Consent',
        'general_liability',
        E'PREMISES INJURY & PARENT SUPERVISION CONSENT\nPromised Land Christian Center (PLCC)\n\nDear Parent or Guardian,\n\nFellowship cookouts and church-campus gatherings include outdoor play, running, games, and shared spaces. Children may get scrapes, bumps, or other injuries while playing.\n\nPARENT SUPERVISION:\n• Parents / guardians are responsible for watching their own children on church grounds during fellowship cookouts and similar open events\n• PLCC does not provide one-to-one childcare for every child at open fellowship events unless a separate Kids Check-In / nursery program is running\n• You agree to keep your children in sight and follow leader directions about safe play areas\n\nIF A CHILD IS HURT:\n• You will be notified right away when possible\n• Basic first aid may be given\n• Emergency services (911) may be called for serious injury\n• You remain responsible for medical decisions and costs for your child\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You understand play and activity on church premises involve risk of injury\n• You are responsible for supervising your own children at this event\n• You will not hold Promised Land Christian Center, its leaders, staff, or volunteers liable for ordinary accidents or injuries that occur while your children are under your care on the premises\n• You will tell leaders about medical conditions that affect safe play\n• This does not replace other children''s ministry consents used during supervised Kids Check-In or nursery care\n\nThis consent is valid for one (1) year from the date signed, and applies to fellowship cookouts and similar campus gatherings.',
        true,
        true,
        365,
        true
      );
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'injury_acknowledged'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN injury_acknowledged BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'injury_signed_name'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN injury_signed_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'injury_signed_at'
  ) THEN
    ALTER TABLE public.event_registrations ADD COLUMN injury_signed_at TIMESTAMPTZ;
  END IF;
END $$;
