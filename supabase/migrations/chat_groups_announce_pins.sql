-- PLCC Chat set 4: announcement-only rooms, pinned messages, faster message search.
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS announce_only boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.chat_channels.announce_only IS
  'Only room leaders (church-wide leaders, room moderators/creator, Ministry Leader of that ministry) can post. Everyone can read and react.';

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS chat_messages_pinned_idx
  ON public.chat_messages (channel_id, pinned_at DESC) WHERE pinned_at IS NOT NULL;

-- Search: trigram index so "contains" searches stay fast as history grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS chat_messages_content_trgm_idx
  ON public.chat_messages USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chat_messages_channel_created_idx
  ON public.chat_messages (channel_id, created_at DESC);
