-- =============================================================================
-- PLCC Serve Phase 2.3 — serve_signups legacy-collision normalization
-- =============================================================================
-- Shared Supabase schema (Canaan-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
--
-- Runs AFTER serve_phase_2_3_core.sql.
--
-- Context:
--   Core used CREATE TABLE IF NOT EXISTS. Production already had a legacy
--   public.serve_signups with an incompatible shape, so core skipped table
--   creation while still installing RPCs/RLS/grants. Production was then
--   normalized manually to the reviewed contract and live RPC-verified.
--
-- This migration records that normalization in Git history and is safe to run
-- on:
--   * legacy serve_signups (repairs toward target)
--   * already-correct production (mostly no-op)
--   * fresh DB after core (mostly no-op)
--
-- Does NOT:
--   * DROP / TRUNCATE serve_signups
--   * delete rows
--   * alter serve_opportunities
--   * alter event_volunteers / user_notifications
--   * recreate RPCs
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Preflight — abort before irreversible constraint changes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_null_user integer;
  v_orphan_user integer;
  v_dup_user integer;
  v_bad_status integer;
BEGIN
  IF to_regclass('public.serve_signups') IS NULL THEN
    RAISE EXCEPTION 'serve_signups_missing: run serve_phase_2_3_core.sql first';
  END IF;

  SELECT count(*)::integer INTO v_null_user
  FROM public.serve_signups
  WHERE user_id IS NULL;

  IF v_null_user > 0 THEN
    RAISE EXCEPTION
      'serve_signups_user_id_null: % row(s); cannot SET NOT NULL without identity repair',
      v_null_user;
  END IF;

  SELECT count(*)::integer INTO v_orphan_user
  FROM public.serve_signups s
  WHERE s.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.user_id);

  IF v_orphan_user > 0 THEN
    RAISE EXCEPTION
      'serve_signups_user_id_orphan: % row(s) missing public.users.id',
      v_orphan_user;
  END IF;

  SELECT count(*)::integer INTO v_dup_user
  FROM (
    SELECT opportunity_id, user_id
    FROM public.serve_signups
    WHERE user_id IS NOT NULL
    GROUP BY opportunity_id, user_id
    HAVING count(*) > 1
  ) d;

  IF v_dup_user > 0 THEN
    RAISE EXCEPTION
      'serve_signups_duplicate_opportunity_user: % group(s); do not auto-merge',
      v_dup_user;
  END IF;

  SELECT count(*)::integer INTO v_bad_status
  FROM public.serve_signups
  WHERE status IS NULL
     OR status NOT IN ('pending', 'confirmed', 'cancelled', 'declined');

  IF v_bad_status > 0 THEN
    RAISE EXCEPTION
      'serve_signups_invalid_status: % row(s) outside reviewed set',
      v_bad_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) updated_at
-- ---------------------------------------------------------------------------
ALTER TABLE public.serve_signups
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.serve_signups
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.serve_signups
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) member_id nullable
-- ---------------------------------------------------------------------------
ALTER TABLE public.serve_signups
  ALTER COLUMN member_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) status — no default; single reviewed CHECK
-- ---------------------------------------------------------------------------
ALTER TABLE public.serve_signups
  ALTER COLUMN status DROP DEFAULT;

-- Drop duplicate/legacy status CHECK names; keep only serve_signups_status_chk
ALTER TABLE public.serve_signups
  DROP CONSTRAINT IF EXISTS serve_signups_status_check;

ALTER TABLE public.serve_signups
  DROP CONSTRAINT IF EXISTS serve_signups_status_chk;

ALTER TABLE public.serve_signups
  ADD CONSTRAINT serve_signups_status_chk
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'declined'));

ALTER TABLE public.serve_signups
  ALTER COLUMN status SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Drop legacy UNIQUE (opportunity_id, member_id)
-- ---------------------------------------------------------------------------
ALTER TABLE public.serve_signups
  DROP CONSTRAINT IF EXISTS serve_signups_opportunity_id_member_id_key;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'serve_signups'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ~* 'UNIQUE\s*\(\s*opportunity_id\s*,\s*member_id\s*\)'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.serve_signups DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5) user_id NOT NULL + FK → public.users(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
ALTER TABLE public.serve_signups
  ALTER COLUMN user_id SET NOT NULL;

DO $$
DECLARE
  r record;
  v_ok boolean := false;
BEGIN
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'serve_signups'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ~* '\(.*user_id.*\)'
  LOOP
    IF r.def ~* 'REFERENCES\s+(public\.)?users\(id\)'
       AND r.def ~* 'ON DELETE CASCADE' THEN
      v_ok := true;
    ELSE
      EXECUTE format(
        'ALTER TABLE public.serve_signups DROP CONSTRAINT %I',
        r.conname
      );
    END IF;
  END LOOP;

  IF NOT v_ok THEN
    ALTER TABLE public.serve_signups
      ADD CONSTRAINT serve_signups_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6) UNIQUE (opportunity_id, user_id) — add only if missing under any name
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_has boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'serve_signups'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ~* 'UNIQUE\s*\(\s*opportunity_id\s*,\s*user_id\s*\)'
  ) INTO v_has;

  IF NOT v_has THEN
    ALTER TABLE public.serve_signups
      ADD CONSTRAINT serve_signups_opportunity_user_uidx
      UNIQUE (opportunity_id, user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7) opportunity_id FK — ON DELETE CASCADE
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_ok boolean := false;
BEGIN
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'serve_signups'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ~* '\(.*opportunity_id.*\)'
      AND pg_get_constraintdef(c.oid) ~* 'serve_opportunities'
  LOOP
    IF r.def ~* 'ON DELETE CASCADE' THEN
      v_ok := true;
    ELSE
      EXECUTE format(
        'ALTER TABLE public.serve_signups DROP CONSTRAINT %I',
        r.conname
      );
    END IF;
  END LOOP;

  IF NOT v_ok THEN
    ALTER TABLE public.serve_signups
      ADD CONSTRAINT serve_signups_opportunity_id_fkey
      FOREIGN KEY (opportunity_id)
      REFERENCES public.serve_opportunities(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8) member_id FK — ON DELETE SET NULL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_ok boolean := false;
BEGIN
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'serve_signups'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ~* '\(.*member_id.*\)'
      AND pg_get_constraintdef(c.oid) ~* 'members'
  LOOP
    IF r.def ~* 'ON DELETE SET NULL' THEN
      v_ok := true;
    ELSE
      EXECUTE format(
        'ALTER TABLE public.serve_signups DROP CONSTRAINT %I',
        r.conname
      );
    END IF;
  END LOOP;

  IF NOT v_ok THEN
    ALTER TABLE public.serve_signups
      ADD CONSTRAINT serve_signups_member_id_fkey
      FOREIGN KEY (member_id)
      REFERENCES public.members(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS serve_signups_user_status_idx
  ON public.serve_signups (user_id, status);

DROP INDEX IF EXISTS public.serve_signups_opportunity_idx;

COMMENT ON TABLE public.serve_signups IS
  'PLCC Serve 2.3 one-row lifecycle per (opportunity, user). Ownership = user_id (public.users / auth.uid()). member_id NULL on self-signup.';

COMMIT;
