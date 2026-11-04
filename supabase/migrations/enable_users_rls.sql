-- 1. Enable Row Level Security
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS Policies

-- Policy for SELECT: Users can see their own record, or Admins can see all
DROP POLICY IF EXISTS "users_select_policy" ON "public"."users";
CREATE POLICY "users_select_policy" ON "public"."users" 
FOR SELECT 
TO authenticated 
USING (
  (SELECT auth.uid()) = id 
  OR 
  (EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = (SELECT auth.uid()) 
    AND role IN ('SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE')
  ))
);

-- Policy for INSERT: Only Admins can create new users via PostgREST
DROP POLICY IF EXISTS "users_insert_policy" ON "public"."users";
CREATE POLICY "users_insert_policy" ON "public"."users" 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = (SELECT auth.uid()) 
    AND role IN ('SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE')
  )
);

-- Policy for UPDATE: Users can update their own record, or Admins can update any
DROP POLICY IF EXISTS "users_update_policy" ON "public"."users";
CREATE POLICY "users_update_policy" ON "public"."users" 
FOR UPDATE 
TO authenticated 
USING (
  (SELECT auth.uid()) = id 
  OR 
  (EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = (SELECT auth.uid()) 
    AND role IN ('SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE')
  ))
)
WITH CHECK (
  (SELECT auth.uid()) = id 
  OR 
  (EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = (SELECT auth.uid()) 
    AND role IN ('SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE')
  ))
);

-- Policy for DELETE: Only Admins can delete users
DROP POLICY IF EXISTS "users_delete_policy" ON "public"."users";
CREATE POLICY "users_delete_policy" ON "public"."users" 
FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = (SELECT auth.uid()) 
    AND role IN ('SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE')
  )
);
