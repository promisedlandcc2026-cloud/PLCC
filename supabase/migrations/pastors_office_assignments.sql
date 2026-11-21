-- Pastor's Office: additive assignments. Draft for isolated testing and review.
-- Do not apply to production without explicit approval and a verified backup.
-- An office assignment supplements public.users.role; it never changes that role.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pastoral_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pastor_user_id uuid NOT NULL UNIQUE REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pastoral_office_assignments (
  office_id uuid NOT NULL REFERENCES public.pastoral_offices(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  office_role text NOT NULL CHECK (office_role IN ('PASTOR', 'PASTORS_ASSISTANT')),
  granted_by uuid NOT NULL REFERENCES public.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (office_id, user_id, office_role)
);
CREATE TABLE IF NOT EXISTS public.pastoral_office_assignment_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  office_id uuid NOT NULL,
  user_id uuid NOT NULL,
  office_role text NOT NULL,
  changed_by uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pastoral_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_office_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_office_assignment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pastoral_offices, public.pastoral_office_assignments, public.pastoral_office_assignment_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pastoral_offices, public.pastoral_office_assignments TO service_role;
-- All writes occur through this service-only transaction. The verified actor ID is
-- supplied by the server, never the browser. The actor and target are rechecked here.
CREATE OR REPLACE FUNCTION public.set_pastors_assistant(
  p_actor uuid, p_pastor uuid, p_assistant uuid, p_grant boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_office uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor AND role = 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_pastor = p_assistant OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_pastor AND role = 'PASTOR') THEN
    RAISE EXCEPTION 'invalid pastor' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_assistant AND role NOT IN ('PENDING','GUEST','KIOSK')) THEN
    RAISE EXCEPTION 'invalid assistant' USING ERRCODE = '22023';
  END IF;
  IF p_grant THEN
    INSERT INTO public.pastoral_offices (pastor_user_id) VALUES (p_pastor)
      ON CONFLICT (pastor_user_id) DO UPDATE SET pastor_user_id = EXCLUDED.pastor_user_id RETURNING id INTO v_office;
    INSERT INTO public.pastoral_office_assignments (office_id,user_id,office_role,granted_by,granted_at,revoked_at)
      VALUES (v_office,p_assistant,'PASTORS_ASSISTANT',p_actor,now(),NULL)
      ON CONFLICT (office_id,user_id,office_role) DO UPDATE SET granted_by=p_actor, granted_at=now(), revoked_at=NULL;
  ELSE
    SELECT id INTO v_office FROM public.pastoral_offices WHERE pastor_user_id=p_pastor;
    UPDATE public.pastoral_office_assignments SET revoked_at=now()
      WHERE office_id=v_office AND user_id=p_assistant AND office_role='PASTORS_ASSISTANT' AND revoked_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO public.pastoral_office_assignment_audit (office_id,user_id,office_role,changed_by,action)
    VALUES (v_office,p_assistant,'PASTORS_ASSISTANT',p_actor,CASE WHEN p_grant THEN 'grant' ELSE 'revoke' END);
END $$;
REVOKE ALL ON FUNCTION public.set_pastors_assistant(uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pastors_assistant(uuid,uuid,uuid,boolean) TO service_role;
COMMIT;
