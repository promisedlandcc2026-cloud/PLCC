-- =============================================================================
-- PLCC Connect Phase 2.7D.10B — Family attendance history includes child session
-- check-ins (attendance_records), not only Kids Kiosk custody.
-- =============================================================================
-- DO NOT apply automatically — review before live apply.
--
-- Replaces get_my_children_custody_history to return:
--   * kind = 'session'  → dependent digital card into attendance_sessions
--   * kind = 'custody'  → Kids Kiosk Family Pass custody (in/out)
-- =============================================================================

BEGIN;

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
    SELECT * FROM (
      -- Session roster presence (Attendance Sessions scanner / household bulk)
      SELECT
        'session'::text AS kind,
        trim(BOTH FROM concat_ws(' ', COALESCE(m.first_name, ''), COALESCE(m.last_name, '')))
          AS "childDisplayName",
        s.title AS "sessionTitle",
        s.type AS "sessionType",
        r.checked_in_at AS "checkedInAt",
        NULL::timestamptz AS "checkedOutAt",
        true AS "isOpen"
      FROM public.attendance_records r
      JOIN public.members m ON m.id = r.member_id
      JOIN public.attendance_sessions s ON s.id = r.session_id
      WHERE EXISTS (
        SELECT 1 FROM public.guardian_relationships gr
        WHERE gr.guardian_user_id = v_uid
          AND gr.child_member_id = r.member_id
          AND gr.status = 'active'
          AND (gr.can_check_in = true OR gr.can_check_out = true OR gr.can_view_card = true)
      )

      UNION ALL

      -- Kids Kiosk Family Pass custody
      SELECT
        'custody'::text AS kind,
        trim(BOTH FROM concat_ws(' ', COALESCE(m.first_name, ''), COALESCE(m.last_name, '')))
          AS "childDisplayName",
        s.title AS "sessionTitle",
        s.type AS "sessionType",
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
    ) u
    ORDER BY u."checkedInAt" DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('items', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.get_my_children_custody_history(integer) IS
  'Phase 2.7D.10B — Connect guardian view: child session attendance_records + Kids Kiosk custody. No staff IDs.';

REVOKE ALL ON FUNCTION public.get_my_children_custody_history(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_children_custody_history(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_children_custody_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_children_custody_history(integer) TO service_role;

COMMIT;
