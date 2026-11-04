-- Food Allergy Consent should count toward Children e-sign progress.
UPDATE public.consent_forms
SET
  is_required = true,
  updated_at = NOW()
WHERE title = 'Food Allergy Consent'
  AND COALESCE(is_active, true) = true;
