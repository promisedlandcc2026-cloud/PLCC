-- SQL Migration: Meeting Minutes & Acknowledgement System
-- Purpose: Track meeting records and user read receipts.

-- 1. Create Minutes Documents Table
CREATE TABLE IF NOT EXISTS minutes_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    meeting_date DATE NOT NULL,
    department TEXT NOT NULL, -- Leadership / Youth / Worship / Finance / etc
    summary TEXT,
    content TEXT, -- Markdown or plain text
    file_url TEXT, -- If PDF is uploaded
    require_signature BOOLEAN DEFAULT true,
    deadline TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id), -- Links to Supabase Auth
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Acknowledgements Table
CREATE TABLE IF NOT EXISTS minutes_acknowledgements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES minutes_documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'read', -- 'read'
    ip_address TEXT,
    user_agent TEXT,
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure a user can only sign once per document
    CONSTRAINT unique_user_acknowledgement UNIQUE (document_id, user_id)
);

-- 3. Add Row Level Security (RLS)
ALTER TABLE minutes_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE minutes_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Policies for minutes_documents
CREATE POLICY "Minutes are viewable by all authenticated users" 
ON minutes_documents FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage minutes" 
ON minutes_documents FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'pastor')
    )
);

-- Policies for minutes_acknowledgements
CREATE POLICY "Users can view their own acknowledgements" 
ON minutes_acknowledgements FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all acknowledgements" 
ON minutes_acknowledgements FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'pastor')
    )
);

CREATE POLICY "Users can sign minutes" 
ON minutes_acknowledgements FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- 4. Helper Function for Admin Tracking
-- (Optional) This can be handled directly via joins, but a view helps for the Admin Tracking Page
CREATE OR REPLACE VIEW minutes_tracking_summary AS
SELECT 
    d.id as document_id,
    d.title,
    u.id as user_id,
    u.name as user_name,
    u.role as user_role,
    a.signed_at,
    CASE WHEN a.id IS NOT NULL THEN 'read' ELSE 'pending' END as status
FROM minutes_documents d
CROSS JOIN users u
LEFT JOIN minutes_acknowledgements a ON d.id = a.document_id AND u.id = a.user_id
WHERE u.role != 'member'; -- Tracking primarily for leaders/admins
