-- PLCC Ark: add Dove Defender ('dove') as a ranked game.
-- Safe to run more than once.

ALTER TABLE public.ark_scores DROP CONSTRAINT IF EXISTS ark_scores_game_check;
ALTER TABLE public.ark_scores ADD CONSTRAINT ark_scores_game_check
  CHECK (game IN ('pong', 'breakout', 'invaders', 'tetris', 'dove'));

-- Weekly top-3 PLCC Bucks now include Dove Defender.
CREATE OR REPLACE FUNCTION public.awc_ark_settle_week(p_week_start timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  g        text;
  r        record;
  v_given  integer := 0;
  v_res    jsonb;
BEGIN
  IF p_week_start IS NULL OR p_week_start >= public.awc_bucks_week_start(now()) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'week_not_over');
  END IF;
  FOREACH g IN ARRAY ARRAY['pong', 'breakout', 'invaders', 'tetris', 'dove'] LOOP
    INSERT INTO public.ark_week_settlements (week_start, game) VALUES (p_week_start, g)
    ON CONFLICT DO NOTHING;
    CONTINUE WHEN NOT FOUND;  -- already settled
    FOR r IN
      SELECT b.player_member_id, b.best, row_number() OVER (ORDER BY b.best DESC, b.first_at) AS place
      FROM (
        SELECT s.player_member_id, max(s.score) AS best, min(s.created_at) AS first_at
        FROM public.ark_scores s
        WHERE s.game = g AND s.is_child AND s.status = 'ok'
          AND s.created_at >= p_week_start AND s.created_at < p_week_start + interval '7 days'
        GROUP BY s.player_member_id
      ) b
      ORDER BY b.best DESC, b.first_at
      LIMIT 3
    LOOP
      v_res := public.awc_ark_award(r.player_member_id, 'ark_top_' || r.place,
        'ark:top:' || g || ':' || to_char(p_week_start AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD') || ':' || r.player_member_id::text,
        NULL);
      IF coalesce((v_res->>'ok')::boolean, false) AND NOT coalesce((v_res->>'duplicate')::boolean, false) THEN
        v_given := v_given + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'awarded', v_given);
END $$;
