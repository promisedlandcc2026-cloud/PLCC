-- Add created_by column to security_logs table
ALTER TABLE public.security_logs 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);

-- Update RLS policies to allow users to edit/delete their own rows
DROP POLICY IF EXISTS "Allow delete access to all authenticated users" ON public.security_logs;

CREATE POLICY "Allow delete access to owners and admins"
ON public.security_logs
FOR DELETE
TO authenticated
USING (
    created_by = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (role ILIKE '%admin%' OR role ILIKE '%security%')
    )
);

CREATE POLICY "Allow update access to owners and admins"
ON public.security_logs
FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (role ILIKE '%admin%' OR role ILIKE '%security%')
    )
);
