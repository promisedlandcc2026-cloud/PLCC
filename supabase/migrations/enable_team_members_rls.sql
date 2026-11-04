-- 1. Add user_id column referencing auth.users
ALTER TABLE "public"."team_members" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Enable Row Level Security
ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Policy for SELECT: Users can only see their own team member records
DROP POLICY IF EXISTS "team_members_select_owner" ON "public"."team_members";
CREATE POLICY "team_members_select_owner" ON "public"."team_members" 
FOR SELECT 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- Policy for INSERT: Users can only insert records for themselves
DROP POLICY IF EXISTS "team_members_insert_owner" ON "public"."team_members";
CREATE POLICY "team_members_insert_owner" ON "public"."team_members" 
FOR INSERT 
TO authenticated 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for UPDATE: Users can only update their own records
DROP POLICY IF EXISTS "team_members_update_owner" ON "public"."team_members";
CREATE POLICY "team_members_update_owner" ON "public"."team_members" 
FOR UPDATE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id) 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for DELETE: Users can only delete their own records
DROP POLICY IF EXISTS "team_members_delete_owner" ON "public"."team_members";
CREATE POLICY "team_members_delete_owner" ON "public"."team_members" 
FOR DELETE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- 4. Add index on user_id for performance
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON "public"."team_members"(user_id);
