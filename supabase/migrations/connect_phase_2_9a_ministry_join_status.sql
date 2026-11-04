-- =============================================================================
-- PLCC Connect Phase 2.9A — Ministry join request status (member self-read)
-- =============================================================================
-- Review before apply.
--
-- Allows authenticated members to read their own team_applications rows
-- (email match to JWT) so Connect hubs can show pending/approved status.
-- Does NOT redesign ministry membership or add group chat.
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_team_applications_email_lower
  ON public.team_applications (lower(trim(email)));

DROP POLICY IF EXISTS team_applications_select_own ON public.team_applications;
CREATE POLICY team_applications_select_own
  ON public.team_applications
  FOR SELECT
  TO authenticated
  USING (
    lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    AND length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
  );

COMMENT ON POLICY team_applications_select_own ON public.team_applications IS
  'Phase 2.9A — members may read their own join applications by auth email. Staff admin policy remains.';

-- Optional RPC: applications for teams under a ministry (or all mine)
CREATE OR REPLACE FUNCTION public.get_my_team_applications(p_ministry_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT lower(trim(coalesce(u.email, '')))
  INTO v_email
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(row_data ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      jsonb_build_object(
        'id', a.id,
        'teamId', a.team_id,
        'teamName', coalesce(t.name, a.team_id),
        'ministryId', t.ministry_id,
        'status', coalesce(a.status, 'new'),
        'createdAt', a.created_at
      ) AS row_data,
      a.created_at AS ord
    FROM public.team_applications a
    LEFT JOIN public.teams t ON t.id::text = a.team_id
    WHERE lower(trim(a.email)) = v_email
      AND (
        p_ministry_id IS NULL
        OR t.ministry_id = p_ministry_id
      )
    ORDER BY a.created_at DESC
  ) s;

  RETURN jsonb_build_object('items', coalesce(v_items, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.get_my_team_applications(uuid) IS
  'Phase 2.9A — caller team_applications by users.email; optional ministry filter via teams.ministry_id.';

REVOKE ALL ON FUNCTION public.get_my_team_applications(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_team_applications(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_team_applications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_team_applications(uuid) TO service_role;

COMMIT;
