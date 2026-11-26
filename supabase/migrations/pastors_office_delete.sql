-- Pastor's Office: delete finished requests (e.g. test requests). Run once in PLCC's Supabase.
BEGIN;
-- Member requests: only once cancelled, declined, completed or no-show. Pastor or assistant of that office.
CREATE OR REPLACE FUNCTION public.pastoral_delete_request(p_actor uuid, p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r public.pastoral_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.pastoral_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor AND role NOT IN ('PENDING','GUEST','KIOSK','ACCOUNTANT'))
     OR NOT (
       EXISTS (SELECT 1 FROM public.pastoral_offices WHERE id=r.office_id AND pastor_user_id=p_actor)
       OR EXISTS (SELECT 1 FROM public.pastoral_office_assignments WHERE office_id=r.office_id AND user_id=p_actor AND office_role='PASTORS_ASSISTANT' AND revoked_at IS NULL)
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF r.status NOT IN ('cancelled','declined','completed','no_show') THEN RAISE EXCEPTION 'still active' USING ERRCODE='40001'; END IF;
  DELETE FROM public.pastoral_private_notes WHERE request_id = r.id;
  DELETE FROM public.pastoral_notification_outbox WHERE request_id = r.id;
  DELETE FROM public.pastoral_appointment_history WHERE request_id = r.id;
  DELETE FROM public.pastoral_appointments WHERE request_id = r.id;
  DELETE FROM public.pastoral_office_events_audit WHERE request_id = r.id;
  DELETE FROM public.user_notifications WHERE source_id = r.id AND link = '/pastors-office';
  DELETE FROM public.pastoral_requests WHERE id = r.id;
END $$;
REVOKE ALL ON FUNCTION public.pastoral_delete_request(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastoral_delete_request(uuid,uuid) TO service_role;
-- Website requests can be deleted by the server (it checks the pastor/assistant first).
GRANT DELETE ON public.pastoral_website_requests TO service_role;
COMMIT;
