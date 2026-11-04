-- Add primary_contact_id to organization_settings
ALTER TABLE public.organization_settings 
ADD COLUMN IF NOT EXISTS primary_contact_id UUID REFERENCES public.users(id);

-- Update the view/select permissions if necessary (usually handled by RBAC)
COMMENT ON COLUMN public.organization_settings.primary_contact_id IS 'Designated staff member for official church communication.';
