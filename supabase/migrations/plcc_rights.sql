-- PLCC ONE permission rights (Nov 24 2026)
--   ka_link_moderator = "Mod": moderate every Ka Link + reserved seat
--   ka_link_recording = "Recording button": start/stop Ka Link recordings
--                       (once anyone holds it, only holders + Super Admins can record)
--   admissions        = "Admissions": stored; what it unlocks is confirmed separately
-- Full rights = users.role SUPER_ADMIN. Back end rights = users.role ADMIN.
-- Managed in PLCC Canaan → Admin → Ka Link Team → PLCC ONE rights. Server-only.
CREATE TABLE IF NOT EXISTS public.plcc_rights (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  ka_link_moderator boolean NOT NULL DEFAULT false,
  ka_link_recording boolean NOT NULL DEFAULT false,
  admissions boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plcc_rights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plcc_rights FROM anon, authenticated;

-- A Pastor's Assistant may now serve a pastor who is a Super Admin (full rights),
-- e.g. Ps Grace. Everything else in set_pastors_assistant is unchanged.
CREATE OR REPLACE FUNCTION public.set_pastors_assistant(
  p_actor uuid, p_pastor uuid, p_assistant uuid, p_grant boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_office uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor AND role = 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_pastor = p_assistant OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_pastor AND role IN ('PASTOR','SUPER_ADMIN')) THEN
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
