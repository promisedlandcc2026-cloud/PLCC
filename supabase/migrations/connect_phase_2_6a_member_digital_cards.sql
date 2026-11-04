-- =============================================================================
-- PLCC Connect Phase 2.6A — digital membership card foundation
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Vault + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * create public.member_digital_cards
--   * card_number sequence (year + nextval)
--   * updated_at trigger
--   * RLS: authenticated SELECT own only; no client writes
--   * SECURITY DEFINER RPCs: get_my / mint / rotate
--
-- Does NOT:
--   * Family Pass / household grants / child cards / guardian columns
--   * staff scanner resolve RPC (design-only; future phase)
--   * alter Vault Official Member Pass (raw members.id QR in Members.tsx)
--   * auto-link members by email/name/phone
--   * require a public.members row to issue a card
--
-- Identity (locked):
--   member_digital_cards.user_id → public.users(id)  (canonical; auth.uid())
--   member_id is OPTIONAL enrichment only — NEVER ownership authority
--
-- QR credential architecture (MVP = Option E + hash):
--   Persist opaque non-PII qr_token so My Card can redisplay the same QR until
--   rotate/revoke. Also store qr_token_hash = SHA-256(qr_token) for future
--   scanner lookup. Format: AWC1.<64 hex chars> (≥256-bit random material).
--   Browser must NEVER generate tokens. No reversible encryption in MVP.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1) Card number sequence (concurrent-safe via nextval)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.member_digital_card_number_seq
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1
  CACHE 1;

COMMENT ON SEQUENCE public.member_digital_card_number_seq IS
  'Monotonic suffix for PLCC-YYYY-NNNNN digital card numbers. nextval is concurrency-safe.';

-- ---------------------------------------------------------------------------
-- 2) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_digital_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_id uuid NULL REFERENCES public.members(id) ON DELETE SET NULL,
  card_number text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  -- Opaque QR payload (AWC1.<hex>). Non-PII. Required so My Card can redisplay
  -- the same credential until rotate. Not a substitute for scanner auth.
  qr_token text NOT NULL,
  -- SHA-256 hex of qr_token (UTF-8). Preferred future scanner lookup key.
  qr_token_hash text NOT NULL,
  -- Optional short prefix for ops debugging (NOT sufficient for auth).
  qr_token_prefix text NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_digital_cards_user_uidx UNIQUE (user_id),
  CONSTRAINT member_digital_cards_card_number_uidx UNIQUE (card_number),
  CONSTRAINT member_digital_cards_qr_token_uidx UNIQUE (qr_token),
  CONSTRAINT member_digital_cards_qr_token_hash_uidx UNIQUE (qr_token_hash),
  CONSTRAINT member_digital_cards_status_chk
    CHECK (status IN ('active', 'inactive', 'revoked')),
  CONSTRAINT member_digital_cards_card_number_fmt_chk
    CHECK (card_number ~ '^PLCC-[0-9]{4}-[0-9]{5,}$'),
  CONSTRAINT member_digital_cards_qr_token_fmt_chk
    CHECK (qr_token ~ '^AWC1\.[0-9a-f]{64}$'),
  CONSTRAINT member_digital_cards_qr_token_hash_fmt_chk
    CHECK (qr_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT member_digital_cards_revoked_at_chk
    CHECK (
      (status = 'revoked' AND revoked_at IS NOT NULL)
      OR (status <> 'revoked' AND revoked_at IS NULL)
    )
);

COMMENT ON TABLE public.member_digital_cards IS
  'Connect Phase 2.6A — one login-backed digital membership card per public.users row. Opaque QR; no family/child columns.';

COMMENT ON COLUMN public.member_digital_cards.user_id IS
  'Canonical card subject = public.users(id) matching auth.uid(). Ownership authority.';

COMMENT ON COLUMN public.member_digital_cards.member_id IS
  'Optional CRM enrichment only. NEVER ownership. Must not be auto-filled via email/name/phone.';

COMMENT ON COLUMN public.member_digital_cards.card_number IS
  'Non-secret human-readable id (PLCC-YYYY-NNNNN). Stable across QR rotations.';

COMMENT ON COLUMN public.member_digital_cards.qr_token IS
  'Opaque display/scan credential AWC1.<64 hex>. Persist for redisplay; rotate invalidates. Owner may SELECT own row.';

COMMENT ON COLUMN public.member_digital_cards.qr_token_hash IS
  'SHA-256 hex of qr_token. Preferred future scanner lookup key.';

COMMENT ON COLUMN public.member_digital_cards.status IS
  'Stored status. Effective display/scan status = stored status AND approved public.users.role.';

-- ---------------------------------------------------------------------------
-- 3) Indexes (UNIQUE constraints cover user_id / card_number / token / hash)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS member_digital_cards_status_idx
  ON public.member_digital_cards (status);

