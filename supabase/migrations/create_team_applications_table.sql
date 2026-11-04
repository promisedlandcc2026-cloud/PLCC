-- Create team_applications table
CREATE TABLE IF NOT EXISTS public.team_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    team_id TEXT NOT NULL,
    experience TEXT
);

-- Enable RLS
ALTER TABLE public.team_applications ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public insert (for landing page sign-ups)
DROP POLICY IF EXISTS "Allow public insert for team applications" ON public.team_applications;
CREATE POLICY "Allow public insert for team applications" ON public.team_applications
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Policy: Admins can view applications
DROP POLICY IF EXISTS "Admins can view team applications" ON public.team_applications;
CREATE POLICY "Admins can view team applications" ON public.team_applications
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND (role ILIKE '%admin%' OR role = 'SUPER_ADMIN' OR role = 'PASTOR')
        )
    );
