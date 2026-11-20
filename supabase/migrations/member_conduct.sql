-- Nov 19 2026: warn, then block, unruly members (Ka Link + Tribes: calls, chat, posts).
-- A moderator warns first; only a warned member can be blocked. A block stays
-- until a pastor/admin lifts it in Canaan → Blocked members.

CREATE TABLE IF NOT EXISTS public.member_blocks (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  reason text,
  blocked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  blocked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.member_conduct_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('warn', 'block', 'unblock')),
  reason text,
  place text CHECK (place IN ('call', 'chat', 'post', 'canaan')),
  channel_id uuid,
  post_id text,
  app text,
  by_user uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_conduct_log_user_idx ON public.member_conduct_log (user_id, created_at DESC);

ALTER TABLE public.member_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_conduct_log ENABLE ROW LEVEL SECURITY;
-- No policies: only the Canaan server (service role) reads or writes these.
REVOKE ALL ON public.member_blocks FROM anon, authenticated;
REVOKE ALL ON public.member_conduct_log FROM anon, authenticated;
