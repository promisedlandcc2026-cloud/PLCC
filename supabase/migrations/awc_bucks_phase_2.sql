-- =============================================================================
-- PLCC Bucks — Phase 2 (Rewards Store, budget, corrections, challenges,
-- recommendations) · PROPOSED — NOT APPLIED
-- Requires Phase 1 (awc_bucks_phase_1.sql). Keeps every Phase 1 row; the
-- ledger stays append-only. Same lockdown: RLS on, no client policies,
-- nothing for anon/authenticated, server writes only through these functions,
-- which re-check role / grants themselves. Safe to re-run.
-- No link to store_orders (the church shop) or finance_budgets (treasury).
-- =============================================================================
BEGIN;

-- 0) Generic append-only guard (rows may only leave via an FK cascade) --------
CREATE OR REPLACE FUNCTION public.awc_bucks_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

-- 1) New permission switches on the Phase 1 leaders table ---------------------
ALTER TABLE public.awc_bucks_leaders
  ADD COLUMN IF NOT EXISTS can_approve   boolean NOT NULL DEFAULT false,  -- kids.bucks.approve (MINISTRY_LEADER only)
  ADD COLUMN IF NOT EXISTS can_fulfill   boolean NOT NULL DEFAULT false,  -- kids.bucks.fulfill
  ADD COLUMN IF NOT EXISTS can_recommend boolean NOT NULL DEFAULT false;  -- kids.bucks.recommend

-- 2) Prizes, stock, budget ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.awc_bucks_prizes (
  id               text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,40}$'),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  description      text CHECK (description IS NULL OR char_length(description) <= 200),
  price_bucks      integer NOT NULL CHECK (price_bucks BETWEEN 1 AND 10000),
  unit_cost_cents  integer CHECK (unit_cost_cents IS NULL OR unit_cost_cents BETWEEN 0 AND 100000),
  image_url        text CHECK (image_url IS NULL OR char_length(image_url) <= 500),
  active           boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 100,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Approved prices. Unit costs stay empty until Super Admin enters them;
-- a prize without a cost cannot be approved (the budget needs it).
INSERT INTO public.awc_bucks_prizes (id, name, price_bucks, sort_order) VALUES
  ('sticker_pack',  'Sticker Pack',               50, 10),
  ('coloring_kit',  'Coloring Book & Crayons',   150, 20),
  ('plush_toy',     'Small Plush Toy',           250, 30),
  ('art_kit',       'Creative Art Kit',          400, 40),
  ('board_game',    'Board Game',                600, 50)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.awc_bucks_stock_moves (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id       text NOT NULL REFERENCES public.awc_bucks_prizes(id),
  delta          integer NOT NULL CHECK (delta <> 0 AND delta BETWEEN -1000 AND 1000),
  reason         text NOT NULL CHECK (reason IN ('restock', 'adjust', 'fulfilled')),
  redemption_id  uuid,
  note           text CHECK (note IS NULL OR char_length(note) <= 200),
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS awc_bucks_stock_one_per_redemption
  ON public.awc_bucks_stock_moves (redemption_id) WHERE redemption_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.awc_bucks_budget_months (
  month_start   date PRIMARY KEY CHECK (extract(day FROM month_start) = 1),
  budget_cents  integer NOT NULL CHECK (budget_cents BETWEEN 0 AND 10000000),
  updated_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 3) Redemptions (requests) + their append-only event history ----------------
CREATE TABLE IF NOT EXISTS public.awc_bucks_redemptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_member_id        uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  prize_id               text NOT NULL REFERENCES public.awc_bucks_prizes(id),
  prize_name             text NOT NULL,                 -- snapshot
  price_bucks            integer NOT NULL CHECK (price_bucks > 0),  -- snapshot: held, then spent
  status                 text NOT NULL CHECK (status IN ('requested','approved','fulfilled','rejected','cancelled')),
  requested_by           uuid NOT NULL,
  requested_at           timestamptz NOT NULL DEFAULT now(),
  approved_by            uuid,
  approved_at            timestamptz,
  budget_month           date,
  committed_cost_cents   integer CHECK (committed_cost_cents IS NULL OR committed_cost_cents >= 0),
  budget_override        boolean NOT NULL DEFAULT false,
  override_note          text,
  fulfilled_by           uuid,
  fulfilled_at           timestamptz,
  actual_cost_cents      integer CHECK (actual_cost_cents IS NULL OR actual_cost_cents >= 0),
  closed_by              uuid,
  closed_at              timestamptz,
  close_note             text CHECK (close_note IS NULL OR char_length(close_note) <= 200),
  idempotency_key        text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 100),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
-- One open request per child per prize.
CREATE UNIQUE INDEX IF NOT EXISTS awc_bucks_one_open_request
  ON public.awc_bucks_redemptions (child_member_id, prize_id) WHERE status IN ('requested','approved');
CREATE INDEX IF NOT EXISTS awc_bucks_redemptions_status_idx ON public.awc_bucks_redemptions (status, requested_at);
CREATE INDEX IF NOT EXISTS awc_bucks_redemptions_month_idx  ON public.awc_bucks_redemptions (budget_month) WHERE budget_month IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.awc_bucks_redemption_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id  uuid NOT NULL REFERENCES public.awc_bucks_redemptions(id) ON DELETE CASCADE,
  from_status    text,
  to_status      text NOT NULL,
  actor          uuid NOT NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 4) Corrections (the full amount of a reversed award) ------------------------
CREATE TABLE IF NOT EXISTS public.awc_bucks_corrections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id         uuid NOT NULL UNIQUE REFERENCES public.awc_bucks_ledger(id) ON DELETE CASCADE,
  child_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount           integer NOT NULL CHECK (amount > 0),
  note             text NOT NULL,
  issued_by        uuid NOT NULL,
  issued_by_name   text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 5) Ledger: two new entry kinds, links to redemptions and corrections ---------
ALTER TABLE public.awc_bucks_ledger
  ADD COLUMN IF NOT EXISTS redemption_id uuid UNIQUE REFERENCES public.awc_bucks_redemptions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS correction_id uuid REFERENCES public.awc_bucks_corrections(id) ON DELETE CASCADE;

ALTER TABLE public.awc_bucks_ledger DROP CONSTRAINT IF EXISTS awc_bucks_ledger_kind_check;
ALTER TABLE public.awc_bucks_ledger DROP CONSTRAINT IF EXISTS awc_bucks_ledger_shape;
ALTER TABLE public.awc_bucks_ledger ADD CONSTRAINT awc_bucks_ledger_kind_check
  CHECK (kind IN ('award', 'reversal', 'redemption', 'recovery'));
