-- PLCC Ka Link: per-person "Delete chat" for direct messages.
-- Hides the conversation and its earlier messages for YOU only. The other person keeps theirs.
-- If either of you writes again, the chat comes back fresh (only the new messages show).
CREATE TABLE IF NOT EXISTS public.chat_dm_clears (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);
ALTER TABLE public.chat_dm_clears ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_dm_clears FROM anon, authenticated;
