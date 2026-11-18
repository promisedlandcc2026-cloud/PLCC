-- Ka Link recordings (#14, Nov 2026): audio recordings of prayer sessions (e.g. Midnight Watch).
-- Files live in the private Storage bucket ka-link-recordings; members play them
-- through short-lived links from Canaan. Server-only table (service role).
CREATE TABLE IF NOT EXISTS public.ka_link_recordings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL, channel_name text, egress_id text NOT NULL, status text NOT NULL DEFAULT 'recording' CHECK (status IN ('recording','processing','ready','failed')), storage_path text NOT NULL, started_by uuid REFERENCES public.users(id) ON DELETE SET NULL, started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, duration_seconds integer, size_bytes bigint, error text);
CREATE INDEX IF NOT EXISTS ka_link_recordings_channel_idx ON public.ka_link_recordings (channel_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ka_link_recordings_egress_idx ON public.ka_link_recordings (egress_id);
ALTER TABLE public.ka_link_recordings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ka_link_recordings FROM anon, authenticated;
INSERT INTO storage.buckets (id, name, public) VALUES ('ka-link-recordings', 'ka-link-recordings', false) ON CONFLICT (id) DO NOTHING;
