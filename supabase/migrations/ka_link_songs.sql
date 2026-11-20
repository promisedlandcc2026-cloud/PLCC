-- Ka Link song library (#12, Nov 2026): waiting / interlude music for prayer rooms.
-- Managed in PLCC Canaan → More → Ka Link Music. Server-only table; private bucket.
CREATE TABLE IF NOT EXISTS public.ka_link_songs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, artist text, storage_path text NOT NULL, mime_type text, size_bytes bigint, duration_seconds integer, status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','ready')), uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.ka_link_songs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ka_link_songs FROM anon, authenticated;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('ka-link-songs', 'ka-link-songs', false, 26214400, ARRAY['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/ogg']) ON CONFLICT (id) DO NOTHING;

-- Nov 19 2026: Music team — people leaders assign to upload songs the church has
-- bought (Ka Link / Tribes → Ka Link Music). They can delete only their own uploads.
CREATE TABLE IF NOT EXISTS public.ka_link_music_team (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ka_link_music_team ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ka_link_music_team FROM anon, authenticated;
