-- Migration: Minutes Versioning & User Departments

-- 1. Update Users Table with Department association
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='department') THEN
        ALTER TABLE users ADD COLUMN department TEXT;
    END IF;
END $$;

-- 2. Update Minutes Documents Table for Versioning
DO $$ 
BEGIN 
    -- Ensure table exists before altering
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='minutes_documents') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='minutes_documents' AND column_name='version') THEN
            ALTER TABLE minutes_documents ADD COLUMN version INTEGER DEFAULT 1;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='minutes_documents' AND column_name='parent_id') THEN
            ALTER TABLE minutes_documents ADD COLUMN parent_id UUID REFERENCES minutes_documents(id);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='minutes_documents' AND column_name='is_latest') THEN
            ALTER TABLE minutes_documents ADD COLUMN is_latest BOOLEAN DEFAULT true;
        END IF;
    END IF;
END $$;

-- 3. Update Existing Records
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='minutes_documents') THEN
        UPDATE minutes_documents SET parent_id = id WHERE parent_id IS NULL;
    END IF;
END $$;

-- 4. Update Tracking View
-- Drop existing view to avoid "cannot change name of view column" error
DROP VIEW IF EXISTS minutes_tracking_summary;

CREATE VIEW minutes_tracking_summary AS
SELECT 
    d.id as document_id,
    d.title,
    d.department as doc_department,
    u.id as user_id,
    u.name as user_name,
    u.role as user_role,
    u.department as user_department,
    a.signed_at,
    CASE WHEN a.id IS NOT NULL THEN 'read' ELSE 'pending' END as status
FROM minutes_documents d
CROSS JOIN users u
LEFT JOIN minutes_acknowledgements a ON d.id = a.document_id AND u.id = a.user_id
WHERE u.role != 'member'
AND d.is_latest = true;
