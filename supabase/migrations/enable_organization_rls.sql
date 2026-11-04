-- 1. Add user_id column referencing auth.users
ALTER TABLE "public"."organization_settings" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Enable Row Level Security
ALTER TABLE "public"."organization_settings" ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Policy for SELECT: All authenticated users can read organization settings
DROP POLICY IF EXISTS "organization_settings_select_authenticated" ON "public"."organization_settings";
CREATE POLICY "organization_settings_select_authenticated" ON "public"."organization_settings" 
FOR SELECT 
TO authenticated 
USING (true);

-- Policy for INSERT: Users can only insert records for themselves
DROP POLICY IF EXISTS "organization_settings_insert_owner" ON "public"."organization_settings";
CREATE POLICY "organization_settings_insert_owner" ON "public"."organization_settings" 
FOR INSERT 
TO authenticated 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for UPDATE: Users can only update their own records
DROP POLICY IF EXISTS "organization_settings_update_owner" ON "public"."organization_settings";
CREATE POLICY "organization_settings_update_owner" ON "public"."organization_settings" 
FOR UPDATE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id) 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for DELETE: Users can only delete their own records
DROP POLICY IF EXISTS "organization_settings_delete_owner" ON "public"."organization_settings";
CREATE POLICY "organization_settings_delete_owner" ON "public"."organization_settings" 
FOR DELETE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- 4. Add index on user_id for performance
CREATE INDEX IF NOT EXISTS organization_settings_user_id_idx ON "public"."organization_settings"(user_id);
