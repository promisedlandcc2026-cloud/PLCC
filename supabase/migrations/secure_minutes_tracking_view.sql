-- 1. Drop the existing view (avoids issues if it was SECURITY DEFINER)
DROP VIEW IF EXISTS "public"."minutes_tracking_summary";

-- 2. Recreate the view as a standard view (defaults to SECURITY INVOKER)
-- This ensures that the view respects the RLS of the underlying tables
CREATE VIEW "public"."minutes_tracking_summary" AS
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

-- 3. Grand select permission to authenticated users
GRANT SELECT ON "public"."minutes_tracking_summary" TO authenticated;
