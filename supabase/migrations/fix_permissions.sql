-- ⚠️ TEMPORARY FIX: Allow PUBLIC DELETE (for development since no users exist)

-- 1. Connect Cards
DROP POLICY IF EXISTS "Allow public delete for connect cards" ON public.connect_cards;
CREATE POLICY "Allow public delete for connect cards" ON public.connect_cards
    FOR DELETE TO anon, authenticated
    USING (true);

-- Also ensure UPDATE is allowed (for approving/rejecting)
DROP POLICY IF EXISTS "Allow public update for connect cards" ON public.connect_cards;
CREATE POLICY "Allow public update for connect cards" ON public.connect_cards
    FOR UPDATE TO anon, authenticated
    USING (true);

-- 2. Team Applications
DROP POLICY IF EXISTS "Allow public delete for team applications" ON public.team_applications;
CREATE POLICY "Allow public delete for team applications" ON public.team_applications
    FOR DELETE TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow public update for team applications" ON public.team_applications;
CREATE POLICY "Allow public update for team applications" ON public.team_applications
    FOR UPDATE TO anon, authenticated
    USING (true);
