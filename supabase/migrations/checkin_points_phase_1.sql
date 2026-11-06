-- =============================================================================
-- Check-in Points — Phase 1 (rotating QR self check-in + points ledger)
-- =============================================================================
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
-- Run once in PLCC Canaan Supabase SQL editor. Safe to re-run.
--
-- Additive only:
--   * attendance_records.source: allow 'self_qr' (member scanned the leader's
--     rotating QR with their own phone)
--   * attendance_sessions.points_enabled (default false — leaders turn points
--     on per session, so Sunday worship does not award points by accident)
--   * public.points_season_key(timestamptz) — same Fall/Winter/Spring/Summer
--     boundaries as lib/seasons (Africa/Kampala)
--   * public.member_point_ledger — every point is a row; totals are SUM()
--   * public.member_points_settings — leaderboard opt-out
--   * AFTER INSERT trigger on attendance_records that awards points for
--     EVERY check-in path (card scan, manual, household, self QR)
--   * public.attendance_self_checkin(...) — self QR check-in RPC
--   * public.points_leaderboard(...) / public.points_member_summary(...)
--
-- Does NOT:
--   * change or remove any existing attendance row, session, or RPC
--   * award points for past check-ins (no backfill)
--   * expose any table to anon/authenticated (service_role only, like
--     attendance_sessions / attendance_records)
--
-- The points trigger can never block a check-in: any error inside it is
-- caught and logged as a WARNING, and the check-in still succeeds.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Allow source = 'self_qr'
-- ---------------------------------------------------------------------------

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_source_chk;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_source_chk
  CHECK (source IN ('digital_card', 'manual_staff', 'household_bulk', 'self_qr'));

COMMENT ON COLUMN public.attendance_records.source IS
  'digital_card | manual_staff | household_bulk | self_qr. First successful write wins; duplicates do not overwrite.';

-- ---------------------------------------------------------------------------
-- 2) Per-session points switch
-- ---------------------------------------------------------------------------

ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS points_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.attendance_sessions.points_enabled IS
  'When true, check-ins to this session earn points (member_point_ledger). Off by default.';

-- ---------------------------------------------------------------------------
-- 3) Season key — mirrors lib/seasons/season.ts getSeasonWindow
--    Fall Sep–Nov, Winter Dec–Feb (keyed by the December year), Spring Mar–May,
--    Summer Jun–Aug, all in Africa/Kampala.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.points_season_key(p_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN m BETWEEN 9 AND 11 THEN y::text || '-fall'
    WHEN m BETWEEN 6 AND 8  THEN y::text || '-summer'
    WHEN m BETWEEN 3 AND 5  THEN y::text || '-spring'
    WHEN m = 12             THEN y::text || '-winter'
    ELSE (y - 1)::text || '-winter'
  END
  FROM (
    SELECT
      extract(month FROM (p_at AT TIME ZONE 'Africa/Kampala'))::int AS m,
      extract(year  FROM (p_at AT TIME ZONE 'Africa/Kampala'))::int AS y
  ) parts;
$$;

-- ---------------------------------------------------------------------------
-- 4) Ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,

  season_key text NOT NULL
    CONSTRAINT member_point_ledger_season_key_chk
      CHECK (season_key ~ '^[0-9]{4}-(fall|winter|spring|summer)$'),

  points integer NOT NULL
    CONSTRAINT member_point_ledger_points_chk
      CHECK (points <> 0 AND points BETWEEN -1000 AND 1000),

  reason text NOT NULL
    CONSTRAINT member_point_ledger_reason_chk
      CHECK (reason IN ('checkin', 'on_time', 'first_visit', 'streak', 'referral', 'manual')),

  note text NULL
    CONSTRAINT member_point_ledger_note_chk
      CHECK (note IS NULL OR char_length(note) <= 200),

  session_id uuid NULL
    REFERENCES public.attendance_sessions(id) ON DELETE SET NULL,

  -- Removing a check-in removes the points it earned.
  attendance_record_id uuid NULL
    REFERENCES public.attendance_records(id) ON DELETE CASCADE,

  awarded_by uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Manual awards always need a note
  CONSTRAINT member_point_ledger_manual_note_chk
    CHECK (reason <> 'manual' OR (note IS NOT NULL AND char_length(btrim(note)) > 0))
);

COMMENT ON TABLE public.member_point_ledger IS
  'Check-in points. One row per award; totals are always SUM(points). Service-role only.';

