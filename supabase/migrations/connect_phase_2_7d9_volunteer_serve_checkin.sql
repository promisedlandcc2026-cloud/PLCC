-- =============================================================================
-- PLCC Connect Phase 2.7D.9 — Volunteer / Serve digital check-in gate
-- =============================================================================
-- DO NOT apply automatically — review before live apply.
--
-- Additive:
--   * attendance_require_serve_signup_for_card_hash(...) — pre-check for Canaan API
--
-- When session.type = 'serve' AND serve_opportunity_id IS NOT NULL, adult AWC1
-- check-in requires an active serve_signups row for that opportunity.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.attendance_require_serve_signup_for_card_hash(
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
  v_dep public.dependent_digital_cards%ROWTYPE;
  v_signup_id uuid;
BEGIN
  IF p_session_id IS NULL OR p_qr_token_hash IS NULL
     OR p_qr_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.* INTO v_session
  FROM public.attendance_sessions s
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Only gate serve sessions with a linked opportunity
  IF v_session.type IS DISTINCT FROM 'serve' OR v_session.serve_opportunity_id IS NULL THEN
    RETURN jsonb_build_object('required', false, 'ok', true);
  END IF;

  SELECT d.* INTO v_dep
  FROM public.dependent_digital_cards d
  WHERE d.qr_token_hash = p_qr_token_hash;

  IF FOUND THEN
    RAISE EXCEPTION 'adult_card_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.* INTO v_adult
  FROM public.member_digital_cards c
  WHERE c.qr_token_hash = p_qr_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.id INTO v_signup_id
  FROM public.serve_signups s
  WHERE s.opportunity_id = v_session.serve_opportunity_id
    AND s.user_id = v_adult.user_id
    AND s.status IN ('pending', 'confirmed')
    AND s.cancelled_at IS NULL
  LIMIT 1;

  IF v_signup_id IS NULL THEN
    RAISE EXCEPTION 'serve_signup_required' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'required', true,
    'ok', true,
    'signupId', v_signup_id,
    'opportunityId', v_session.serve_opportunity_id
  );
END;
$$;

COMMENT ON FUNCTION public.attendance_require_serve_signup_for_card_hash(text, uuid) IS
  'Phase 2.7D.9 — for serve sessions with serve_opportunity_id, require active serve_signups before digital check-in.';

REVOKE ALL ON FUNCTION public.attendance_require_serve_signup_for_card_hash(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_require_serve_signup_for_card_hash(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.attendance_require_serve_signup_for_card_hash(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_require_serve_signup_for_card_hash(text, uuid) TO service_role;

COMMIT;
