-- 1. Add user_id column referencing auth.users
ALTER TABLE "public"."attendance" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Enable Row Level Security
ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Policy for SELECT: Users can only see their own attendance records
DROP POLICY IF EXISTS "attendance_select" ON "public"."attendance";
CREATE POLICY "attendance_select" ON "public"."attendance" 
FOR SELECT 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- Policy for INSERT: Users can only insert records for themselves
DROP POLICY IF EXISTS "attendance_insert" ON "public"."attendance";
CREATE POLICY "attendance_insert" ON "public"."attendance" 
FOR INSERT 
TO authenticated 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for UPDATE: Users can only update their own records
DROP POLICY IF EXISTS "attendance_update" ON "public"."attendance";
CREATE POLICY "attendance_update" ON "public"."attendance" 
FOR UPDATE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id) 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for DELETE: Users can only delete their own records
DROP POLICY IF EXISTS "attendance_delete" ON "public"."attendance";
CREATE POLICY "attendance_delete" ON "public"."attendance" 
FOR DELETE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- 4. Add index on user_id for performance
CREATE INDEX IF NOT EXISTS attendance_user_id_idx ON "public"."attendance"(user_id);

-- 5. Service Role bypasses RLS (Default Supabase behavior, but explicitly noted here)
-- ALTER TABLE "public"."attendance" FORCE ROW LEVEL SECURITY; -- Not used, as service_role needs access.
