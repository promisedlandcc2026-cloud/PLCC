-- Migration: Add signature support to acknowledgements
ALTER TABLE public.minutes_acknowledgements 
ADD COLUMN IF NOT EXISTS signature_data TEXT;

-- Update view to include signatures
DROP VIEW IF EXISTS minutes_tracking_summary;
CREATE OR REPLACE VIEW minutes_tracking_summary AS
SELECT 
    d.id as document_id,
    d.title,
    d.department as doc_department,
    u.id as user_id,
    u.name as user_name,
    u.role as user_role,
    u.department as user_department,
    a.signed_at,
    a.signature_data,
    CASE WHEN a.id IS NOT NULL THEN 'read' ELSE 'pending' END as status
FROM minutes_documents d
CROSS JOIN users u
LEFT JOIN minutes_acknowledgements a ON d.id = a.document_id AND u.id = a.user_id
WHERE u.role != 'member';
