-- =============================================================================
-- PLCC Connect Phase 2.6C.1 — Family Identity Foundation
-- =============================================================================
-- Shared Supabase schema (Canaan-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * public.user_member_links
--   * public.household_members
--   * public.guardian_relationships
--   * constraints, indexes, RLS, grants/revokes, updated_at triggers
--
-- Does NOT:
--   * Family Pass UI / Family RPC / Connect DTO
--   * child digital cards / alter member_digital_cards
--   * scanner / check-in / checkout behavior
--   * spouse QR sharing / automatic household card grants
--   * ALTER members.children / members.household_id / members.household_name
--   * email/name/phone matching or automatic verified backfill
--   * INSERT/UPDATE of production user/member/household rows
--
-- Authorization model (future Family RPC — not in this migration):
--   auth.uid()
--     → user_member_links.status = 'verified'
--     AND (self OR active guardian_relationships with required flag)
--   Household membership is descriptive / directory-grade only.
--   relationship_type on household_members NEVER grants guardian rights.
--   Family Pass card view ≠ child pickup authorization.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) user_member_links — canonical users ↔ members (1:1)
-- ---------------------------------------------------------------------------
-- At most one member per user and one user per member.
-- Only status = 'verified' may authorize future Family access.
-- 'proposed' is a candidate only (e.g. future same-UUID review) — fail closed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_member_links (
  user_id uuid PRIMARY KEY
    REFERENCES public.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('proposed', 'verified', 'revoked')),
  link_method text NOT NULL
    CHECK (link_method IN ('same_uuid', 'staff_verified', 'migration')),
  linked_by uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL,
  linked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_member_links_member_uidx UNIQUE (member_id)
);

COMMENT ON TABLE public.user_member_links IS
  'Phase 2.6C.1 — canonical 1:1 link public.users ↔ public.members. Only status=verified is authorization-grade. No email/name/phone matching.';

COMMENT ON COLUMN public.user_member_links.user_id IS
  'Authenticated Connect/Canaan identity = public.users(id) matching auth.uid() for own-link reads.';

COMMENT ON COLUMN public.user_member_links.member_id IS
  'CRM directory subject = public.members(id). UNIQUE — one user per member.';

COMMENT ON COLUMN public.user_member_links.status IS
  'proposed = candidate only (no Family auth). verified = may authorize. revoked = fail closed.';

COMMENT ON COLUMN public.user_member_links.link_method IS
  'How the link was established. same_uuid is a candidate signal only — never auto-verified by this migration.';

COMMENT ON COLUMN public.user_member_links.linked_by IS
  'Staff user who created/verified the link when applicable. NULL for system/migration candidates.';

COMMENT ON COLUMN public.user_member_links.linked_at IS
  'When the link became verified (or was last staff-confirmed). NULL while proposed.';

-- ---------------------------------------------------------------------------
-- 2) household_members — structured household membership (not guardian auth)
-- ---------------------------------------------------------------------------
-- Descriptive membership for future directory/Family list metadata.
-- Does NOT grant guardian rights or adult QR access.
-- Legacy members.household_id / household_name remain untouched.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL
    REFERENCES public.households(id) ON DELETE CASCADE,
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  relationship_type text NULL
    CHECK (
      relationship_type IS NULL
      OR relationship_type IN (
        'self',
        'spouse',
        'partner',
        'parent',
        'child',
        'dependent',
        'relative',
        'guardian',
        'other'
      )
    ),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_by uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_members_household_member_uidx UNIQUE (household_id, member_id)
);

COMMENT ON TABLE public.household_members IS
  'Phase 2.6C.1 — authorization-grade household membership rows for future Family metadata. Does NOT grant guardian or card rights. Legacy members.household_* remain for Canaan directory UI.';

COMMENT ON COLUMN public.household_members.relationship_type IS
  'Descriptive only. A value of parent/guardian here MUST NEVER authorize child card view — use guardian_relationships.';

COMMENT ON COLUMN public.household_members.status IS
  'active = current household member. inactive = soft removal without deleting history.';

CREATE INDEX IF NOT EXISTS household_members_member_id_idx
  ON public.household_members (member_id);

-- ---------------------------------------------------------------------------
-- 3) guardian_relationships — explicit guardian → child authorization edges
-- ---------------------------------------------------------------------------
-- Authority subject = guardian_user_id (login identity).
-- guardian_member_id is OPTIONAL CRM enrichment only — never ownership.
-- Must NOT require shared household_id (custody/separation support).
-- Permission flags are independent — do not infer check-out from view, etc.
-- Soft revoke preferred over delete for custody changes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guardian_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id uuid NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,
  -- Optional enrichment via directory; authority remains guardian_user_id.
  guardian_member_id uuid NULL
    REFERENCES public.members(id) ON DELETE SET NULL,
  child_member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  relationship_type text NOT NULL
    CHECK (relationship_type IN (
      'parent',
      'legal_guardian',
      'authorized_guardian'
    )),
  can_view_card boolean NOT NULL DEFAULT false,
  can_check_in boolean NOT NULL DEFAULT false,
  can_check_out boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  verified_by uuid NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guardian_relationships_guardian_child_uidx
    UNIQUE (guardian_user_id, child_member_id),
  CONSTRAINT guardian_relationships_not_self_member_chk
    CHECK (
      guardian_member_id IS NULL
      OR guardian_member_id <> child_member_id
    )
);

COMMENT ON TABLE public.guardian_relationships IS
  'Phase 2.6C.1 — explicit verified guardian→child edges. Household co-residence is NOT required. Card view requires status=active AND can_view_card=true. Not pickup authorization by itself.';

