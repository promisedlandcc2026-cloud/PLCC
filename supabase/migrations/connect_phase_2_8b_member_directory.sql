-- =============================================================================
-- PLCC Connect Phase 2.8B — Privacy-first Member Directory
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations).
-- DO NOT apply automatically — review before live apply.
--
-- Requires 2.8A: member_directory_privacy + preferred_name + profile helpers.
--
-- Adds:
--   * member_directory_eligible(member_id) — opt-in + adult Connect link + not child
--   * member_directory_row(member) — field-level privacy projection
--   * list_member_directory(p_letter, p_limit, p_offset)
--   * search_member_directory(p_q, p_limit)
--
-- Does NOT:
--   * Reuse Community mention-candidates
--   * Auto-list children because a parent opted in
--   * Return full DOB year, roles, attendance, giving, notes, custody
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Eligibility: verified Connect link, directory opt-in, not child/dependent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_directory_is_eligible(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_member_links l
      WHERE l.member_id = p_member_id
        AND l.status = 'verified'
    )
    AND EXISTS (
      SELECT 1
      FROM public.member_directory_privacy p
      WHERE p.member_id = p_member_id
        AND p.directory_opt_in = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.member_id = p_member_id
        AND hm.status = 'active'
        AND hm.relationship_type IN ('child', 'dependent')
    );
$$;

COMMENT ON FUNCTION public.member_directory_is_eligible(uuid) IS
  'Phase 2.8B — directory eligibility: verified user_member_links + directory_opt_in + not child/dependent household role.';

