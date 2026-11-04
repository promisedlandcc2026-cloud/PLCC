-- 1. Add user_id column referencing auth.users
ALTER TABLE "public"."videos" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Enable Row Level Security
ALTER TABLE "public"."videos" ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Policy for SELECT: Users can only see their own video records
DROP POLICY IF EXISTS "videos_select_owner" ON "public"."videos";
CREATE POLICY "videos_select_owner" ON "public"."videos" 
FOR SELECT 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- Policy for INSERT: Users can only insert records for themselves
DROP POLICY IF EXISTS "videos_insert_owner" ON "public"."videos";
CREATE POLICY "videos_insert_owner" ON "public"."videos" 
FOR INSERT 
TO authenticated 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for UPDATE: Users can only update their own records
DROP POLICY IF EXISTS "videos_update_owner" ON "public"."videos";
CREATE POLICY "videos_update_owner" ON "public"."videos" 
FOR UPDATE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id) 
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy for DELETE: Users can only delete their own records
DROP POLICY IF EXISTS "videos_delete_owner" ON "public"."videos";
CREATE POLICY "videos_delete_owner" ON "public"."videos" 
FOR DELETE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

-- 4. Add index on user_id for performance
CREATE INDEX IF NOT EXISTS videos_user_id_idx ON "public"."videos"(user_id);
