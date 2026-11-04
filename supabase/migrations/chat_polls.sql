-- PLCC Chat polls. A poll rides on a normal chat message (same posting rules,
-- same room access); votes are one row per member per chosen option.
-- Server (service role) only: RLS on, no client policies.

CREATE TABLE IF NOT EXISTS public.chat_polls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 300),
  options jsonb NOT NULL,
  multi boolean NOT NULL DEFAULT false,
  anonymous boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_polls_channel_idx ON public.chat_polls (channel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id, option_id)
);
CREATE INDEX IF NOT EXISTS chat_poll_votes_poll_idx ON public.chat_poll_votes (poll_id);

ALTER TABLE public.chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;
