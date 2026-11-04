-- =============================================================================
-- PLCC Connect Phase 2.7D.5B — Dependent digital card session check-in
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Vault + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * CREATE OR REPLACE public.attendance_checkin_by_card_hash(...)
--
-- Extends Phase 2.7D.2 adult digital check-in:
--   * Dependent AWC1 hash → dependent_digital_cards.member_id (child)
--   * Never treats parent/guardian as the attendee
--   * Dependent cards may check into open sessions including type=kids
--   * Adult path unchanged (still rejects type=kids; requires verified UML)
--
-- Does NOT:
--   * ALTER attendance_records / attendance_sessions
--   * touch public.attendance (legacy)
--   * accept raw QR tokens (hash only)
--   * authorize pickup / check-out via dependent card
--   * modify Kids Kiosk / Connect UI
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Atomic digital check-in by qr_token_hash (adult OR dependent)
-- ---------------------------------------------------------------------------
-- Vault API hashes AWC1 token in Node, then calls this RPC as service_role.
-- Dependent card is attendance credential only — NOT child pickup authorization.
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
  v_dependent public.dependent_digital_cards%ROWTYPE;
  v_adult_found boolean := false;
  v_dep_found boolean := false;
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

  -- Resolve adult vs dependent by hash (never trust client memberId)
  SELECT c.*
  INTO v_adult
  FROM public.member_digital_cards c
  WHERE c.qr_token_hash = p_qr_token_hash;
  v_adult_found := FOUND;

  SELECT d.*
  INTO v_dependent
  FROM public.dependent_digital_cards d
  WHERE d.qr_token_hash = p_qr_token_hash;
  v_dep_found := FOUND;

  IF v_adult_found AND v_dep_found THEN
    RAISE EXCEPTION 'card_resolution_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_adult_found AND NOT v_dep_found THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- -----------------------------------------------------------------------
  -- Dependent path: attendee = dependent.member_id (child), never parent
  -- -----------------------------------------------------------------------
  IF v_dep_found THEN
    IF v_session.type NOT IN ('worship', 'event', 'serve', 'bible_study', 'kids', 'other') THEN
      RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
    END IF;

    IF v_dependent.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'card_not_valid' USING ERRCODE = 'P0001';
    END IF;

    v_member_id := v_dependent.member_id;

    IF v_member_id IS NULL OR NOT EXISTS (
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
  END IF;

  -- -----------------------------------------------------------------------
  -- Adult path (unchanged semantics from 2.7D.2)
  -- -----------------------------------------------------------------------
  IF v_session.type = 'kids' THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.type NOT IN ('worship', 'event', 'serve', 'bible_study', 'other') THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
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
  'Phase 2.7D.5B — atomic digital check-in by qr_token_hash. Adult: verified user_member_links; rejects kids sessions. Dependent: child members.id from dependent_digital_cards; allows kids sessions. Not pickup authorization. Server-only; hash only; no raw token.';

REVOKE ALL ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_checkin_by_card_hash(uuid, text, uuid) TO service_role;

COMMIT;