-- ---------------------------------------------------------------------------
-- 4) updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_digital_cards_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_digital_cards_set_updated_at ON public.member_digital_cards;
CREATE TRIGGER member_digital_cards_set_updated_at
  BEFORE UPDATE ON public.member_digital_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_member_digital_cards_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.member_digital_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_digital_cards_select_own ON public.member_digital_cards;
CREATE POLICY member_digital_cards_select_own
  ON public.member_digital_cards
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies for authenticated or anon.
-- Mutations: SECURITY DEFINER RPCs + service_role only.
-- Scanner resolution must NOT use table SELECT by token (no token-based policy).

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.member_digital_cards FROM PUBLIC;
REVOKE ALL ON TABLE public.member_digital_cards FROM anon;
REVOKE ALL ON TABLE public.member_digital_cards FROM authenticated;

GRANT SELECT ON TABLE public.member_digital_cards TO authenticated;
GRANT ALL ON TABLE public.member_digital_cards TO service_role;

REVOKE ALL ON SEQUENCE public.member_digital_card_number_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.member_digital_card_number_seq FROM anon;
REVOKE ALL ON SEQUENCE public.member_digital_card_number_seq FROM authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.member_digital_card_number_seq TO service_role;
-- SECURITY DEFINER RPCs (owner) use nextval internally.

-- ---------------------------------------------------------------------------
-- 7) Internal helpers (not granted to authenticated/anon)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_digital_card_is_approved_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT upper(trim(coalesce(p_role, ''))) IN (
    'SUPER_ADMIN',
    'PASTOR',
    'MINISTRY_LEADER',
    'FINANCE',
    'MEDIA_TEAM',
    'ADMIN_STAFF',
    'STAFF',
    'SECRETARY',
    'ASST_SECRETARY',
    'FIRST_LADY',
    'WORSHIP_TEAM',
    'SUNDAY_SCHOOL_TEACHER',
    'VOLUNTEER',
    'GUEST',
    'MEMBER',
    'PARENT',
    'TEACHER',
    'YOUTH',
    'ADMIN',
    'USER'
  );
$$;

COMMENT ON FUNCTION public.member_digital_card_is_approved_role(text) IS
  'Connect-aligned approved role allowlist. PENDING and unknown roles are false. No users-table recursion.';

CREATE OR REPLACE FUNCTION public.member_digital_card_new_token()
RETURNS TABLE (token text, token_hash text, token_prefix text)
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token text;
  v_hash text;
BEGIN
  -- 32 cryptographically random bytes → 64 hex (≥256-bit entropy).
  v_token := 'AWC1.' || encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');
  token := v_token;
  token_hash := v_hash;
  token_prefix := left(v_token, 12);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.member_digital_card_alloc_number()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year text := to_char((now() AT TIME ZONE 'utc'), 'YYYY');
  v_n bigint;
