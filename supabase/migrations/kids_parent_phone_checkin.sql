-- =============================================================================
-- Kids check-in by the parent's phone (Pastor, Oct 2026).
--
-- A teacher shows the kids session's rotating QR at the classroom door (Nesties,
-- Toddlers, …). A signed-in parent scans it and checks in their own children.
--
-- Who counts as a parent here:
--   * an active guardian_relationships row for that child (any check-in flag), or
--   * the same active household: the parent is self / spouse / parent there and
--     the child is child / dependent — unless a guardian row for that pair was revoked.
--
-- Pickup is unchanged: a teacher checks the child out at the Kids Kiosk and confirms
-- a guardian with can_check_out. The rotating QR (30 s) means it only works in the room.
-- =============================================================================

BEGIN;

ALTER TABLE public.child_custody_records
  DROP CONSTRAINT IF EXISTS child_custody_records_source_chk;
ALTER TABLE public.child_custody_records
  ADD CONSTRAINT child_custody_records_source_chk
  CHECK (source IN ('digital_card', 'manual_staff', 'parent_phone'));

-- Children this account may check in, with whether each is already in this session.
CREATE OR REPLACE FUNCTION public.kids_parent_children(
  p_session_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  child_member_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  checked_in boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH my_members AS (
    SELECT p_user_id AS member_id
    WHERE EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_user_id)
    UNION
    SELECT l.member_id FROM public.user_member_links l
    WHERE l.user_id = p_user_id AND l.status = 'verified'
  ),
  my_households AS (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.member_id IN (SELECT member_id FROM my_members)
      AND hm.status = 'active'
      AND hm.relationship_type IN ('self', 'spouse', 'parent')
  ),
  kids AS (
    SELECT gr.child_member_id AS id FROM public.guardian_relationships gr
    WHERE gr.guardian_user_id = p_user_id AND gr.status = 'active'
    UNION
    SELECT hm.member_id FROM public.household_members hm
    WHERE hm.household_id IN (SELECT household_id FROM my_households)
      AND hm.status = 'active'
      AND hm.relationship_type IN ('child', 'dependent')
      AND NOT EXISTS (
        SELECT 1 FROM public.guardian_relationships r
        WHERE r.guardian_user_id = p_user_id
          AND r.child_member_id = hm.member_id
          AND r.status = 'revoked'
      )
  )
  SELECT m.id, m.first_name, m.last_name, m.preferred_name,
         EXISTS (
           SELECT 1 FROM public.child_custody_records c
           WHERE c.session_id = p_session_id AND c.child_member_id = m.id AND c.checked_out_at IS NULL
         )
  FROM kids k
  JOIN public.members m ON m.id = k.id
  WHERE m.id NOT IN (SELECT member_id FROM my_members)
  ORDER BY m.first_name, m.last_name;
$$;

CREATE OR REPLACE FUNCTION public.kids_parent_self_checkin(
  p_session_id uuid,
  p_child_member_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_row public.child_custody_records%ROWTYPE;
  v_parent_member uuid;
BEGIN
  IF p_session_id IS NULL OR p_child_member_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.* INTO v_session FROM public.attendance_sessions s WHERE s.id = p_session_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.type IS DISTINCT FROM 'kids' THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.kids_parent_children(p_session_id, p_user_id) k
    WHERE k.child_member_id = p_child_member_id
  ) THEN
    RAISE EXCEPTION 'guardian_not_authorized' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.child_custody_records r
    WHERE r.session_id = p_session_id AND r.child_member_id = p_child_member_id AND r.checked_out_at IS NULL
  ) THEN
    RETURN jsonb_build_object('childMemberId', p_child_member_id, 'alreadyCheckedIn', true);
  END IF;

  SELECT l.member_id INTO v_parent_member
  FROM public.user_member_links l
  WHERE l.user_id = p_user_id AND l.status = 'verified'
  LIMIT 1;
  IF v_parent_member IS NULL AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_user_id) THEN
    v_parent_member := p_user_id;
  END IF;

  INSERT INTO public.child_custody_records (
    session_id, child_member_id, source, checked_in_by,
    check_in_guardian_user_id, check_in_guardian_member_id
  )
  VALUES (
    p_session_id, p_child_member_id, 'parent_phone', p_user_id,
    p_user_id, v_parent_member
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'custodyId', v_row.id,
    'childMemberId', v_row.child_member_id,
    'checkedInAt', v_row.checked_in_at,
    'alreadyCheckedIn', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kids_parent_children(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kids_parent_self_checkin(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kids_parent_children(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kids_parent_self_checkin(uuid, uuid, uuid) TO service_role;

COMMIT;
