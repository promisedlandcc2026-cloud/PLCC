-- Spiritual milestones shown on the church profile.
-- Additive. Apply in the Supabase SQL editor so Membership Journey stays on the church record.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS journey_milestones jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.members.journey_milestones IS
  'Membership journey milestones on the church profile, as [{id, title, date, category, description, officiatedBy}].';
