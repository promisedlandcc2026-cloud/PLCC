-- =============================================================================
-- PLCC Connect Phase 2.8A.1 — Harden profile update dual-writes
-- =============================================================================
-- Review before apply.
--
-- Fixes save failures when dual-writing public.users (missing/typed birthday)
-- while keeping public.members as CRM source of truth.
--
-- PL/pgSQL notes:
--   * One EXCEPTION section per BEGIN block
--   * OTHERS cannot be combined with OR
-- =============================================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birthday date;

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
    BEGIN
      UPDATE public.users
      SET phone = v_phone
      WHERE id = v_uid;
    EXCEPTION
      WHEN others THEN
        NULL; -- members remains SoT; Card dual-write best-effort
    END;
  END IF;

  IF v_patch ? 'birthday' THEN
    v_birthday := nullif(trim(coalesce(v_patch->>'birthday', '')), '');
    IF v_birthday IS NULL THEN
      BEGIN
        UPDATE public.members SET birthday = NULL WHERE id = v_member_id;
      EXCEPTION
        WHEN others THEN
          RAISE EXCEPTION 'invalid_birthday' USING ERRCODE = 'P0001';
      END;
      BEGIN
        UPDATE public.users SET birthday = NULL WHERE id = v_uid;
      EXCEPTION
        WHEN others THEN
          NULL;
      END;
    ELSE
      IF v_birthday !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'invalid_birthday' USING ERRCODE = 'P0001';
      END IF;
      -- Prefer date cast; if members.birthday is text, fall back once.
      BEGIN
        UPDATE public.members
        SET birthday = v_birthday::date
        WHERE id = v_member_id;
      EXCEPTION
        WHEN others THEN
          BEGIN
            UPDATE public.members
            SET birthday = v_birthday
            WHERE id = v_member_id;
          EXCEPTION
            WHEN others THEN
              RAISE EXCEPTION 'invalid_birthday' USING ERRCODE = 'P0001';
          END;
      END;
      BEGIN
        UPDATE public.users
        SET birthday = v_birthday::date
        WHERE id = v_uid;
      EXCEPTION
        WHEN others THEN
          NULL;
      END;
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
    BEGIN
      UPDATE public.users
      SET avatar_url = v_avatar
      WHERE id = v_uid;
    EXCEPTION
      WHEN others THEN
        NULL;
    END;
  END IF;

  SELECT preferred_name, first_name, last_name
  INTO v_preferred, v_first, v_last
  FROM public.members
  WHERE id = v_member_id;

  v_users_name := public.member_profile_display_name(v_preferred, v_first, v_last);
  BEGIN
    UPDATE public.users
    SET name = v_users_name
    WHERE id = v_uid;
  EXCEPTION
    WHEN others THEN
      NULL;
  END;

  RETURN public.get_my_member_profile();
END;
$$;

COMMENT ON FUNCTION public.update_my_member_profile(jsonb) IS
  'Phase 2.8A.1 — member self-update; members SoT; users dual-write best-effort so missing users.birthday cannot fail saves.';

COMMIT;
