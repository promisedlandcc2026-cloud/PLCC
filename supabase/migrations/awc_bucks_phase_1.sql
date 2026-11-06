-- =============================================================================
-- PLCC Bucks — Phase 1 (Foundation) · v2 · approved Oct 17, 2026
-- Earn + view only. No store, no spending, no money link.
-- Server-only like every child table: RLS on, no client policies, nothing
-- granted to anon/authenticated. PLCC Canaan API (service role) calls these
-- functions; the functions ALSO check role + permission themselves, so a bug
-- in the API cannot let an unauthorized user award, reverse or change settings.
-- Safe to re-run. Changes no existing table.
-- =============================================================================
BEGIN;

-- 1) Preset reasons (leaders pick one; they never type an amount) -------------
CREATE TABLE IF NOT EXISTS public.awc_bucks_reasons (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,40}$'),
  label       text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 60),
  amount      integer NOT NULL CHECK (amount BETWEEN 1 AND 100),
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.awc_bucks_reasons (id, label, amount, sort_order) VALUES
  ('memory_verse',     'Memorized a Bible verse',          20, 10),
  ('kindness',         'Showed kindness',                  15, 20),
  ('bible_discussion', 'Joined the Bible discussion',      10, 30),
  ('brought_bible',    'Brought their Bible',               5, 40),
  ('cleanup_helper',   'Helped clean up',                  10, 50),
  ('ministry_helper',  'Took part in children''s ministry', 15, 60),
  ('weekly_challenge', 'Weekly Bible challenge',           25, 70),
  ('special',          'Special achievement',              50, 80)
ON CONFLICT (id) DO NOTHING;
-- No attendance reason on purpose: check-in points already reward attendance.

-- 2) Caps — one row, Super Admin edits via awc_bucks_set_caps -----------------
CREATE TABLE IF NOT EXISTS public.awc_bucks_settings (
  id                              boolean PRIMARY KEY DEFAULT true CHECK (id),
  weekly_cap_per_child            integer NOT NULL DEFAULT 100 CHECK (weekly_cap_per_child BETWEEN 1 AND 1000),
  daily_cap_per_issuer_per_child  integer NOT NULL DEFAULT 60  CHECK (daily_cap_per_issuer_per_child BETWEEN 1 AND 1000),
  updated_by                      uuid,
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.awc_bucks_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 3) Leaders — approved display names + the kids.bucks.award permission -------
-- SECRETARY / ASST_SECRETARY may award only with can_award = true here.
-- Core kids roles award by role; active = false suspends anyone.
CREATE TABLE IF NOT EXISTS public.awc_bucks_leaders (
  user_id       uuid PRIMARY KEY,
  display_name  text CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 40),
  can_award     boolean NOT NULL DEFAULT false,   -- kids.bucks.award for roles that need a grant
  active        boolean NOT NULL DEFAULT true,
  updated_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 4) The ledger (append-only; balance = sum of amount) -------------------------
