-- Pastor's Office scheduling: DRAFT, not yet approved or applied to production.
-- Requires pastors_office_assignments.sql. Validate in an isolated database first.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pastoral_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.pastoral_offices(id),
  requester_user_id uuid NOT NULL REFERENCES public.users(id),
  category text NOT NULL CHECK (category IN ('appointment','counseling','baptism')),
  preferred_start timestamptz NOT NULL,
  preferred_zone text NOT NULL CHECK (length(preferred_zone) BETWEEN 1 AND 80),
  contact_preference text NOT NULL CHECK (contact_preference IN ('app','phone','email')),
  brief_message text CHECK (length(brief_message) <= 500),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','proposed','awaiting_approval','confirmed','completed','declined','cancelled','no_show')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pastoral_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.pastoral_offices(id),
  request_id uuid NOT NULL UNIQUE REFERENCES public.pastoral_requests(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  display_zone text NOT NULL CHECK (length(display_zone) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('proposed','awaiting_approval','confirmed','completed','declined','cancelled','no_show')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '12 hours')
);
CREATE INDEX IF NOT EXISTS pastoral_appointments_office_time_idx ON public.pastoral_appointments (office_id, starts_at, ends_at);
CREATE TABLE IF NOT EXISTS public.pastoral_office_events_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES public.pastoral_offices(id),
  request_id uuid NOT NULL REFERENCES public.pastoral_requests(id),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pastoral_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  request_id uuid NOT NULL REFERENCES public.pastoral_requests(id),
  request_version integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id, request_version)
);
ALTER TABLE public.pastoral_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_office_events_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pastoral_requests, public.pastoral_appointments, public.pastoral_office_events_audit, public.pastoral_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pastoral_requests, public.pastoral_appointments TO service_role;
-- Serializes reservations and transitions on the office row. Client checks alone
-- are insufficient: every write must use a reviewed transaction like this one.
CREATE OR REPLACE FUNCTION public.pastoral_propose_slot(
  p_actor uuid, p_request uuid, p_version integer, p_start timestamptz, p_end timestamptz, p_zone text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r public.pastoral_requests%ROWTYPE; v_pastor uuid; v_next integer;
BEGIN
  SELECT * INTO r FROM public.pastoral_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='22023'; END IF;
  SELECT pastor_user_id INTO v_pastor FROM public.pastoral_offices WHERE id=r.office_id FOR UPDATE;
  SELECT * INTO r FROM public.pastoral_requests WHERE id=p_request FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor AND role NOT IN ('PENDING','GUEST','KIOSK','ACCOUNTANT')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT (p_actor = v_pastor OR EXISTS (SELECT 1 FROM public.pastoral_office_assignments WHERE office_id=r.office_id AND user_id=p_actor AND office_role='PASTORS_ASSISTANT' AND revoked_at IS NULL)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_version IS NULL OR r.version <> p_version OR r.status NOT IN ('requested','proposed','declined') THEN RAISE EXCEPTION 'stale state' USING ERRCODE='40001'; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_end > p_start + interval '12 hours' OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_zone) THEN
    RAISE EXCEPTION 'invalid slot' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pastoral_appointments a WHERE a.office_id=r.office_id AND a.request_id<>r.id AND a.status IN ('proposed','awaiting_approval','confirmed') AND a.starts_at < p_end AND p_start < a.ends_at) THEN
    RAISE EXCEPTION 'slot unavailable' USING ERRCODE='23P01';
  END IF;
  INSERT INTO public.pastoral_appointments(office_id,request_id,starts_at,ends_at,display_zone,status)
    VALUES(r.office_id,r.id,p_start,p_end,p_zone,'proposed')
    ON CONFLICT(request_id) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,display_zone=EXCLUDED.display_zone,status='proposed',updated_at=now();
  UPDATE public.pastoral_requests SET status='proposed',version=version+1,updated_at=now() WHERE id=r.id RETURNING version INTO v_next;
  INSERT INTO public.pastoral_office_events_audit(office_id,request_id,actor_id,action) VALUES(r.office_id,r.id,p_actor,'propose');
  INSERT INTO public.pastoral_notification_outbox(user_id,request_id,request_version) VALUES(r.requester_user_id,r.id,v_next) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.pastoral_propose_slot(uuid,uuid,integer,timestamptz,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastoral_propose_slot(uuid,uuid,integer,timestamptz,timestamptz,text) TO service_role;

-- Create a member request and generic notifications in one transaction.
CREATE OR REPLACE FUNCTION public.pastoral_submit_request(
  p_actor uuid, p_office uuid, p_category text, p_preferred timestamptz, p_zone text, p_contact text, p_message text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_request uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor AND role NOT IN ('PENDING','GUEST','KIOSK','ACCOUNTANT')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pastoral_offices WHERE id=p_office) OR p_preferred IS NULL OR p_category IS NULL OR p_category NOT IN ('appointment','counseling','baptism') OR p_contact IS NULL OR p_contact NOT IN ('app','phone','email') OR length(coalesce(p_message,'')) > 500 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_zone) THEN
    RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.pastoral_requests(office_id,requester_user_id,category,preferred_start,preferred_zone,contact_preference,brief_message)
    VALUES(p_office,p_actor,p_category,p_preferred,p_zone,p_contact,NULLIF(trim(p_message),'')) RETURNING id INTO v_request;
  INSERT INTO public.pastoral_office_events_audit(office_id,request_id,actor_id,action) VALUES(p_office,v_request,p_actor,'submit');
  INSERT INTO public.pastoral_notification_outbox(user_id,request_id,request_version)
    SELECT user_id,v_request,1 FROM (
      SELECT pastor_user_id AS user_id FROM public.pastoral_offices WHERE id=p_office
      UNION SELECT user_id FROM public.pastoral_office_assignments WHERE office_id=p_office AND office_role='PASTORS_ASSISTANT' AND revoked_at IS NULL
    ) recipients WHERE user_id<>p_actor ON CONFLICT DO NOTHING;
  RETURN v_request;
