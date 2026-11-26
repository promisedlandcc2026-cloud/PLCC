-- Pastor's Office: contact details on member requests + website (visitor) requests.
-- Run once in PLCC's Supabase SQL editor. Safe to run again.
BEGIN;

-- 1) Members: the phone/email they want the office to use (prefilled from their profile in Tribes).
ALTER TABLE public.pastoral_requests ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.pastoral_requests ADD COLUMN IF NOT EXISTS contact_email text;
DO $$ BEGIN
  ALTER TABLE public.pastoral_requests ADD CONSTRAINT pastoral_requests_contact_len
    CHECK (length(coalesce(contact_phone,'')) <= 32 AND length(coalesce(contact_email,'')) <= 254);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only the member who made the request can set its contact details.
CREATE OR REPLACE FUNCTION public.pastoral_set_request_contact(p_actor uuid, p_request uuid, p_phone text, p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.pastoral_requests
     SET contact_phone = NULLIF(left(trim(coalesce(p_phone,'')),32),''),
         contact_email = NULLIF(left(lower(trim(coalesce(p_email,''))),254),''),
         updated_at = now()
   WHERE id = p_request AND requester_user_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.pastoral_set_request_contact(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastoral_set_request_contact(uuid,uuid,text,text) TO service_role;

-- 2) Website requests from people without a PLCC account (or not signed in).
CREATE TABLE IF NOT EXISTS public.pastoral_website_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid REFERENCES public.pastoral_offices(id),
  service text NOT NULL CHECK (service IN ('baptism','dedication','wedding','counseling','other')),
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 120),
  phone text CHECK (length(phone) <= 32),
  email text CHECK (length(email) <= 254),
  preferred_start timestamptz,
  preferred_zone text CHECK (length(preferred_zone) <= 80),
  message text CHECK (length(message) <= 1000),
  -- Set when the phone/email matches an existing PLCC account.
  matched_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  handled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pastoral_website_requests_office_idx ON public.pastoral_website_requests (office_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pastoral_website_requests_created_idx ON public.pastoral_website_requests (created_at DESC);
ALTER TABLE public.pastoral_website_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pastoral_website_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pastoral_website_requests TO service_role;

COMMIT;
