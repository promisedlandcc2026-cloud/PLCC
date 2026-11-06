-- PLCC Chat: per-room "Mute" for phone alerts. Server-only (Canaan API), like the other chat tables.
CREATE TABLE IF NOT EXISTS public.chat_room_mutes (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  muted_until timestamptz,            -- null = muted until they unmute
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);
CREATE INDEX IF NOT EXISTS chat_room_mutes_channel_idx ON public.chat_room_mutes (channel_id);
ALTER TABLE public.chat_room_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_room_mutes FROM anon, authenticated;
