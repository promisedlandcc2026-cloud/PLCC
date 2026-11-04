-- Member spiritual journey text shown on the church profile.
-- Additive. Apply in the Supabase SQL editor before bios can be saved on the church record.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS bio text;

COMMENT ON COLUMN public.members.bio IS
  'Spiritual journey and bio for the church profile. Empty when the member has not written one.';
