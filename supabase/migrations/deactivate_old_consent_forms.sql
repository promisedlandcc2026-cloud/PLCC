-- Deactivate the old default consent forms
-- Keeps only the 3 new focused PLCC forms active

UPDATE public.consent_forms
SET is_active = false
WHERE title IN (
    'Photo & Video Release',
    'Medical Treatment & Emergency',
    'General Liability & Assumption of Risk',
    'Code of Conduct Agreement'
);

-- Confirm what is now active
SELECT id, title, form_type, is_active
FROM public.consent_forms
ORDER BY is_active DESC, created_at DESC;
