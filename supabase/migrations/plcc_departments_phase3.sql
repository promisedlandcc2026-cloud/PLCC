-- PLCC Core Departments — Phase 3 (Nov 25 2026): attendance, reports & performance, requisitions.
-- Run after plcc_departments.sql and plcc_departments_phase2.sql. Server-only like Phases 1–2.
--
-- Requisition flow (UGX): raised by a Treasurer or Head
--   → PENDING_HEAD (skipped when the Head raised it) → PENDING_FINANCE → PENDING_PASTOR → APPROVED → PAID.
-- Any stage can send it back (REJECTED, with a note). A different person must act at each stage,
-- and nobody approves a stage of their own requisition.

CREATE TABLE IF NOT EXISTS public.department_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.department_activities(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  held_on date NOT NULL,
  recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_attendance_sessions_dept_idx ON public.department_attendance_sessions(department_id, held_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS department_attendance_sessions_activity_uq ON public.department_attendance_sessions(activity_id) WHERE activity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.department_attendance (
  session_id uuid NOT NULL REFERENCES public.department_attendance_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('PRESENT','ABSENT','EXCUSED')),
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS department_attendance_user_idx ON public.department_attendance(user_id);

CREATE TABLE IF NOT EXISTS public.department_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('MONTHLY','QUARTERLY','SPECIAL')),
  period_start date NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 3000),
  achievements text NOT NULL DEFAULT '' CHECK (char_length(achievements) <= 3000),
  challenges text NOT NULL DEFAULT '' CHECK (char_length(challenges) <= 3000),
  plans text NOT NULL DEFAULT '' CHECK (char_length(plans) <= 3000),
  support_needed text NOT NULL DEFAULT '' CHECK (char_length(support_needed) <= 3000),
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','REVIEWED','RETURNED')),
  submitted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_reports_dept_idx ON public.department_reports(department_id, period_start DESC);
CREATE UNIQUE INDEX IF NOT EXISTS department_reports_period_uq ON public.department_reports(department_id, period_type, period_start) WHERE period_type <> 'SPECIAL';

CREATE TABLE IF NOT EXISTS public.department_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.department_activities(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  purpose text NOT NULL DEFAULT '' CHECK (char_length(purpose) <= 2000),
  amount_ugx bigint NOT NULL CHECK (amount_ugx BETWEEN 1 AND 100000000000),
  needed_by date,
  status text NOT NULL CHECK (status IN ('PENDING_HEAD','PENDING_FINANCE','PENDING_PASTOR','APPROVED','PAID','REJECTED','CANCELLED')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  head_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  head_at timestamptz,
  finance_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  finance_at timestamptz,
  finance_note text CHECK (finance_note IS NULL OR char_length(finance_note) <= 500),
  pastor_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  pastor_at timestamptz,
  rejected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_stage text,
  reject_note text CHECK (reject_note IS NULL OR char_length(reject_note) <= 500),
  paid_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_reference text CHECK (paid_reference IS NULL OR char_length(paid_reference) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_requisitions_dept_idx ON public.department_requisitions(department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS department_requisitions_status_idx ON public.department_requisitions(status);

ALTER TABLE public.department_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_requisitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.department_attendance_sessions, public.department_attendance, public.department_reports, public.department_requisitions FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
