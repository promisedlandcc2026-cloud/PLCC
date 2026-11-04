-- Create teams table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    leader_id UUID REFERENCES public.members(id),
    color TEXT DEFAULT 'bg-burgundy',
    icon_name TEXT DEFAULT 'Star',
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
-- ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone
-- CREATE POLICY "Allow read access to everyone" ON public.teams FOR SELECT USING (true);

-- Allow full access to admins
-- CREATE POLICY "Allow full access to admins" ON public.teams FOR ALL TO authenticated USING (
--     EXISTS (
--         SELECT 1 FROM public.users
--         WHERE id = auth.uid()
--         AND (role ILIKE '%admin%' OR role ILIKE '%super_admin%')
--     )
-- );

-- Create team_members table for tracking who is in what team
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    member_id UUID NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, member_id)
);

-- 🔥 CRITICAL FIX: Force Supabase to reload its API Schema Cache to fix PGRST002
NOTIFY pgrst, 'reload schema';