CREATE TABLE IF NOT EXISTS public.awc_bucks_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('award', 'reversal')),
  amount           integer NOT NULL CHECK (amount <> 0 AND amount BETWEEN -1000 AND 1000),
  reason_id        text REFERENCES public.awc_bucks_reasons(id),
  reason_label     text NOT NULL,                       -- snapshot: history reads right after a rename
  note             text CHECK (note IS NULL OR char_length(note) <= 200),
  reverses_id      uuid UNIQUE REFERENCES public.awc_bucks_ledger(id),  -- each award reversed at most once
  issued_by        uuid NOT NULL,                       -- users.id (no FK: removing a login must not touch history)
  issued_by_name   text NOT NULL,                       -- approved display name at the time (shown to parents)
  idempotency_key  text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 100),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT awc_bucks_ledger_shape CHECK (
    (kind = 'award'    AND amount > 0 AND reason_id IS NOT NULL AND reverses_id IS NULL) OR
    (kind = 'reversal' AND amount < 0 AND reverses_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS awc_bucks_ledger_child_time_idx  ON public.awc_bucks_ledger (child_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS awc_bucks_ledger_issuer_time_idx ON public.awc_bucks_ledger (issued_by, created_at DESC);

-- Append-only for everyone, the server included. The one exception: rows go
-- with the child's members row if that record itself is deleted (FK cascade).
CREATE OR REPLACE FUNCTION public.awc_bucks_ledger_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;  -- cascade from deleting the child's member record
  END IF;
  RAISE EXCEPTION 'awc_bucks_ledger is append-only (use awc_bucks_reverse)' USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS awc_bucks_ledger_no_edit ON public.awc_bucks_ledger;
CREATE TRIGGER awc_bucks_ledger_no_edit
  BEFORE UPDATE OR DELETE ON public.awc_bucks_ledger
  FOR EACH ROW EXECUTE FUNCTION public.awc_bucks_ledger_immutable();

DROP TRIGGER IF EXISTS awc_bucks_ledger_no_truncate ON public.awc_bucks_ledger;
CREATE TRIGGER awc_bucks_ledger_no_truncate
  BEFORE TRUNCATE ON public.awc_bucks_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.awc_bucks_ledger_immutable();

-- 5) Helpers -------------------------------------------------------------------
-- Church week = Monday 00:00 through Sunday 23:59, Africa/Kampala.
CREATE OR REPLACE FUNCTION public.awc_bucks_week_start(p_at timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT date_trunc('week', p_at AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala';
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_day_start(p_at timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT date_trunc('day', p_at AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala';
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_user_role(p_user uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT upper(coalesce(u.role, '')) FROM public.users u WHERE u.id = p_user;
$$;

-- Who may award: core kids roles by role; SECRETARY / ASST_SECRETARY only with
-- the kids.bucks.award grant; everyone else (VOLUNTEER, KIOSK, MEMBER…) never.
CREATE OR REPLACE FUNCTION public.awc_bucks_can_award(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.awc_bucks_leaders l WHERE l.user_id = p_user AND NOT l.active) THEN false
    WHEN public.awc_bucks_user_role(p_user) IN
      ('SUPER_ADMIN','ADMIN','PASTOR','ADMIN_STAFF','FIRST_LADY','MINISTRY_LEADER','SUNDAY_SCHOOL_TEACHER','TEACHER') THEN true
    WHEN public.awc_bucks_user_role(p_user) IN ('SECRETARY','ASST_SECRETARY') THEN
      EXISTS (SELECT 1 FROM public.awc_bucks_leaders l WHERE l.user_id = p_user AND l.active AND l.can_award)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_can_reverse(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.awc_bucks_user_role(p_user) IN ('SUPER_ADMIN','ADMIN','PASTOR','MINISTRY_LEADER');
$$;

-- Name parents see: the approved display name, else first name + last initial.
-- Never email, phone or any contact detail.
CREATE OR REPLACE FUNCTION public.awc_bucks_display_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT l.display_name FROM public.awc_bucks_leaders l
      WHERE l.user_id = p_user AND l.active AND l.display_name IS NOT NULL),
    (SELECT nullif(trim(
              split_part(trim(u.name), ' ', 1) || ' ' ||
              coalesce(left(nullif(split_part(trim(u.name), ' ', 2), ''), 1) || '.', '')), '')
       FROM public.users u WHERE u.id = p_user),
    'PLCC Leader');
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_balance_of(p_child_member_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(l.amount), 0)::int FROM public.awc_bucks_ledger l WHERE l.child_member_id = p_child_member_id;
$$;

CREATE OR REPLACE FUNCTION public.awc_bucks_audit(p_user uuid, p_action text, p_resource_id text, p_details jsonb)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details, severity)
  VALUES (p_user, p_action, 'awc_bucks', p_resource_id, p_details::text, 'info');
$$;

-- 6) Award ---------------------------------------------------------------------
-- Preset reason only · idempotent · both caps checked under a per-child lock.
-- Caps count Bucks a child KEEPS: a reversed award no longer counts, so the
-- Bucks a child keeps in a week can never exceed the weekly cap, whatever the
-- order of awards and reversals.
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

  -- One award or reversal at a time per child: caps stay exact under double taps.
  PERFORM pg_advisory_xact_lock(hashtextextended('awc_bucks:' || p_child_member_id::text, 0));

  -- Same request again (retry / double tap) → same answer, no second row.
  SELECT * INTO v_existing FROM public.awc_bucks_ledger l WHERE l.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.child_member_id <> p_child_member_id OR v_existing.issued_by <> p_issued_by THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'entryId', v_existing.id,
      'amount', v_existing.amount, 'reasonLabel', v_existing.reason_label,
      'balance', public.awc_bucks_balance_of(p_child_member_id));
  END IF;

  SELECT * INTO v_settings FROM public.awc_bucks_settings s WHERE s.id;

  SELECT coalesce(sum(l.amount), 0) INTO v_week_total
  FROM public.awc_bucks_ledger l
  WHERE l.child_member_id = p_child_member_id AND l.kind = 'award'
    AND l.created_at >= public.awc_bucks_week_start(now())
    AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_ledger r WHERE r.reverses_id = l.id);

  IF v_week_total + v_reason.amount > v_settings.weekly_cap_per_child THEN
    RETURN jsonb_build_object('ok', false, 'code', 'weekly_cap',
      'remaining', greatest(0, v_settings.weekly_cap_per_child - v_week_total));
  END IF;

  SELECT coalesce(sum(l.amount), 0) INTO v_day_total
  FROM public.awc_bucks_ledger l
  WHERE l.child_member_id = p_child_member_id AND l.issued_by = p_issued_by AND l.kind = 'award'
    AND l.created_at >= public.awc_bucks_day_start(now())
    AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_ledger r WHERE r.reverses_id = l.id);

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

  PERFORM public.awc_bucks_audit(p_issued_by, 'awc_bucks.award', v_row.id::text,
    jsonb_build_object('child', p_child_member_id, 'reason', v_reason.id, 'amount', v_reason.amount));

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'entryId', v_row.id,
    'amount', v_row.amount, 'reasonLabel', v_row.reason_label, 'issuedByName', v_row.issued_by_name,
    'balance', public.awc_bucks_balance_of(p_child_member_id));
