-- =============================================================================
-- PLCC Connect Phase 2.8A — My Profile & Directory Privacy Preferences
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations).
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive:
--   * members.preferred_name, members.anniversary
--   * public.member_directory_privacy (opt-in + field flags; defaults deny)
--   * get_my_member_profile / update_my_member_profile / update_my_directory_privacy
--   * Storage policies for avatars/{auth.uid()}/… (Connect self-upload)
--
-- Does NOT:
--   * Member Directory list/search RPCs (2.8B)
--   * Child directory discoverability
--   * Ministry join/leave redesign (2.9)
--   * Auth email mutation
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) CRM profile enrichment on members
-- ---------------------------------------------------------------------------

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS anniversary date;

COMMENT ON COLUMN public.members.preferred_name IS
  'Phase 2.8A — member-facing display name preference. Pastoral/legal names remain first_name/last_name.';

COMMENT ON COLUMN public.members.anniversary IS
  'Phase 2.8A — optional anniversary date (pastoral). Directory display gated by privacy flag in 2.8B.';

-- ---------------------------------------------------------------------------
-- 2) member_directory_privacy — opt-in + field-level flags (default deny)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_directory_privacy (
  member_id uuid PRIMARY KEY
    REFERENCES public.members(id) ON DELETE CASCADE,
  directory_opt_in boolean NOT NULL DEFAULT false,
  show_photo boolean NOT NULL DEFAULT false,
  show_phone boolean NOT NULL DEFAULT false,
  show_email boolean NOT NULL DEFAULT false,
  show_birthday boolean NOT NULL DEFAULT false,
  show_anniversary boolean NOT NULL DEFAULT false,
  show_household boolean NOT NULL DEFAULT false,
  show_ministries boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_directory_privacy IS
  'Phase 2.8A — Connect directory privacy prefs. Defaults deny. 2.8B queries MUST filter directory_opt_in and null fields server-side.';

COMMENT ON COLUMN public.member_directory_privacy.directory_opt_in IS
  'Master opt-in. False → member must not appear in directory browse/search (2.8B).';

COMMENT ON COLUMN public.member_directory_privacy.show_birthday IS
  'When true, 2.8B may show month/day only — never full year in directory DTOs.';

CREATE OR REPLACE FUNCTION public.set_member_directory_privacy_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_directory_privacy_set_updated_at ON public.member_directory_privacy;
CREATE TRIGGER member_directory_privacy_set_updated_at
  BEFORE UPDATE ON public.member_directory_privacy
  FOR EACH ROW
  EXECUTE FUNCTION public.set_member_directory_privacy_updated_at();

ALTER TABLE public.member_directory_privacy ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.member_directory_privacy FROM PUBLIC;
REVOKE ALL ON TABLE public.member_directory_privacy FROM anon;
REVOKE ALL ON TABLE public.member_directory_privacy FROM authenticated;

-- Own-row read via verified user_member_links only. Mutations via SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS member_directory_privacy_select_own ON public.member_directory_privacy;
CREATE POLICY member_directory_privacy_select_own
  ON public.member_directory_privacy
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_member_links l
      WHERE l.user_id = auth.uid()
        AND l.member_id = member_directory_privacy.member_id
        AND l.status = 'verified'
    )
  );

GRANT SELECT ON TABLE public.member_directory_privacy TO authenticated;
GRANT ALL ON TABLE public.member_directory_privacy TO service_role;

