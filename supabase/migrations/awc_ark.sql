-- =============================================================================
-- PLCC Ark — retro games for the PLCC family (approved Oct 21, 2026)
-- Scores, leaderboards and PLCC Bucks for kids. Needs awc_bucks_phase_1 + _2.
-- Server only (Canaan API, service role), like the PLCC Bucks tables. Safe to re-run.
--
-- PLCC Bucks from the Ark (kids only; adults play and rank but never earn):
--   +2  first game of the day            (ark_first_game)
--   +5  new personal best in a game      (ark_personal_best)
--   +10 / +6 / +4  week's top 3 kids per game (ark_top_1 / _2 / _3)
-- At most ark_settings.weekly_bucks_cap a week from playing (default 20); top-3
-- prizes (for last week) sit outside that, and every Ark award counts inside the
-- PLCC Bucks weekly cap (100).
-- =============================================================================
BEGIN;

-- 1) Settings (one row; Super Admin edits in PLCC Canaan) -------------------------
CREATE TABLE IF NOT EXISTS public.ark_settings (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  bucks_enabled     boolean NOT NULL DEFAULT true,
  weekly_bucks_cap  integer NOT NULL DEFAULT 20 CHECK (weekly_bucks_cap BETWEEN 0 AND 100),
  -- A score more than this many times the player's previous best is held for a leader.
  hold_multiplier   numeric(4,1) NOT NULL DEFAULT 3.0 CHECK (hold_multiplier BETWEEN 1.5 AND 20),
  updated_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ark_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 2) Scores ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ark_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  played_by_user    uuid NOT NULL,              -- who was signed in (a parent playing as their child)
  is_child          boolean NOT NULL DEFAULT false,
  game              text NOT NULL CHECK (game IN ('pong', 'breakout', 'invaders', 'tetris', 'dove')),
  score             integer NOT NULL CHECK (score BETWEEN 0 AND 5000000),
  stats             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'held', 'removed')),
  status_note       text CHECK (status_note IS NULL OR char_length(status_note) <= 200),
  status_by         uuid,
  status_at         timestamptz,
  bucks_entry_ids   uuid[] NOT NULL DEFAULT '{}',  -- PLCC Bucks this score earned (taken back if removed)
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ark_scores ADD COLUMN IF NOT EXISTS bucks_entry_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS ark_scores_game_time_idx    ON public.ark_scores (game, created_at DESC);
CREATE INDEX IF NOT EXISTS ark_scores_player_game_idx  ON public.ark_scores (player_member_id, game, score DESC);
CREATE INDEX IF NOT EXISTS ark_scores_time_idx         ON public.ark_scores (created_at DESC);

-- 3) Weeks whose top-3 Bucks were handed out (once per game per week) -----------
CREATE TABLE IF NOT EXISTS public.ark_week_settlements (
  week_start  timestamptz NOT NULL,
  game        text NOT NULL,
  settled_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, game)
);

-- 4) PLCC Bucks reasons for the Ark (Super Admin can rename / re-price) ----------
INSERT INTO public.awc_bucks_reasons (id, label, amount, sort_order) VALUES
  ('ark_first_game',    'PLCC Ark: first game of the day', 2, 200),
  ('ark_personal_best', 'PLCC Ark: new personal best',     5, 210),
  ('ark_top_1',         'PLCC Ark: #1 of the week',       10, 220),
  ('ark_top_2',         'PLCC Ark: #2 of the week',        6, 230),
  ('ark_top_3',         'PLCC Ark: #3 of the week',        4, 240)
ON CONFLICT (id) DO NOTHING;

