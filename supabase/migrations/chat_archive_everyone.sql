-- PLCC Chat: per-person "Archive chat". A chat comes back when someone else posts after you archived it.
CREATE TABLE IF NOT EXISTS public.chat_archives (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);
ALTER TABLE public.chat_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_archives FROM anon, authenticated;
