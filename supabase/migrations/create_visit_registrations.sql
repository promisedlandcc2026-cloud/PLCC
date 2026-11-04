
-- Create visit_registrations table
CREATE TABLE IF NOT EXISTS visit_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_name TEXT NOT NULL,
    preferred_date DATE NOT NULL,
    family_size TEXT,
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE visit_registrations ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (from awc-connect)
-- We check if the policy exists first to avoid errors on re-run
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'visit_registrations' 
        AND policyname = 'Allow anonymous inserts'
    ) THEN
        CREATE POLICY "Allow anonymous inserts" ON visit_registrations
        FOR INSERT TO anon
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'visit_registrations' 
        AND policyname = 'Allow authenticated users to manage'
    ) THEN
        CREATE POLICY "Allow authenticated users to manage" ON visit_registrations
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END
$$;
