-- Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT CHECK (type IN ('MESSAGE', 'UPDATE', 'EVENT', 'ANNOUNCEMENT', 'PRAYER_REQUEST')) NOT NULL,
    image_url TEXT,
    event_date TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id)
);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
CREATE POLICY "Admins can manage announcements" ON public.announcements
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND (role ILIKE '%admin%' OR role = 'SUPER_ADMIN')
        )
    );

-- Policy: Everyone can view (if it's for public consumption, otherwise restrict)
-- Assuming these are public announcements for the app
DROP POLICY IF EXISTS "Everyone can view announcements" ON public.announcements;
CREATE POLICY "Everyone can view announcements" ON public.announcements
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Anon can view announcements" ON public.announcements;
CREATE POLICY "Anon can view announcements" ON public.announcements
    FOR SELECT TO anon
    USING (true);
