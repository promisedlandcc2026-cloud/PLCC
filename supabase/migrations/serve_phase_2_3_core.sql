-- =============================================================================
-- PLCC Serve Phase 2.3 — core schema + member signup/cancel RPCs
-- =============================================================================
-- Shared Supabase schema (Canaan-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
--
-- DO NOT apply automatically — review before live apply.
-- Companion: serve_phase_2_3_signup_normalize.sql (idempotent legacy-collision repair).
--
-- Additive only:
--   * create public.serve_opportunities
--   * create public.serve_signups
--   * create public.serve_signup_opportunity(uuid)
--   * create public.serve_cancel_signup(uuid)
--   * RLS + grants for member-safe reads; mutations via RPC / service_role
--
-- Does NOT:
--   * alter event_volunteers
--   * migrate legacy volunteer rows
--   * change user_notifications / notification types
--   * invent members.id = auth.uid() linking inside RPCs
--
-- Identity (locked):
--   serve_signups.user_id → public.users(id)  (canonical; auth.uid())
--   serve_signups.member_id NULL on member self-signup
--   optional member_id backfill = Canaan service-role only (later)
--
-- Product launch note:
--   Schema alone does not authorize Serve UI. Connect/Canaan must still define
--   a SERVER-SIDE adult/eligibility rule before member Serve UI ships.
--   UI hiding alone is not sufficient protection for minors.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Opportunities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.serve_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NULL REFERENCES public.events(id) ON DELETE SET NULL,
  team_id uuid NULL REFERENCES public.teams(id) ON DELETE SET NULL,
  ministry_id uuid NULL REFERENCES public.ministries(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NULL,
  role_label text NULL,
  location text NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  capacity integer NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT serve_opportunities_capacity_chk
    CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT serve_opportunities_status_chk
    CHECK (status IN ('open', 'cancelled', 'completed')),
  CONSTRAINT serve_opportunities_time_chk
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

-- "full" is NEVER a stored lifecycle status; derive from active signup count.

CREATE INDEX IF NOT EXISTS serve_opportunities_status_starts_idx
  ON public.serve_opportunities (status, starts_at);

CREATE INDEX IF NOT EXISTS serve_opportunities_ministry_idx
  ON public.serve_opportunities (ministry_id);

CREATE INDEX IF NOT EXISTS serve_opportunities_team_idx
  ON public.serve_opportunities (team_id);

CREATE INDEX IF NOT EXISTS serve_opportunities_event_idx
  ON public.serve_opportunities (event_id);

-- ---------------------------------------------------------------------------
-- 2) Signups — ONE lifecycle row per (opportunity, user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.serve_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL
    REFERENCES public.serve_opportunities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,
  member_id uuid NULL
    REFERENCES public.members(id) ON DELETE SET NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz NULL,
  CONSTRAINT serve_signups_status_chk
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'declined')),
  CONSTRAINT serve_signups_opportunity_user_uidx
    UNIQUE (opportunity_id, user_id)
);

CREATE INDEX IF NOT EXISTS serve_signups_user_status_idx
  ON public.serve_signups (user_id, status);

-- opportunity_id lookups are covered by UNIQUE (opportunity_id, user_id) leftmost prefix.
-- Do not add a redundant standalone opportunity_id index.

-- ---------------------------------------------------------------------------
-- 3) RLS — deny-by-default writes; limited authenticated reads
-- ---------------------------------------------------------------------------
ALTER TABLE public.serve_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serve_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS serve_opportunities_select_open ON public.serve_opportunities;
CREATE POLICY serve_opportunities_select_open
  ON public.serve_opportunities
  FOR SELECT
  TO authenticated
  USING (status = 'open');

DROP POLICY IF EXISTS serve_signups_select_own ON public.serve_signups;
CREATE POLICY serve_signups_select_own
  ON public.serve_signups
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated or anon.
-- Mutations: SECURITY DEFINER RPCs + Canaan service_role (bypasses RLS).

-- ---------------------------------------------------------------------------
-- 4) Table grants (defense in depth vs default privileges)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.serve_opportunities FROM PUBLIC;
REVOKE ALL ON TABLE public.serve_opportunities FROM anon;
REVOKE ALL ON TABLE public.serve_signups FROM PUBLIC;
REVOKE ALL ON TABLE public.serve_signups FROM anon;

GRANT SELECT ON TABLE public.serve_opportunities TO authenticated;
GRANT SELECT ON TABLE public.serve_signups TO authenticated;

