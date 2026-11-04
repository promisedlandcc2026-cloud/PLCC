-- =============================================================================
-- PLCC Connect Phase 2.6D.1 — Dependent digital cards + guardian read RPC
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Vault + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * public.dependent_digital_cards
--   * updated_at trigger helper
--   * public.get_my_guardian_child_cards()  (SECURITY DEFINER, lazy mint)
--
-- Does NOT:
--   * ALTER public.member_digital_cards or adult card RPCs
--   * MODIFY public.get_my_family_summary()
--   * guardian rotate / revoke RPCs (staff-only later)
--   * scanner / check-in / check-out
--   * Connect UI
--   * production DML / backfill
--
-- Subject model:
--   dependent_digital_cards.member_id → public.members(id)  (canonical)
--   NO user_id — dependents may have no login account
--
-- Authorization (guardian VIEW only):
--   auth.uid()
--     → public.users exists
--     → public.user_member_links.status = 'verified'
--     → public.guardian_relationships.status = 'active'
--     → can_view_card = true
--   Household co-residence NEVER grants dependent-card access.
--
-- Pickup separation:
--   Dependent membership card credential MUST NOT be treated as
--   child pickup / check-out authorization. This RPC does not read
--   can_check_in / can_check_out.
--
-- Card number: reuses public.member_digital_card_number_seq (PLCC-YYYY-NNNNN)
--   via public.member_digital_card_alloc_number() — shared global namespace.
-- QR token: reuses public.member_digital_card_new_token() (AWC1.<64 hex> + SHA-256).
-- card_ref: opaque AWCD.<64 hex>, stable across QR rotation (not member UUID).
--
-- Audit:
--   Lazy mint is recorded via row created_at / issued_at only.
--   No audit_logs writes from this RPC (avoids unsafe coupling).
--   Future Vault staff mint/rotate/revoke should use audit_logs.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dependent_digital_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  -- Opaque stable selector for Connect (never members.id / card_number / qr_token).
  card_ref text NOT NULL,
  card_number text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  qr_token text NOT NULL,
  qr_token_hash text NOT NULL,
  qr_token_prefix text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dependent_digital_cards_member_uidx UNIQUE (member_id),
  CONSTRAINT dependent_digital_cards_card_ref_uidx UNIQUE (card_ref),
  CONSTRAINT dependent_digital_cards_card_number_uidx UNIQUE (card_number),
  CONSTRAINT dependent_digital_cards_qr_token_uidx UNIQUE (qr_token),
  CONSTRAINT dependent_digital_cards_qr_token_hash_uidx UNIQUE (qr_token_hash),
  CONSTRAINT dependent_digital_cards_status_chk
    CHECK (status IN ('active', 'inactive', 'revoked')),
  CONSTRAINT dependent_digital_cards_card_ref_fmt_chk
    CHECK (card_ref ~ '^AWCD\.[0-9a-f]{64}$'),
  CONSTRAINT dependent_digital_cards_card_number_fmt_chk
    CHECK (card_number ~ '^PLCC-[0-9]{4}-[0-9]{5,}$'),
  CONSTRAINT dependent_digital_cards_qr_token_fmt_chk
    CHECK (qr_token ~ '^AWC1\.[0-9a-f]{64}$'),
  CONSTRAINT dependent_digital_cards_qr_token_hash_fmt_chk
    CHECK (qr_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT dependent_digital_cards_revoked_at_chk
    CHECK (
      (status = 'revoked' AND revoked_at IS NOT NULL)
      OR (status <> 'revoked' AND revoked_at IS NULL)
    )
);

COMMENT ON TABLE public.dependent_digital_cards IS
  'Phase 2.6D.1 — one digital membership credential per dependent public.members row. No login user_id. Not pickup/check-out authorization. Adult member_digital_cards unchanged.';

COMMENT ON COLUMN public.dependent_digital_cards.member_id IS
  'Canonical dependent subject = public.members(id). JSON-only members.children entries are NOT valid subjects.';

COMMENT ON COLUMN public.dependent_digital_cards.card_ref IS
  'Opaque stable AWCD.<64 hex> selector for Connect. Stable across QR rotation. Never equals members.id / card_number / qr_token.';

COMMENT ON COLUMN public.dependent_digital_cards.card_number IS
  'Human-readable PLCC-YYYY-NNNNN from shared member_digital_card_number_seq. Stable across QR rotation.';

COMMENT ON COLUMN public.dependent_digital_cards.qr_token IS
  'Opaque AWC1.<64 hex> display/scan credential. Guardian VIEW via DEFINER RPC only. Not pickup authorization.';

COMMENT ON COLUMN public.dependent_digital_cards.qr_token_hash IS
  'SHA-256 hex of qr_token. Preferred future scanner lookup key.';

COMMENT ON COLUMN public.dependent_digital_cards.status IS
  'Stored status. Guardian revoke of can_view_card does NOT alter this row.';

