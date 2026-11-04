-- Create ministries table
CREATE TABLE IF NOT EXISTS public.ministries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- Unique constraint to avoid duplicates
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.ministries ENABLE ROW LEVEL SECURITY;

-- Add ministry_id to teams
ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS ministry_id UUID REFERENCES public.ministries(id);

-- Migration: Create ministries from existing distinct categories in teams
INSERT INTO public.ministries (name)
SELECT DISTINCT category 
FROM public.teams
WHERE category IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Update teams to link to ministries
UPDATE public.teams
SET ministry_id = public.ministries.id
FROM public.ministries
WHERE public.teams.category = public.ministries.name;

-- RLS Policies for Ministries

-- Allow admins full access
-- CREATE POLICY "Allow full access to admins"
-- ON public.ministries
-- FOR ALL
-- TO authenticated
-- USING (
--     EXISTS (
--         SELECT 1 FROM public.users
--         WHERE id = auth.uid()
--         AND (role ILIKE '%admin%' OR role ILIKE '%super_admin%')
--     )
-- );

-- Allow read access to everyone authenticated
-- CREATE POLICY "Allow read access to everyone"
-- ON public.ministries
-- FOR SELECT
-- TO authenticated
-- USING (true);

-- Allow anon read access (for public pages if needed, safe for ministries)
-- CREATE POLICY "Allow anon read access"
-- ON public.ministries
-- FOR SELECT
-- TO anon
-- USING (true);