-- ---------------------------------------------------------------------------
-- Sort / display key (preferred else legal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_directory_sort_key(
  p_preferred text,
  p_first text,
  p_last text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(trim(both FROM coalesce(
    nullif(trim(coalesce(p_preferred, '')), ''),
    nullif(trim(coalesce(p_last, '') || ', ' || coalesce(p_first, '')), ', '),
    nullif(trim(coalesce(p_first, '') || ' ' || coalesce(p_last, '')), ''),
    'member'
  )));
$$;

CREATE OR REPLACE FUNCTION public.member_directory_month_day(p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_date IS NULL THEN NULL
    ELSE to_char(p_date, 'MM-DD')
  END;
$$;

-- ---------------------------------------------------------------------------
-- Privacy-projected directory row (never includes forbidden admin fields)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_directory_project_row(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_m public.members%ROWTYPE;
  v_p public.member_directory_privacy%ROWTYPE;
  v_display text;
  v_sort text;
  v_hh_name text;
  v_hh_count integer;
  v_bday date;
  v_ann date;
BEGIN
  IF NOT public.member_directory_is_eligible(p_member_id) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_m FROM public.members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_p
  FROM public.member_directory_privacy
  WHERE member_id = p_member_id;

  IF NOT FOUND OR NOT v_p.directory_opt_in THEN
    RETURN NULL;
  END IF;

  v_display := public.member_profile_display_name(v_m.preferred_name, v_m.first_name, v_m.last_name);
  v_sort := public.member_directory_sort_key(v_m.preferred_name, v_m.first_name, v_m.last_name);

  v_hh_name := NULL;
  SELECT count(*)::integer
  INTO v_hh_count
  FROM public.household_members hm
  WHERE hm.member_id = p_member_id
    AND hm.status = 'active';

  IF v_p.show_household AND v_hh_count = 1 THEN
    SELECT nullif(trim(h.name), '')
    INTO v_hh_name
    FROM public.household_members hm
    JOIN public.households h ON h.id = hm.household_id
    WHERE hm.member_id = p_member_id
      AND hm.status = 'active'
    LIMIT 1;
  END IF;

  BEGIN
    v_bday := v_m.birthday::date;
  EXCEPTION WHEN others THEN
    v_bday := NULL;
  END;

  BEGIN
    v_ann := v_m.anniversary::date;
  EXCEPTION WHEN others THEN
    v_ann := NULL;
  END;

  RETURN jsonb_build_object(
    'directoryId', p_member_id::text, -- opaque listing key (same as member id; Connect must not treat as admin CRM)
    'displayName', v_display,
    'sortKey', v_sort,
    'avatarUrl', CASE
      WHEN v_p.show_photo THEN nullif(trim(coalesce(v_m.avatar_url, '')), '')
      ELSE NULL
    END,
    'phone', CASE
      WHEN v_p.show_phone THEN nullif(trim(coalesce(v_m.phone, '')), '')
      ELSE NULL
    END,
    'email', CASE
      WHEN v_p.show_email THEN nullif(trim(coalesce(v_m.email, '')), '')
      ELSE NULL
    END,
    -- Month/day only — never year in directory DTO
    'birthdayMd', CASE
      WHEN v_p.show_birthday THEN public.member_directory_month_day(v_bday)
      ELSE NULL
    END,
    'anniversaryMd', CASE
      WHEN v_p.show_anniversary THEN public.member_directory_month_day(v_ann)
      ELSE NULL
    END,
    'householdName', CASE
      WHEN v_p.show_household THEN v_hh_name
      ELSE NULL
    END,
    'ministries', CASE
      WHEN v_p.show_ministries THEN public.member_profile_collect_ministries(p_member_id)
      ELSE '[]'::jsonb
    END
  );
END;
$$;

COMMENT ON FUNCTION public.member_directory_project_row(uuid) IS
  'Phase 2.8B — privacy-projected directory row. Null fields when show_* false. Birthday/anniversary month-day only.';

-- ---------------------------------------------------------------------------
-- list_member_directory
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_member_directory(
  p_letter text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_letter text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_items jsonb := '[]'::jsonb;
  v_row jsonb;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Caller must be an approved-linked member (same posture as Family/Profile).
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_member_links l
    WHERE l.user_id = v_uid
      AND l.status = 'verified'
  ) THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  v_letter := nullif(upper(trim(coalesce(p_letter, ''))), '');
  IF v_letter IS NOT NULL THEN
    v_letter := left(v_letter, 1);
    IF v_letter !~ '^[A-Z]$' THEN
      v_letter := NULL;
    END IF;
  END IF;

  FOR r IN
    SELECT m.id AS member_id
    FROM public.members m
    INNER JOIN public.member_directory_privacy p ON p.member_id = m.id AND p.directory_opt_in = true
    INNER JOIN public.user_member_links l ON l.member_id = m.id AND l.status = 'verified'
    WHERE public.member_directory_is_eligible(m.id)
      AND (
        v_letter IS NULL
        OR left(public.member_directory_sort_key(m.preferred_name, m.first_name, m.last_name), 1) = lower(v_letter)
      )
    ORDER BY public.member_directory_sort_key(m.preferred_name, m.first_name, m.last_name), m.id
    LIMIT v_limit
    OFFSET v_offset
  LOOP
    v_row := public.member_directory_project_row(r.member_id);
    IF v_row IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(v_row);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'items', v_items,
    'letter', v_letter,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

COMMENT ON FUNCTION public.list_member_directory(text, integer, integer) IS
  'Phase 2.8B — A–Z browse of opted-in eligible members. Server-side field privacy. Auth verified link required.';

-- ---------------------------------------------------------------------------
-- search_member_directory — non-empty query required
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_member_directory(
  p_q text,
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q text := lower(trim(coalesce(p_q, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_items jsonb := '[]'::jsonb;
  v_row jsonb;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_member_links l
    WHERE l.user_id = v_uid
      AND l.status = 'verified'
  ) THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  -- No empty browse via search
  IF length(v_q) < 2 THEN
    RAISE EXCEPTION 'query_too_short' USING ERRCODE = 'P0001';
  END IF;

  IF length(v_q) > 80 THEN
    v_q := left(v_q, 80);
  END IF;

  FOR r IN
    SELECT m.id AS member_id
    FROM public.members m
    INNER JOIN public.member_directory_privacy p ON p.member_id = m.id AND p.directory_opt_in = true
    INNER JOIN public.user_member_links l ON l.member_id = m.id AND l.status = 'verified'
    WHERE public.member_directory_is_eligible(m.id)
      AND (
        public.member_directory_sort_key(m.preferred_name, m.first_name, m.last_name) LIKE '%' || v_q || '%'
        OR lower(coalesce(m.preferred_name, '')) LIKE '%' || v_q || '%'
        OR lower(coalesce(m.first_name, '')) LIKE '%' || v_q || '%'
        OR lower(coalesce(m.last_name, '')) LIKE '%' || v_q || '%'
        OR lower(trim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, ''))) LIKE '%' || v_q || '%'
      )
    ORDER BY public.member_directory_sort_key(m.preferred_name, m.first_name, m.last_name), m.id
    LIMIT v_limit
  LOOP
    v_row := public.member_directory_project_row(r.member_id);
    IF v_row IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(v_row);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'items', v_items,
    'query', v_q,
    'limit', v_limit
  );
END;
$$;

COMMENT ON FUNCTION public.search_member_directory(text, integer) IS
  'Phase 2.8B — directory search. Requires query length >= 2. Same opt-in + field privacy as list.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.member_directory_is_eligible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_directory_is_eligible(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.member_directory_is_eligible(uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_directory_sort_key(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_directory_sort_key(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.member_directory_sort_key(text, text, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_directory_month_day(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_directory_month_day(date) FROM anon;
REVOKE ALL ON FUNCTION public.member_directory_month_day(date) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_directory_project_row(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_directory_project_row(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.member_directory_project_row(uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.list_member_directory(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_member_directory(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_member_directory(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_member_directory(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.search_member_directory(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_member_directory(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_member_directory(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_member_directory(text, integer) TO service_role;

COMMIT;
