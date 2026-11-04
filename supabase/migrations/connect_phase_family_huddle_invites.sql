-- Family Huddle invite links (Connect share / WhatsApp).
-- Opaque tokens stored as SHA-256 hashes. Guests redeem without joining household_members.

CREATE TABLE IF NOT EXISTS public.family_huddle_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL
    REFERENCES public.households(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL DEFAULT 10
    CHECK (max_uses > 0 AND max_uses <= 50),
  use_count integer NOT NULL DEFAULT 0
    CHECK (use_count >= 0),
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_huddle_invites_token_hash_uidx UNIQUE (token_hash)
);

COMMENT ON TABLE public.family_huddle_invites IS
  'Family Huddle share links. Token plaintext never stored — SHA-256 only. Does not grant household membership.';

CREATE INDEX IF NOT EXISTS family_huddle_invites_household_id_idx
  ON public.family_huddle_invites (household_id);

CREATE INDEX IF NOT EXISTS family_huddle_invites_expires_at_idx
  ON public.family_huddle_invites (expires_at);

ALTER TABLE public.family_huddle_invites ENABLE ROW LEVEL SECURITY;

-- No direct client access — Vault service_role only.
REVOKE ALL ON public.family_huddle_invites FROM PUBLIC;
REVOKE ALL ON public.family_huddle_invites FROM anon;
REVOKE ALL ON public.family_huddle_invites FROM authenticated;
GRANT ALL ON public.family_huddle_invites TO service_role;
