-- =============================================================================
-- PLCC Serve Phase 2.3E — member-safe capacity aggregate RPC
-- =============================================================================
-- Purpose:
--   Read-only SECURITY DEFINER function that returns capacity aggregates for
--   open Serve opportunities. Connect list/detail use this instead of counting
--   serve_signups under RLS (members may only SELECT their own signup rows).
--
-- Returns ONLY:
--   opportunity_id, capacity, active_signup_count, remaining_slots
--
-- Does NOT return:
--   roster rows, user_id, member_id, emails, signup ids, statuses of individuals
--
-- Active capacity rule (matches signup RPC):
--   pending + confirmed
--
-- Visibility:
--   Only opportunities with status = 'open' and (ends_at IS NULL OR ends_at >= now())
--
-- DO NOT APPLY until Phase 2.3E final review approval.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.serve_opportunity_capacity(
  p_opportunity_ids uuid[]
)
RETURNS TABLE (
  opportunity_id uuid,
  capacity integer,
  active_signup_count integer,
  remaining_slots integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  -- Require linked app user (same posture as signup RPC; no members lookup).
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_uid
  ) THEN
    RAISE EXCEPTION 'user_not_linked'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_opportunity_ids IS NULL OR cardinality(p_opportunity_ids) = 0 THEN
    RETURN;
  END IF;

  -- Deduplicate and drop nulls
  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_opportunity_ids) AS x
    WHERE x IS NOT NULL
  )
  INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(v_ids) > 50 THEN
    RAISE EXCEPTION 'too_many_opportunity_ids'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS opportunity_id,
    o.capacity AS capacity,
    COALESCE(a.active_count, 0)::integer AS active_signup_count,
    CASE
      WHEN o.capacity IS NULL THEN NULL
      ELSE GREATEST(o.capacity - COALESCE(a.active_count, 0), 0)::integer
    END AS remaining_slots
  FROM public.serve_opportunities o
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS active_count
    FROM public.serve_signups s
    WHERE s.opportunity_id = o.id
      AND s.status IN ('pending', 'confirmed')
  ) a ON TRUE
  WHERE o.id = ANY (v_ids)
    AND o.status = 'open'
    AND (o.ends_at IS NULL OR o.ends_at >= now())
  ORDER BY o.starts_at NULLS LAST, o.id;
END;
$$;

COMMENT ON FUNCTION public.serve_opportunity_capacity(uuid[]) IS
  'Member-safe Serve capacity aggregates (pending+confirmed). No roster. Auth required. Max 50 ids.';

REVOKE ALL ON FUNCTION public.serve_opportunity_capacity(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.serve_opportunity_capacity(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.serve_opportunity_capacity(uuid[]) TO authenticated;
-- service_role inherits via SUPERUSER/bypass in Supabase; explicit grant for clarity:
GRANT EXECUTE ON FUNCTION public.serve_opportunity_capacity(uuid[]) TO service_role;
