-- Check-in Points 1b: award points to people already checked in when a
-- leader turns points on late. Safe to re-run. Awards are never doubled.
CREATE OR REPLACE FUNCTION public.award_points_for_record(p_record_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.attendance_records%ROWTYPE;
  s public.attendance_sessions%ROWTYPE;
  v_season text;
  v_streak integer := 1;
  v_prev record;
BEGIN
  SELECT * INTO r FROM public.attendance_records WHERE id = p_record_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO s FROM public.attendance_sessions WHERE id = r.session_id;
  IF NOT FOUND OR s.points_enabled IS NOT TRUE THEN RETURN; END IF;
  v_season := public.points_season_key(r.checked_in_at);

  INSERT INTO public.member_point_ledger (member_id, season_key, points, reason, session_id, attendance_record_id)
  VALUES (r.member_id, v_season, 10, 'checkin', r.session_id, r.id) ON CONFLICT DO NOTHING;

  IF r.checked_in_at <= s.starts_at THEN
    INSERT INTO public.member_point_ledger (member_id, season_key, points, reason, session_id, attendance_record_id)
    VALUES (r.member_id, v_season, 5, 'on_time', r.session_id, r.id) ON CONFLICT DO NOTHING;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.attendance_records x
                 WHERE x.member_id = r.member_id AND x.id <> r.id AND x.checked_in_at <= r.checked_in_at) THEN
    INSERT INTO public.member_point_ledger (member_id, season_key, points, reason, note, session_id, attendance_record_id)
    VALUES (r.member_id, v_season, 20, 'first_visit', 'Welcome!', r.session_id, r.id) ON CONFLICT DO NOTHING;
  END IF;

  FOR v_prev IN
    SELECT p.id FROM public.attendance_sessions p
    WHERE p.points_enabled AND p.status <> 'draft' AND p.id <> s.id AND p.starts_at < s.starts_at
      AND public.points_season_key(p.starts_at) = public.points_season_key(s.starts_at)
    ORDER BY p.starts_at DESC LIMIT 60
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.attendance_records x
                          WHERE x.session_id = v_prev.id AND x.member_id = r.member_id);
    v_streak := v_streak + 1;
  END LOOP;

  IF v_streak >= 3 AND v_streak % 3 = 0 THEN
    INSERT INTO public.member_point_ledger (member_id, season_key, points, reason, note, session_id, attendance_record_id)
    VALUES (r.member_id, v_season, 10, 'streak', v_streak::text || ' in a row', r.session_id, r.id) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- The trigger now uses the same award logic.
CREATE OR REPLACE FUNCTION public.award_attendance_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  BEGIN
    PERFORM public.award_points_for_record(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'award_attendance_points skipped for record %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Award everyone already checked in to a session (earliest first).
CREATE OR REPLACE FUNCTION public.award_points_for_session(p_session_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_n integer := 0;
BEGIN
  FOR v_id IN SELECT id FROM public.attendance_records WHERE session_id = p_session_id ORDER BY checked_in_at LOOP
    PERFORM public.award_points_for_record(v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.award_points_for_record(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_points_for_session(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_points_for_record(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_points_for_session(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
