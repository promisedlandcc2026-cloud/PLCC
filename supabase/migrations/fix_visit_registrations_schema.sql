-- Comprehensive Fix for visit_registrations table
DO $$ 
BEGIN
    -- 1. Add missing columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_registrations' AND column_name = 'email') THEN
        ALTER TABLE public.visit_registrations ADD COLUMN email TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_registrations' AND column_name = 'phone') THEN
        ALTER TABLE public.visit_registrations ADD COLUMN phone TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_registrations' AND column_name = 'notes') THEN
        ALTER TABLE public.visit_registrations ADD COLUMN notes TEXT;
    END IF;

    -- 2. Ensure status has a default
    ALTER TABLE public.visit_registrations ALTER COLUMN status SET DEFAULT 'Pending';
END $$;

-- Enable RLS (Should already be enabled but just in case)
ALTER TABLE public.visit_registrations ENABLE ROW LEVEL SECURITY;

-- Ensure anonymous inserts are allowed (for awc-connect)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'visit_registrations' 
        AND policyname = 'Allow anonymous inserts'
    ) THEN
        CREATE POLICY "Allow anonymous inserts" ON public.visit_registrations
        FOR INSERT TO anon
        WITH CHECK (true);
    END IF;
END $$;

-- Refresh Supabase Cache
NOTIFY pgrst, 'reload schema';