ALTER TABLE public.awc_bucks_ledger ADD CONSTRAINT awc_bucks_ledger_shape CHECK (
  (kind = 'award'      AND amount > 0 AND reason_id IS NOT NULL AND reverses_id IS NULL AND redemption_id IS NULL AND correction_id IS NULL) OR
  (kind = 'reversal'   AND amount < 0 AND reverses_id IS NOT NULL AND redemption_id IS NULL) OR
  (kind = 'redemption' AND amount < 0 AND redemption_id IS NOT NULL AND reverses_id IS NULL AND correction_id IS NULL) OR
  (kind = 'recovery'   AND amount < 0 AND correction_id IS NOT NULL AND reverses_id IS NULL AND redemption_id IS NULL)
);
-- Phase 1 reversals (always the full amount) get a matching, fully paid
-- correction so every reversed award is recorded the same way.
INSERT INTO public.awc_bucks_corrections (award_id, child_member_id, amount, note, issued_by, issued_by_name, created_at)
SELECT r.reverses_id, r.child_member_id, -r.amount, coalesce(r.note, 'Phase 1 reversal'), r.issued_by, r.issued_by_name, r.created_at
FROM public.awc_bucks_ledger r
WHERE r.kind = 'reversal'
ON CONFLICT (award_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS awc_bucks_ledger_correction_idx ON public.awc_bucks_ledger (correction_id) WHERE correction_id IS NOT NULL;

-- 6) Weekly Bible challenges + recommendations ---------------------------------
CREATE TABLE IF NOT EXISTS public.awc_bucks_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start  date NOT NULL UNIQUE CHECK (extract(isodow FROM week_start) = 1),  -- Monday
  title       text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  verse_ref   text CHECK (verse_ref IS NULL OR char_length(verse_ref) <= 60),
  details     text CHECK (details IS NULL OR char_length(details) <= 400),
  active      boolean NOT NULL DEFAULT true,
  updated_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.awc_bucks_challenge_completions (
  challenge_id     uuid NOT NULL REFERENCES public.awc_bucks_challenges(id),
  child_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  ledger_id        uuid NOT NULL UNIQUE REFERENCES public.awc_bucks_ledger(id) ON DELETE CASCADE,
  completed_by     uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, child_member_id)
);

CREATE TABLE IF NOT EXISTS public.awc_bucks_recommendations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_member_id      uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  reason_id            text NOT NULL REFERENCES public.awc_bucks_reasons(id),
  note                 text CHECK (note IS NULL OR char_length(note) <= 200),
  recommended_by       uuid NOT NULL,
  recommended_by_name  text NOT NULL,
  status               text NOT NULL CHECK (status IN ('pending','approved','declined')),
  decided_by           uuid,
  decided_at           timestamptz,
  decision_note        text CHECK (decision_note IS NULL OR char_length(decision_note) <= 200),
  ledger_id            uuid UNIQUE REFERENCES public.awc_bucks_ledger(id) ON DELETE CASCADE,
  idempotency_key      text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 100),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS awc_bucks_one_pending_recommendation
  ON public.awc_bucks_recommendations (child_member_id, reason_id, recommended_by) WHERE status = 'pending';

