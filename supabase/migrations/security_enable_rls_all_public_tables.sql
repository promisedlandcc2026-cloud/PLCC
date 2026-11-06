-- PLCC Canaan — Security Advisor fix: rls_disabled_in_public
-- Project: yrpwdrioomdihjlmcfnu
--
-- Enables Row Level Security on every public BASE TABLE that lacks it.
-- With RLS on and no anon policies, PostgREST anon clients cannot read/write
-- (Service Role / Canaan API continues to bypass RLS).
--
-- Also hardens sensitive VIEWS that were leaking PII to anon
-- (consent_status_summary, minutes_tracking_summary, unified_giving).
--
-- Intentional public marketing reads (events, announcements, sermons, videos,
-- community_voices, daily_inspiration, giving_* content) get narrow SELECT
-- policies for anon+authenticated after RLS is enabled.
--
-- APPLY: paste into Supabase Dashboard → SQL Editor → Run
--   or: DATABASE_URL=... node scripts/apply-rls-security-fix.mjs
--
-- Idempotent / additive. Does not DROP tables or data.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Enable RLS on all public base tables missing it
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
      AND c.relname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.name);
    RAISE NOTICE 'Enabled RLS on public.%', r.name;
  END LOOP;
END $$;

-- Explicit high-value tables (safe if already enabled)
ALTER TABLE IF EXISTS public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.member_ministries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ministries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prayer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.giving_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.giving_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finance_pledges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servant_keeper_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servant_keeper_field_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servant_keeper_sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servant_keeper_sync_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servant_keeper_conflicts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) Revoke direct anon privileges on sensitive tables (defense in depth)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  sensitive text[] := ARRAY[
    'members','users','member_ministries','households','forms','form_submissions',
    'store_orders','store_order_items','follow_ups','followup_templates',
    'followup_workflows','followup_workflow_steps','team_members','team_applications',
    'prayer_requests','audit_logs','security_logs','giving_transactions','giving_intents',
    'finance_ledger','finance_expenses','finance_funds','finance_budgets','finance_pledges',
    'finance_counting_sessions','finance_counting_details','bank_deposits',
    'child_consents','consent_forms','consent_check_in_blocks','consent_audit_log',
    'minutes_documents','minutes_acknowledgements','user_notes','user_profiles',
    'user_notifications','connect_cards','visit_registrations','attendance',
    'event_registrations','event_volunteers','event_checkins','member_tags','tags',
    'servant_keeper_config','servant_keeper_field_mapping','servant_keeper_sync_history',
    'servant_keeper_sync_mapping','servant_keeper_conflicts','organization_settings',
    'reports','user_ministries'
  ];
BEGIN
  FOREACH t IN ARRAY sensitive LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO postgres', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Secure PII views (were readable by anon even when base tables had RLS)
-- ---------------------------------------------------------------------------

-- Kids consent dashboard — must not be anon-readable
DROP VIEW IF EXISTS public.consent_status_summary CASCADE;
CREATE VIEW public.consent_status_summary
WITH (security_invoker = true) AS
SELECT
  m.id AS child_id,
  m.first_name,
  m.last_name,
  m.household_name,
  COUNT(DISTINCT cf.id) AS total_required_forms,
  COUNT(DISTINCT CASE
    WHEN cc.status = 'granted' AND (cc.expires_at IS NULL OR cc.expires_at > NOW())
    THEN cc.consent_form_id END) AS completed_forms,
  COUNT(DISTINCT CASE WHEN cc.status = 'expired' THEN cc.consent_form_id END) AS expired_forms,
  CASE
    WHEN COUNT(DISTINCT cf.id) = COUNT(DISTINCT CASE
      WHEN cc.status = 'granted' AND (cc.expires_at IS NULL OR cc.expires_at > NOW())
      THEN cc.consent_form_id END)
    THEN 'complete'
    WHEN COUNT(DISTINCT CASE
      WHEN cc.status = 'granted' AND (cc.expires_at IS NULL OR cc.expires_at > NOW())
      THEN cc.consent_form_id END) > 0
    THEN 'partial'
    ELSE 'none'
  END AS consent_status
FROM public.members m
CROSS JOIN public.consent_forms cf
LEFT JOIN public.child_consents cc
  ON m.id = cc.child_id AND cf.id = cc.consent_form_id
WHERE cf.is_active = true AND cf.is_required = true
GROUP BY m.id, m.first_name, m.last_name, m.household_name;

REVOKE ALL ON public.consent_status_summary FROM anon, PUBLIC;
GRANT SELECT ON public.consent_status_summary TO authenticated;
GRANT ALL ON public.consent_status_summary TO service_role;

-- Minutes tracking — staff only via API (invoker respects users/minutes RLS)
DROP VIEW IF EXISTS public.minutes_tracking_summary CASCADE;
CREATE VIEW public.minutes_tracking_summary
WITH (security_invoker = true) AS
SELECT
  d.id AS document_id,
  d.title,
  d.department AS doc_department,
  u.id AS user_id,
  u.name AS user_name,
  u.role AS user_role,
  u.department AS user_department,
  a.signed_at,
  CASE WHEN a.id IS NOT NULL THEN 'read' ELSE 'pending' END AS status
FROM public.minutes_documents d
CROSS JOIN public.users u
LEFT JOIN public.minutes_acknowledgements a
  ON d.id = a.document_id AND u.id = a.user_id
