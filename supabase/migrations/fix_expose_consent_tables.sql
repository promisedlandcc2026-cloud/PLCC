-- Expose consent tables to PostgREST by adding them to the realtime publication
-- This forces Supabase to recognize them in the schema cache

ALTER TABLE public.consent_forms REPLICA IDENTITY FULL;
ALTER TABLE public.child_consents REPLICA IDENTITY FULL;

-- Re-grant everything explicitly
GRANT ALL PRIVILEGES ON TABLE public.consent_forms TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.child_consents TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.consent_check_in_blocks TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.consent_audit_log TO postgres, anon, authenticated, service_role;

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT 
    schemaname,
    tablename,
    tableowner,
    hasindexes
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'consent%';
