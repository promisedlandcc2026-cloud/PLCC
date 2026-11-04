-- Membership month and ministry badges shown on the church profile.
-- Additive. Apply in the Supabase SQL editor so Member Since and Volunteer Badges stay on the church record.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS joined_on date,
  ADD COLUMN IF NOT EXISTS volunteer_badges jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.members.joined_on IS
  'Month the member joined Promised Land Christian Center. Empty until they set Member Since.';
COMMENT ON COLUMN public.members.volunteer_badges IS
  'Ministry badges on the church profile, as [{category, active}].';
