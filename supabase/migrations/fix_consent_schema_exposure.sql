-- Grant REST API access to consent tables
-- This exposes the tables to the PostgREST API layer

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON public.consent_forms TO anon, authenticated, service_role;
GRANT ALL ON public.child_consents TO anon, authenticated, service_role;
GRANT ALL ON public.consent_check_in_blocks TO anon, authenticated, service_role;
GRANT ALL ON public.consent_audit_log TO anon, authenticated, service_role;

-- Also grant sequence access
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Verify tables exist and are accessible
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'consent%';