-- Append-only guards on the history tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['awc_bucks_stock_moves','awc_bucks_redemption_events','awc_bucks_corrections','awc_bucks_challenge_completions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_edit', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.awc_bucks_append_only()', t || '_no_edit', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.awc_bucks_append_only()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- 7) Helpers ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.awc_bucks_month_start(p_at timestamptz)
RETURNS date LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT date_trunc('month', p_at AT TIME ZONE 'Africa/Kampala')::date;
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_held(p_child uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(r.price_bucks), 0)::int FROM public.awc_bucks_redemptions r
  WHERE r.child_member_id = p_child AND r.status IN ('requested','approved');
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_available(p_child uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT greatest(0, public.awc_bucks_balance_of(p_child) - public.awc_bucks_held(p_child));
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_outstanding(p_child uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(c.amount + coalesce((SELECT sum(l.amount) FROM public.awc_bucks_ledger l WHERE l.correction_id = c.id OR l.reverses_id = c.award_id), 0)), 0)::int
  FROM public.awc_bucks_corrections c WHERE c.child_member_id = p_child;
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_suspended(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.awc_bucks_leaders l WHERE l.user_id = p_user AND NOT l.active);
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_can_approve(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT NOT public.awc_bucks_suspended(p_user) AND (
    public.awc_bucks_user_role(p_user) = 'SUPER_ADMIN' OR (
      public.awc_bucks_user_role(p_user) = 'MINISTRY_LEADER' AND
      EXISTS (SELECT 1 FROM public.awc_bucks_leaders l WHERE l.user_id = p_user AND l.active AND l.can_approve)));
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_can_fulfill(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.awc_bucks_can_approve(p_user) OR (
    NOT public.awc_bucks_suspended(p_user) AND
    public.awc_bucks_user_role(p_user) IN ('TEACHER','SUNDAY_SCHOOL_TEACHER','SECRETARY','ASST_SECRETARY','VOLUNTEER') AND
    EXISTS (SELECT 1 FROM public.awc_bucks_leaders l WHERE l.user_id = p_user AND l.active AND l.can_fulfill));
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_can_recommend(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT NOT public.awc_bucks_suspended(p_user)
    AND coalesce(public.awc_bucks_user_role(p_user), '') NOT IN ('', 'KIOSK', 'PENDING', 'GUEST', 'MEMBER')
    AND EXISTS (SELECT 1 FROM public.awc_bucks_leaders l WHERE l.user_id = p_user AND l.active AND l.can_recommend);
$$;

-- Linked parent: active guardian link, or an adult in the child's active household.
CREATE OR REPLACE FUNCTION public.awc_bucks_is_linked_parent(p_user uuid, p_child uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guardian_relationships g
    WHERE g.guardian_user_id = p_user AND g.child_member_id = p_child AND g.status = 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.user_member_links uml
    JOIN public.household_members adult ON adult.member_id = uml.member_id AND adult.status = 'active'
      AND lower(coalesce(adult.relationship_type, '')) NOT IN ('child', 'dependent')
    JOIN public.household_members kid ON kid.household_id = adult.household_id AND kid.member_id = p_child
      AND kid.status = 'active' AND kid.relationship_type IN ('child', 'dependent')
    WHERE uml.user_id = p_user AND uml.status = 'verified'
  );
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_stock_on_hand(p_prize text)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(m.delta), 0)::int FROM public.awc_bucks_stock_moves m WHERE m.prize_id = p_prize;
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_stock_reserved(p_prize text)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT count(*)::int FROM public.awc_bucks_redemptions r WHERE r.prize_id = p_prize AND r.status = 'approved';
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_month_usage(p_month date)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(coalesce(r.actual_cost_cents, r.committed_cost_cents)), 0)::int
  FROM public.awc_bucks_redemptions r
  WHERE r.budget_month = p_month AND r.status IN ('approved', 'fulfilled');
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_event(p_redemption uuid, p_from text, p_to text, p_actor uuid, p_note text)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO public.awc_bucks_redemption_events (redemption_id, from_status, to_status, actor, note)
  VALUES (p_redemption, p_from, p_to, p_actor, p_note);
$$;

-- 8) Phase 1 functions, upgraded in place (same names and arguments) ----------
-- Award: unchanged rules + recovers outstanding corrections from the new award.
-- Caps count live awards (an award with a correction no longer counts).
CREATE OR REPLACE FUNCTION public.awc_bucks_award(
  p_child_member_id uuid,
  p_reason_id       text,
  p_issued_by       uuid,
  p_idempotency_key text,
  p_note            text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing   public.awc_bucks_ledger%ROWTYPE;
  v_reason     public.awc_bucks_reasons%ROWTYPE;
  v_settings   public.awc_bucks_settings%ROWTYPE;
  v_row        public.awc_bucks_ledger%ROWTYPE;
  v_week_total integer;
  v_day_total  integer;
  v_left       integer;
  v_take       integer;
  v_recovered  integer := 0;
  c            record;
BEGIN
  IF p_child_member_id IS NULL OR p_issued_by IS NULL OR coalesce(trim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'missing_input' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.awc_bucks_can_award(p_issued_by) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.member_id = p_child_member_id AND hm.status = 'active'
      AND hm.relationship_type IN ('child', 'dependent')
  ) THEN
    RAISE EXCEPTION 'not_a_child' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_reason FROM public.awc_bucks_reasons r WHERE r.id = p_reason_id AND r.active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_reason' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('awc_bucks:' || p_child_member_id::text, 0));

  SELECT * INTO v_existing FROM public.awc_bucks_ledger l WHERE l.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.child_member_id <> p_child_member_id OR v_existing.issued_by <> p_issued_by THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'entryId', v_existing.id,
      'amount', v_existing.amount, 'reasonLabel', v_existing.reason_label,
      'balance', public.awc_bucks_available(p_child_member_id));
  END IF;

  SELECT * INTO v_settings FROM public.awc_bucks_settings s WHERE s.id;

  SELECT coalesce(sum(l.amount), 0) INTO v_week_total
  FROM public.awc_bucks_ledger l
  WHERE l.child_member_id = p_child_member_id AND l.kind = 'award'
    AND l.created_at >= public.awc_bucks_week_start(now())
    AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_corrections c2 WHERE c2.award_id = l.id);

  IF v_week_total + v_reason.amount > v_settings.weekly_cap_per_child THEN
    RETURN jsonb_build_object('ok', false, 'code', 'weekly_cap',
      'remaining', greatest(0, v_settings.weekly_cap_per_child - v_week_total));
  END IF;

  SELECT coalesce(sum(l.amount), 0) INTO v_day_total
  FROM public.awc_bucks_ledger l
  WHERE l.child_member_id = p_child_member_id AND l.issued_by = p_issued_by AND l.kind = 'award'
    AND l.created_at >= public.awc_bucks_day_start(now())
    AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_corrections c2 WHERE c2.award_id = l.id);

  IF v_day_total + v_reason.amount > v_settings.daily_cap_per_issuer_per_child THEN
    RETURN jsonb_build_object('ok', false, 'code', 'daily_cap',
      'remaining', greatest(0, v_settings.daily_cap_per_issuer_per_child - v_day_total));
  END IF;

  INSERT INTO public.awc_bucks_ledger
    (child_member_id, kind, amount, reason_id, reason_label, note, issued_by, issued_by_name, idempotency_key)
  VALUES
    (p_child_member_id, 'award', v_reason.amount, v_reason.id, v_reason.label,
     nullif(left(trim(coalesce(p_note, '')), 200), ''), p_issued_by,
     public.awc_bucks_display_name(p_issued_by), p_idempotency_key)
  RETURNING * INTO v_row;

  -- Recover outstanding corrections, oldest first, never more than this award.
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
      (p_child_member_id, 'recovery', -v_take, 'Earlier correction recovered', c.id, p_issued_by,
       public.awc_bucks_display_name(p_issued_by), 'recover:' || v_row.id::text || ':' || c.id::text);
    v_left := v_left - v_take;
    v_recovered := v_recovered + v_take;
  END LOOP;

  PERFORM public.awc_bucks_audit(p_issued_by, 'awc_bucks.award', v_row.id::text,
    jsonb_build_object('child', p_child_member_id, 'reason', v_reason.id, 'amount', v_reason.amount, 'recovered', v_recovered));

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'entryId', v_row.id,
    'amount', v_row.amount, 'reasonLabel', v_row.reason_label, 'issuedByName', v_row.issued_by_name,
    'recovered', v_recovered, 'balance', public.awc_bucks_available(p_child_member_id));
END $$;

