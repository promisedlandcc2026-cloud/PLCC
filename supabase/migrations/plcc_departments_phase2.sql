-- PLCC Core Departments — Phase 2 (Nov 25 2026): activities with approval, announcements,
-- notifications. Run after plcc_departments.sql. Server-only like Phase 1.
--
-- Activity flow: planner submits (PENDING) → a Pastor or the Apostle APPROVES or REJECTS (with a note)
-- → rejected activities can be edited and resubmitted → approved ones can be CANCELLED or marked COMPLETED.

CREATE TABLE IF NOT EXISTS public.department_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  location text NOT NULL DEFAULT '' CHECK (char_length(location) <= 160),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  budget_ugx bigint CHECK (budget_ugx IS NULL OR budget_ugx BETWEEN 0 AND 100000000000),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','COMPLETED')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  completion_note text CHECK (completion_note IS NULL OR char_length(completion_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS department_activities_dept_idx ON public.department_activities(department_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS department_activities_pending_idx ON public.department_activities(status) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS public.department_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_announcements_dept_idx ON public.department_announcements(department_id, created_at DESC);

ALTER TABLE public.department_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.department_activities, public.department_announcements FROM anon, authenticated;

-- Bell notifications for departments (type 'department'). NOT VALID keeps old rows untouched.
ALTER TABLE public.user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;
ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_type_check CHECK (
  type IN (
    'announcement','prayer','assignment','community_mention','community_reply','community_dm',
    'community_huddle_started','community_feed_comment','community_feed_mention_post',
    'community_feed_mention_comment','event_approval','kids_bucks_award','celebration','department'
  )
) NOT VALID;

NOTIFY pgrst, 'reload schema';
