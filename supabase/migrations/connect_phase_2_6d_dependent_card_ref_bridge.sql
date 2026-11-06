-- =============================================================================
-- PLCC Connect Phase 2.6D.2B — Dependent UI reference bridge (cardRef)
-- =============================================================================
-- Shared Supabase schema (Canaan-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive / replace-only:
--   * public.ensure_dependent_digital_card(uuid)  (internal SECURITY DEFINER)
--   * CREATE OR REPLACE public.get_my_guardian_child_cards()
--       → uses ensure helper (behavior preserved)
--   * CREATE OR REPLACE public.get_my_family_summary()
--       → dependents gain cardRef (string|null); QR/cardNumber NEVER returned
--
-- Does NOT:
--   * ALTER adult member_digital_cards / adult card RPCs
--   * expose qrPayload / cardNumber / status / hashes in Family Summary
--   * expose raw member/user/guardian/household IDs
--   * mint for household-only or can_view_card=false
--   * weaken RLS / table grants on dependent_digital_cards
--   * Connect UI / API / production DML backfill
--
-- Bridge rule:
--   cardAccess = 'guardian'  → cardRef = AWCD.<64 hex> (ensure/lazy-mint)
--   cardAccess = 'none'      → cardRef = null
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Internal ensure helper — one card per members.id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_dependent_digital_card(p_member_id uuid)
RETURNS public.dependent_digital_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_card public.dependent_digital_cards%ROWTYPE;
  v_tok record;
  v_number text;
  v_ref text;
  v_attempts integer;
BEGIN
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'invalid_member' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member_id) THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_card
  FROM public.dependent_digital_cards c
  WHERE c.member_id = p_member_id;

  IF FOUND THEN
    RETURN v_card;
  END IF;

  -- Lazy mint: concurrency-safe one card per member_id.
  v_attempts := 0;
  LOOP
    v_attempts := v_attempts + 1;
    SELECT * INTO v_tok FROM public.member_digital_card_new_token();
    v_number := public.member_digital_card_alloc_number();
    v_ref := public.dependent_digital_card_new_ref();

    BEGIN
      INSERT INTO public.dependent_digital_cards (
        member_id,
        card_ref,
        card_number,
        status,
        qr_token,
        qr_token_hash,
        qr_token_prefix
      ) VALUES (
        p_member_id,
        v_ref,
        v_number,
        'active',
        v_tok.token,
        v_tok.token_hash,
        v_tok.token_prefix
      )
      ON CONFLICT (member_id) DO NOTHING
      RETURNING * INTO v_card;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempts >= 5 THEN
          RAISE;
        END IF;
    END;
  END LOOP;

  IF v_card.id IS NULL THEN
    SELECT *
    INTO v_card
    FROM public.dependent_digital_cards c
    WHERE c.member_id = p_member_id;
  END IF;

  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'dependent_card_ensure_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_card;
END;
$$;

COMMENT ON FUNCTION public.ensure_dependent_digital_card(uuid) IS
  'Phase 2.6D.2B — internal ensure/lazy-mint one dependent_digital_cards row per members.id. Not browser-callable. Callers must already authorize (guardian + can_view_card).';

REVOKE ALL ON FUNCTION public.ensure_dependent_digital_card(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_dependent_digital_card(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_dependent_digital_card(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_dependent_digital_card(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Guardian child-card RPC — same contract, uses ensure helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_guardian_child_cards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_self_member_id uuid;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_card public.dependent_digital_cards%ROWTYPE;
  v_display text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT l.member_id
  INTO v_self_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_uid
    AND l.status = 'verified';

  IF v_self_member_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Authorized dependents only: active guardian edge + can_view_card.
  -- No household_members join. No members.children JSON. No can_check_*.
  FOR r IN
    SELECT
      m.id AS member_id,
      m.first_name,
      m.last_name
    FROM public.guardian_relationships gr
    JOIN public.members m ON m.id = gr.child_member_id
    WHERE gr.guardian_user_id = v_uid
      AND gr.status = 'active'
      AND gr.can_view_card = true
    ORDER BY m.last_name NULLS LAST, m.first_name NULLS LAST
  LOOP
    v_display := nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '');
    IF v_display IS NULL THEN
      v_display := 'PLCC Child Member';
    END IF;

    v_card := public.ensure_dependent_digital_card(r.member_id);

    v_out := v_out || jsonb_build_array(
      public.dependent_digital_card_dto(v_card, v_display)
    );
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.get_my_guardian_child_cards() IS
  'Phase 2.6D.2B — return (and ensure/lazy-mint) dependent card DTOs for auth.uid() when verified link + active guardian_relationship.can_view_card. Uses ensure_dependent_digital_card(). Credential is NOT pickup authorization.';

REVOKE ALL ON FUNCTION public.get_my_guardian_child_cards() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_guardian_child_cards() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_guardian_child_cards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_guardian_child_cards() TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Family Summary — add opaque cardRef for guardian-authorized dependents
-- ---------------------------------------------------------------------------
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
  v_card_ref text;
  v_ensured public.dependent_digital_cards%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

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

    -- Household children/dependents (directory). cardRef ONLY when guardian+can_view_card.
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
      v_card_ref := NULL;

      IF EXISTS (
        SELECT 1
        FROM public.guardian_relationships gr
        WHERE gr.guardian_user_id = v_uid
          AND gr.child_member_id = r.member_id
          AND gr.status = 'active'
          AND gr.can_view_card = true
      ) THEN
        v_card := 'guardian';
        v_ensured := public.ensure_dependent_digital_card(r.member_id);
        v_card_ref := v_ensured.card_ref;
      END IF;

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
        'cardAccess', v_card,
        'cardRef', v_card_ref
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
    v_card_ref := NULL;

    IF v_card = 'guardian' THEN
      v_ensured := public.ensure_dependent_digital_card(r.member_id);
      v_card_ref := v_ensured.card_ref;
    END IF;

    IF v_dep_map ? v_key THEN
      v_entry := v_dep_map -> v_key;
      v_entry := jsonb_set(v_entry, '{relationship}', to_jsonb(v_rel), true);
      v_entry := jsonb_set(v_entry, '{cardAccess}', to_jsonb(v_card), true);
      v_entry := jsonb_set(v_entry, '{cardRef}', coalesce(to_jsonb(v_card_ref), 'null'::jsonb), true);
      v_dep_map := jsonb_set(v_dep_map, ARRAY[v_key], v_entry, true);
    ELSE
      v_dep_map := jsonb_set(
        v_dep_map,
        ARRAY[v_key],
        jsonb_build_object(
          'displayName', v_display,
          'avatarUrl', NULL,
          'relationship', v_rel,
          'cardAccess', v_card,
          'cardRef', v_card_ref
        ),
        true
      );
    END IF;
  END LOOP;

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
  'Phase 2.6D.2B — Family summary for auth.uid(). Verified link only. Guardian cardAccess requires active edge + can_view_card. Dependents include opaque cardRef (AWCD) when cardAccess=guardian; otherwise cardRef=null. Never returns QR/cardNumber/raw IDs. Household alone never mints. Multi active households → householdState=conflict.';

REVOKE ALL ON FUNCTION public.get_my_family_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_family_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_family_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_family_summary() TO service_role;

COMMIT;
