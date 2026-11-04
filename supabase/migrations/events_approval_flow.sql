-- Event calendar request → approve flow
-- status on events; approver config; widen user_notifications for event_approval
-- DO NOT apply automatically; review before live apply.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) events approval columns
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.events
      ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'submitted_by'
  ) THEN
    ALTER TABLE public.events ADD COLUMN submitted_by UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE public.events ADD COLUMN approved_by UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE public.events ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'department'
  ) THEN
    ALTER TABLE public.events ADD COLUMN department TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.events ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Existing rows stay live on the calendar
UPDATE public.events SET status = 'approved' WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS events_status_date_idx
  ON public.events (status, date);

CREATE INDEX IF NOT EXISTS events_submitted_by_idx
  ON public.events (submitted_by)
  WHERE submitted_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Approver config (singleton). Seed Jerless via known ops email when present.
--    Runtime also honors EVENT_APPROVER_USER_IDS env (comma-separated UUIDs).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_approver_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  user_ids UUID[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.event_approver_config (id, user_ids)
VALUES (1, '{}')
ON CONFLICT (id) DO NOTHING;

UPDATE public.event_approver_config c
SET
  user_ids = (
    SELECT COALESCE(array_agg(DISTINCT u.id), '{}'::uuid[])
    FROM public.users u
    WHERE lower(trim(u.email)) = 'jerlessm@gmail.com'
  ),
  updated_at = now()
WHERE c.id = 1
  AND (
    c.user_ids IS NULL
    OR cardinality(c.user_ids) = 0
  )
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE lower(trim(u.email)) = 'jerlessm@gmail.com'
  );

ALTER TABLE public.event_approver_config ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Widen user_notifications.type for event_approval
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_type_check
  CHECK (
    type IN (
      'announcement',
      'prayer',
      'assignment',
      'community_mention',
      'community_reply',
      'community_dm',
      'community_huddle_started',
      'community_feed_comment',
      'community_feed_mention_post',
      'community_feed_mention_comment',
      'event_approval'
    )
  );

COMMIT;
