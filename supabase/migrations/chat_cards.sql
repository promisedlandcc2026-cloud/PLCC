-- PLCC Chat: event and Serve cards. A card rides on a normal chat message
-- (same posting rules, same room access). Server (service role) only.
-- Also makes sure public.attendance_plans ("I'll be there", shared with Connect) exists.

CREATE TABLE IF NOT EXISTS public.chat_message_cards (
  message_id uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('event', 'serve')),
  ref_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_message_cards ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.attendance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_key text NOT NULL,
  event_id uuid NULL REFERENCES public.events(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  title text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_plans_key_chk CHECK (plan_key ~ '^(event:[0-9a-f-]{36}|sunday:[0-9]{4}-[0-9]{2}-[0-9]{2})$'),
  CONSTRAINT attendance_plans_title_len_chk CHECK (title IS NULL OR char_length(title) <= 200),
  CONSTRAINT attendance_plans_one_per_service UNIQUE (user_id, plan_key)
);
CREATE INDEX IF NOT EXISTS attendance_plans_key_idx ON public.attendance_plans (plan_key);
ALTER TABLE public.attendance_plans ENABLE ROW LEVEL SECURITY;
