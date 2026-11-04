-- =============================================================================
-- PLCC Connect Phase 2.7D.6 — Child Check-In / Check-Out (Family Pass custody)
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Vault + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * public.child_custody_records
--   * kids_custody_lookup_by_card_hash(...)
--   * kids_custody_checkin(...)
--   * kids_custody_checkout(...)
--   * RLS / grants / indexes
--
-- Does NOT:
--   * ALTER attendance_records (presence-only; no custody)
--   * touch public.attendance (legacy Kids Kiosk)
--   * accept raw QR tokens (hash only)
--   * treat child QR alone as pickup authorization
--   * modify Connect UI / Family summary RPCs
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) child_custody_records — session-bound kids custody with guardian audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.child_custody_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id uuid NOT NULL
    REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT,

  child_member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE RESTRICT,

  source text NOT NULL
    CONSTRAINT child_custody_records_source_chk
      CHECK (source IN ('digital_card', 'manual_staff')),

  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_in_by uuid NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  check_in_guardian_user_id uuid NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  check_in_guardian_member_id uuid NULL
    REFERENCES public.members(id) ON DELETE RESTRICT,

  checked_out_at timestamptz NULL,
  checked_out_by uuid NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  check_out_guardian_user_id uuid NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  check_out_guardian_member_id uuid NULL
    REFERENCES public.members(id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT child_custody_records_checkout_complete_chk
    CHECK (
      (checked_out_at IS NULL
        AND checked_out_by IS NULL
        AND check_out_guardian_user_id IS NULL
        AND check_out_guardian_member_id IS NULL)
      OR
      (checked_out_at IS NOT NULL
        AND checked_out_by IS NOT NULL
        AND check_out_guardian_user_id IS NOT NULL)
    )
);

COMMENT ON TABLE public.child_custody_records IS
  'Phase 2.7D.6 — Kids Family Pass custody. Child QR identifies the child only; staff must confirm an authorized guardian (can_check_in / can_check_out). Not attendance_records presence.';

COMMENT ON COLUMN public.child_custody_records.child_member_id IS
  'Canonical child = public.members(id) from dependent_digital_cards.member_id.';

COMMENT ON COLUMN public.child_custody_records.check_in_guardian_user_id IS
  'Drop-off guardian = public.users(id) from guardian_relationships.guardian_user_id with can_check_in.';

COMMENT ON COLUMN public.child_custody_records.check_out_guardian_user_id IS
  'Pickup guardian = public.users(id) with can_check_out. NULL while still checked in.';

CREATE UNIQUE INDEX IF NOT EXISTS child_custody_records_open_session_child_uidx
  ON public.child_custody_records (session_id, child_member_id)
  WHERE checked_out_at IS NULL;

CREATE INDEX IF NOT EXISTS child_custody_records_session_open_idx
  ON public.child_custody_records (session_id, checked_in_at ASC)
  WHERE checked_out_at IS NULL;

CREATE INDEX IF NOT EXISTS child_custody_records_child_idx
  ON public.child_custody_records (child_member_id, checked_in_at DESC);

ALTER TABLE public.child_custody_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.child_custody_records FROM PUBLIC;
REVOKE ALL ON TABLE public.child_custody_records FROM anon;
REVOKE ALL ON TABLE public.child_custody_records FROM authenticated;
GRANT ALL ON TABLE public.child_custody_records TO service_role;

