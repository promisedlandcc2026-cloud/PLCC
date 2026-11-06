-- =============================================================================
-- PLCC Connect Phase 2.7B — Attendance Session Foundation
-- =============================================================================
-- Shared Supabase schema (Canaan-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * public.attendance_sessions
--   * constraints, indexes, RLS, grants/revokes, updated_at trigger
--
-- Does NOT:
--   * ALTER / UPDATE / DELETE / INSERT public.attendance (legacy preserved)
--   * create attendance_records / child_custody_events
--   * adult/child check-in or checkout mutations
--   * card resolver / scanner / Kids Check-In / Kiosk changes
--   * Serve signup status / notifications / digital cards / guardians
--   * seed user_member_links / guardian_relationships
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) attendance_sessions — explicit session lifecycle (no person check-in)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  type text NOT NULL
    CONSTRAINT attendance_sessions_type_chk
      CHECK (type IN ('worship', 'event', 'serve', 'bible_study', 'kids', 'other')),

  event_id uuid NULL
    REFERENCES public.events(id) ON DELETE SET NULL,

  serve_opportunity_id uuid NULL
    REFERENCES public.serve_opportunities(id) ON DELETE SET NULL,

  title text NOT NULL
    CONSTRAINT attendance_sessions_title_chk
      CHECK (
        char_length(btrim(title)) > 0
        AND char_length(title) <= 200
      ),

  starts_at timestamptz NOT NULL,

  ends_at timestamptz NULL,

  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT attendance_sessions_status_chk
      CHECK (status IN ('draft', 'open', 'closed')),

  timezone text NOT NULL DEFAULT 'Africa/Kampala'
    CONSTRAINT attendance_sessions_timezone_chk
      CHECK (char_length(btrim(timezone)) > 0 AND char_length(timezone) <= 64),

  visitor_count integer NOT NULL DEFAULT 0
    CONSTRAINT attendance_sessions_visitor_count_chk
      CHECK (visitor_count >= 0),

  created_by uuid NOT NULL
    REFERENCES public.users(id),

  created_at timestamptz NOT NULL DEFAULT now(),

  opened_by uuid NULL
    REFERENCES public.users(id),

  opened_at timestamptz NULL,

  closed_by uuid NULL
    REFERENCES public.users(id),

  closed_at timestamptz NULL,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_sessions_ends_after_starts_chk
    CHECK (ends_at IS NULL OR ends_at >= starts_at),

  -- type=event requires event_id; other types may omit event_id
  CONSTRAINT attendance_sessions_event_type_fk_chk
    CHECK (type <> 'event' OR event_id IS NOT NULL),

  -- Lifecycle timestamp consistency (actors must accompany timestamps)
  CONSTRAINT attendance_sessions_lifecycle_chk
    CHECK (
      (
        status = 'draft'
        AND opened_at IS NULL
        AND closed_at IS NULL
        AND opened_by IS NULL
        AND closed_by IS NULL
      )
      OR (
        status = 'open'
        AND opened_at IS NOT NULL
        AND opened_by IS NOT NULL
        AND closed_at IS NULL
        AND closed_by IS NULL
      )
      OR (
        status = 'closed'
        AND opened_at IS NOT NULL
        AND opened_by IS NOT NULL
        AND closed_at IS NOT NULL
        AND closed_by IS NOT NULL
      )
    )
);

COMMENT ON TABLE public.attendance_sessions IS
  'Phase 2.7B — explicit attendance/check-in session lifecycle. No person attendance rows. Legacy public.attendance untouched.';

COMMENT ON COLUMN public.attendance_sessions.type IS
  'worship | event | serve | bible_study | kids | other. type=event requires event_id.';

COMMENT ON COLUMN public.attendance_sessions.status IS
  'draft | open | closed. Mutations against person attendance only allowed later when open.';

COMMENT ON COLUMN public.attendance_sessions.timezone IS
  'IANA timezone snapshot (default Africa/Kampala). Not Eastern Standard Time label. Not browser locale.';

COMMENT ON COLUMN public.attendance_sessions.visitor_count IS
  'Aggregate visitor tally only. No visitor person rows in 2.7B.';

COMMENT ON COLUMN public.attendance_sessions.serve_opportunity_id IS
  'Optional even for type=serve — generic Serve arrival sessions allowed without one opportunity.';

-- ---------------------------------------------------------------------------
-- 2) Indexes (no global unique-open — overlapping open sessions are valid)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS attendance_sessions_status_starts_idx
  ON public.attendance_sessions (status, starts_at DESC);

CREATE INDEX IF NOT EXISTS attendance_sessions_type_starts_idx
  ON public.attendance_sessions (type, starts_at DESC);

CREATE INDEX IF NOT EXISTS attendance_sessions_event_id_idx
  ON public.attendance_sessions (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_sessions_serve_opportunity_id_idx
  ON public.attendance_sessions (serve_opportunity_id)
  WHERE serve_opportunity_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) updated_at trigger (table-specific)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_attendance_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_sessions_set_updated_at ON public.attendance_sessions;
CREATE TRIGGER attendance_sessions_set_updated_at
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attendance_sessions_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS — fail closed; Canaan service_role only
-- ---------------------------------------------------------------------------
-- No authenticated/anon SELECT or writes. Session admin is Canaan API only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Explicit deny-by-absence: no FOR SELECT/INSERT/UPDATE/DELETE policies
-- for authenticated or anon on attendance_sessions.

-- ---------------------------------------------------------------------------
-- 5) Grants / revokes
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.attendance_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.attendance_sessions FROM anon;
REVOKE ALL ON TABLE public.attendance_sessions FROM authenticated;

GRANT ALL ON TABLE public.attendance_sessions TO service_role;

REVOKE ALL ON FUNCTION public.set_attendance_sessions_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_attendance_sessions_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_attendance_sessions_updated_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_attendance_sessions_updated_at() TO service_role;

COMMIT;
