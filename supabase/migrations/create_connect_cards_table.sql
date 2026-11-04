-- Create connect_cards table
CREATE TABLE IF NOT EXISTS public.connect_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    status TEXT DEFAULT 'new'
);

-- Enable RLS
ALTER TABLE public.connect_cards ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Allow public insert for connect cards" ON public.connect_cards;
DROP POLICY IF EXISTS "Admins can view connect cards" ON public.connect_cards;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.connect_cards;

-- Allow anyone to submit a connect card (public form)
CREATE POLICY "Allow public insert for connect cards" ON public.connect_cards
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Allow any authenticated user to read/update/delete (admin check is done in app layer)
CREATE POLICY "Allow authenticated full access" ON public.connect_cards
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