GRANT ALL ON TABLE public.serve_opportunities TO service_role;
GRANT ALL ON TABLE public.serve_signups TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Member signup RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.serve_signup_opportunity(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_opp public.serve_opportunities%ROWTYPE;
  v_existing public.serve_signups%ROWTYPE;
  v_has_existing boolean := false;
  v_active integer;
  v_status text;
  v_signup public.serve_signups%ROWTYPE;
  v_remaining integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  -- Canonical app user must exist (public.users.id = auth.uid() after resolveAppUser).
  -- Do NOT lookup public.members here.
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_uid
  ) THEN
    RAISE EXCEPTION 'user_not_linked'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_opp
  FROM public.serve_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_opp.status <> 'open' THEN
    RAISE EXCEPTION 'opportunity_not_open'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.serve_signups
  WHERE opportunity_id = p_opportunity_id
    AND user_id = v_uid;

  -- Capture before any later SELECT overwrites FOUND
  v_has_existing := FOUND;

  -- Active signup count (pending + confirmed consume capacity)
  SELECT count(*)::integer
  INTO v_active
  FROM public.serve_signups
  WHERE opportunity_id = p_opportunity_id
    AND status IN ('pending', 'confirmed');

  IF v_opp.capacity IS NULL THEN
    v_remaining := NULL;
  ELSE
    v_remaining := GREATEST(v_opp.capacity - v_active, 0);
  END IF;

  -- Idempotent: already pending/confirmed
  IF v_has_existing AND v_existing.status IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'opportunityId', p_opportunity_id,
      'signupStatus', v_existing.status,
      'remainingSlots', v_remaining,
      'idempotent', true
    );
  END IF;

  IF v_opp.capacity IS NOT NULL AND v_active >= v_opp.capacity THEN
    RAISE EXCEPTION 'opportunity_full'
      USING ERRCODE = 'P0001';
  END IF;

  v_status := CASE
    WHEN v_opp.requires_approval THEN 'pending'
    ELSE 'confirmed'
  END;

  IF v_has_existing THEN
    -- Reactivate the ONE lifecycle row (cancelled / declined)
    UPDATE public.serve_signups
    SET
      status = v_status,
      member_id = NULL,
      cancelled_at = NULL,
      updated_at = now()
    WHERE opportunity_id = p_opportunity_id
      AND user_id = v_uid
    RETURNING * INTO v_signup;
  ELSE
    INSERT INTO public.serve_signups (
      opportunity_id,
      user_id,
      member_id,
      status
    )
    VALUES (
      p_opportunity_id,
      v_uid,
      NULL,
      v_status
    )
    RETURNING * INTO v_signup;
  END IF;

  IF v_opp.capacity IS NULL THEN
    v_remaining := NULL;
  ELSE
    v_remaining := GREATEST(v_opp.capacity - (v_active + 1), 0);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'opportunityId', p_opportunity_id,
    'signupStatus', v_signup.status,
    'remainingSlots', v_remaining
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Member cancel RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.serve_cancel_signup(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.serve_signups%ROWTYPE;
  v_signup public.serve_signups%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.serve_signups
  WHERE opportunity_id = p_opportunity_id
    AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signup_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent cancel
  IF v_existing.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'opportunityId', p_opportunity_id,
      'signupStatus', 'cancelled',
      'idempotent', true
    );
  END IF;

  -- Declined is inactive; no-op success (not another user's row)
  IF v_existing.status = 'declined' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'opportunityId', p_opportunity_id,
      'signupStatus', 'declined',
      'alreadyInactive', true
    );
  END IF;

  -- pending / confirmed → cancelled (own row only; opportunity may be completed/cancelled)
  UPDATE public.serve_signups
  SET
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  WHERE opportunity_id = p_opportunity_id
    AND user_id = v_uid
    AND status IN ('pending', 'confirmed')
  RETURNING * INTO v_signup;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signup_not_active'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'opportunityId', p_opportunity_id,
    'signupStatus', 'cancelled'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Function privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.serve_signup_opportunity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.serve_signup_opportunity(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.serve_cancel_signup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.serve_cancel_signup(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.serve_signup_opportunity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.serve_cancel_signup(uuid) TO authenticated;

-- Admin approve/decline remains Canaan service-role API only (no public admin RPC).

COMMENT ON TABLE public.serve_opportunities IS
  'PLCC Serve 2.3 member-facing opportunities. Full = derived, not stored. event_volunteers remains separate staff roster.';

COMMENT ON TABLE public.serve_signups IS
  'PLCC Serve 2.3 one-row lifecycle per (opportunity, user). Ownership = user_id (public.users / auth.uid()). member_id NULL on self-signup.';

COMMENT ON FUNCTION public.serve_signup_opportunity(uuid) IS
  'Member self-signup. Identity from auth.uid() only. member_id forced NULL. Capacity under opportunity FOR UPDATE.';

COMMENT ON FUNCTION public.serve_cancel_signup(uuid) IS
  'Member soft-cancel of own signup only. Idempotent if already cancelled.';

COMMIT;