END $$;

-- 7) Reverse -------------------------------------------------------------------
-- A negative row pointing at the award. Once per award; a note is required.
CREATE OR REPLACE FUNCTION public.awc_bucks_reverse(
  p_entry_id  uuid,
  p_issued_by uuid,
  p_note      text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_orig public.awc_bucks_ledger%ROWTYPE;
  v_row  public.awc_bucks_ledger%ROWTYPE;
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

  IF EXISTS (SELECT 1 FROM public.awc_bucks_ledger r WHERE r.reverses_id = p_entry_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_reversed');
  END IF;

  INSERT INTO public.awc_bucks_ledger
    (child_member_id, kind, amount, reason_id, reason_label, note, reverses_id, issued_by, issued_by_name, idempotency_key)
  VALUES
    (v_orig.child_member_id, 'reversal', -v_orig.amount, v_orig.reason_id, 'Reversed: ' || v_orig.reason_label,
     left(trim(p_note), 200), v_orig.id, p_issued_by, public.awc_bucks_display_name(p_issued_by),
     'reverse:' || v_orig.id::text)
  RETURNING * INTO v_row;

  PERFORM public.awc_bucks_audit(p_issued_by, 'awc_bucks.reverse', v_row.id::text,
    jsonb_build_object('child', v_orig.child_member_id, 'reverses', v_orig.id, 'amount', v_row.amount, 'note', v_row.note));

  RETURN jsonb_build_object('ok', true, 'entryId', v_row.id, 'amount', v_row.amount,
    'balance', public.awc_bucks_balance_of(v_orig.child_member_id));
END $$;

-- 8) Wallet (Kids View / leaders) ---------------------------------------------
-- Parents see reason, amount, date and the leader's display name. No ids of
-- the issuer, no contact details. Full detail stays in the ledger + audit_logs.
CREATE OR REPLACE FUNCTION public.awc_bucks_wallet(p_child_member_id uuid, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'balance', public.awc_bucks_balance_of(p_child_member_id),
    'totalEarned', (
      SELECT coalesce(sum(l.amount), 0)::int FROM public.awc_bucks_ledger l
      WHERE l.child_member_id = p_child_member_id AND l.kind = 'award'
        AND NOT EXISTS (SELECT 1 FROM public.awc_bucks_ledger r WHERE r.reverses_id = l.id)),
    'history', coalesce((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h."createdAt" DESC) FROM (
        SELECT l.id, l.kind, l.amount, l.reason_label AS "reasonLabel",
               l.issued_by_name AS "awardedBy", l.created_at AS "createdAt",
               EXISTS (SELECT 1 FROM public.awc_bucks_ledger r WHERE r.reverses_id = l.id) AS reversed
        FROM public.awc_bucks_ledger l
        WHERE l.child_member_id = p_child_member_id
        ORDER BY l.created_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
      ) h), '[]'::jsonb)
  );
$$;

