-- 1. Add user_id column referencing auth.users
ALTER TABLE "public"."finance_ledger" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Enable Row Level Security
ALTER TABLE "public"."finance_ledger" ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Policy for SELECT: Users can only see their own ledger records
DROP POLICY IF EXISTS "finance_ledger_select_owner" ON "public"."finance_ledger";
CREATE POLICY "finance_ledger_select_owner" ON "public"."finance_ledger" 
FOR SELECT 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- Policy for INSERT: Users can only insert records for themselves
DROP POLICY IF EXISTS "finance_ledger_insert_owner" ON "public"."finance_ledger";
CREATE POLICY "finance_ledger_insert_owner" ON "public"."finance_ledger" 
FOR INSERT 
TO authenticated 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for UPDATE: Users can only update their own records
DROP POLICY IF EXISTS "finance_ledger_update_owner" ON "public"."finance_ledger";
CREATE POLICY "finance_ledger_update_owner" ON "public"."finance_ledger" 
FOR UPDATE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id) 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for DELETE: Users can only delete their own records
DROP POLICY IF EXISTS "finance_ledger_delete_owner" ON "public"."finance_ledger";
CREATE POLICY "finance_ledger_delete_owner" ON "public"."finance_ledger" 
FOR DELETE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- 4. Add index on user_id for performance
CREATE INDEX IF NOT EXISTS finance_ledger_user_id_idx ON "public"."finance_ledger"(user_id);
