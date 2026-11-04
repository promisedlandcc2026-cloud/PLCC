-- Create event_run_of_show table
CREATE TABLE IF NOT EXISTS event_run_of_show (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER DEFAULT 0,
    start_time TIME,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create event_templates table
CREATE TABLE IF NOT EXISTS event_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    items JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE event_run_of_show ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'event_run_of_show' 
        AND policyname = 'Allow authenticated users to manage run of show'
    ) THEN
        CREATE POLICY "Allow authenticated users to manage run of show" ON event_run_of_show
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'event_templates' 
        AND policyname = 'Allow authenticated users to manage templates'
    ) THEN
        CREATE POLICY "Allow authenticated users to manage templates" ON event_templates
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END
$$;
