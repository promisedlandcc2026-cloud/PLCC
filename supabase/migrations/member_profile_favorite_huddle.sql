-- Favorite Community huddle shown on the church profile.
-- Additive. Apply in the Supabase SQL editor before a favorite huddle can be saved on the church record.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS favorite_huddle_id uuid,
  ADD COLUMN IF NOT EXISTS favorite_huddle_name text;

COMMENT ON COLUMN public.members.favorite_huddle_id IS
  'Community channel the member chose as their favorite huddle. Empty when none is chosen.';
COMMENT ON COLUMN public.members.favorite_huddle_name IS
  'Display name of the favorite huddle, saved with the channel so the profile can show it.';
