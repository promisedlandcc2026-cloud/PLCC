ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS fellowship_online boolean NOT NULL DEFAULT false;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS cover_url text;

COMMENT ON COLUMN public.members.fellowship_online IS
  'Online or Offline choice on the church profile. Stays until the member changes it.';

COMMENT ON COLUMN public.members.cover_url IS
  'https cover banner on the church profile. Empty uses the sanctuary default.';
