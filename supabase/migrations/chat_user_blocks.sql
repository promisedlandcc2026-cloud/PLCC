-- PLCC Ka Link: block a member from messaging you directly. Unblock any time.
CREATE TABLE IF NOT EXISTS public.chat_user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS chat_user_blocks_blocked_idx ON public.chat_user_blocks (blocked_id);
ALTER TABLE public.chat_user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_user_blocks FROM anon, authenticated;