CREATE INDEX IF NOT EXISTS dependent_digital_cards_status_idx
  ON public.dependent_digital_cards (status);

-- ---------------------------------------------------------------------------
-- 2) updated_at trigger (dedicated helper — avoid colliding with adult helper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_dependent_digital_cards_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dependent_digital_cards_set_updated_at ON public.dependent_digital_cards;
CREATE TRIGGER dependent_digital_cards_set_updated_at
  BEFORE UPDATE ON public.dependent_digital_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_dependent_digital_cards_updated_at();

-- ---------------------------------------------------------------------------
-- 3) RLS — no authenticated browser table access
-- ---------------------------------------------------------------------------
ALTER TABLE public.dependent_digital_cards ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies for authenticated/anon.
-- Reads/writes: SECURITY DEFINER RPCs + service_role only.

REVOKE ALL ON TABLE public.dependent_digital_cards FROM PUBLIC;
REVOKE ALL ON TABLE public.dependent_digital_cards FROM anon;
REVOKE ALL ON TABLE public.dependent_digital_cards FROM authenticated;

GRANT ALL ON TABLE public.dependent_digital_cards TO service_role;

REVOKE ALL ON FUNCTION public.set_dependent_digital_cards_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_dependent_digital_cards_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_dependent_digital_cards_updated_at() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4) Internal helpers (not granted to authenticated/anon)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dependent_digital_card_new_ref()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- Opaque AWCD.<64 hex>; not derived from member_id / card_number / qr_token.
  RETURN 'AWCD.' || encode(gen_random_bytes(32), 'hex');
END;
$$;

COMMENT ON FUNCTION public.dependent_digital_card_new_ref() IS
  'Phase 2.6D.1 — opaque stable card_ref generator (AWCD.<64 hex>). Server-only.';

CREATE OR REPLACE FUNCTION public.dependent_digital_card_dto(
  p_card public.dependent_digital_cards,
  p_display_name text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'cardRef', p_card.card_ref,
    'displayName', coalesce(nullif(trim(p_display_name), ''), 'PLCC Child Member'),
    'label', 'PLCC Child Member',
    'cardNumber', p_card.card_number,
    'cardStatus', p_card.status,
    'qrPayload', p_card.qr_token,
    'issuedAt', p_card.issued_at,
    'rotatedAt', p_card.rotated_at
    -- omit: id, member_id, qr_token_hash, avatar, DOB, guardian/household IDs
  );
$$;

COMMENT ON FUNCTION public.dependent_digital_card_dto(public.dependent_digital_cards, text) IS
  'Phase 2.6D.1 — member-safe dependent card DTO. No raw IDs, hashes, or PII beyond displayName.';

REVOKE ALL ON FUNCTION public.dependent_digital_card_new_ref() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dependent_digital_card_new_ref() FROM anon;
REVOKE ALL ON FUNCTION public.dependent_digital_card_new_ref() FROM authenticated;

REVOKE ALL ON FUNCTION public.dependent_digital_card_dto(public.dependent_digital_cards, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dependent_digital_card_dto(public.dependent_digital_cards, text) FROM anon;
REVOKE ALL ON FUNCTION public.dependent_digital_card_dto(public.dependent_digital_cards, text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5) Guardian VIEW RPC — lazy mint, no rotate/revoke
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
  v_tok record;
  v_number text;
  v_ref text;
  v_display text;
  v_attempts integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- App user must exist.
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Verified identity link required (proposed/revoked/absent → empty).
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

    SELECT *
    INTO v_card
    FROM public.dependent_digital_cards c
    WHERE c.member_id = r.member_id;

    IF NOT FOUND THEN
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
            r.member_id,
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
            -- Rare card_ref / card_number / token collision — retry a few times.
            IF v_attempts >= 5 THEN
              RAISE;
            END IF;
        END;
      END LOOP;

      IF v_card.id IS NULL THEN
        SELECT * INTO v_card
        FROM public.dependent_digital_cards c
        WHERE c.member_id = r.member_id;
      END IF;
    END IF;

    IF v_card.id IS NULL THEN
      CONTINUE;
    END IF;

    v_out := v_out || jsonb_build_array(
      public.dependent_digital_card_dto(v_card, v_display)
    );
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.get_my_guardian_child_cards() IS
  'Phase 2.6D.1 — return (and lazy-mint if needed) dependent card DTOs for auth.uid() when verified user_member_link + active guardian_relationship.can_view_card. No household auth. No rotate/revoke. Credential is NOT pickup authorization. Does not modify get_my_family_summary().';

REVOKE ALL ON FUNCTION public.get_my_guardian_child_cards() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_guardian_child_cards() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_guardian_child_cards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_guardian_child_cards() TO service_role;

-- Future (NOT created in 2.6D.1):
--   staff_mint / staff_rotate / staff_revoke / staff_reactivate dependent cards
--   resolve_dependent_digital_card(p_token) for scanner (hash lookup)
--   Connect /family View Child Card UI

COMMIT;
