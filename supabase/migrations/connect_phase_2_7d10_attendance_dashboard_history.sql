-- =============================================================================
-- PLCC Connect Phase 2.7D.10 — Attendance Dashboard & personal/family history
-- =============================================================================
-- DO NOT apply automatically — review before live apply.
--
-- Additive:
--   * attendance_dashboard_summary() — Canaan leadership aggregates
--   * get_my_attendance_history() — Connect personal session check-ins
--   * get_my_children_custody_history() — Connect guardian custody times
--   * get_my_event_attendance_status(uuid) — Connect event reconcile status
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Canaan dashboard aggregates (service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attendance_dashboard_summary(
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer;
  v_since timestamptz;
  v_sessions jsonb;
  v_by_type jsonb;
  v_totals jsonb;
  v_custody jsonb;
BEGIN
  v_days := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_since := now() - make_interval(days => v_days);

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."startsAt" DESC), '[]'::jsonb)
  INTO v_sessions
  FROM (
    SELECT
      s.id AS "sessionId",
      s.title,
      s.type,
      s.status,
      s.starts_at AS "startsAt",
      s.opened_at AS "openedAt",
      s.closed_at AS "closedAt",
      (
        SELECT count(*)::integer FROM public.attendance_records r
        WHERE r.session_id = s.id
      ) AS "memberCount",
      (
        SELECT count(*)::integer FROM public.child_custody_records c
        WHERE c.session_id = s.id AND c.checked_out_at IS NULL
      ) AS "openCustodyCount"
    FROM public.attendance_sessions s
    WHERE s.starts_at >= v_since
       OR s.opened_at >= v_since
    ORDER BY s.starts_at DESC
    LIMIT 100
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.type), '[]'::jsonb)
  INTO v_by_type
  FROM (
    SELECT
      s.type,
      count(DISTINCT s.id)::integer AS sessions,
      count(r.id)::integer AS checkins
    FROM public.attendance_sessions s
    LEFT JOIN public.attendance_records r ON r.session_id = s.id
    WHERE s.starts_at >= v_since OR s.opened_at >= v_since
    GROUP BY s.type
  ) t;

  SELECT jsonb_build_object(
    'sessions', count(DISTINCT s.id)::integer,
    'checkins', count(r.id)::integer,
    'openSessions', count(DISTINCT s.id) FILTER (WHERE s.status = 'open')::integer,
    'custodyCycles', (
      SELECT count(*)::integer FROM public.child_custody_records c
      WHERE c.checked_in_at >= v_since
    ),
    'eventReconciliations', (
      SELECT count(*)::integer FROM public.event_attendance_reconciliations e
      WHERE e.reconciled_at >= v_since
    )
  )
  INTO v_totals
  FROM public.attendance_sessions s
  LEFT JOIN public.attendance_records r ON r.session_id = s.id
  WHERE s.starts_at >= v_since OR s.opened_at >= v_since;

  SELECT jsonb_build_object(
    'openNow', count(*) FILTER (WHERE c.checked_out_at IS NULL)::integer,
    'completed', count(*) FILTER (WHERE c.checked_out_at IS NOT NULL)::integer
  )
  INTO v_custody
  FROM public.child_custody_records c
  WHERE c.checked_in_at >= v_since;

  RETURN jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'totals', COALESCE(v_totals, '{}'::jsonb),
    'byType', COALESCE(v_by_type, '[]'::jsonb),
    'recentSessions', COALESCE(v_sessions, '[]'::jsonb),
    'custody', COALESCE(v_custody, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.attendance_dashboard_summary(integer) IS
  'Phase 2.7D.10 — Canaan leadership aggregates. No QR hashes or PII beyond session titles.';

REVOKE ALL ON FUNCTION public.attendance_dashboard_summary(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_dashboard_summary(integer) FROM anon;
REVOKE ALL ON FUNCTION public.attendance_dashboard_summary(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_dashboard_summary(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Connect: my attendance history (verified link only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_attendance_history(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_limit integer;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));

  SELECT l.member_id INTO v_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_uid
    AND l.status = 'verified';

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."checkedInAt" DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      s.title AS "sessionTitle",
      s.type AS "sessionType",
      s.starts_at AS "sessionStartsAt",
      r.checked_in_at AS "checkedInAt",
      r.source
    FROM public.attendance_records r
    JOIN public.attendance_sessions s ON s.id = r.session_id
    WHERE r.member_id = v_member_id
    ORDER BY r.checked_in_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('items', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.get_my_attendance_history(integer) IS
  'Phase 2.7D.10 — Connect personal attendance history for verified member link. No staff fields.';

REVOKE ALL ON FUNCTION public.get_my_attendance_history(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_attendance_history(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_attendance_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_attendance_history(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Connect: children's custody history for active guardians
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_children_custody_history(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."checkedInAt" DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      trim(BOTH FROM concat_ws(' ', COALESCE(m.first_name, ''), COALESCE(m.last_name, '')))
        AS "childDisplayName",
      s.title AS "sessionTitle",
      c.checked_in_at AS "checkedInAt",
      c.checked_out_at AS "checkedOutAt",
      (c.checked_out_at IS NULL) AS "isOpen"
    FROM public.child_custody_records c
    JOIN public.members m ON m.id = c.child_member_id
    JOIN public.attendance_sessions s ON s.id = c.session_id
    WHERE EXISTS (
      SELECT 1 FROM public.guardian_relationships gr
      WHERE gr.guardian_user_id = v_uid
        AND gr.child_member_id = c.child_member_id
        AND gr.status = 'active'
        AND (gr.can_check_in = true OR gr.can_check_out = true OR gr.can_view_card = true)
    )
    ORDER BY c.checked_in_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('items', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.get_my_children_custody_history(integer) IS
  'Phase 2.7D.10 — Connect guardian view of child custody times. No staff IDs.';

REVOKE ALL ON FUNCTION public.get_my_children_custody_history(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_children_custody_history(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_children_custody_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_children_custody_history(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Connect: my event attendance status for one event
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_event_attendance_status(
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_row public.event_attendance_reconciliations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.member_id INTO v_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_uid
    AND l.status = 'verified';

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'eventId', p_event_id,
      'checkedIn', false,
      'reconciledAt', NULL
    );
  END IF;

  SELECT e.* INTO v_row
  FROM public.event_attendance_reconciliations e
  WHERE e.event_id = p_event_id
    AND e.member_id = v_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eventId', p_event_id,
      'checkedIn', false,
      'reconciledAt', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'eventId', p_event_id,
    'checkedIn', true,
    'reconciledAt', v_row.reconciled_at
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_event_attendance_status(uuid) IS
  'Phase 2.7D.10 / 2.7D.8 — Connect personal event check-in status from reconciliations.';

REVOKE ALL ON FUNCTION public.get_my_event_attendance_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_event_attendance_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_event_attendance_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_event_attendance_status(uuid) TO service_role;

COMMIT;
