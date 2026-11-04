-- 1. Add user_id column referencing auth.users
ALTER TABLE "public"."finance_funds" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Enable Row Level Security
ALTER TABLE "public"."finance_funds" ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Policy for SELECT: Users can only see their own fund records
DROP POLICY IF EXISTS "finance_funds_select_owner" ON "public"."finance_funds";
CREATE POLICY "finance_funds_select_owner" ON "public"."finance_funds" 
FOR SELECT 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- Policy for INSERT: Users can only insert records for themselves
DROP POLICY IF EXISTS "finance_funds_insert_owner" ON "public"."finance_funds";
CREATE POLICY "finance_funds_insert_owner" ON "public"."finance_funds" 
FOR INSERT 
TO authenticated 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for UPDATE: Users can only update their own records
DROP POLICY IF EXISTS "finance_funds_update_owner" ON "public"."finance_funds";
CREATE POLICY "finance_funds_update_owner" ON "public"."finance_funds" 
FOR UPDATE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id) 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for DELETE: Users can only delete their own records
DROP POLICY IF EXISTS "finance_funds_delete_owner" ON "public"."finance_funds";
CREATE POLICY "finance_funds_delete_owner" ON "public"."finance_funds" 
FOR DELETE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- 4. Add index on user_id for performance
CREATE INDEX IF NOT EXISTS finance_funds_user_id_idx ON "public"."finance_funds"(user_id);
