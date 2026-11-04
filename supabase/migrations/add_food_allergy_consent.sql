-- Dedicated Food Allergy Consent (members, parents, cookouts, kids snacks)

DO $$
DECLARE
  has_audience boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consent_forms' AND column_name = 'audience'
  ) INTO has_audience;

  IF EXISTS (SELECT 1 FROM public.consent_forms WHERE title = 'Food Allergy Consent') THEN
    RETURN;
  END IF;

  IF has_audience THEN
    INSERT INTO public.consent_forms (
      title, form_type, content, is_required, requires_signature, valid_duration_days, is_active, audience
    ) VALUES (
      'Food Allergy Consent',
      'medical',
      E'FOOD ALLERGY CONSENT\nPromised Land Christian Center (PLCC)\n\nDear Member / Parent / Guardian,\n\nChurch meals, fellowship cookouts, nursery snacks, and children''s ministry activities may include shared food. Please help us keep everyone safe.\n\nPLEASE TELL THE CHURCH ABOUT:\n• Any food allergies or intolerances (for you or your child)\n• Foods that must be avoided\n• Severity (mild reaction vs emergency / epinephrine)\n• Any emergency medicine you or your child may need\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You will share accurate food-allergy information with PLCC\n• You will update the church if allergies change\n• Shared meals may still involve risk of cross-contact; PLCC will take reasonable care\n• In an emergency, staff will follow PLCC medical procedures and contact you\n• For fellowship cookouts and special meals, you may also note allergies on the event signup form\n\nThis consent is valid for one (1) year from the date signed.',
      false,
      true,
      365,
      true,
      'all'
    );
  ELSE
    INSERT INTO public.consent_forms (
      title, form_type, content, is_required, requires_signature, valid_duration_days, is_active
    ) VALUES (
      'Food Allergy Consent',
      'medical',
      E'FOOD ALLERGY CONSENT\nPromised Land Christian Center (PLCC)\n\nDear Member / Parent / Guardian,\n\nChurch meals, fellowship cookouts, nursery snacks, and children''s ministry activities may include shared food. Please help us keep everyone safe.\n\nPLEASE TELL THE CHURCH ABOUT:\n• Any food allergies or intolerances (for you or your child)\n• Foods that must be avoided\n• Severity (mild reaction vs emergency / epinephrine)\n• Any emergency medicine you or your child may need\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You will share accurate food-allergy information with PLCC\n• You will update the church if allergies change\n• Shared meals may still involve risk of cross-contact; PLCC will take reasonable care\n• In an emergency, staff will follow PLCC medical procedures and contact you\n• For fellowship cookouts and special meals, you may also note allergies on the event signup form\n\nThis consent is valid for one (1) year from the date signed.',
      false,
      true,
      365,
      true
    );
  END IF;
END $$;