-- Reverse: never makes Available negative and never touches Bucks on hold.
-- Takes what is available now; the rest is recorded as an outstanding
-- correction and recovered from future awards.
CREATE OR REPLACE FUNCTION public.awc_bucks_reverse(
  p_entry_id  uuid,
  p_issued_by uuid,
  p_note      text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_orig    public.awc_bucks_ledger%ROWTYPE;
  v_corr    public.awc_bucks_corrections%ROWTYPE;
  v_applied integer;
  v_name    text;
BEGIN
  IF p_issued_by IS NULL OR NOT public.awc_bucks_can_reverse(p_issued_by) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(trim(p_note), '') = '' THEN
    RAISE EXCEPTION 'note_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_orig FROM public.awc_bucks_ledger l WHERE l.id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_orig.kind <> 'award' THEN
    RAISE EXCEPTION 'not_reversible' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('awc_bucks:' || v_orig.child_member_id::text, 0));

  IF EXISTS (SELECT 1 FROM public.awc_bucks_corrections c WHERE c.award_id = p_entry_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_reversed');
  END IF;

  v_name := public.awc_bucks_display_name(p_issued_by);
  INSERT INTO public.awc_bucks_corrections (award_id, child_member_id, amount, note, issued_by, issued_by_name)
  VALUES (v_orig.id, v_orig.child_member_id, v_orig.amount, left(trim(p_note), 200), p_issued_by, v_name)
  RETURNING * INTO v_corr;

  v_applied := least(v_orig.amount, public.awc_bucks_available(v_orig.child_member_id));
  IF v_applied > 0 THEN
    INSERT INTO public.awc_bucks_ledger
      (child_member_id, kind, amount, reason_id, reason_label, note, reverses_id, correction_id, issued_by, issued_by_name, idempotency_key)
    VALUES
      (v_orig.child_member_id, 'reversal', -v_applied, v_orig.reason_id, 'Reversed: ' || v_orig.reason_label,
       left(trim(p_note), 200), v_orig.id, v_corr.id, p_issued_by, v_name, 'reverse:' || v_orig.id::text);
  END IF;

  PERFORM public.awc_bucks_audit(p_issued_by, 'awc_bucks.reverse', v_corr.id::text,
    jsonb_build_object('child', v_orig.child_member_id, 'reverses', v_orig.id, 'amount', v_orig.amount,
                       'applied', v_applied, 'outstanding', v_orig.amount - v_applied, 'note', left(trim(p_note), 200)));

  RETURN jsonb_build_object('ok', true, 'correctionId', v_corr.id, 'amount', -v_orig.amount,
    'applied', v_applied, 'outstanding', v_orig.amount - v_applied,
    'balance', public.awc_bucks_available(v_orig.child_member_id));
END $$;

-- Wallet: Available is the balance; plus on hold, outstanding, history,
-- requests, this week's challenge and badge counts.
CREATE OR REPLACE FUNCTION public.awc_bucks_wallet(p_child_member_id uuid, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'balance', public.awc_bucks_available(p_child_member_id),
    'onHold', public.awc_bucks_held(p_child_member_id),
    'outstandingCorrection', public.awc_bucks_outstanding(p_child_member_id),
    'totalEarned', (
      SELECT coalesce(sum(l.amount), 0)::int FROM public.awc_bucks_ledger l
      WHERE l.child_member_id = p_child_member_id AND l.kind = 'award'
        AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_corrections c WHERE c.award_id = l.id)),
    'history', coalesce((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h."createdAt" DESC) FROM (
        SELECT l.id, l.kind, l.amount, l.reason_label AS "reasonLabel",
               l.issued_by_name AS "awardedBy", l.created_at AS "createdAt",
               EXISTS (SELECT 1 FROM public.awc_bucks_corrections c WHERE c.award_id = l.id) AS reversed
        FROM public.awc_bucks_ledger l
        WHERE l.child_member_id = p_child_member_id
        ORDER BY l.created_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
      ) h), '[]'::jsonb),
    'requests', coalesce((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q."requestedAt" DESC) FROM (
        SELECT r.id, r.prize_id AS "prizeId", r.prize_name AS "prizeName", r.price_bucks AS "price",
               r.status, r.requested_at AS "requestedAt", r.close_note AS "reason"
        FROM public.awc_bucks_redemptions r
        WHERE r.child_member_id = p_child_member_id
        ORDER BY r.requested_at DESC LIMIT 10
      ) q), '[]'::jsonb),
    'challenge', (
      SELECT jsonb_build_object('id', ch.id, 'title', ch.title, 'verseRef', ch.verse_ref, 'details', ch.details,
        'bucks', (SELECT r.amount FROM public.awc_bucks_reasons r WHERE r.id = 'weekly_challenge'),
        'completed', EXISTS (SELECT 1 FROM public.awc_bucks_challenge_completions cc
                             WHERE cc.challenge_id = ch.id AND cc.child_member_id = p_child_member_id))
      FROM public.awc_bucks_challenges ch
      WHERE ch.active AND ch.week_start = (public.awc_bucks_week_start(now()) AT TIME ZONE 'Africa/Kampala')::date),
    'counts', jsonb_build_object(
      'memoryVerses', (SELECT count(*) FROM public.awc_bucks_ledger l WHERE l.child_member_id = p_child_member_id
                         AND l.kind = 'award' AND l.reason_id = 'memory_verse'
                         AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_corrections c WHERE c.award_id = l.id)),
      'kindness', (SELECT count(*) FROM public.awc_bucks_ledger l WHERE l.child_member_id = p_child_member_id
                     AND l.kind = 'award' AND l.reason_id = 'kindness'
                     AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_corrections c WHERE c.award_id = l.id)),
      'challenges', (SELECT count(*) FROM public.awc_bucks_challenge_completions cc
                       JOIN public.awc_bucks_ledger l ON l.id = cc.ledger_id
                       WHERE cc.child_member_id = p_child_member_id
                         AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_corrections c WHERE c.award_id = l.id)),
      'prizesPickedUp', (SELECT count(*) FROM public.awc_bucks_redemptions r
                           WHERE r.child_member_id = p_child_member_id AND r.status = 'fulfilled'))
  );
$$;

