-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES public.users(id),
    action TEXT NOT NULL,
    details TEXT, 
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    severity TEXT CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'info'
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all logs
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND (role ILIKE '%admin%' OR role = 'SUPER_ADMIN')
        )
    );

-- Policy: Authenticated users can insert logs (for self-audit via API)
-- Ideally, the backend service role handles this, but for now allow auth users to insert
DROP POLICY IF EXISTS "Users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert audit logs" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);
