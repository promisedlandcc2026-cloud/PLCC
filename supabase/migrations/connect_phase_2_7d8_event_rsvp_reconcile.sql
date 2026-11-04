-- =============================================================================
-- PLCC Connect Phase 2.7D.8 — Event Registration → QR Attendance reconcile
-- =============================================================================
-- DO NOT apply automatically — review before live apply.
--
-- Additive:
--   * public.event_attendance_reconciliations
--   * attendance_reconcile_event_checkin(...) helper called from Vault API
--
-- When a digital/manual check-in lands on a session with event_id, Vault upserts
-- a reconciliation row linking event ↔ member ↔ attendance_record.
-- Connect reads personal status via get_my_event_attendance_status (2.7D.10).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_attendance_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL
    REFERENCES public.events(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL
    REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT,
  attendance_record_id uuid NULL
    REFERENCES public.attendance_records(id) ON DELETE SET NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  reconciled_by uuid NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'digital_card'
    CHECK (source IN ('digital_card', 'manual_staff', 'household_bulk')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_attendance_reconciliations_event_member_uidx
    UNIQUE (event_id, member_id)
);

COMMENT ON TABLE public.event_attendance_reconciliations IS
  'Phase 2.7D.8 — links event RSVP/attendance to session check-in. No raw QR. Vault service_role writes; Connect reads via narrow RPC.';

CREATE INDEX IF NOT EXISTS event_attendance_reconciliations_session_idx
  ON public.event_attendance_reconciliations (session_id);

CREATE INDEX IF NOT EXISTS event_attendance_reconciliations_member_idx
  ON public.event_attendance_reconciliations (member_id, reconciled_at DESC);

ALTER TABLE public.event_attendance_reconciliations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_attendance_reconciliations FROM PUBLIC;
REVOKE ALL ON TABLE public.event_attendance_reconciliations FROM anon;
REVOKE ALL ON TABLE public.event_attendance_reconciliations FROM authenticated;
GRANT ALL ON TABLE public.event_attendance_reconciliations TO service_role;

CREATE OR REPLACE FUNCTION public.attendance_reconcile_event_checkin(
  p_session_id uuid,
  p_member_id uuid,
  p_attendance_record_id uuid,
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
  v_row public.event_attendance_reconciliations%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_member_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('digital_card', 'manual_staff', 'household_bulk') THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.* INTO v_session
  FROM public.attendance_sessions s
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- No event linked → no-op success (check-in still valid)
  IF v_session.event_id IS NULL THEN
    RETURN jsonb_build_object('reconciled', false, 'reason', 'no_event');
  END IF;

  INSERT INTO public.event_attendance_reconciliations (
    event_id,
    member_id,
    session_id,
    attendance_record_id,
    reconciled_by,
    source
  )
  VALUES (
    v_session.event_id,
    p_member_id,
    p_session_id,
    p_attendance_record_id,
    p_actor_user_id,
    p_source
  )
  ON CONFLICT (event_id, member_id) DO UPDATE
    SET
      session_id = EXCLUDED.session_id,
      attendance_record_id = COALESCE(EXCLUDED.attendance_record_id, public.event_attendance_reconciliations.attendance_record_id),
      reconciled_at = now(),
      reconciled_by = EXCLUDED.reconciled_by,
      source = EXCLUDED.source
  RETURNING * INTO v_row;

  -- Best-effort: mark matching RSVP rows by member email if present
  UPDATE public.event_registrations er
  SET rsvp_status = CASE
    WHEN er.rsvp_status IS NULL OR er.rsvp_status = '' THEN 'Checked In'
    WHEN lower(er.rsvp_status) IN ('going', 'registered', 'yes') THEN 'Checked In'
    ELSE er.rsvp_status
  END
  WHERE er.event_id = v_session.event_id
    AND er.email IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = p_member_id
        AND m.email IS NOT NULL
        AND lower(trim(m.email)) = lower(trim(er.email))
    );

  RETURN jsonb_build_object(
    'reconciled', true,
    'eventId', v_row.event_id,
    'memberId', v_row.member_id,
    'sessionId', v_row.session_id,
    'reconciledAt', v_row.reconciled_at
  );
END;
$$;

COMMENT ON FUNCTION public.attendance_reconcile_event_checkin(uuid, uuid, uuid, uuid, text) IS
  'Phase 2.7D.8 — upsert event↔member reconciliation after session check-in when session.event_id is set.';

REVOKE ALL ON FUNCTION public.attendance_reconcile_event_checkin(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_reconcile_event_checkin(uuid, uuid, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.attendance_reconcile_event_checkin(uuid, uuid, uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_reconcile_event_checkin(uuid, uuid, uuid, uuid, text) TO service_role;

COMMIT;