WHERE lower(COALESCE(u.role, '')) NOT IN ('member', 'guest', 'pending')
  AND COALESCE(d.is_latest, true) = true;

REVOKE ALL ON public.minutes_tracking_summary FROM anon, PUBLIC;
GRANT SELECT ON public.minutes_tracking_summary TO authenticated;
GRANT ALL ON public.minutes_tracking_summary TO service_role;

-- Unified giving — revoke anon; prefer invoker so members RLS applies
DO $$
BEGIN
  IF to_regclass('public.unified_giving') IS NOT NULL THEN
    BEGIN
      EXECUTE 'ALTER VIEW public.unified_giving SET (security_invoker = true)';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not set security_invoker on unified_giving: %', SQLERRM;
    END;
    REVOKE ALL ON public.unified_giving FROM anon, PUBLIC;
    GRANT SELECT ON public.unified_giving TO authenticated;
    GRANT ALL ON public.unified_giving TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Narrow public-read policies for intentional marketing / church site data
--    (only if table exists; Canaan API still uses service role)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.announcements') IS NOT NULL THEN
    ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_announcements" ON public.announcements;
    CREATE POLICY "awc_public_read_announcements" ON public.announcements
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.events') IS NOT NULL THEN
    ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_events" ON public.events;
    CREATE POLICY "awc_public_read_events" ON public.events
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.sermons') IS NOT NULL THEN
    ALTER TABLE public.sermons ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_sermons" ON public.sermons;
    CREATE POLICY "awc_public_read_sermons" ON public.sermons
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.videos') IS NOT NULL THEN
    ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_videos" ON public.videos;
    CREATE POLICY "awc_public_read_videos" ON public.videos
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.community_voices') IS NOT NULL THEN
    ALTER TABLE public.community_voices ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_community_voices" ON public.community_voices;
    CREATE POLICY "awc_public_read_community_voices" ON public.community_voices
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.daily_inspiration') IS NOT NULL THEN
    ALTER TABLE public.daily_inspiration ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_daily_inspiration" ON public.daily_inspiration;
    CREATE POLICY "awc_public_read_daily_inspiration" ON public.daily_inspiration
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.giving_options') IS NOT NULL THEN
    ALTER TABLE public.giving_options ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_giving_options" ON public.giving_options;
    CREATE POLICY "awc_public_read_giving_options" ON public.giving_options
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.giving_content') IS NOT NULL THEN
    ALTER TABLE public.giving_content ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_giving_content" ON public.giving_content;
    CREATE POLICY "awc_public_read_giving_content" ON public.giving_content
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.giving_settings') IS NOT NULL THEN
    ALTER TABLE public.giving_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_giving_settings" ON public.giving_settings;
    CREATE POLICY "awc_public_read_giving_settings" ON public.giving_settings
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.gallery_items') IS NOT NULL THEN
    ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_gallery_items" ON public.gallery_items;
    CREATE POLICY "awc_public_read_gallery_items" ON public.gallery_items
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.gallery') IS NOT NULL THEN
    ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_gallery" ON public.gallery;
    CREATE POLICY "awc_public_read_gallery" ON public.gallery
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- Ministry / team directories (names only; still no write for anon)
  IF to_regclass('public.ministries') IS NOT NULL THEN
    ALTER TABLE public.ministries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_ministries" ON public.ministries;
    CREATE POLICY "awc_public_read_ministries" ON public.ministries
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.teams') IS NOT NULL THEN
    ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "awc_public_read_teams" ON public.teams;
    CREATE POLICY "awc_public_read_teams" ON public.teams
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- Public insert for team applications (landing page); staff read via authenticated policy
  IF to_regclass('public.team_applications') IS NOT NULL THEN
    ALTER TABLE public.team_applications ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow public insert for team applications" ON public.team_applications;
    DROP POLICY IF EXISTS "awc_anon_insert_team_applications" ON public.team_applications;
    CREATE POLICY "awc_anon_insert_team_applications" ON public.team_applications
      FOR INSERT TO anon, authenticated WITH CHECK (true);
    DROP POLICY IF EXISTS "Admins can view team applications" ON public.team_applications;
    DROP POLICY IF EXISTS "awc_staff_read_team_applications" ON public.team_applications;
    CREATE POLICY "awc_staff_read_team_applications" ON public.team_applications
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid()
            AND upper(COALESCE(u.role, '')) IN (
              'SUPER_ADMIN','PASTOR','ADMIN_STAFF','ADMIN','SECRETARY',
              'ASST_SECRETARY','FIRST_LADY','FINANCE','MINISTRY_LEADER'
            )
        )
      );
    DROP POLICY IF EXISTS "awc_staff_write_team_applications" ON public.team_applications;
    CREATE POLICY "awc_staff_write_team_applications" ON public.team_applications
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid()
            AND upper(COALESCE(u.role, '')) IN (
              'SUPER_ADMIN','PASTOR','ADMIN_STAFF','ADMIN','SECRETARY',
              'ASST_SECRETARY','FIRST_LADY','FINANCE','MINISTRY_LEADER'
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid()
            AND upper(COALESCE(u.role, '')) IN (
              'SUPER_ADMIN','PASTOR','ADMIN_STAFF','ADMIN','SECRETARY',
              'ASST_SECRETARY','FIRST_LADY','FINANCE','MINISTRY_LEADER'
            )
        )
      );
  END IF;
END $$;

COMMIT;

-- Verify remaining tables without RLS (should be empty or only system leftovers)
SELECT c.relname AS table_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY 1;
