-- Team applications are reviewed through the API (service role).
-- There is no public application form in the app, so the open insert policy is removed.
-- audit_logs has no anon insert policy. Browser inserts from authenticated users
-- are also removed; the API writes those rows with the service role.

DROP POLICY IF EXISTS "Allow public insert for team applications" ON public.team_applications;
DROP POLICY IF EXISTS "awc_anon_insert_team_applications" ON public.team_applications;

DROP POLICY IF EXISTS "Users can insert audit logs" ON public.audit_logs;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.team_applications FROM anon;
REVOKE INSERT ON TABLE public.audit_logs FROM anon, authenticated;