-- 9) Prize store -------------------------------------------------------------------
-- Prize list with live stock. Unit costs are for staff screens only; the API
-- strips them before anything reaches a parent.
CREATE OR REPLACE FUNCTION public.awc_bucks_prize_list(p_include_inactive boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description, 'price', p.price_bucks,
    'unitCostCents', p.unit_cost_cents, 'imageUrl', p.image_url, 'active', p.active, 'sortOrder', p.sort_order,
    'onHand', public.awc_bucks_stock_on_hand(p.id), 'reserved', public.awc_bucks_stock_reserved(p.id),
    'inStock', public.awc_bucks_stock_on_hand(p.id) - public.awc_bucks_stock_reserved(p.id) > 0
  ) ORDER BY p.sort_order, p.name), '[]'::jsonb)
  FROM public.awc_bucks_prizes p
  WHERE p.active OR coalesce(p_include_inactive, false);
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_request_prize(
  p_child uuid, p_prize text, p_requested_by uuid, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_prize    public.awc_bucks_prizes%ROWTYPE;
  v_existing public.awc_bucks_redemptions%ROWTYPE;
  v_row      public.awc_bucks_redemptions%ROWTYPE;
  v_avail    integer;
BEGIN
  IF p_child IS NULL OR p_requested_by IS NULL OR coalesce(trim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'missing_input' USING ERRCODE = 'P0001';
  END IF;
  IF public.awc_bucks_suspended(p_requested_by) OR NOT (
       public.awc_bucks_can_approve(p_requested_by) OR public.awc_bucks_is_linked_parent(p_requested_by, p_child)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.member_id = p_child AND hm.status = 'active'
                   AND hm.relationship_type IN ('child', 'dependent')) THEN
    RAISE EXCEPTION 'not_a_child' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_prize FROM public.awc_bucks_prizes p WHERE p.id = p_prize AND p.active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_prize' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('awc_bucks:' || p_child::text, 0));

  SELECT * INTO v_existing FROM public.awc_bucks_redemptions r WHERE r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.child_member_id <> p_child OR v_existing.prize_id <> p_prize OR v_existing.requested_by <> p_requested_by THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'requestId', v_existing.id, 'status', v_existing.status,
      'balance', public.awc_bucks_available(p_child), 'onHold', public.awc_bucks_held(p_child));
  END IF;

  IF EXISTS (SELECT 1 FROM public.awc_bucks_redemptions r WHERE r.child_member_id = p_child AND r.prize_id = p_prize
               AND r.status IN ('requested','approved')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_requested');
  END IF;
  IF public.awc_bucks_stock_on_hand(p_prize) - public.awc_bucks_stock_reserved(p_prize) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'out_of_stock');
  END IF;
  v_avail := public.awc_bucks_available(p_child);
  IF v_avail < v_prize.price_bucks THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_enough', 'needed', v_prize.price_bucks - v_avail);
  END IF;

  INSERT INTO public.awc_bucks_redemptions
    (child_member_id, prize_id, prize_name, price_bucks, status, requested_by, idempotency_key)
  VALUES (p_child, v_prize.id, v_prize.name, v_prize.price_bucks, 'requested', p_requested_by, p_idempotency_key)
  RETURNING * INTO v_row;

  PERFORM public.awc_bucks_event(v_row.id, NULL, 'requested', p_requested_by, NULL);
  PERFORM public.awc_bucks_audit(p_requested_by, 'awc_bucks.request', v_row.id::text,
    jsonb_build_object('child', p_child, 'prize', p_prize, 'price', v_prize.price_bucks));

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'requestId', v_row.id, 'status', 'requested',
    'balance', public.awc_bucks_available(p_child), 'onHold', public.awc_bucks_held(p_child));
END $$;

-- Approve: locks the request, the prize and the month's budget, then checks
-- stock and budget. Over budget needs a Super Admin override with a note.
CREATE OR REPLACE FUNCTION public.awc_bucks_approve_request(
  p_request uuid, p_by uuid, p_override boolean DEFAULT false, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_req    public.awc_bucks_redemptions%ROWTYPE;
  v_prize  public.awc_bucks_prizes%ROWTYPE;
  v_month  date := public.awc_bucks_month_start(now());
  v_budget integer;
  v_used   integer;
  v_over   boolean := false;
BEGIN
  IF NOT public.awc_bucks_can_approve(p_by) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(p_override, false) AND public.awc_bucks_user_role(p_by) <> 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(p_override, false) AND coalesce(trim(p_note), '') = '' THEN
    RAISE EXCEPTION 'note_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_req FROM public.awc_bucks_redemptions r WHERE r.id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_req.status <> 'requested' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_waiting', 'status', v_req.status);
  END IF;

  SELECT * INTO v_prize FROM public.awc_bucks_prizes p WHERE p.id = v_req.prize_id FOR UPDATE;
  IF v_prize.unit_cost_cents IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'cost_not_set');
  END IF;
  IF public.awc_bucks_stock_on_hand(v_prize.id) - public.awc_bucks_stock_reserved(v_prize.id) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'out_of_stock');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('awc_bucks_budget:' || v_month::text, 0));
  SELECT b.budget_cents INTO v_budget FROM public.awc_bucks_budget_months b WHERE b.month_start = v_month;
  v_used := public.awc_bucks_month_usage(v_month);
  IF v_budget IS NULL OR v_used + v_prize.unit_cost_cents > v_budget THEN
    IF NOT coalesce(p_override, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', CASE WHEN v_budget IS NULL THEN 'no_budget' ELSE 'over_budget' END,
        'budgetCents', v_budget, 'usedCents', v_used, 'costCents', v_prize.unit_cost_cents);
    END IF;
    v_over := true;
  END IF;

  UPDATE public.awc_bucks_redemptions
     SET status = 'approved', approved_by = p_by, approved_at = now(), budget_month = v_month,
         committed_cost_cents = v_prize.unit_cost_cents, budget_override = v_over,
         override_note = CASE WHEN v_over THEN left(trim(p_note), 200) END, updated_at = now()
   WHERE id = v_req.id;

  PERFORM public.awc_bucks_event(v_req.id, 'requested', 'approved', p_by, CASE WHEN v_over THEN 'Budget override: ' || left(trim(p_note), 180) END);
  PERFORM public.awc_bucks_audit(p_by, CASE WHEN v_over THEN 'awc_bucks.approve_override' ELSE 'awc_bucks.approve' END, v_req.id::text,
    jsonb_build_object('child', v_req.child_member_id, 'prize', v_req.prize_id, 'costCents', v_prize.unit_cost_cents,
                       'month', v_month, 'usedBefore', v_used, 'budget', v_budget, 'override', v_over));

  RETURN jsonb_build_object('ok', true, 'requestId', v_req.id, 'status', 'approved', 'override', v_over,
    'usedCents', v_used + v_prize.unit_cost_cents, 'budgetCents', v_budget);
END $$;

