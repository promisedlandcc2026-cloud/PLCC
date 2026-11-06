-- =============================================================================
-- PLCC Connect Phase 2.7D.7 — Household / Family Check-In
-- =============================================================================
-- Shared Supabase schema (Canaan-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive:
--   * Extend attendance_records.source to include household_bulk
--   * attendance_household_preview_by_card_hash(...)
--   * attendance_checkin_household(...)
--
-- Does NOT:
--   * touch child_custody_records / Kids Kiosk pickup
--   * allow household bulk on type=kids sessions
--   * modify Family Admin / Connect UI
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Allow household_bulk source on attendance_records
-- ---------------------------------------------------------------------------
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_source_chk;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_source_chk
  CHECK (source IN ('digital_card', 'manual_staff', 'household_bulk'));

COMMENT ON COLUMN public.attendance_records.source IS
  'digital_card | manual_staff | household_bulk. First successful write wins; duplicates do not overwrite.';

-- ---------------------------------------------------------------------------
-- 2) Preview household members after adult AWC1 (hash only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attendance_household_preview_by_card_hash(
  p_qr_token_hash text,
  p_session_id uuid
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
  v_anchor_member_id uuid;
  v_link_count integer;
  v_household_id uuid;
  v_members jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF p_qr_token_hash IS NULL
     OR p_qr_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_token_hash' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.attendance_sessions s
  WHERE s.id = p_session_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.status IS DISTINCT FROM 'open' THEN
    IF v_session.status = 'closed' THEN
      RAISE EXCEPTION 'session_closed' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;

  -- Household bulk is for worship/event/etc — never kids custody sessions.
  IF v_session.type = 'kids' THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

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

  IF v_dep_found AND NOT v_adult_found THEN
    RAISE EXCEPTION 'adult_card_required' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_adult_found THEN
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
  INTO v_anchor_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_adult.user_id
    AND l.status = 'verified';

  IF v_anchor_member_id IS NULL THEN
    RAISE EXCEPTION 'member_link_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT hm.household_id
  INTO v_household_id
  FROM public.household_members hm
  WHERE hm.member_id = v_anchor_member_id
    AND hm.status = 'active'
  ORDER BY hm.created_at ASC
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RETURN jsonb_build_object(
      'anchorMemberId', v_anchor_member_id,
      'sessionId', v_session.id,
      'householdId', NULL,
      'members', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'memberId', m.id,
      'displayName', trim(BOTH FROM concat_ws(' ',
        COALESCE(m.first_name, ''),
        COALESCE(m.last_name, '')
      )),
      'relationshipType', hm.relationship_type,
      'alreadyCheckedIn', EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.session_id = p_session_id
          AND ar.member_id = m.id
      ),
      'isAnchor', (m.id = v_anchor_member_id)
    )
    ORDER BY
      CASE WHEN m.id = v_anchor_member_id THEN 0 ELSE 1 END,
      COALESCE(m.last_name, ''),
      COALESCE(m.first_name, '')
  ), '[]'::jsonb)
  INTO v_members
  FROM public.household_members hm
  JOIN public.members m ON m.id = hm.member_id
  WHERE hm.household_id = v_household_id
    AND hm.status = 'active';

  RETURN jsonb_build_object(
    'anchorMemberId', v_anchor_member_id,
    'sessionId', v_session.id,
    'householdId', v_household_id,
    'members', COALESCE(v_members, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.attendance_household_preview_by_card_hash(text, uuid) IS
  'Phase 2.7D.7 — list structured household members for bulk check-in after adult AWC1. Kids sessions denied. Hash only.';

REVOKE ALL ON FUNCTION public.attendance_household_preview_by_card_hash(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_household_preview_by_card_hash(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.attendance_household_preview_by_card_hash(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_household_preview_by_card_hash(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Bulk check-in selected household members
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attendance_checkin_household(
  p_session_id uuid,
  p_anchor_member_id uuid,
  p_member_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_household_id uuid;
  v_mid uuid;
  v_ok integer := 0;
  v_skipped integer := 0;
  v_inserted public.attendance_records%ROWTYPE;
  v_results jsonb := '[]'::jsonb;
  v_name text;
BEGIN
  IF p_session_id IS NULL OR p_anchor_member_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF p_member_ids IS NULL OR cardinality(p_member_ids) = 0 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF cardinality(p_member_ids) > 40 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_actor_user_id) THEN
    RAISE EXCEPTION 'actor_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.attendance_sessions s
  WHERE s.id = p_session_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.status IS DISTINCT FROM 'open' THEN
    IF v_session.status = 'closed' THEN
      RAISE EXCEPTION 'session_closed' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.type = 'kids' THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  SELECT hm.household_id
  INTO v_household_id
  FROM public.household_members hm
  WHERE hm.member_id = p_anchor_member_id
    AND hm.status = 'active'
  ORDER BY hm.created_at ASC
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'household_not_found' USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_mid IN ARRAY p_member_ids
  LOOP
    IF v_mid IS NULL THEN
      CONTINUE;
    END IF;

    -- Must be active household member of anchor's household
    IF NOT EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = v_household_id
        AND hm.member_id = v_mid
        AND hm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'household_member_not_allowed' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_mid) THEN
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
      v_mid,
      'household_bulk',
      p_actor_user_id
    )
    ON CONFLICT (session_id, member_id) DO NOTHING
    RETURNING * INTO v_inserted;

    SELECT trim(BOTH FROM concat_ws(' ', COALESCE(m.first_name, ''), COALESCE(m.last_name, '')))
    INTO v_name
    FROM public.members m
    WHERE m.id = v_mid;

    IF v_inserted.id IS NOT NULL THEN
      v_ok := v_ok + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'memberId', v_mid,
        'displayName', COALESCE(nullif(v_name, ''), 'PLCC Member'),
        'alreadyCheckedIn', false
      ));
    ELSE
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'memberId', v_mid,
        'displayName', COALESCE(nullif(v_name, ''), 'PLCC Member'),
        'alreadyCheckedIn', true
      ));
    END IF;

    v_inserted := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'sessionId', p_session_id,
    'anchorMemberId', p_anchor_member_id,
    'checkedInCount', v_ok,
    'alreadyCheckedInCount', v_skipped,
    'results', v_results
  );
END;
$$;

COMMENT ON FUNCTION public.attendance_checkin_household(uuid, uuid, uuid[], uuid) IS
  'Phase 2.7D.7 — bulk check-in selected structured household members. Kids sessions denied. Staff actor required.';

REVOKE ALL ON FUNCTION public.attendance_checkin_household(uuid, uuid, uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_checkin_household(uuid, uuid, uuid[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.attendance_checkin_household(uuid, uuid, uuid[], uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_checkin_household(uuid, uuid, uuid[], uuid) TO service_role;

COMMIT;
