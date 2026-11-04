-- Merge duplicate households into one (Households list v2, Oct 2026).
-- Moves members (household_id + household_name), household_members links and
-- family huddle invites to the kept household, fills its blank details from the
-- merged ones, then deletes the merged households. All-or-nothing.
-- Called only by the Vault API with the service role.

CREATE OR REPLACE FUNCTION public.merge_households(p_keep uuid, p_merge uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep public.households%ROWTYPE;
  v_names text[];
  v_found int;
  v_members int := 0;
  v_links int := 0;
BEGIN
  IF p_keep IS NULL OR p_merge IS NULL OR cardinality(p_merge) = 0 THEN
    RAISE EXCEPTION 'Choose at least one household to merge.' USING ERRCODE = '22023';
  END IF;
  IF p_keep = ANY (p_merge) THEN
    RAISE EXCEPTION 'The household you keep cannot also be merged away.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_keep FROM public.households WHERE id = p_keep FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household to keep was not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*), array_agg(name) INTO v_found, v_names
  FROM public.households WHERE id = ANY (p_merge);
  IF v_found <> cardinality(p_merge) THEN
    RAISE EXCEPTION 'One of the households to merge was not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Fill blank details on the kept household from the merged ones (largest first).
  UPDATE public.households k SET
    address = COALESCE(NULLIF(k.address, ''), (
      SELECT h.address FROM public.households h WHERE h.id = ANY (p_merge) AND COALESCE(h.address, '') <> ''
      ORDER BY (SELECT count(*) FROM public.members m WHERE m.household_id = h.id) DESC LIMIT 1)),
    phone = COALESCE(NULLIF(k.phone, ''), (
      SELECT h.phone FROM public.households h WHERE h.id = ANY (p_merge) AND COALESCE(h.phone, '') <> ''
      ORDER BY (SELECT count(*) FROM public.members m WHERE m.household_id = h.id) DESC LIMIT 1)),
    bio = COALESCE(NULLIF(k.bio, ''), (
      SELECT h.bio FROM public.households h WHERE h.id = ANY (p_merge) AND COALESCE(h.bio, '') <> ''
      ORDER BY (SELECT count(*) FROM public.members m WHERE m.household_id = h.id) DESC LIMIT 1)),
    head_member_id = COALESCE(k.head_member_id, (
      SELECT h.head_member_id FROM public.households h WHERE h.id = ANY (p_merge) AND h.head_member_id IS NOT NULL
      LIMIT 1)),
    updated_at = now()
  WHERE k.id = p_keep;

  -- Members.
  UPDATE public.members
  SET household_id = p_keep, household_name = v_keep.name
  WHERE household_id = ANY (p_merge) OR household_name = ANY (v_names);
  GET DIAGNOSTICS v_members = ROW_COUNT;

  -- Family links: move one row per member not already linked to the kept household;
  -- leftovers (true duplicates) are removed with the merged household.
  UPDATE public.household_members hm
  SET household_id = p_keep, updated_at = now()
  WHERE hm.id IN (
    SELECT DISTINCT ON (x.member_id) x.id
    FROM public.household_members x
    WHERE x.household_id = ANY (p_merge)
      AND NOT EXISTS (
        SELECT 1 FROM public.household_members k
        WHERE k.household_id = p_keep AND k.member_id = x.member_id)
    ORDER BY x.member_id, (x.status = 'active') DESC, x.created_at
  );
  GET DIAGNOSTICS v_links = ROW_COUNT;

  UPDATE public.family_huddle_invites SET household_id = p_keep WHERE household_id = ANY (p_merge);

  DELETE FROM public.households WHERE id = ANY (p_merge);

  RETURN jsonb_build_object(
    'kept', p_keep,
    'merged', cardinality(p_merge),
    'members_moved', v_members,
    'links_moved', v_links
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_households(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_households(uuid, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_households(uuid, uuid[]) TO service_role;