-- ---------------------------------------------------------------------------
-- 2) kids_custody_lookup_by_card_hash — resolve dependent card + guardians
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kids_custody_lookup_by_card_hash(
  p_qr_token_hash text,
  p_session_id uuid,
  p_mode text
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
  v_child public.members%ROWTYPE;
  v_open public.child_custody_records%ROWTYPE;
  v_guardians jsonb;
  v_status text;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = 'P0001';
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

  IF v_session.status = 'draft' THEN
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'session_closed' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.type IS DISTINCT FROM 'kids' THEN
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

  IF v_adult_found AND NOT v_dep_found THEN
    RAISE EXCEPTION 'adult_card_required' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_dep_found THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_dependent.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'card_not_valid' USING ERRCODE = 'P0001';
  END IF;

  SELECT m.*
  INTO v_child
  FROM public.members m
  WHERE m.id = v_dependent.member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
  INTO v_open
  FROM public.child_custody_records r
  WHERE r.session_id = p_session_id
    AND r.child_member_id = v_child.id
    AND r.checked_out_at IS NULL;

  IF FOUND THEN
    v_status := 'in';
  ELSE
    v_status := 'none';
  END IF;

  IF p_mode = 'in' THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'guardianUserId', gr.guardian_user_id,
        'guardianMemberId', gr.guardian_member_id,
        'displayName', COALESCE(
          nullif(trim(BOTH FROM concat_ws(' ', COALESCE(gm.first_name, ''), COALESCE(gm.last_name, ''))), ''),
          nullif(trim(BOTH FROM COALESCE(u.name, '')), ''),
          'Guardian'
        ),
        'relationshipType', gr.relationship_type
      )
      ORDER BY COALESCE(gm.last_name, u.name, ''), COALESCE(gm.first_name, '')
    ), '[]'::jsonb)
    INTO v_guardians
    FROM public.guardian_relationships gr
    JOIN public.users u ON u.id = gr.guardian_user_id
    LEFT JOIN public.members gm ON gm.id = gr.guardian_member_id
    WHERE gr.child_member_id = v_child.id
      AND gr.status = 'active'
      AND gr.can_check_in = true;
  ELSE
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'guardianUserId', gr.guardian_user_id,
        'guardianMemberId', gr.guardian_member_id,
        'displayName', COALESCE(
          nullif(trim(BOTH FROM concat_ws(' ', COALESCE(gm.first_name, ''), COALESCE(gm.last_name, ''))), ''),
          nullif(trim(BOTH FROM COALESCE(u.name, '')), ''),
          'Guardian'
        ),
        'relationshipType', gr.relationship_type
      )
      ORDER BY COALESCE(gm.last_name, u.name, ''), COALESCE(gm.first_name, '')
    ), '[]'::jsonb)
    INTO v_guardians
    FROM public.guardian_relationships gr
    JOIN public.users u ON u.id = gr.guardian_user_id
    LEFT JOIN public.members gm ON gm.id = gr.guardian_member_id
    WHERE gr.child_member_id = v_child.id
      AND gr.status = 'active'
      AND gr.can_check_out = true;
  END IF;

  RETURN jsonb_build_object(
    'childMemberId', v_child.id,
    'childDisplayName', trim(BOTH FROM concat_ws(' ',
      COALESCE(v_child.first_name, ''),
      COALESCE(v_child.last_name, '')
    )),
    'sessionId', v_session.id,
    'mode', p_mode,
    'custodyStatus', v_status,
    'custodyId', CASE WHEN v_status = 'in' THEN v_open.id ELSE NULL END,
    'checkedInAt', CASE WHEN v_status = 'in' THEN v_open.checked_in_at ELSE NULL END,
    'guardians', COALESCE(v_guardians, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.kids_custody_lookup_by_card_hash(text, uuid, text) IS
  'Phase 2.7D.6 — resolve dependent AWC1 hash to child + authorized guardians for kids session custody. Adult cards rejected. Hash only; not pickup by itself.';

REVOKE ALL ON FUNCTION public.kids_custody_lookup_by_card_hash(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kids_custody_lookup_by_card_hash(text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.kids_custody_lookup_by_card_hash(text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kids_custody_lookup_by_card_hash(text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) kids_custody_checkin — staff + guardian can_check_in
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kids_custody_checkin(
  p_session_id uuid,
  p_child_member_id uuid,
  p_guardian_user_id uuid,
  p_actor_user_id uuid,
  p_source text DEFAULT 'digital_card'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_gr public.guardian_relationships%ROWTYPE;
  v_inserted public.child_custody_records%ROWTYPE;
  v_existing public.child_custody_records%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_child_member_id IS NULL
     OR p_guardian_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('digital_card', 'manual_staff') THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_actor_user_id
  ) THEN
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

  IF v_session.type IS DISTINCT FROM 'kids' THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members m WHERE m.id = p_child_member_id
  ) THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT gr.*
  INTO v_gr
  FROM public.guardian_relationships gr
  WHERE gr.guardian_user_id = p_guardian_user_id
    AND gr.child_member_id = p_child_member_id
    AND gr.status = 'active'
    AND gr.can_check_in = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guardian_not_authorized' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
  INTO v_existing
  FROM public.child_custody_records r
  WHERE r.session_id = p_session_id
    AND r.child_member_id = p_child_member_id
    AND r.checked_out_at IS NULL;

  IF FOUND THEN
    RAISE EXCEPTION 'already_checked_in' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.child_custody_records (
    session_id,
    child_member_id,
    source,
    checked_in_by,
    check_in_guardian_user_id,
    check_in_guardian_member_id
  )
  VALUES (
    p_session_id,
    p_child_member_id,
    p_source,
    p_actor_user_id,
    p_guardian_user_id,
    v_gr.guardian_member_id
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'custodyId', v_inserted.id,
    'sessionId', v_inserted.session_id,
    'childMemberId', v_inserted.child_member_id,
    'checkedInAt', v_inserted.checked_in_at,
    'checkedInBy', v_inserted.checked_in_by,
    'checkInGuardianUserId', v_inserted.check_in_guardian_user_id,
    'checkInGuardianMemberId', v_inserted.check_in_guardian_member_id,
    'source', v_inserted.source
  );
END;
$$;

COMMENT ON FUNCTION public.kids_custody_checkin(uuid, uuid, uuid, uuid, text) IS
  'Phase 2.7D.6 — check in child to open kids session with staff actor + can_check_in guardian. QR alone is insufficient.';

REVOKE ALL ON FUNCTION public.kids_custody_checkin(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kids_custody_checkin(uuid, uuid, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.kids_custody_checkin(uuid, uuid, uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kids_custody_checkin(uuid, uuid, uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) kids_custody_checkout — staff + guardian can_check_out
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kids_custody_checkout(
  p_custody_id uuid,
  p_guardian_user_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.child_custody_records%ROWTYPE;
  v_session public.attendance_sessions%ROWTYPE;
  v_gr public.guardian_relationships%ROWTYPE;
BEGIN
  IF p_custody_id IS NULL OR p_guardian_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'actor_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
  INTO v_row
  FROM public.child_custody_records r
  WHERE r.id = p_custody_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'custody_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.checked_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_checked_out' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.attendance_sessions s
  WHERE s.id = v_row.session_id
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

  IF v_session.type IS DISTINCT FROM 'kids' THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  SELECT gr.*
  INTO v_gr
  FROM public.guardian_relationships gr
  WHERE gr.guardian_user_id = p_guardian_user_id
    AND gr.child_member_id = v_row.child_member_id
    AND gr.status = 'active'
    AND gr.can_check_out = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guardian_not_authorized' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.child_custody_records
  SET
    checked_out_at = now(),
    checked_out_by = p_actor_user_id,
    check_out_guardian_user_id = p_guardian_user_id,
    check_out_guardian_member_id = v_gr.guardian_member_id
  WHERE id = p_custody_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'custodyId', v_row.id,
    'sessionId', v_row.session_id,
    'childMemberId', v_row.child_member_id,
    'checkedInAt', v_row.checked_in_at,
    'checkedOutAt', v_row.checked_out_at,
    'checkedOutBy', v_row.checked_out_by,
    'checkOutGuardianUserId', v_row.check_out_guardian_user_id,
    'checkOutGuardianMemberId', v_row.check_out_guardian_member_id
  );
END;
$$;

COMMENT ON FUNCTION public.kids_custody_checkout(uuid, uuid, uuid) IS
  'Phase 2.7D.6 — check out child from open custody row with staff actor + can_check_out guardian. Child QR alone never authorizes pickup.';

REVOKE ALL ON FUNCTION public.kids_custody_checkout(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kids_custody_checkout(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.kids_custody_checkout(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kids_custody_checkout(uuid, uuid, uuid) TO service_role;

COMMIT;
