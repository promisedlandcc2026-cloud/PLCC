-- Add audience category to consent form templates (children | adults | all)
-- Run in Supabase SQL Editor if not applied by migrate.

ALTER TABLE public.consent_forms
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'children';

-- Normalize any nulls / unexpected values
UPDATE public.consent_forms
SET audience = 'children'
WHERE audience IS NULL OR audience NOT IN ('children', 'adults', 'all');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consent_forms_audience_check'
  ) THEN
    ALTER TABLE public.consent_forms
      ADD CONSTRAINT consent_forms_audience_check
      CHECK (audience IN ('children', 'adults', 'all'));
  END IF;
END $$;

COMMENT ON COLUMN public.consent_forms.audience IS
  'Who this e-sign form is for: children (pick child), adults (self-sign), all (treat as children for signing)';
