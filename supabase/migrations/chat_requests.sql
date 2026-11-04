-- PLCC Chat: help requests (ride, visit, meal, errand…) with tracking and assignments.
-- A request rides on a normal chat message (same posting rules, same room access).
-- Server (service role) only: RLS on, no client policies.

CREATE TABLE IF NOT EXISTS public.chat_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('ride', 'visit', 'meal', 'errand', 'other')),
  details text NOT NULL CHECK (char_length(details) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'done', 'cancelled')),
  assignee_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS chat_requests_channel_idx ON public.chat_requests (channel_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_requests_assignee_idx ON public.chat_requests (assignee_id) WHERE assignee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_request_updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.chat_requests(id) ON DELETE CASCADE,
  actor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  note text NULL CHECK (note IS NULL OR char_length(note) <= 500),
  target_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_request_updates_request_idx ON public.chat_request_updates (request_id, created_at);

ALTER TABLE public.chat_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_request_updates ENABLE ROW LEVEL SECURITY;
