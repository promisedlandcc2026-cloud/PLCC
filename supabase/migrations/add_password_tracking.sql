-- Add is_temporary_password to users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_temporary_password BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.users.is_temporary_password IS 'Flag to track if the user is still using an admin-assigned temporary password.';
