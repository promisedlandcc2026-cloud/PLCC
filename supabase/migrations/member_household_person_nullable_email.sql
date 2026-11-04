-- A household child or adult added from My Family has no login, so email can be empty.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'members'
      AND column_name = 'email'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.members ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.members.email IS
  'Login email when the member has an account. Empty for a household child or adult added without a login.';
