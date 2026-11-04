-- Community channel voice huddle attendance (Pastor / staff roster).
-- Written by LiveKit webhook via service role; reads go through vault API.

CREATE TABLE IF NOT EXISTS public.community_huddle_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  room_name text NOT NULL,
  room_sid text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_huddle_sessions_room_sid_uidx
  ON public.community_huddle_sessions (room_sid)
  WHERE room_sid IS NOT NULL AND length(trim(room_sid)) > 0;

CREATE INDEX IF NOT EXISTS community_huddle_sessions_channel_started_idx
  ON public.community_huddle_sessions (channel_id, started_at DESC);

CREATE INDEX IF NOT EXISTS community_huddle_sessions_channel_open_idx
  ON public.community_huddle_sessions (channel_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.community_huddle_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.community_huddle_sessions (id) ON DELETE CASCADE,
  user_id uuid,
  display_name text NOT NULL DEFAULT 'Participant',
  identity text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_huddle_attendance_session_identity_uidx UNIQUE (session_id, identity)
);

CREATE INDEX IF NOT EXISTS community_huddle_attendance_session_idx
  ON public.community_huddle_attendance (session_id, joined_at);

CREATE INDEX IF NOT EXISTS community_huddle_attendance_user_idx
  ON public.community_huddle_attendance (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.community_huddle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_huddle_attendance ENABLE ROW LEVEL SECURITY;

-- No direct client policies: service role (webhook + vault) bypasses RLS.
COMMENT ON TABLE public.community_huddle_sessions IS
  'One LiveKit voice room session per community channel huddle';
COMMENT ON TABLE public.community_huddle_attendance IS
  'Join/leave rows for community_huddle_sessions; identity = LiveKit participant identity';
