ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS address_as text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_address_as_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_address_as_check
      CHECK (address_as IS NULL OR address_as IN ('brother', 'sister'));
  END IF;
END $$;

COMMENT ON COLUMN public.members.address_as IS
  'How an adult member is addressed: brother or sister. Empty keeps the given name.';