END $$;
REVOKE ALL ON FUNCTION public.pastoral_submit_request(uuid,uuid,text,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastoral_submit_request(uuid,uuid,text,timestamptz,text,text,text) TO service_role;

-- Validate ownership and every transition inside the same transaction.
CREATE OR REPLACE FUNCTION public.pastoral_transition_request(
  p_actor uuid, p_request uuid, p_version integer, p_action text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r public.pastoral_requests%ROWTYPE; v_pastor uuid; v_assistant boolean; v_next text; v_version integer;
BEGIN
  SELECT * INTO r FROM public.pastoral_requests WHERE id=p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='22023'; END IF;
  SELECT pastor_user_id INTO v_pastor FROM public.pastoral_offices WHERE id=r.office_id FOR UPDATE;
  SELECT * INTO r FROM public.pastoral_requests WHERE id=p_request FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor AND role NOT IN ('PENDING','GUEST','KIOSK','ACCOUNTANT')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.pastoral_office_assignments WHERE office_id=r.office_id AND user_id=p_actor AND office_role='PASTORS_ASSISTANT' AND revoked_at IS NULL) INTO v_assistant;
  IF p_version IS NULL OR r.version<>p_version THEN RAISE EXCEPTION 'stale state' USING ERRCODE='40001'; END IF;
  IF p_action='request_approval' AND r.status='proposed' AND (p_actor=v_pastor OR v_assistant) THEN v_next:='awaiting_approval';
  ELSIF p_action='approve' AND r.status='awaiting_approval' AND p_actor=v_pastor THEN v_next:='confirmed';
  ELSIF p_action='decline' AND r.status IN ('requested','proposed','awaiting_approval') AND p_actor=v_pastor THEN v_next:='declined';
  ELSIF p_action='cancel' AND r.status IN ('requested','proposed','awaiting_approval','confirmed') AND (p_actor=v_pastor OR v_assistant OR p_actor=r.requester_user_id) THEN v_next:='cancelled';
  ELSIF p_action='complete' AND r.status='confirmed' AND (p_actor=v_pastor OR v_assistant) THEN v_next:='completed';
  ELSIF p_action='mark_no_show' AND r.status='confirmed' AND (p_actor=v_pastor OR v_assistant) THEN v_next:='no_show';
  ELSE RAISE EXCEPTION 'invalid transition' USING ERRCODE='42501'; END IF;
  IF v_next IN ('awaiting_approval','confirmed','completed','no_show') AND NOT EXISTS (SELECT 1 FROM public.pastoral_appointments WHERE request_id=r.id) THEN RAISE EXCEPTION 'slot required' USING ERRCODE='22023'; END IF;
  UPDATE public.pastoral_requests SET status=v_next,version=version+1,updated_at=now() WHERE id=r.id RETURNING version INTO v_version;
  UPDATE public.pastoral_appointments SET status=v_next,updated_at=now() WHERE request_id=r.id;
  INSERT INTO public.pastoral_office_events_audit(office_id,request_id,actor_id,action) VALUES(r.office_id,r.id,p_actor,p_action);
  INSERT INTO public.pastoral_notification_outbox(user_id,request_id,request_version)
    SELECT user_id,r.id,v_version FROM (SELECT r.requester_user_id AS user_id UNION SELECT v_pastor UNION SELECT user_id FROM public.pastoral_office_assignments WHERE office_id=r.office_id AND office_role='PASTORS_ASSISTANT' AND revoked_at IS NULL) recipients WHERE user_id<>p_actor ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.pastoral_transition_request(uuid,uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastoral_transition_request(uuid,uuid,integer,text) TO service_role;

-- Delivers generic in-app alerts without including category or message text.
-- Each batch is transactional; a failure rolls back both inbox insert and status.
CREATE OR REPLACE FUNCTION public.pastoral_deliver_inbox(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.pastoral_notification_outbox%ROWTYPE; delivered integer := 0;
BEGIN
  FOR item IN SELECT * FROM public.pastoral_notification_outbox WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),100)
  LOOP
    INSERT INTO public.user_notifications(user_id,type,title,body,link,source_id)
      VALUES(item.user_id,'assignment','Pastor’s Office update','You have an appointment update. Open the app to view it.','/pastors-office',item.request_id);
    UPDATE public.pastoral_notification_outbox SET status='sent',attempts=attempts+1 WHERE id=item.id;
    delivered := delivered + 1;
  END LOOP;
  RETURN delivered;
END $$;
REVOKE ALL ON FUNCTION public.pastoral_deliver_inbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastoral_deliver_inbox(integer) TO service_role;

COMMIT;