-- Hand-over: spends the held Bucks (one redemption entry), removes one item
-- from stock and records the actual cost. Exactly once per request.
CREATE OR REPLACE FUNCTION public.awc_bucks_fulfill_request(
  p_request uuid, p_by uuid, p_actual_cost_cents integer DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_req  public.awc_bucks_redemptions%ROWTYPE;
  v_cost integer;
BEGIN
  IF NOT public.awc_bucks_can_fulfill(p_by) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_req FROM public.awc_bucks_redemptions r WHERE r.id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_req.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'code', CASE WHEN v_req.status = 'fulfilled' THEN 'already_fulfilled' ELSE 'not_approved' END);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('awc_bucks:' || v_req.child_member_id::text, 0));
  PERFORM 1 FROM public.awc_bucks_prizes p WHERE p.id = v_req.prize_id FOR UPDATE;
  IF public.awc_bucks_stock_on_hand(v_req.prize_id) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'out_of_stock');
  END IF;

  v_cost := coalesce(p_actual_cost_cents, v_req.committed_cost_cents);
  IF v_cost IS NULL OR v_cost < 0 OR v_cost > 100000 THEN
    RAISE EXCEPTION 'invalid_cost' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.awc_bucks_ledger
    (child_member_id, kind, amount, reason_label, redemption_id, issued_by, issued_by_name, idempotency_key)
  VALUES
    (v_req.child_member_id, 'redemption', -v_req.price_bucks, 'Prize: ' || v_req.prize_name, v_req.id,
     p_by, public.awc_bucks_display_name(p_by), 'redeem:' || v_req.id::text);

  INSERT INTO public.awc_bucks_stock_moves (prize_id, delta, reason, redemption_id, note, created_by)
  VALUES (v_req.prize_id, -1, 'fulfilled', v_req.id, NULL, p_by);

  UPDATE public.awc_bucks_redemptions
     SET status = 'fulfilled', fulfilled_by = p_by, fulfilled_at = now(), actual_cost_cents = v_cost, updated_at = now()
   WHERE id = v_req.id;

  PERFORM public.awc_bucks_event(v_req.id, 'approved', 'fulfilled', p_by, nullif(left(trim(coalesce(p_note, '')), 200), ''));
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.fulfill', v_req.id::text,
    jsonb_build_object('child', v_req.child_member_id, 'prize', v_req.prize_id, 'price', v_req.price_bucks,
                       'actualCostCents', v_cost, 'committedCostCents', v_req.committed_cost_cents,
                       'overCommitment', v_cost > coalesce(v_req.committed_cost_cents, 0)));

  RETURN jsonb_build_object('ok', true, 'requestId', v_req.id, 'status', 'fulfilled',
    'balance', public.awc_bucks_available(v_req.child_member_id));
END $$;

-- Reject (approver, while waiting) or cancel (parent while waiting; approver
-- while waiting or approved). The status change itself releases the hold,
-- the stock reservation and the budget commitment.
CREATE OR REPLACE FUNCTION public.awc_bucks_close_request(
  p_request uuid, p_by uuid, p_action text, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_req      public.awc_bucks_redemptions%ROWTYPE;
  v_approver boolean := public.awc_bucks_can_approve(p_by);
  v_to       text;
BEGIN
  IF p_action NOT IN ('reject', 'cancel') THEN
    RAISE EXCEPTION 'missing_input' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_req FROM public.awc_bucks_redemptions r WHERE r.id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'reject' THEN
    IF NOT v_approver THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001'; END IF;
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'note_required' USING ERRCODE = 'P0001'; END IF;
    IF v_req.status <> 'requested' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'not_waiting', 'status', v_req.status);
    END IF;
    v_to := 'rejected';
  ELSE
    IF v_approver THEN
      IF v_req.status NOT IN ('requested', 'approved') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'not_open', 'status', v_req.status);
      END IF;
    ELSIF public.awc_bucks_is_linked_parent(p_by, v_req.child_member_id) AND NOT public.awc_bucks_suspended(p_by) THEN
      IF v_req.status <> 'requested' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'not_waiting', 'status', v_req.status);
      END IF;
    ELSE
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
    END IF;
    v_to := 'cancelled';
  END IF;

  UPDATE public.awc_bucks_redemptions
     SET status = v_to, closed_by = p_by, closed_at = now(),
         close_note = nullif(left(trim(coalesce(p_note, '')), 200), ''), updated_at = now()
   WHERE id = v_req.id;

  PERFORM public.awc_bucks_event(v_req.id, v_req.status, v_to, p_by, nullif(left(trim(coalesce(p_note, '')), 200), ''));
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.' || p_action, v_req.id::text,
    jsonb_build_object('child', v_req.child_member_id, 'prize', v_req.prize_id, 'from', v_req.status));

  RETURN jsonb_build_object('ok', true, 'requestId', v_req.id, 'status', v_to,
    'balance', public.awc_bucks_available(v_req.child_member_id));
END $$;

-- 10) Weekly Bible challenges ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.awc_bucks_upsert_challenge(
  p_by uuid, p_week_start date, p_title text, p_verse_ref text, p_details text, p_active boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.awc_bucks_can_approve(p_by) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.awc_bucks_challenges (week_start, title, verse_ref, details, active, updated_by)
  VALUES (p_week_start, trim(p_title), nullif(trim(coalesce(p_verse_ref, '')), ''), nullif(trim(coalesce(p_details, '')), ''),
          coalesce(p_active, true), p_by)
  ON CONFLICT (week_start) DO UPDATE
    SET title = EXCLUDED.title, verse_ref = EXCLUDED.verse_ref, details = EXCLUDED.details,
        active = EXCLUDED.active, updated_by = p_by, updated_at = now()
  RETURNING id INTO v_id;
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.challenge', v_id::text,
    jsonb_build_object('weekStart', p_week_start, 'title', p_title, 'active', p_active));
  RETURN jsonb_build_object('ok', true, 'challengeId', v_id);
END $$;

-- Mark a child's challenge done: one completion per child per challenge, paid
-- as a normal "weekly_challenge" award (caps apply), all-or-nothing.
CREATE OR REPLACE FUNCTION public.awc_bucks_complete_challenge(
  p_challenge uuid, p_child uuid, p_by uuid, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ch  public.awc_bucks_challenges%ROWTYPE;
  v_res jsonb;
BEGIN
  IF NOT public.awc_bucks_can_award(p_by) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_ch FROM public.awc_bucks_challenges c WHERE c.id = p_challenge AND c.active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('awc_bucks:' || p_child::text, 0));
  IF EXISTS (SELECT 1 FROM public.awc_bucks_challenge_completions cc
             WHERE cc.challenge_id = p_challenge AND cc.child_member_id = p_child) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_completed');
  END IF;

  v_res := public.awc_bucks_award(p_child, 'weekly_challenge', p_by, p_idempotency_key, 'Challenge: ' || v_ch.title);
  IF coalesce((v_res->>'ok')::boolean, false) AND NOT coalesce((v_res->>'duplicate')::boolean, false) THEN
    INSERT INTO public.awc_bucks_challenge_completions (challenge_id, child_member_id, ledger_id, completed_by)
    VALUES (p_challenge, p_child, (v_res->>'entryId')::uuid, p_by);
  END IF;
  RETURN v_res || jsonb_build_object('challengeId', p_challenge);
END $$;

