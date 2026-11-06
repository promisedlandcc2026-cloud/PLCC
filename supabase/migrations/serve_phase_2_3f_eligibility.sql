-- =============================================================================
-- PLCC Serve Phase 2.3F — verified Serve eligibility foundation
-- =============================================================================
-- Purpose:
--   Person-level Serve eligibility that is staff-verified (not self-asserted DOB).
--   Connect signup must consult this BEFORE calling serve_signup_opportunity.
--
-- Architecture: OPTION B — dedicated public.serve_eligibility table
--   (not columns on public.users; not kids consent; not members.birthday)
--
-- Status semantics:
--   no row              → not_verified (member cannot self-sign up)
--   eligible            → staff-verified adult eligible to self-sign up
--   ineligible          → staff-reviewed; denied (e.g. under 18 / policy)
--   suspended           → was eligible; temporarily revoked
--
-- Privacy:
--   Members may SELECT only own status / reason_code / timestamps (no verified_by).
--   Connect should still prefer bridge sanitization over direct table reads.
--   Never store DOB or medical/background free-text here.
--
-- DO NOT APPLY until Phase 2.3F foundation review approval.
-- Does NOT enable Connect SERVE_ELIGIBILITY_ENABLED.
-- Does NOT alter serve_signup_opportunity / serve_cancel_signup / capacity RPC.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.serve_eligibility (
  user_id uuid PRIMARY KEY
    REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL
    CONSTRAINT serve_eligibility_status_chk
      CHECK (status IN ('eligible', 'ineligible', 'suspended')),
  -- Member-safe machine code only (not free-text staff notes).
  -- Examples: under_18, policy, temporary_hold, other
  reason_code text NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT serve_eligibility_no_self_verify_chk
    CHECK (verified_by IS NULL OR verified_by <> user_id OR status <> 'eligible')
);

-- Note on CONSTRAINT serve_eligibility_no_self_verify_chk:
-- Soft guard only. Real enforcement is Canaan API (service_role + role gate).
-- Allows verified_by = user_id for non-eligible transitions if needed by tooling;
-- blocks marking oneself eligible.

COMMENT ON TABLE public.serve_eligibility IS
  'Staff-verified Serve person eligibility. Absence of row = not_verified. No DOB.';

COMMENT ON COLUMN public.serve_eligibility.status IS
  'eligible | ineligible | suspended. Missing row = not_verified.';

COMMENT ON COLUMN public.serve_eligibility.reason_code IS
  'Optional member-safe reason code. No free-text medical/background notes.';

COMMENT ON COLUMN public.serve_eligibility.verified_by IS
  'Staff public.users.id who last set status. SET NULL if staff user deleted.';

CREATE INDEX IF NOT EXISTS serve_eligibility_status_idx
  ON public.serve_eligibility (status);

CREATE INDEX IF NOT EXISTS serve_eligibility_verified_by_idx
  ON public.serve_eligibility (verified_by);

CREATE INDEX IF NOT EXISTS serve_eligibility_updated_at_idx
  ON public.serve_eligibility (updated_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.serve_eligibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS serve_eligibility_select_own ON public.serve_eligibility;
CREATE POLICY serve_eligibility_select_own
  ON public.serve_eligibility
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE for authenticated or anon.
-- Mutations: Canaan API via service_role only.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.serve_eligibility FROM PUBLIC;
REVOKE ALL ON TABLE public.serve_eligibility FROM anon;
GRANT SELECT ON TABLE public.serve_eligibility TO authenticated;
GRANT ALL ON TABLE public.serve_eligibility TO service_role;
