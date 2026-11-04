-- Several Community huddles shown on the church profile.
-- Additive. Apply in the Supabase SQL editor before more than one huddle can be saved on the church record.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS favorite_huddles jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.members.favorite_huddles IS
  'Community huddles the member shows on their profile, as [{id, name}]. Up to 8.';
