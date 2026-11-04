-- Fix RLS so authenticated users can read consent forms

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "consent_forms_view_active" ON public.consent_forms;
DROP POLICY IF EXISTS "consent_forms_admin_all" ON public.consent_forms;

-- Allow ALL authenticated users to read ALL consent forms (active or not)
CREATE POLICY "consent_forms_read_all" ON public.consent_forms
FOR SELECT TO authenticated USING (true);

-- Allow ALL authenticated users to insert/update/delete consent forms
CREATE POLICY "consent_forms_write_all" ON public.consent_forms
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Confirm forms are visible
SELECT id, title, is_active FROM public.consent_forms ORDER BY created_at DESC;
