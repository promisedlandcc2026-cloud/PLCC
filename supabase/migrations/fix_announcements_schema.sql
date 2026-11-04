-- Fix for missing 'content' column in announcements table
DO $$ 
BEGIN
    -- 1. Add missing columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'title') THEN
        ALTER TABLE public.announcements ADD COLUMN title TEXT NOT NULL DEFAULT 'Untitled';
        ALTER TABLE public.announcements ALTER COLUMN title DROP DEFAULT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'content') THEN
        ALTER TABLE public.announcements ADD COLUMN content TEXT NOT NULL DEFAULT 'No content provided';
        ALTER TABLE public.announcements ALTER COLUMN content DROP DEFAULT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'type') THEN
        ALTER TABLE public.announcements ADD COLUMN type TEXT NOT NULL DEFAULT 'ANNOUNCEMENT';
        ALTER TABLE public.announcements ALTER COLUMN type DROP DEFAULT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'event_date') THEN
        ALTER TABLE public.announcements ADD COLUMN event_date TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'image_url') THEN
        ALTER TABLE public.announcements ADD COLUMN image_url TEXT;
    END IF;

    -- 2. Ensure 'created_by' exists and is a UUID
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'created_by') THEN
        ALTER TABLE public.announcements ADD COLUMN created_by UUID REFERENCES public.users(id);
    END IF;

    -- 3. Ensure 'type' check constraint is correct
    -- (This ensures the enum matches the types.ts definition)
    -- This part is optional but recommended
END $$;

-- Refresh the schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