-- One award of each kind per check-in (makes the trigger idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS member_point_ledger_record_reason_uidx
  ON public.member_point_ledger (attendance_record_id, reason)
  WHERE attendance_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS member_point_ledger_season_member_idx
  ON public.member_point_ledger (season_key, member_id);

CREATE INDEX IF NOT EXISTS member_point_ledger_member_created_idx
  ON public.member_point_ledger (member_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5) Leaderboard opt-out
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_points_settings (
  member_id uuid PRIMARY KEY
    REFERENCES public.members(id) ON DELETE CASCADE,
  show_on_leaderboard boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_points_settings IS
  'Per-member points preferences. No row = shown on the leaderboard (first name + last initial).';

-- ---------------------------------------------------------------------------
-- 6) Award trigger — runs for every new attendance_records row
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.award_attendance_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_season text;
  v_streak integer := 1;
  v_prev record;
BEGIN
  BEGIN
    SELECT s.* INTO v_session
    FROM public.attendance_sessions s
    WHERE s.id = NEW.session_id;

    IF NOT FOUND OR v_session.points_enabled IS NOT TRUE THEN
      RETURN NEW;
    END IF;

    v_season := public.points_season_key(NEW.checked_in_at);

    -- Check-in: +10
    INSERT INTO public.member_point_ledger
      (member_id, season_key, points, reason, session_id, attendance_record_id)
    VALUES
      (NEW.member_id, v_season, 10, 'checkin', NEW.session_id, NEW.id)
    ON CONFLICT DO NOTHING;

    -- On time (at or before the session start): +5
    IF NEW.checked_in_at <= v_session.starts_at THEN
      INSERT INTO public.member_point_ledger
        (member_id, season_key, points, reason, session_id, attendance_record_id)
      VALUES
        (NEW.member_id, v_season, 5, 'on_time', NEW.session_id, NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;

    -- First check-in ever: +20
    IF NOT EXISTS (
      SELECT 1 FROM public.attendance_records r
      WHERE r.member_id = NEW.member_id
        AND r.id <> NEW.id
        AND r.checked_in_at <= NEW.checked_in_at
    ) THEN
      INSERT INTO public.member_point_ledger
        (member_id, season_key, points, reason, note, session_id, attendance_record_id)
      VALUES
        (NEW.member_id, v_season, 20, 'first_visit', 'Welcome!', NEW.session_id, NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Streak: consecutive earlier points sessions this season the member attended.
    -- Every 3 in a row: +10
    FOR v_prev IN
      SELECT s.id
      FROM public.attendance_sessions s
      WHERE s.points_enabled
        AND s.status <> 'draft'
        AND s.id <> v_session.id
        AND s.starts_at < v_session.starts_at
        AND public.points_season_key(s.starts_at) = public.points_season_key(v_session.starts_at)
      ORDER BY s.starts_at DESC
      LIMIT 60
    LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.attendance_records r
        WHERE r.session_id = v_prev.id AND r.member_id = NEW.member_id
      );
      v_streak := v_streak + 1;
    END LOOP;

    IF v_streak >= 3 AND v_streak % 3 = 0 THEN
      INSERT INTO public.member_point_ledger
        (member_id, season_key, points, reason, note, session_id, attendance_record_id)
      VALUES
        (NEW.member_id, v_season, 10, 'streak', v_streak::text || ' in a row', NEW.session_id, NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never block a check-in because of points.
    RAISE WARNING 'award_attendance_points skipped for record %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_records_award_points ON public.attendance_records;
CREATE TRIGGER attendance_records_award_points
  AFTER INSERT ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.award_attendance_points();

-- ---------------------------------------------------------------------------
-- 7) Self check-in RPC (rotating QR). Canaan API verifies the QR token first,
--    then calls this as service_role with the signed-in user's id.
--    Same session rules as attendance_checkin_member.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attendance_self_checkin(
  p_session_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.attendance_sessions%ROWTYPE;
  v_member_id uuid;
  v_link_count integer;
  v_inserted public.attendance_records%ROWTYPE;
  v_existing public.attendance_records%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'actor_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO v_link_count
  FROM public.user_member_links l
  WHERE l.user_id = p_user_id AND l.status = 'verified';

  IF v_link_count > 1 THEN
    RAISE EXCEPTION 'member_link_conflict' USING ERRCODE = 'P0001';
  END IF;
  IF v_link_count = 0 THEN
    RAISE EXCEPTION 'member_link_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.member_id INTO v_member_id
  FROM public.user_member_links l
  WHERE l.user_id = p_user_id AND l.status = 'verified';

  IF v_member_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_member_id) THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.* INTO v_session
  FROM public.attendance_sessions s
  WHERE s.id = p_session_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.status = 'draft' THEN
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'session_closed' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'session_not_open' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.type NOT IN ('worship', 'event', 'serve', 'bible_study', 'other') THEN
    RAISE EXCEPTION 'session_type_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.attendance_records (session_id, member_id, source, checked_in_by)
  VALUES (p_session_id, v_member_id, 'self_qr', p_user_id)
  ON CONFLICT (session_id, member_id) DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'attendanceId', v_inserted.id,
      'sessionId', v_inserted.session_id,
      'memberId', v_inserted.member_id,
      'checkedInAt', v_inserted.checked_in_at,
      'source', v_inserted.source,
      'alreadyCheckedIn', false
    );
  END IF;

  SELECT r.* INTO v_existing
  FROM public.attendance_records r
  WHERE r.session_id = p_session_id AND r.member_id = v_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_unavailable' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'attendanceId', v_existing.id,
    'sessionId', v_existing.session_id,
    'memberId', v_existing.member_id,
    'checkedInAt', v_existing.checked_in_at,
    'source', v_existing.source,
    'alreadyCheckedIn', true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Read helpers (service_role only; the API adds names + privacy)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.points_leaderboard(p_season_key text, p_limit integer DEFAULT 10)
RETURNS TABLE (member_id uuid, points bigint, rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH totals AS (
    SELECT l.member_id, sum(l.points)::bigint AS points
    FROM public.member_point_ledger l
    LEFT JOIN public.member_points_settings ps ON ps.member_id = l.member_id
    WHERE l.season_key = p_season_key
      AND coalesce(ps.show_on_leaderboard, true)
    GROUP BY l.member_id
    HAVING sum(l.points) > 0
  )
  SELECT t.member_id, t.points, rank() OVER (ORDER BY t.points DESC)::bigint AS rank
  FROM totals t
  ORDER BY t.points DESC, t.member_id
  LIMIT greatest(1, least(coalesce(p_limit, 10), 50));
$$;

CREATE OR REPLACE FUNCTION public.points_member_summary(p_member_id uuid, p_season_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_season bigint;
  v_lifetime bigint;
  v_checkins bigint;
  v_visible boolean;
  v_rank bigint;
BEGIN
  SELECT coalesce(sum(points), 0) INTO v_season
  FROM public.member_point_ledger
  WHERE member_id = p_member_id AND season_key = p_season_key;

  SELECT coalesce(sum(points), 0) INTO v_lifetime
  FROM public.member_point_ledger
  WHERE member_id = p_member_id;

  SELECT count(*) INTO v_checkins
  FROM public.member_point_ledger
  WHERE member_id = p_member_id AND reason = 'checkin';

  SELECT coalesce(ps.show_on_leaderboard, true) INTO v_visible
  FROM (SELECT 1) one
  LEFT JOIN public.member_points_settings ps ON ps.member_id = p_member_id;

  IF v_visible AND v_season > 0 THEN
    SELECT 1 + count(*) INTO v_rank
    FROM (
      SELECT l.member_id, sum(l.points) AS pts
      FROM public.member_point_ledger l
      LEFT JOIN public.member_points_settings ps ON ps.member_id = l.member_id
      WHERE l.season_key = p_season_key
        AND coalesce(ps.show_on_leaderboard, true)
      GROUP BY l.member_id
    ) t
    WHERE t.pts > v_season;
  END IF;

  RETURN jsonb_build_object(
    'seasonPoints', v_season,
    'lifetimePoints', v_lifetime,
    'checkins', v_checkins,
    'showOnLeaderboard', v_visible,
    'rank', v_rank
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) RLS + grants — fail closed; Canaan API (service_role) only
-- ---------------------------------------------------------------------------

ALTER TABLE public.member_point_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_points_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.member_point_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.member_points_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.member_point_ledger TO service_role;
GRANT ALL ON TABLE public.member_points_settings TO service_role;

REVOKE ALL ON FUNCTION public.points_season_key(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_attendance_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attendance_self_checkin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.points_leaderboard(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.points_member_summary(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.points_season_key(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_attendance_points() TO service_role;
GRANT EXECUTE ON FUNCTION public.attendance_self_checkin(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.points_leaderboard(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.points_member_summary(uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
