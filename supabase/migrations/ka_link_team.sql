-- Ka Link team (Phase 3, Nov 2026)
--   admin  = may start the prayer-room Ka Links (Morning Glory, Lunch Hour,
--            Midnight Watch, Upper Room, Intercessors)
--   leader = altar leaders / those serving (e.g. Pr. Grace): reserved seat,
--            never sent to overflow, "I'm ready" button
-- Managed in PLCC Canaan → Admin → Ka Link Team. Server-only (service role).
CREATE TABLE IF NOT EXISTS public.ka_link_team (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  team_role text NOT NULL CHECK (team_role IN ('admin', 'leader')),
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ka_link_team ENABLE ROW LEVEL SECURITY;
-- No policies: only the Canaan server (service role) reads or writes this table.
REVOKE ALL ON public.ka_link_team FROM anon, authenticated;
