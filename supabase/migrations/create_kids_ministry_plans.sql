-- Kids ministry weekly Sunday plan archive (images/PDFs in Storage; metadata in Postgres).
-- Apply via your usual Supabase SQL workflow. Service-role API only for Storage I/O.

CREATE TABLE IF NOT EXISTS public.kids_ministry_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date date NOT NULL,
  classroom text NOT NULL,
  title text,
  notes text,
  storage_path text NOT NULL,
  file_name text,
  content_type text,
  byte_size integer,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kids_ministry_plans_classroom_date_idx
  ON public.kids_ministry_plans (classroom, service_date DESC);

CREATE INDEX IF NOT EXISTS kids_ministry_plans_service_date_idx
  ON public.kids_ministry_plans (service_date DESC);

ALTER TABLE public.kids_ministry_plans ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: Canaan API uses service role (bypasses RLS).

-- Private Storage bucket for plan images / PDFs (~15MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kids-ministry-plans',
  'kids-ministry-plans',
  false,
  15728640,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated/anon: no INSERT/UPDATE/DELETE policies — service role bypasses RLS.
COMMENT ON TABLE public.kids_ministry_plans IS
  'Weekly kids classroom Sunday plans. Files live in storage bucket kids-ministry-plans; signed URLs via vault resource=kids-plans.';