-- 5) Award from the Ark --------------------------------------------------------
-- Same ledger, lock, idempotency and weekly cap as awc_bucks_award, plus the Ark's
-- own weekly cap. The issuer is the Ark itself (shown to parents as "PLCC Ark");
-- p_for_user is the signed-in person, recorded in the audit log.
CREATE OR REPLACE FUNCTION public.awc_ark_award(
  p_child_member_id uuid,
  p_reason_id       text,
  p_idempotency_key text,
  p_for_user        uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c_issuer     constant uuid := '00000000-0000-4000-8000-0000000a4c00';
  v_existing   public.awc_bucks_ledger%ROWTYPE;
  v_reason     public.awc_bucks_reasons%ROWTYPE;
  v_settings   public.awc_bucks_settings%ROWTYPE;
  v_ark        public.ark_settings%ROWTYPE;
  v_row        public.awc_bucks_ledger%ROWTYPE;
  v_week_total integer;
  v_ark_total  integer;
  v_left       integer;
  v_take       integer;
  c            record;
BEGIN
  IF p_child_member_id IS NULL OR coalesce(trim(p_idempotency_key), '') = '' OR p_reason_id NOT LIKE 'ark\_%' THEN
    RAISE EXCEPTION 'missing_input' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_ark FROM public.ark_settings s WHERE s.id;
  IF NOT FOUND OR NOT v_ark.bucks_enabled THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ark_bucks_off');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.member_id = p_child_member_id AND hm.status = 'active'
      AND hm.relationship_type IN ('child', 'dependent')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_a_child');
  END IF;
  SELECT * INTO v_reason FROM public.awc_bucks_reasons r WHERE r.id = p_reason_id AND r.active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'reason_off');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('awc_bucks:' || p_child_member_id::text, 0));

  SELECT * INTO v_existing FROM public.awc_bucks_ledger l WHERE l.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'entryId', v_existing.id,
      'amount', v_existing.amount, 'reasonLabel', v_existing.reason_label);
  END IF;

  SELECT * INTO v_settings FROM public.awc_bucks_settings s WHERE s.id;

  -- Kept awards this church week (corrected ones no longer count), all sources.
  SELECT coalesce(sum(l.amount), 0) INTO v_week_total
  FROM public.awc_bucks_ledger l
  WHERE l.child_member_id = p_child_member_id AND l.kind = 'award'
    AND l.created_at >= public.awc_bucks_week_start(now())
    AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_corrections c2 WHERE c2.award_id = l.id);
  IF v_week_total + v_reason.amount > v_settings.weekly_cap_per_child THEN
    RETURN jsonb_build_object('ok', false, 'code', 'weekly_cap');
  END IF;

  -- The Ark's own weekly cap, for Bucks earned by playing (first game, personal best).
  -- Top-3 prizes are for LAST week's play, so they don't use up this week's Ark cap
  -- (they still count inside the PLCC Bucks weekly cap above).
  SELECT coalesce(sum(l.amount), 0) INTO v_ark_total
  FROM public.awc_bucks_ledger l
  WHERE l.child_member_id = p_child_member_id AND l.kind = 'award'
    AND l.reason_id LIKE 'ark\_%' AND l.reason_id NOT LIKE 'ark\_top\_%'
    AND l.created_at >= public.awc_bucks_week_start(now())
    AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_corrections c2 WHERE c2.award_id = l.id);
  IF p_reason_id NOT LIKE 'ark\_top\_%' AND v_ark_total + v_reason.amount > v_ark.weekly_bucks_cap THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ark_cap', 'arkWeek', v_ark_total);
  END IF;

  INSERT INTO public.awc_bucks_ledger
    (child_member_id, kind, amount, reason_id, reason_label, issued_by, issued_by_name, idempotency_key)
  VALUES
    (p_child_member_id, 'award', v_reason.amount, v_reason.id, v_reason.label, c_issuer, 'PLCC Ark', p_idempotency_key)
  RETURNING * INTO v_row;

  -- Same as every award: recover outstanding corrections first, oldest first.
  v_left := v_row.amount;
  FOR c IN
    SELECT co.id, co.amount + coalesce((SELECT sum(l.amount) FROM public.awc_bucks_ledger l WHERE l.correction_id = co.id OR l.reverses_id = co.award_id), 0) AS owed
    FROM public.awc_bucks_corrections co
    WHERE co.child_member_id = p_child_member_id
    ORDER BY co.created_at, co.id
  LOOP
    EXIT WHEN v_left <= 0;
    CONTINUE WHEN c.owed <= 0;
    v_take := least(v_left, c.owed);
    INSERT INTO public.awc_bucks_ledger
      (child_member_id, kind, amount, reason_label, correction_id, issued_by, issued_by_name, idempotency_key)
    VALUES
      (p_child_member_id, 'recovery', -v_take, 'Earlier correction recovered', c.id, c_issuer, 'PLCC Ark',
       'recover:' || v_row.id::text || ':' || c.id::text);
    v_left := v_left - v_take;
  END LOOP;

  IF p_for_user IS NOT NULL THEN
    PERFORM public.awc_bucks_audit(p_for_user, 'awc_bucks.ark_award', v_row.id::text,
      jsonb_build_object('child', p_child_member_id, 'reason', v_reason.id, 'amount', v_reason.amount));
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'entryId', v_row.id,
    'amount', v_row.amount, 'reasonLabel', v_row.reason_label,
    'arkWeek', v_ark_total + CASE WHEN p_reason_id LIKE 'ark\_top\_%' THEN 0 ELSE v_row.amount END);
END $$;

-- 6) Hand out last week's top-3 Bucks (once per game per week) -----------------
-- Ranks children only, by their best non-removed, non-held score that week.
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

-- 7) Lockdown: server only ------------------------------------------------------
ALTER TABLE public.ark_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ark_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ark_week_settlements  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ark_settings, public.ark_scores, public.ark_week_settlements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ark_scores TO service_role;
GRANT SELECT, UPDATE ON TABLE public.ark_settings TO service_role;
GRANT SELECT ON TABLE public.ark_week_settlements TO service_role;

REVOKE ALL ON FUNCTION public.awc_ark_award(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.awc_ark_settle_week(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.awc_ark_award(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.awc_ark_settle_week(timestamptz) TO service_role;

COMMIT;