BEGIN
  -- nextval is atomic under concurrency; UNIQUE(card_number) is a second safety net.
  v_n := nextval('public.member_digital_card_number_seq');
  RETURN 'PLCC-' || v_year || '-' || lpad(v_n::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.member_digital_card_effective_status(
  p_stored text,
  p_role text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_stored = 'revoked' THEN 'revoked'
    WHEN NOT public.member_digital_card_is_approved_role(p_role) THEN 'inactive'
    WHEN p_stored = 'inactive' THEN 'inactive'
    ELSE 'active'
  END;
$$;

CREATE OR REPLACE FUNCTION public.member_digital_card_dto(
  p_card public.member_digital_cards,
  p_name text,
  p_avatar_url text,
  p_role text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'displayName', coalesce(nullif(trim(p_name), ''), 'PLCC Member'),
    'avatarUrl', nullif(trim(coalesce(p_avatar_url, '')), ''),
    'label', 'PLCC Member',
    'cardNumber', p_card.card_number,
    'cardStatus', public.member_digital_card_effective_status(p_card.status, p_role),
    'qrPayload', p_card.qr_token,
    'issuedAt', p_card.issued_at,
    'rotatedAt', p_card.rotated_at
    -- omit: cardId, userId, memberId, email, phone, role dump, qr_token_hash
  );
$$;

-- ---------------------------------------------------------------------------
-- 8) Member RPCs — identity from auth.uid() only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_member_digital_card()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
  v_avatar text;
  v_card public.member_digital_cards%ROWTYPE;
  v_tok record;
  v_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- SECURITY DEFINER read of public.users — avoid recursive RLS patterns.
  SELECT u.role, u.name, u.avatar_url
  INTO v_role, v_name, v_avatar
  FROM public.users u
  WHERE u.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_linked' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.member_digital_card_is_approved_role(v_role) THEN
    RAISE EXCEPTION 'not_approved' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_card
  FROM public.member_digital_cards c
  WHERE c.user_id = v_uid;

  IF FOUND THEN
    IF v_card.status = 'revoked' THEN
      RAISE EXCEPTION 'card_revoked' USING ERRCODE = 'P0001';
    END IF;
    RETURN public.member_digital_card_dto(v_card, v_name, v_avatar, v_role);
  END IF;

  -- Lazy mint: no client-supplied user_id / card_number / token; member_id stays NULL
  SELECT * INTO v_tok FROM public.member_digital_card_new_token();
  v_number := public.member_digital_card_alloc_number();

  INSERT INTO public.member_digital_cards (
    user_id,
    member_id,
    card_number,
    status,
    qr_token,
    qr_token_hash,
    qr_token_prefix
  ) VALUES (
    v_uid,
    NULL,
    v_number,
    'active',
    v_tok.token,
    v_tok.token_hash,
    v_tok.token_prefix
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_card;

  IF v_card.id IS NULL THEN
    SELECT * INTO v_card FROM public.member_digital_cards WHERE user_id = v_uid;
  END IF;

  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'card_mint_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.member_digital_card_dto(v_card, v_name, v_avatar, v_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.mint_member_digital_card()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- Idempotent alias of get_my (lazy mint or return existing).
  RETURN public.get_my_member_digital_card();
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_member_digital_card()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
  v_avatar text;
  v_card public.member_digital_cards%ROWTYPE;
  v_tok record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.role, u.name, u.avatar_url
  INTO v_role, v_name, v_avatar
  FROM public.users u
  WHERE u.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_linked' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.member_digital_card_is_approved_role(v_role) THEN
    RAISE EXCEPTION 'not_approved' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_card
  FROM public.member_digital_cards c
  WHERE c.user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_card.status = 'revoked' THEN
    RAISE EXCEPTION 'card_revoked' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tok FROM public.member_digital_card_new_token();

  UPDATE public.member_digital_cards
  SET
    qr_token = v_tok.token,
    qr_token_hash = v_tok.token_hash,
    qr_token_prefix = v_tok.token_prefix,
    rotated_at = now()
    -- card_number unchanged; status unchanged; member_id untouched
  WHERE id = v_card.id
  RETURNING * INTO v_card;

  RETURN public.member_digital_card_dto(v_card, v_name, v_avatar, v_role);
END;
$$;

COMMENT ON FUNCTION public.get_my_member_digital_card() IS
  'Return (and lazy-mint if needed) the caller digital card DTO including qrPayload. auth.uid() only.';

COMMENT ON FUNCTION public.mint_member_digital_card() IS
  'Idempotent mint alias for get_my_member_digital_card().';

COMMENT ON FUNCTION public.rotate_member_digital_card() IS
  'Replace QR credential; keep card_number. Old token/hash immediately invalid. Member self regenerate.';

-- Future (NOT created in 2.6A):
--   resolve_member_digital_card(p_token text)
--     staff-only; hash(p_token) → qr_token_hash; return minimal DTO;
--     enforce effective status; rate-limit; audit.
--   staff_revoke_member_digital_card(p_user_id uuid)
--     administrative revoke; set status=revoked, revoked_at=now(); rotate optional.

REVOKE ALL ON FUNCTION public.member_digital_card_is_approved_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_digital_card_is_approved_role(text) FROM anon;
REVOKE ALL ON FUNCTION public.member_digital_card_is_approved_role(text) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_digital_card_new_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_digital_card_new_token() FROM anon;
REVOKE ALL ON FUNCTION public.member_digital_card_new_token() FROM authenticated;

REVOKE ALL ON FUNCTION public.member_digital_card_alloc_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_digital_card_alloc_number() FROM anon;
REVOKE ALL ON FUNCTION public.member_digital_card_alloc_number() FROM authenticated;

REVOKE ALL ON FUNCTION public.member_digital_card_effective_status(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_digital_card_effective_status(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.member_digital_card_effective_status(text, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.member_digital_card_dto(public.member_digital_cards, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_digital_card_dto(public.member_digital_cards, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.member_digital_card_dto(public.member_digital_cards, text, text, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.get_my_member_digital_card() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_member_digital_card() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_member_digital_card() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_member_digital_card() TO service_role;

REVOKE ALL ON FUNCTION public.mint_member_digital_card() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mint_member_digital_card() FROM anon;
GRANT EXECUTE ON FUNCTION public.mint_member_digital_card() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mint_member_digital_card() TO service_role;

REVOKE ALL ON FUNCTION public.rotate_member_digital_card() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_member_digital_card() FROM anon;
GRANT EXECUTE ON FUNCTION public.rotate_member_digital_card() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_member_digital_card() TO service_role;

COMMIT;