REVOKE ALL ON FUNCTION public.set_member_directory_privacy_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_member_directory_privacy_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_member_directory_privacy_updated_at() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_profile_ensure_privacy(p_member_id uuid)
RETURNS public.member_directory_privacy
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.member_directory_privacy%ROWTYPE;
BEGIN
  INSERT INTO public.member_directory_privacy (member_id)
  VALUES (p_member_id)
  ON CONFLICT (member_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.member_directory_privacy
  WHERE member_id = p_member_id;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.member_profile_privacy_json(
  p_row public.member_directory_privacy
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'directoryOptIn', p_row.directory_opt_in,
    'showPhoto', p_row.show_photo,
    'showPhone', p_row.show_phone,
    'showEmail', p_row.show_email,
    'showBirthday', p_row.show_birthday,
    'showAnniversary', p_row.show_anniversary,
    'showHousehold', p_row.show_household,
    'showMinistries', p_row.show_ministries
  );
$$;

CREATE OR REPLACE FUNCTION public.member_profile_is_safe_avatar_url(p_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text := lower(trim(coalesce(p_url, '')));
BEGIN
  IF v = '' THEN
    RETURN true; -- clear
  END IF;
  IF v LIKE 'data:%' THEN
    RETURN false;
  END IF;
  IF v NOT LIKE 'https://%' THEN
    RETURN false;
  END IF;
  IF length(v) > 2048 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.member_profile_display_name(
  p_preferred text,
  p_first text,
  p_last text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    nullif(trim(coalesce(p_preferred, '')), ''),
    nullif(trim(coalesce(p_first, '') || ' ' || coalesce(p_last, '')), ''),
    'PLCC Member'
  );
$$;

CREATE OR REPLACE FUNCTION public.member_profile_collect_ministries(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_names text[] := ARRAY[]::text[];
  v_elem text;
BEGIN
  SELECT coalesce(
    array_agg(DISTINCT n ORDER BY n),
    ARRAY[]::text[]
  )
  INTO v_names
  FROM (
    SELECT nullif(trim(mi.name), '') AS n
    FROM public.member_ministries mm
    JOIN public.ministries mi ON mi.id = mm.ministry_id
    WHERE mm.member_id = p_member_id
  ) s
  WHERE n IS NOT NULL;

  -- Best-effort legacy members.ministries text[] — display only.
  BEGIN
    FOR v_elem IN
      SELECT nullif(trim(x), '')
      FROM public.members m
      CROSS JOIN LATERAL unnest(COALESCE(m.ministries::text[], ARRAY[]::text[])) AS x
      WHERE m.id = p_member_id
    LOOP
      IF v_elem IS NOT NULL AND NOT (v_elem = ANY (v_names)) THEN
        v_names := array_append(v_names, v_elem);
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN to_jsonb(coalesce(v_names, ARRAY[]::text[]));
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) get_my_member_profile
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_member_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_m public.members%ROWTYPE;
  v_priv public.member_directory_privacy%ROWTYPE;
  v_hh_count integer;
  v_hh_name text;
  v_has_card boolean;
  v_has_family boolean;
  v_display text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.member_id
  INTO v_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_uid
    AND l.status = 'verified';

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false,
      'profile', NULL,
      'privacy', NULL
    );
  END IF;

  SELECT * INTO v_m FROM public.members WHERE id = v_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'linked', false,
      'profile', NULL,
      'privacy', NULL
    );
  END IF;

  v_priv := public.member_profile_ensure_privacy(v_member_id);
  v_display := public.member_profile_display_name(v_m.preferred_name, v_m.first_name, v_m.last_name);

  SELECT count(*)::integer
  INTO v_hh_count
  FROM public.household_members hm
  WHERE hm.member_id = v_member_id
    AND hm.status = 'active';

  v_hh_name := NULL;
  IF v_hh_count = 1 THEN
    SELECT nullif(trim(h.name), '')
    INTO v_hh_name
    FROM public.household_members hm
    JOIN public.households h ON h.id = hm.household_id
    WHERE hm.member_id = v_member_id
      AND hm.status = 'active'
    LIMIT 1;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.member_digital_cards c
    WHERE c.user_id = v_uid
      AND c.status IS DISTINCT FROM 'revoked'
  ) INTO v_has_card;

  SELECT (
    v_hh_count >= 1
    OR EXISTS (
      SELECT 1
      FROM public.guardian_relationships g
      WHERE g.guardian_user_id = v_uid
        AND g.status = 'active'
    )
  ) INTO v_has_family;

  RETURN jsonb_build_object(
    'linked', true,
    'profile', jsonb_build_object(
      'preferredName', nullif(trim(coalesce(v_m.preferred_name, '')), ''),
      'firstName', nullif(trim(coalesce(v_m.first_name, '')), ''),
      'lastName', nullif(trim(coalesce(v_m.last_name, '')), ''),
      'displayName', v_display,
      'phone', nullif(trim(coalesce(v_m.phone, '')), ''),
      'email', nullif(trim(coalesce(v_m.email, '')), ''),
      'birthday', CASE WHEN v_m.birthday IS NULL THEN NULL ELSE left(v_m.birthday::text, 10) END,
      'anniversary', CASE WHEN v_m.anniversary IS NULL THEN NULL ELSE left(v_m.anniversary::text, 10) END,
      'avatarUrl', nullif(trim(coalesce(v_m.avatar_url, '')), ''),
      'membershipStatus', nullif(trim(coalesce(v_m.status, '')), ''),
      'householdName', v_hh_name,
      'householdState', CASE
        WHEN v_hh_count > 1 THEN 'conflict'
        WHEN v_hh_count = 1 THEN 'linked'
        ELSE 'none'
      END,
      'ministries', public.member_profile_collect_ministries(v_member_id),
      'hasCard', v_has_card,
      'hasFamily', v_has_family
    ),
    'privacy', public.member_profile_privacy_json(v_priv)
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_member_profile() IS
  'Phase 2.8A — member-safe self profile + directory privacy. Verified user_member_links only. No admin/attendance/giving fields.';

-- ---------------------------------------------------------------------------
-- 5) update_my_member_profile
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_my_member_profile(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_preferred text;
  v_phone text;
  v_birthday text;
  v_anniversary text;
  v_avatar text;
  v_users_name text;
  v_first text;
  v_last text;
  k text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Reject unknown / forbidden keys early.
  FOR k IN SELECT jsonb_object_keys(v_patch)
  LOOP
    IF k NOT IN (
      'preferredName', 'preferred_name',
      'phone',
      'birthday',
      'anniversary',
      'avatarUrl', 'avatar_url'
    ) THEN
      RAISE EXCEPTION 'forbidden_field:%', k USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  SELECT l.member_id
  INTO v_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_uid
    AND l.status = 'verified';

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  IF v_patch ? 'preferredName' OR v_patch ? 'preferred_name' THEN
    v_preferred := nullif(trim(coalesce(v_patch->>'preferredName', v_patch->>'preferred_name', '')), '');
    IF v_preferred IS NOT NULL AND length(v_preferred) > 80 THEN
      RAISE EXCEPTION 'preferred_name_too_long' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.members
    SET preferred_name = v_preferred
    WHERE id = v_member_id;
  END IF;

  IF v_patch ? 'phone' THEN
    v_phone := nullif(trim(coalesce(v_patch->>'phone', '')), '');
    IF v_phone IS NOT NULL AND length(v_phone) > 40 THEN
      RAISE EXCEPTION 'phone_too_long' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.members
    SET phone = v_phone
    WHERE id = v_member_id;
    UPDATE public.users
    SET phone = v_phone
    WHERE id = v_uid;
  END IF;

  IF v_patch ? 'birthday' THEN
    v_birthday := nullif(trim(coalesce(v_patch->>'birthday', '')), '');
    IF v_birthday IS NULL THEN
      UPDATE public.members SET birthday = NULL WHERE id = v_member_id;
      UPDATE public.users SET birthday = NULL WHERE id = v_uid;
    ELSE
      IF v_birthday !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'invalid_birthday' USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.members
      SET birthday = v_birthday::date
      WHERE id = v_member_id;
      UPDATE public.users
      SET birthday = v_birthday::date
      WHERE id = v_uid;
    END IF;
  END IF;

  IF v_patch ? 'anniversary' THEN
    v_anniversary := nullif(trim(coalesce(v_patch->>'anniversary', '')), '');
    IF v_anniversary IS NULL THEN
      UPDATE public.members SET anniversary = NULL WHERE id = v_member_id;
    ELSE
      IF v_anniversary !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'invalid_anniversary' USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.members
      SET anniversary = v_anniversary::date
      WHERE id = v_member_id;
    END IF;
  END IF;

  IF v_patch ? 'avatarUrl' OR v_patch ? 'avatar_url' THEN
    v_avatar := nullif(trim(coalesce(v_patch->>'avatarUrl', v_patch->>'avatar_url', '')), '');
    IF NOT public.member_profile_is_safe_avatar_url(coalesce(v_avatar, '')) THEN
      RAISE EXCEPTION 'invalid_avatar_url' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.members
    SET avatar_url = v_avatar
    WHERE id = v_member_id;
    UPDATE public.users
    SET avatar_url = v_avatar
    WHERE id = v_uid;
  END IF;

  -- Dual-write users.name from preferred/legal so Card stays coherent.
  SELECT preferred_name, first_name, last_name
  INTO v_preferred, v_first, v_last
  FROM public.members
  WHERE id = v_member_id;

  v_users_name := public.member_profile_display_name(v_preferred, v_first, v_last);
  UPDATE public.users
  SET name = v_users_name
  WHERE id = v_uid;

  RETURN public.get_my_member_profile();
END;
$$;

COMMENT ON FUNCTION public.update_my_member_profile(jsonb) IS
  'Phase 2.8A — member self-update of preferred_name/phone/birthday/anniversary/avatar_url. Dual-writes users for Card. Forbidden: email/status/household/ministries/admin fields.';

-- ---------------------------------------------------------------------------
-- 6) update_my_directory_privacy
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_my_directory_privacy(p_prefs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_prefs jsonb := coalesce(p_prefs, '{}'::jsonb);
  v_row public.member_directory_privacy%ROWTYPE;
  k text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  FOR k IN SELECT jsonb_object_keys(v_prefs)
  LOOP
    IF k NOT IN (
      'directoryOptIn', 'directory_opt_in',
      'showPhoto', 'show_photo',
      'showPhone', 'show_phone',
      'showEmail', 'show_email',
      'showBirthday', 'show_birthday',
      'showAnniversary', 'show_anniversary',
      'showHousehold', 'show_household',
      'showMinistries', 'show_ministries'
    ) THEN
      RAISE EXCEPTION 'forbidden_field:%', k USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  SELECT l.member_id
  INTO v_member_id
  FROM public.user_member_links l
  WHERE l.user_id = v_uid
    AND l.status = 'verified';

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.member_profile_ensure_privacy(v_member_id);

  UPDATE public.member_directory_privacy
  SET
    directory_opt_in = CASE
      WHEN v_prefs ? 'directoryOptIn' THEN coalesce((v_prefs->>'directoryOptIn')::boolean, false)
      WHEN v_prefs ? 'directory_opt_in' THEN coalesce((v_prefs->>'directory_opt_in')::boolean, false)
      ELSE directory_opt_in
    END,
    show_photo = CASE
      WHEN v_prefs ? 'showPhoto' THEN coalesce((v_prefs->>'showPhoto')::boolean, false)
      WHEN v_prefs ? 'show_photo' THEN coalesce((v_prefs->>'show_photo')::boolean, false)
      ELSE show_photo
    END,
    show_phone = CASE
      WHEN v_prefs ? 'showPhone' THEN coalesce((v_prefs->>'showPhone')::boolean, false)
      WHEN v_prefs ? 'show_phone' THEN coalesce((v_prefs->>'show_phone')::boolean, false)
      ELSE show_phone
    END,
    show_email = CASE
      WHEN v_prefs ? 'showEmail' THEN coalesce((v_prefs->>'showEmail')::boolean, false)
      WHEN v_prefs ? 'show_email' THEN coalesce((v_prefs->>'show_email')::boolean, false)
      ELSE show_email
    END,
    show_birthday = CASE
      WHEN v_prefs ? 'showBirthday' THEN coalesce((v_prefs->>'showBirthday')::boolean, false)
      WHEN v_prefs ? 'show_birthday' THEN coalesce((v_prefs->>'show_birthday')::boolean, false)
      ELSE show_birthday
    END,
    show_anniversary = CASE
      WHEN v_prefs ? 'showAnniversary' THEN coalesce((v_prefs->>'showAnniversary')::boolean, false)
      WHEN v_prefs ? 'show_anniversary' THEN coalesce((v_prefs->>'show_anniversary')::boolean, false)
      ELSE show_anniversary
    END,
    show_household = CASE
      WHEN v_prefs ? 'showHousehold' THEN coalesce((v_prefs->>'showHousehold')::boolean, false)
      WHEN v_prefs ? 'show_household' THEN coalesce((v_prefs->>'show_household')::boolean, false)
      ELSE show_household
    END,
    show_ministries = CASE
      WHEN v_prefs ? 'showMinistries' THEN coalesce((v_prefs->>'showMinistries')::boolean, false)
      WHEN v_prefs ? 'show_ministries' THEN coalesce((v_prefs->>'show_ministries')::boolean, false)
      ELSE show_ministries
    END
  WHERE member_id = v_member_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'linked', true,
    'privacy', public.member_profile_privacy_json(v_row)
  );
