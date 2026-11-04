-- =============================================================================
-- PLCC Connect Phase 2.7D.1 — Attendance Records + Atomic Check-In RPC
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Vault + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * public.attendance_records
--   * public.attendance_checkin_member(...) SECURITY DEFINER RPC
--   * constraints, indexes, RLS, grants/revokes
--
-- Does NOT:
--   * ALTER / UPDATE / DELETE / INSERT public.attendance (legacy preserved)
--   * seed user_member_links / backfill legacy attendance
--   * digital-card token resolution inside RPC
--   * Vault API / scanner UI / manual check-in UI / Kids / Connect
--   * visitor_count / serve_signups / events / notifications / audit_logs writes
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) attendance_records — immutable adult/member check-in rows (MVP)
-- ---------------------------------------------------------------------------
-- Canonical attendance subject = public.members.id (NOT users.id / email / QR).
-- No updated_at, status, notes, checkout, visitor, or credential fields.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id uuid NOT NULL
    REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT,

  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE RESTRICT,

  source text NOT NULL
    CONSTRAINT attendance_records_source_chk
      CHECK (source IN ('digital_card', 'manual_staff')),

  checked_in_at timestamptz NOT NULL DEFAULT now(),

  checked_in_by uuid NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_records_session_member_uidx UNIQUE (session_id, member_id)
);

COMMENT ON TABLE public.attendance_records IS
  'Phase 2.7D.1 — adult/member attendance rows for open attendance_sessions. Immutable MVP. Legacy public.attendance untouched. No child custody.';

COMMENT ON COLUMN public.attendance_records.session_id IS
  'FK attendance_sessions(id) ON DELETE RESTRICT — history must not vanish with session delete.';

COMMENT ON COLUMN public.attendance_records.member_id IS
  'Canonical attendance subject = public.members(id). ON DELETE RESTRICT preserves history. Not users.id.';

COMMENT ON COLUMN public.attendance_records.source IS
  'digital_card | manual_staff only. First successful write wins; duplicates do not overwrite.';

COMMENT ON COLUMN public.attendance_records.checked_in_at IS
  'DB now() authority. No client timestamp parameter.';

COMMENT ON COLUMN public.attendance_records.checked_in_by IS
  'Staff actor public.users(id). ON DELETE RESTRICT for audit integrity. Not the attendance subject.';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
-- UNIQUE(session_id, member_id) already covers the pair.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS attendance_records_member_checked_in_idx
  ON public.attendance_records (member_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS attendance_records_session_checked_in_idx
  ON public.attendance_records (session_id, checked_in_at ASC);

-- ---------------------------------------------------------------------------
-- 3) RLS — fail closed; Vault service_role only
-- ---------------------------------------------------------------------------

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Explicit deny-by-absence: no FOR SELECT/INSERT/UPDATE/DELETE policies
-- for authenticated or anon on attendance_records.

-- ---------------------------------------------------------------------------
-- 4) Table grants / revokes
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.attendance_records FROM PUBLIC;
REVOKE ALL ON TABLE public.attendance_records FROM anon;
REVOKE ALL ON TABLE public.attendance_records FROM authenticated;

GRANT ALL ON TABLE public.attendance_records TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Atomic check-in RPC — shared by future digital + manual Vault API paths
-- ---------------------------------------------------------------------------
-- Session lock: SELECT ... FOR SHARE on attendance_sessions row.
--   * Concurrent check-ins may proceed together (UNIQUE + ON CONFLICT).
--   * Status-changing UPDATEs (close/open) wait for SHARE locks — prevents
--     insert-after-close without relying on non-transactional SELECT-then-INSERT.
-- Digital card/token/link resolution is intentionally OUTSIDE this RPC
-- (Vault API later). Link race remains a 2.7D.3 design point.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attendance_checkin_member(
  p_session_id uuid,
  p_member_id uuid,
  p_source text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_existing public.attendance_records%ROWTYPE;
  v_inserted public.attendance_records%ROWTYPE;
BEGIN
  -- Source allowlist (narrow MVP)
  IF p_source IS NULL OR p_source NOT IN ('digital_card', 'manual_staff') THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = 'P0001';
  END IF;

  IF p_session_id IS NULL OR p_member_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  -- Actor existence only (role/permission gated later by Vault API)
  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'actor_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Member existence — canonical subject; no email/name inference
  IF NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = p_member_id
  ) THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Lock session row for status/type authority (race-safe vs close)
  SELECT s.*
  INTO v_session
  FROM public.attendance_sessions s
  WHERE s.id = p_session_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.status = 'draft' THEN
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'session_closed' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;

  -- Adult attendance types only — kids denied
  IF v_session.type = 'kids' THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.type NOT IN ('worship', 'event', 'serve', 'bible_study', 'other') THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent insert: first write wins (source/actor/time preserved)
  INSERT INTO public.attendance_records (
    session_id,
    member_id,
    source,
    checked_in_by
  )
  VALUES (
    p_session_id,
    p_member_id,
    p_source,
    p_actor_user_id
  )
  ON CONFLICT (session_id, member_id) DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'attendanceId', v_inserted.id,
      'sessionId', v_inserted.session_id,
      'memberId', v_inserted.member_id,
      'checkedInAt', v_inserted.checked_in_at,
      'source', v_inserted.source,
      'alreadyCheckedIn', false
    );
  END IF;

  -- Conflict path: return original row unchanged
  SELECT r.*
  INTO v_existing
  FROM public.attendance_records r
  WHERE r.session_id = p_session_id
    AND r.member_id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_unavailable' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'attendanceId', v_existing.id,
    'sessionId', v_existing.session_id,
    'memberId', v_existing.member_id,
    'checkedInAt', v_existing.checked_in_at,
    'source', v_existing.source,
    'alreadyCheckedIn', true
  );
END;
$$;

COMMENT ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) IS
  'Phase 2.7D.1 — atomic adult check-in for open non-kids sessions. Server-only (service_role). Idempotent UNIQUE(session_id,member_id). No card/token/link logic. No visitor/Serve/event/notification/audit side effects. RPC JSON may include attendanceId/memberId for Vault API; client DTOs must sanitize.';

REVOKE ALL ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) TO service_role;

COMMIT;