-- 9) Super Admin controls ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.awc_bucks_require_super_admin(p_by uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_by IS NULL OR public.awc_bucks_user_role(p_by) IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.awc_bucks_set_caps(p_by uuid, p_weekly integer, p_daily integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.awc_bucks_require_super_admin(p_by);
  UPDATE public.awc_bucks_settings
     SET weekly_cap_per_child = p_weekly, daily_cap_per_issuer_per_child = p_daily,
         updated_by = p_by, updated_at = now()
   WHERE id;
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.set_caps', 'settings',
    jsonb_build_object('weekly', p_weekly, 'daily', p_daily));
  RETURN jsonb_build_object('ok', true, 'weekly', p_weekly, 'daily', p_daily);
END $$;

CREATE OR REPLACE FUNCTION public.awc_bucks_upsert_reason(
  p_by uuid, p_id text, p_label text, p_amount integer, p_active boolean, p_sort integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.awc_bucks_require_super_admin(p_by);
  INSERT INTO public.awc_bucks_reasons (id, label, amount, active, sort_order, updated_by, updated_at)
  VALUES (p_id, p_label, p_amount, coalesce(p_active, true), coalesce(p_sort, 100), p_by, now())
  ON CONFLICT (id) DO UPDATE
    SET label = EXCLUDED.label, amount = EXCLUDED.amount, active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order, updated_by = p_by, updated_at = now();
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.upsert_reason', p_id,
    jsonb_build_object('label', p_label, 'amount', p_amount, 'active', p_active));
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- Grant / revoke kids.bucks.award, set an approved display name, or suspend.
CREATE OR REPLACE FUNCTION public.awc_bucks_set_leader(
  p_by uuid, p_user uuid, p_display_name text, p_can_award boolean, p_active boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.awc_bucks_require_super_admin(p_by);
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.awc_bucks_leaders (user_id, display_name, can_award, active, updated_by, updated_at)
  VALUES (p_user, nullif(trim(coalesce(p_display_name, '')), ''), coalesce(p_can_award, false),
          coalesce(p_active, true), p_by, now())
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name, can_award = EXCLUDED.can_award,
        active = EXCLUDED.active, updated_by = p_by, updated_at = now();
  PERFORM public.awc_bucks_audit(p_by, 'awc_bucks.set_leader', p_user::text,
    jsonb_build_object('displayName', p_display_name, 'canAward', p_can_award, 'active', p_active));
  RETURN jsonb_build_object('ok', true, 'userId', p_user, 'canAwardNow', public.awc_bucks_can_award(p_user));
END $$;

-- 10) Lockdown: server only, same as every child table -------------------------
ALTER TABLE public.awc_bucks_reasons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awc_bucks_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awc_bucks_leaders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awc_bucks_ledger   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.awc_bucks_reasons, public.awc_bucks_settings,
                    public.awc_bucks_leaders, public.awc_bucks_ledger
  FROM PUBLIC, anon, authenticated;
-- The service role reads tables directly; every write goes through the functions above.
REVOKE ALL ON TABLE public.awc_bucks_reasons, public.awc_bucks_settings,
                    public.awc_bucks_leaders, public.awc_bucks_ledger FROM service_role;
GRANT SELECT ON TABLE public.awc_bucks_reasons, public.awc_bucks_settings,
                      public.awc_bucks_leaders, public.awc_bucks_ledger TO service_role;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.awc_bucks_ledger_immutable()',
    'public.awc_bucks_week_start(timestamptz)',
    'public.awc_bucks_day_start(timestamptz)',
    'public.awc_bucks_user_role(uuid)',
    'public.awc_bucks_can_award(uuid)',
    'public.awc_bucks_can_reverse(uuid)',
    'public.awc_bucks_display_name(uuid)',
    'public.awc_bucks_balance_of(uuid)',
    'public.awc_bucks_audit(uuid, text, text, jsonb)',
    'public.awc_bucks_award(uuid, text, uuid, text, text)',
    'public.awc_bucks_reverse(uuid, uuid, text)',
    'public.awc_bucks_wallet(uuid, integer)',
    'public.awc_bucks_require_super_admin(uuid)',
    'public.awc_bucks_set_caps(uuid, integer, integer)',
    'public.awc_bucks_upsert_reason(uuid, text, text, integer, boolean, integer)',
    'public.awc_bucks_set_leader(uuid, uuid, text, boolean, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.awc_bucks_can_award(uuid)',
    'public.awc_bucks_can_reverse(uuid)',
    'public.awc_bucks_award(uuid, text, uuid, text, text)',
    'public.awc_bucks_reverse(uuid, uuid, text)',
    'public.awc_bucks_wallet(uuid, integer)',
    'public.awc_bucks_set_caps(uuid, integer, integer)',
    'public.awc_bucks_upsert_reason(uuid, text, text, integer, boolean, integer)',
    'public.awc_bucks_set_leader(uuid, uuid, text, boolean, boolean)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
