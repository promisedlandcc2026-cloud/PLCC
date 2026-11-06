-- =============================================================================
-- PLCC Connect Phase 2.6C.3 — Family-Safe Read RPC
-- =============================================================================
-- Shared Supabase schema (Canaan-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * public.get_my_family_summary()
--   * EXECUTE grants/revokes + COMMENT
--
-- Does NOT:
--   * CREATE/ALTER tables or RLS policies
--   * Connect /family UI
--   * child digital cards / member_digital_cards reads
--   * scanner / check-in / checkout execution
--   * spouse/adult QR sharing
--   * INSERT/UPDATE/DELETE of production rows
--   * email/name/phone identity matching
--
-- Authorization model:
--   auth.uid()
--     → public.users must exist
--     → public.user_member_links.status = 'verified' (only)
--   Household membership is directory-grade only (never card access).
--   Dependent cardAccess = 'guardian' only when:
--     active guardian_relationships for auth.uid()
--     AND can_view_card = true
--   can_check_in / can_check_out are intentionally OMITTED from this DTO
--   until a live check-in phase (stored flags exist but are not returned).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_family_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_self_member_id uuid;
  v_self_first text;
  v_self_last text;
  v_self_avatar text;
  v_hh_count integer := 0;
  v_hh_id uuid;
  v_hh_name text;
  v_household jsonb := NULL;
  v_household_state text := NULL;
  v_adults jsonb := '[]'::jsonb;
  v_dependents jsonb := '[]'::jsonb;
  v_dep_map jsonb := '{}'::jsonb; -- internal dedupe by member uuid string (not returned)
  r record;
  v_key text;
  v_entry jsonb;
  v_card text;
  v_rel text;
  v_rel_override text;
  v_display text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- App user must exist (no auto-provision here).
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid) THEN
    RETURN jsonb_build_object(
      'linked', false,
      'household', NULL,
      'householdState', NULL,
      'self', NULL,
      'adults', '[]'::jsonb,
      'dependents', '[]'::jsonb
    );
  END IF;

  -- Verified link only — proposed/revoked/missing → linked=false, no family graph.
  SELECT l.member_id
  INTO v_self_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_uid
    AND l.status = 'verified';

  IF v_self_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false,
      'household', NULL,
      'householdState', NULL,
      'self', NULL,
      'adults', '[]'::jsonb,
      'dependents', '[]'::jsonb
    );
  END IF;

  SELECT m.first_name, m.last_name, m.avatar_url
  INTO v_self_first, v_self_last, v_self_avatar
  FROM public.members m
  WHERE m.id = v_self_member_id;

  -- Structured household only (never members.household_id / household_name).
  -- Schema UNIQUE(household_id, member_id) allows multiple active households → fail closed.
  SELECT count(*)::integer
  INTO v_hh_count
  FROM public.household_members hm
  WHERE hm.member_id = v_self_member_id
    AND hm.status = 'active';

  IF v_hh_count > 1 THEN
    v_household := NULL;
    v_household_state := 'conflict';
  ELSIF v_hh_count = 1 THEN
    SELECT hm.household_id, h.name
    INTO v_hh_id, v_hh_name
    FROM public.household_members hm
    JOIN public.households h ON h.id = hm.household_id
    WHERE hm.member_id = v_self_member_id
      AND hm.status = 'active'
    LIMIT 1;

    v_household := jsonb_build_object('name', nullif(trim(coalesce(v_hh_name, '')), ''));
    v_household_state := NULL;

    -- Adults: same HH, not self, not child/dependent relationship labels.
    FOR r IN
      SELECT
        m.first_name,
        m.last_name,
        m.avatar_url,
        hm.relationship_type
      FROM public.household_members hm
      JOIN public.members m ON m.id = hm.member_id
      WHERE hm.household_id = v_hh_id
        AND hm.status = 'active'
        AND hm.member_id <> v_self_member_id
        AND coalesce(hm.relationship_type, 'other') NOT IN ('child', 'dependent')
      ORDER BY m.last_name NULLS LAST, m.first_name NULLS LAST
    LOOP
      v_display := nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '');
      IF v_display IS NULL THEN
        v_display := 'Family member';
      END IF;
      v_adults := v_adults || jsonb_build_array(
        jsonb_build_object(
          'displayName', v_display,
          'avatarUrl', nullif(trim(coalesce(r.avatar_url, '')), ''),
          'relationship', coalesce(nullif(trim(r.relationship_type), ''), 'other'),
          'cardAccess', 'none'
        )
      );
    END LOOP;

    -- Household children/dependents (directory listing). Card access only via guardian edge.
    -- Dependent avatarUrl forced null (child photo consent model not established).
    FOR r IN
      SELECT
        m.id AS member_id,
        m.first_name,
        m.last_name,
        hm.relationship_type
      FROM public.household_members hm
      JOIN public.members m ON m.id = hm.member_id
      WHERE hm.household_id = v_hh_id
        AND hm.status = 'active'
        AND hm.member_id <> v_self_member_id
        AND hm.relationship_type IN ('child', 'dependent')
      ORDER BY m.last_name NULLS LAST, m.first_name NULLS LAST
    LOOP
      v_key := r.member_id::text;
      v_display := nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '');
      IF v_display IS NULL THEN
        v_display := 'Dependent';
      END IF;
      v_rel := coalesce(nullif(trim(r.relationship_type), ''), 'dependent');
      v_card := 'none';

      IF EXISTS (
        SELECT 1
        FROM public.guardian_relationships gr
        WHERE gr.guardian_user_id = v_uid
          AND gr.child_member_id = r.member_id
          AND gr.status = 'active'
          AND gr.can_view_card = true
      ) THEN
        v_card := 'guardian';
      END IF;

      -- Prefer guardian operational label when an active edge exists (do not NULL household label).
      SELECT CASE gr.relationship_type
               WHEN 'parent' THEN 'Parent'
               WHEN 'legal_guardian' THEN 'Legal Guardian'
               WHEN 'authorized_guardian' THEN 'Authorized Guardian'
               ELSE coalesce(nullif(trim(gr.relationship_type), ''), v_rel)
             END
      INTO v_rel_override
      FROM public.guardian_relationships gr
      WHERE gr.guardian_user_id = v_uid
        AND gr.child_member_id = r.member_id
        AND gr.status = 'active'
      LIMIT 1;

      IF FOUND THEN
        v_rel := v_rel_override;
      END IF;

      v_entry := jsonb_build_object(
        'displayName', v_display,
        'avatarUrl', NULL,
        'relationship', v_rel,
        'cardAccess', v_card
      );
      v_dep_map := jsonb_set(v_dep_map, ARRAY[v_key], v_entry, true);
    END LOOP;
  ELSE
    v_household := NULL;
    v_household_state := NULL;
  END IF;

  -- Cross-household (and same-HH) active guardian edges — union into dependents.
  FOR r IN
    SELECT
      m.id AS member_id,
      m.first_name,
      m.last_name,
      gr.relationship_type,
      gr.can_view_card
    FROM public.guardian_relationships gr
    JOIN public.members m ON m.id = gr.child_member_id
    WHERE gr.guardian_user_id = v_uid
      AND gr.status = 'active'
    ORDER BY m.last_name NULLS LAST, m.first_name NULLS LAST
  LOOP
    v_key := r.member_id::text;
    v_display := nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '');
    IF v_display IS NULL THEN
      v_display := 'Dependent';
    END IF;
    v_rel := CASE r.relationship_type
               WHEN 'parent' THEN 'Parent'
               WHEN 'legal_guardian' THEN 'Legal Guardian'
               WHEN 'authorized_guardian' THEN 'Authorized Guardian'
               ELSE r.relationship_type
             END;
    v_card := CASE WHEN r.can_view_card IS TRUE THEN 'guardian' ELSE 'none' END;

    IF v_dep_map ? v_key THEN
      -- Upgrade cardAccess / relationship from guardian edge; keep listing.
      v_entry := v_dep_map -> v_key;
      v_entry := jsonb_set(v_entry, '{relationship}', to_jsonb(v_rel), true);
      v_entry := jsonb_set(v_entry, '{cardAccess}', to_jsonb(v_card), true);
      v_dep_map := jsonb_set(v_dep_map, ARRAY[v_key], v_entry, true);
    ELSE
      v_dep_map := jsonb_set(
        v_dep_map,
        ARRAY[v_key],
        jsonb_build_object(
          'displayName', v_display,
          'avatarUrl', NULL,
          'relationship', v_rel,
          'cardAccess', v_card
        ),
        true
      );
    END IF;
  END LOOP;

  -- Materialize dependents array without exposing map keys (member UUIDs).
  SELECT coalesce(jsonb_agg(value ORDER BY value ->> 'displayName'), '[]'::jsonb)
  INTO v_dependents
  FROM jsonb_each(v_dep_map);

  RETURN jsonb_build_object(
    'linked', true,
    'household', v_household,
    'householdState', v_household_state,
    'self', jsonb_build_object(
      'displayName', coalesce(
        nullif(trim(coalesce(v_self_first, '') || ' ' || coalesce(v_self_last, '')), ''),
        'You'
      ),
      'avatarUrl', nullif(trim(coalesce(v_self_avatar, '')), ''),
      'cardAccess', 'self'
    ),
    'adults', v_adults,
    'dependents', coalesce(v_dependents, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_family_summary() IS
  'Phase 2.6C.3 — member-safe Family summary for auth.uid(). Verified user_member_links only. Household is directory-grade; guardian cardAccess requires active edge + can_view_card. No QR/tokens/raw IDs/member_digital_cards. Multi active households → householdState=conflict.';

REVOKE ALL ON FUNCTION public.get_my_family_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_family_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_family_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_family_summary() TO service_role;

COMMIT;