-- 11) Volunteer recommendations ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.awc_bucks_recommend(
  p_child uuid, p_reason text, p_by uuid, p_idempotency_key text, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing public.awc_bucks_recommendations%ROWTYPE;
  v_row      public.awc_bucks_recommendations%ROWTYPE;
BEGIN
  IF NOT public.awc_bucks_can_recommend(p_by) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(trim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'missing_input' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.member_id = p_child AND hm.status = 'active'
                   AND hm.relationship_type IN ('child', 'dependent')) THEN
    RAISE EXCEPTION 'not_a_child' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.awc_bucks_reasons r WHERE r.id = p_reason AND r.active) THEN
    RAISE EXCEPTION 'unknown_reason' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing FROM public.awc_bucks_recommendations r WHERE r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'recommendationId', v_existing.id, 'status', v_existing.status);
  END IF;
  IF EXISTS (SELECT 1 FROM public.awc_bucks_recommendations r WHERE r.child_member_id = p_child AND r.reason_id = p_reason
               AND r.recommended_by = p_by AND r.status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_pending');
  END IF;

  INSERT INTO public.awc_bucks_recommendations
    (child_member_id, reason_id, note, recommended_by, recommended_by_name, status, idempotency_key)
  VALUES (p_child, p_reason, nullif(left(trim(coalesce(p_note, '')), 200), ''), p_by,
          public.awc_bucks_display_name(p_by), 'pending', p_idempotency_key)
  RETURNING * INTO v_row;
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.recommend', v_row.id::text,
    jsonb_build_object('child', p_child, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'recommendationId', v_row.id, 'status', 'pending');
END $$;

-- Approve (awards under the normal caps, approver is the giver) or decline.
CREATE OR REPLACE FUNCTION public.awc_bucks_decide_recommendation(
  p_recommendation uuid, p_by uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_rec public.awc_bucks_recommendations%ROWTYPE;
  v_res jsonb;
BEGIN
  IF NOT public.awc_bucks_can_award(p_by) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_rec FROM public.awc_bucks_recommendations r WHERE r.id = p_recommendation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_rec.recommended_by = p_by THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';  -- nobody approves their own recommendation
  END IF;
  IF v_rec.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_decided', 'status', v_rec.status);
  END IF;

  IF coalesce(p_approve, false) THEN
    v_res := public.awc_bucks_award(v_rec.child_member_id, v_rec.reason_id, p_by, 'rec:' || v_rec.id::text,
               'Recommended by ' || v_rec.recommended_by_name || coalesce(': ' || v_rec.note, ''));
    IF NOT coalesce((v_res->>'ok')::boolean, false) THEN
      RETURN v_res;  -- e.g. a cap: the recommendation stays pending
    END IF;
    UPDATE public.awc_bucks_recommendations
       SET status = 'approved', decided_by = p_by, decided_at = now(),
           decision_note = nullif(left(trim(coalesce(p_note, '')), 200), ''), ledger_id = (v_res->>'entryId')::uuid
     WHERE id = v_rec.id;
  ELSE
    UPDATE public.awc_bucks_recommendations
       SET status = 'declined', decided_by = p_by, decided_at = now(),
           decision_note = nullif(left(trim(coalesce(p_note, '')), 200), '')
     WHERE id = v_rec.id;
    v_res := jsonb_build_object('ok', true);
  END IF;
  PERFORM public.awc_bucks_audit(p_by, CASE WHEN p_approve THEN 'awc_bucks.recommendation_approved' ELSE 'awc_bucks.recommendation_declined' END,
    v_rec.id::text, jsonb_build_object('child', v_rec.child_member_id, 'reason', v_rec.reason_id, 'recommendedBy', v_rec.recommended_by));
  RETURN v_res || jsonb_build_object('recommendationId', v_rec.id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'declined' END);
END $$;

-- 12) Super Admin: prizes, stock, budget, permissions ----------------------------
CREATE OR REPLACE FUNCTION public.awc_bucks_upsert_prize(
  p_by uuid, p_id text, p_name text, p_description text, p_price integer,
  p_unit_cost_cents integer, p_image_url text, p_active boolean, p_sort integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.awc_bucks_require_super_admin(p_by);
  INSERT INTO public.awc_bucks_prizes (id, name, description, price_bucks, unit_cost_cents, image_url, active, sort_order, updated_by, updated_at)
  VALUES (p_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_price, p_unit_cost_cents,
          nullif(trim(coalesce(p_image_url, '')), ''), coalesce(p_active, true), coalesce(p_sort, 100), p_by, now())
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description, price_bucks = EXCLUDED.price_bucks,
        unit_cost_cents = EXCLUDED.unit_cost_cents, image_url = EXCLUDED.image_url, active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order, updated_by = p_by, updated_at = now();
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.upsert_prize', p_id,
    jsonb_build_object('name', p_name, 'price', p_price, 'unitCostCents', p_unit_cost_cents, 'active', p_active));
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

CREATE OR REPLACE FUNCTION public.awc_bucks_adjust_stock(p_by uuid, p_prize text, p_delta integer, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_after integer;
BEGIN
  PERFORM public.awc_bucks_require_super_admin(p_by);
  IF coalesce(trim(p_note), '') = '' THEN
    RAISE EXCEPTION 'note_required' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.awc_bucks_prizes p WHERE p.id = p_prize FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_prize' USING ERRCODE = 'P0001';
  END IF;
  v_after := public.awc_bucks_stock_on_hand(p_prize) + p_delta;
  IF v_after < public.awc_bucks_stock_reserved(p_prize) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'below_reserved', 'reserved', public.awc_bucks_stock_reserved(p_prize));
  END IF;
  INSERT INTO public.awc_bucks_stock_moves (prize_id, delta, reason, note, created_by)
  VALUES (p_prize, p_delta, CASE WHEN p_delta > 0 THEN 'restock' ELSE 'adjust' END, left(trim(p_note), 200), p_by);
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.stock', p_prize,
    jsonb_build_object('delta', p_delta, 'onHand', v_after, 'note', left(trim(p_note), 200)));
  RETURN jsonb_build_object('ok', true, 'onHand', v_after);
END $$;

