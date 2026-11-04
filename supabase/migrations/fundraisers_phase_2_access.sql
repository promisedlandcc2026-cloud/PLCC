-- Fundraiser access switch: lets chosen members (and Accountants) use Fundraisers on top of their role.
-- Super Admin, Admin, Pastor, First Lady, Secretary, Asst. Secretary and Finance have access by role.
-- Only changed through the Fundraisers API (never the self-profile update). Safe to run more than once.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fundraiser_access boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fundraiser_access_granted_by uuid;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fundraiser_access_granted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_fundraiser_access ON public.users (fundraiser_access) WHERE fundraiser_access;

-- Anyone already given the Accountant role gets the switch on.
UPDATE public.users SET fundraiser_access = true, fundraiser_access_granted_at = now()
WHERE upper(role) = 'ACCOUNTANT' AND fundraiser_access = false;
