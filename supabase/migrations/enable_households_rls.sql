-- 1. Add user_id column referencing auth.users
ALTER TABLE "public"."households" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Enable Row Level Security
ALTER TABLE "public"."households" ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Policy for SELECT: Users can only see their own household records
DROP POLICY IF EXISTS "households_select_owner" ON "public"."households";
CREATE POLICY "households_select_owner" ON "public"."households" 
FOR SELECT 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- Policy for INSERT: Users can only insert records for themselves
DROP POLICY IF EXISTS "households_insert_owner" ON "public"."households";
CREATE POLICY "households_insert_owner" ON "public"."households" 
FOR INSERT 
TO authenticated 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for UPDATE: Users can only update their own records
DROP POLICY IF EXISTS "households_update_owner" ON "public"."households";
CREATE POLICY "households_update_owner" ON "public"."households" 
FOR UPDATE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id) 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for DELETE: Users can only delete their own records
DROP POLICY IF EXISTS "households_delete_owner" ON "public"."households";
CREATE POLICY "households_delete_owner" ON "public"."households" 
FOR DELETE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- 4. Add index on user_id for performance
CREATE INDEX IF NOT EXISTS households_user_id_idx ON "public"."households"(user_id);