CREATE OR REPLACE FUNCTION public.awc_bucks_set_budget(p_by uuid, p_month date, p_budget_cents integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.awc_bucks_require_super_admin(p_by);
  INSERT INTO public.awc_bucks_budget_months (month_start, budget_cents, updated_by, updated_at)
  VALUES (p_month, p_budget_cents, p_by, now())
  ON CONFLICT (month_start) DO UPDATE SET budget_cents = EXCLUDED.budget_cents, updated_by = p_by, updated_at = now();
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.budget', p_month::text, jsonb_build_object('budgetCents', p_budget_cents));
  RETURN jsonb_build_object('ok', true, 'month', p_month, 'budgetCents', p_budget_cents);
END $$;

-- Phase 2 permission switches (Phase 1 awc_bucks_set_leader keeps working).
CREATE OR REPLACE FUNCTION public.awc_bucks_set_permissions(
  p_by uuid, p_user uuid, p_display_name text, p_can_award boolean, p_can_approve boolean,
  p_can_fulfill boolean, p_can_recommend boolean, p_active boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  PERFORM public.awc_bucks_require_super_admin(p_by);
  v_role := public.awc_bucks_user_role(p_user);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(p_can_award, false) AND v_role NOT IN ('SUPER_ADMIN','ADMIN','PASTOR','ADMIN_STAFF','FIRST_LADY','MINISTRY_LEADER','SUNDAY_SCHOOL_TEACHER','TEACHER','SECRETARY','ASST_SECRETARY') THEN
    RAISE EXCEPTION 'grant_not_allowed' USING ERRCODE = 'P0001';   -- volunteers never award
  END IF;
  IF coalesce(p_can_approve, false) AND v_role <> 'MINISTRY_LEADER' THEN
    RAISE EXCEPTION 'grant_not_allowed' USING ERRCODE = 'P0001';   -- approvals: Children's Ministry Leaders (+ Super Admin by role)
  END IF;
  IF coalesce(p_can_fulfill, false) AND v_role NOT IN ('TEACHER','SUNDAY_SCHOOL_TEACHER','SECRETARY','ASST_SECRETARY','VOLUNTEER','MINISTRY_LEADER') THEN
    RAISE EXCEPTION 'grant_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(p_can_recommend, false) AND v_role IN ('KIOSK','PENDING','GUEST','MEMBER') THEN
    RAISE EXCEPTION 'grant_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.awc_bucks_leaders (user_id, display_name, can_award, can_approve, can_fulfill, can_recommend, active, updated_by, updated_at)
  VALUES (p_user, nullif(trim(coalesce(p_display_name, '')), ''), coalesce(p_can_award, false), coalesce(p_can_approve, false),
          coalesce(p_can_fulfill, false), coalesce(p_can_recommend, false), coalesce(p_active, true), p_by, now())
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name, can_award = EXCLUDED.can_award, can_approve = EXCLUDED.can_approve,
        can_fulfill = EXCLUDED.can_fulfill, can_recommend = EXCLUDED.can_recommend, active = EXCLUDED.active,
        updated_by = p_by, updated_at = now();
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.set_permissions', p_user::text,
    jsonb_build_object('displayName', p_display_name, 'award', p_can_award, 'approve', p_can_approve,
                       'fulfill', p_can_fulfill, 'recommend', p_can_recommend, 'active', p_active));
  RETURN jsonb_build_object('ok', true, 'userId', p_user,
    'canAward', public.awc_bucks_can_award(p_user), 'canApprove', public.awc_bucks_can_approve(p_user),
    'canFulfill', public.awc_bucks_can_fulfill(p_user), 'canRecommend', public.awc_bucks_can_recommend(p_user));
END $$;

-- 13) Lockdown ------------------------------------------------------------------------
DO $$
DECLARE t text; f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['awc_bucks_prizes','awc_bucks_stock_moves','awc_bucks_budget_months','awc_bucks_redemptions',
                           'awc_bucks_redemption_events','awc_bucks_corrections','awc_bucks_challenges',
                           'awc_bucks_challenge_completions','awc_bucks_recommendations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.awc_bucks_append_only()', 'public.awc_bucks_month_start(timestamptz)', 'public.awc_bucks_held(uuid)',
    'public.awc_bucks_available(uuid)', 'public.awc_bucks_outstanding(uuid)', 'public.awc_bucks_suspended(uuid)',
    'public.awc_bucks_can_approve(uuid)', 'public.awc_bucks_can_fulfill(uuid)', 'public.awc_bucks_can_recommend(uuid)',
    'public.awc_bucks_is_linked_parent(uuid, uuid)', 'public.awc_bucks_stock_on_hand(text)', 'public.awc_bucks_stock_reserved(text)',
    'public.awc_bucks_month_usage(date)', 'public.awc_bucks_event(uuid, text, text, uuid, text)',
    'public.awc_bucks_award(uuid, text, uuid, text, text)', 'public.awc_bucks_reverse(uuid, uuid, text)',
    'public.awc_bucks_wallet(uuid, integer)', 'public.awc_bucks_prize_list(boolean)',
    'public.awc_bucks_request_prize(uuid, text, uuid, text)', 'public.awc_bucks_approve_request(uuid, uuid, boolean, text)',
    'public.awc_bucks_fulfill_request(uuid, uuid, integer, text)', 'public.awc_bucks_close_request(uuid, uuid, text, text)',
    'public.awc_bucks_upsert_challenge(uuid, date, text, text, text, boolean)',
    'public.awc_bucks_complete_challenge(uuid, uuid, uuid, text)',
    'public.awc_bucks_recommend(uuid, text, uuid, text, text)', 'public.awc_bucks_decide_recommendation(uuid, uuid, boolean, text)',
    'public.awc_bucks_upsert_prize(uuid, text, text, text, integer, integer, text, boolean, integer)',
    'public.awc_bucks_adjust_stock(uuid, text, integer, text)', 'public.awc_bucks_set_budget(uuid, date, integer)',
    'public.awc_bucks_set_permissions(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.awc_bucks_available(uuid)', 'public.awc_bucks_can_approve(uuid)', 'public.awc_bucks_can_fulfill(uuid)',
    'public.awc_bucks_can_recommend(uuid)', 'public.awc_bucks_is_linked_parent(uuid, uuid)',
    'public.awc_bucks_award(uuid, text, uuid, text, text)', 'public.awc_bucks_reverse(uuid, uuid, text)',
    'public.awc_bucks_wallet(uuid, integer)', 'public.awc_bucks_prize_list(boolean)',
    'public.awc_bucks_request_prize(uuid, text, uuid, text)', 'public.awc_bucks_approve_request(uuid, uuid, boolean, text)',
    'public.awc_bucks_fulfill_request(uuid, uuid, integer, text)', 'public.awc_bucks_close_request(uuid, uuid, text, text)',
    'public.awc_bucks_upsert_challenge(uuid, date, text, text, text, boolean)',
    'public.awc_bucks_complete_challenge(uuid, uuid, uuid, text)',
    'public.awc_bucks_recommend(uuid, text, uuid, text, text)', 'public.awc_bucks_decide_recommendation(uuid, uuid, boolean, text)',
    'public.awc_bucks_upsert_prize(uuid, text, text, text, integer, integer, text, boolean, integer)',
    'public.awc_bucks_adjust_stock(uuid, text, integer, text)', 'public.awc_bucks_set_budget(uuid, date, integer)',
    'public.awc_bucks_set_permissions(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