COMMENT ON COLUMN public.guardian_relationships.guardian_user_id IS
  'Canonical guardian identity = public.users(id). Future Family RPC matches auth.uid() here.';

COMMENT ON COLUMN public.guardian_relationships.guardian_member_id IS
  'Optional CRM enrichment only. NEVER ownership authority — use guardian_user_id + verified user_member_links.';

COMMENT ON COLUMN public.guardian_relationships.child_member_id IS
  'Canonical child/dependent = public.members(id). JSON-only members.children entries are NOT valid subjects.';

COMMENT ON COLUMN public.guardian_relationships.can_view_card IS
  'Future Family Pass: may view child card when status=active. Independent of check-in/out flags.';

COMMENT ON COLUMN public.guardian_relationships.can_check_in IS
  'Future check-in only. Does not imply can_view_card or can_check_out.';

COMMENT ON COLUMN public.guardian_relationships.can_check_out IS
  'Future checkout/pickup privilege flag only. QR/card view alone must NEVER authorize pickup.';

COMMENT ON COLUMN public.guardian_relationships.verified_by IS
  'Staff user who verified the edge. ON DELETE RESTRICT preserves audit integrity.';

CREATE INDEX IF NOT EXISTS guardian_relationships_child_member_id_idx
  ON public.guardian_relationships (child_member_id);

CREATE INDEX IF NOT EXISTS guardian_relationships_active_guardian_idx
  ON public.guardian_relationships (guardian_user_id, status)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 4) updated_at triggers (table-specific — avoid conflicting global helpers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_user_member_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_member_links_set_updated_at ON public.user_member_links;
CREATE TRIGGER user_member_links_set_updated_at
  BEFORE UPDATE ON public.user_member_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_member_links_updated_at();

CREATE OR REPLACE FUNCTION public.set_household_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_members_set_updated_at ON public.household_members;
CREATE TRIGGER household_members_set_updated_at
  BEFORE UPDATE ON public.household_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_household_members_updated_at();

CREATE OR REPLACE FUNCTION public.set_guardian_relationships_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guardian_relationships_set_updated_at ON public.guardian_relationships;
CREATE TRIGGER guardian_relationships_set_updated_at
  BEFORE UPDATE ON public.guardian_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_guardian_relationships_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS — fail closed; no Family graph exposure via client joins
-- ---------------------------------------------------------------------------
-- authenticated:
--   * SELECT own user_member_links row only (useful for “is my CRM linked?”)
--   * NO SELECT on household_members / guardian_relationships
--   * NO INSERT/UPDATE/DELETE on any of these tables
-- anon / PUBLIC: no access
-- service_role: bypasses RLS (Canaan staff APIs)
-- Future Family data: narrow SECURITY DEFINER RPC (not created here)
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_member_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_relationships ENABLE ROW LEVEL SECURITY;

-- Drop policies if re-applied
DROP POLICY IF EXISTS user_member_links_select_own ON public.user_member_links;
DROP POLICY IF EXISTS household_members_no_client ON public.household_members;
DROP POLICY IF EXISTS guardian_relationships_no_client ON public.guardian_relationships;

-- Own link read only — never other users' links
CREATE POLICY user_member_links_select_own
  ON public.user_member_links
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Explicit deny-by-absence for household_members / guardian_relationships:
-- no FOR SELECT/INSERT/UPDATE/DELETE policies for authenticated or anon.
-- (Comment-only sentinel for contract tests.)
-- No client SELECT/INSERT/UPDATE/DELETE policies on household_members.
-- No client SELECT/INSERT/UPDATE/DELETE policies on guardian_relationships.

-- ---------------------------------------------------------------------------
-- 6) Grants / revokes
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.user_member_links FROM PUBLIC;
REVOKE ALL ON TABLE public.user_member_links FROM anon;
REVOKE ALL ON TABLE public.household_members FROM PUBLIC;
REVOKE ALL ON TABLE public.household_members FROM anon;
REVOKE ALL ON TABLE public.guardian_relationships FROM PUBLIC;
REVOKE ALL ON TABLE public.guardian_relationships FROM anon;

-- Authenticated: own-link SELECT only. No writes. No household/guardian table reads.
GRANT SELECT ON TABLE public.user_member_links TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_member_links FROM authenticated;

REVOKE ALL ON TABLE public.household_members FROM authenticated;
REVOKE ALL ON TABLE public.guardian_relationships FROM authenticated;

GRANT ALL ON TABLE public.user_member_links TO service_role;
GRANT ALL ON TABLE public.household_members TO service_role;
GRANT ALL ON TABLE public.guardian_relationships TO service_role;

REVOKE ALL ON FUNCTION public.set_user_member_links_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_member_links_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_user_member_links_updated_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_member_links_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.set_household_members_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_household_members_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_household_members_updated_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_household_members_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.set_guardian_relationships_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_guardian_relationships_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_guardian_relationships_updated_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_guardian_relationships_updated_at() TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Explicit non-goals (documentation markers for contract tests)
-- ---------------------------------------------------------------------------
-- NO Family RPC in this migration.
-- NO spouse QR sharing.
-- NO automatic guardian from household membership.
-- NO ALTER public.member_digital_cards.
-- NO ALTER public.members.children / household_id / household_name.
-- NO INSERT INTO public.user_member_links (no same-UUID DML in this file).
-- NO email/name/phone matching.
-- Staff writes: Canaan/server service_role only — no browser mutation RPCs.

COMMIT;