END;
$$;

COMMENT ON FUNCTION public.update_my_directory_privacy(jsonb) IS
  'Phase 2.8A — upsert Connect directory privacy flags for verified linked member. Field flags preserved when opt-in is false.';

-- ---------------------------------------------------------------------------
-- 7) Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.member_profile_ensure_privacy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_profile_ensure_privacy(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.member_profile_ensure_privacy(uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_profile_privacy_json(public.member_directory_privacy) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_profile_privacy_json(public.member_directory_privacy) FROM anon;
REVOKE ALL ON FUNCTION public.member_profile_privacy_json(public.member_directory_privacy) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_profile_is_safe_avatar_url(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_profile_is_safe_avatar_url(text) FROM anon;
REVOKE ALL ON FUNCTION public.member_profile_is_safe_avatar_url(text) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_profile_display_name(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_profile_display_name(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.member_profile_display_name(text, text, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_profile_collect_ministries(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_profile_collect_ministries(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.member_profile_collect_ministries(uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.get_my_member_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_member_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_member_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_member_profile() TO service_role;

REVOKE ALL ON FUNCTION public.update_my_member_profile(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_member_profile(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_member_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_member_profile(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.update_my_directory_privacy(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_directory_privacy(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_directory_privacy(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_directory_privacy(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 8) Avatars storage — Connect self-upload under {auth.uid()}/…
-- ---------------------------------------------------------------------------
-- Bucket may already exist (Vault Members). Policies are additive IF NOT EXISTS
-- via drop/create by name. Public read of avatars is assumed for directory photos.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS avatars_select_public ON storage.objects;
CREATE POLICY avatars_select_public
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_insert_own_folder ON storage.objects;
CREATE POLICY avatars_insert_own_folder
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_update_own_folder ON storage.objects;
CREATE POLICY avatars_update_own_folder
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_delete_own_folder ON storage.objects;
CREATE POLICY avatars_delete_own_folder
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
