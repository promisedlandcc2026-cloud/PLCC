-- Kids View — per-child dashboard theme.
-- Children are already members rows (parent self-serve dependents), so the theme
-- lives on members. No new table. Safe to run more than once.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS kids_theme text NOT NULL DEFAULT 'soft_garden';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_kids_theme_chk'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_kids_theme_chk
      CHECK (kids_theme IN ('soft_garden', 'adventure'));
  END IF;
END $$;

COMMENT ON COLUMN public.members.kids_theme IS
  'Kids View theme for child members: soft_garden | adventure. Ignored for adults.';
