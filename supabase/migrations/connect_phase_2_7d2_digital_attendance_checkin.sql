-- =============================================================================
-- PLCC Connect Phase 2.7D.2 — Atomic Digital Adult Attendance Check-In RPC
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Vault + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * public.attendance_checkin_by_card_hash(...) SECURITY DEFINER RPC
--
-- Does NOT:
--   * ALTER attendance_records / attendance_sessions
--   * touch public.attendance
--   * seed user_member_links
--   * accept raw QR tokens (hash only)
--   * accept dependent cards for adult attendance
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Atomic digital check-in by qr_token_hash
-- ---------------------------------------------------------------------------
-- Vault API hashes AWC1 token in Node, then calls this RPC as service_role.
-- One transaction: session lock + adult card + approval + verified link + insert.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attendance_checkin_by_card_hash(
  p_session_id uuid,
  p_qr_token_hash text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_adult public.member_digital_cards%ROWTYPE;
  v_dep_exists boolean := false;
  v_user_role text;
  v_effective text;
  v_member_id uuid;
  v_link_count integer;
  v_inserted public.attendance_records%ROWTYPE;
  v_existing public.attendance_records%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  -- SHA-256 hex only (64 chars). Raw token never accepted.
  IF p_qr_token_hash IS NULL
     OR p_qr_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_token_hash' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'actor_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Session lock (same semantics as attendance_checkin_member)
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

  IF v_session.type = 'kids' THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.type NOT IN ('worship', 'event', 'serve', 'bible_study', 'other') THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  -- Adult vs dependent collision / adult-only gate
  SELECT EXISTS (
    SELECT 1
    FROM public.dependent_digital_cards d
    WHERE d.qr_token_hash = p_qr_token_hash
  )
  INTO v_dep_exists;

  SELECT c.*
  INTO v_adult
  FROM public.member_digital_cards c
  WHERE c.qr_token_hash = p_qr_token_hash;

  IF FOUND AND v_dep_exists THEN
    RAISE EXCEPTION 'card_resolution_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF NOT FOUND THEN
    IF v_dep_exists THEN
      RAISE EXCEPTION 'adult_card_required' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.role
  INTO v_user_role
  FROM public.users u
  WHERE u.id = v_adult.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_valid' USING ERRCODE = 'P0001';
  END IF;

  v_effective := public.member_digital_card_effective_status(v_adult.status, v_user_role);
  IF v_effective IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'card_not_valid' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer
  INTO v_link_count
  FROM public.user_member_links l
  WHERE l.user_id = v_adult.user_id
    AND l.status = 'verified';

  IF v_link_count > 1 THEN
    RAISE EXCEPTION 'member_link_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_link_count = 0 THEN
    RAISE EXCEPTION 'member_link_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.member_id
  INTO v_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_adult.user_id
    AND l.status = 'verified';

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'member_link_required' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members m WHERE m.id = v_member_id
  ) THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.attendance_records (
    session_id,
    member_id,
    source,
    checked_in_by
  )
  VALUES (
    p_session_id,
    v_member_id,
    'digital_card',
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

  SELECT r.*
  INTO v_existing
  FROM public.attendance_records r
  WHERE r.session_id = p_session_id
    AND r.member_id = v_member_id;

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

COMMENT ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) IS
  'Phase 2.7D.2 — atomic adult digital check-in by qr_token_hash. Server-only. Requires verified user_member_links. No raw token. No dependent cards. No visitor/Serve/event/notification/audit side effects.';

REVOKE ALL ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) TO service_role;

COMMIT;
