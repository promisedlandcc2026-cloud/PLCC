-- 1. Add user_id column to finance_counting_sessions
ALTER TABLE "public"."finance_counting_sessions" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Add user_id column to finance_counting_details
ALTER TABLE "public"."finance_counting_details" 
ADD COLUMN IF NOT EXISTS "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 3. Enable Row Level Security on both tables
ALTER TABLE "public"."finance_counting_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."finance_counting_details" ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for finance_counting_sessions

DROP POLICY IF EXISTS "finance_counting_sessions_select_owner" ON "public"."finance_counting_sessions";
CREATE POLICY "finance_counting_sessions_select_owner" ON "public"."finance_counting_sessions" 
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "finance_counting_sessions_insert_owner" ON "public"."finance_counting_sessions";
CREATE POLICY "finance_counting_sessions_insert_owner" ON "public"."finance_counting_sessions" 
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "finance_counting_sessions_update_owner" ON "public"."finance_counting_sessions";
CREATE POLICY "finance_counting_sessions_update_owner" ON "public"."finance_counting_sessions" 
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "finance_counting_sessions_delete_owner" ON "public"."finance_counting_sessions";
CREATE POLICY "finance_counting_sessions_delete_owner" ON "public"."finance_counting_sessions" 
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 5. Create RLS Policies for finance_counting_details

DROP POLICY IF EXISTS "finance_counting_details_select_owner" ON "public"."finance_counting_details";
CREATE POLICY "finance_counting_details_select_owner" ON "public"."finance_counting_details" 
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "finance_counting_details_insert_owner" ON "public"."finance_counting_details";
CREATE POLICY "finance_counting_details_insert_owner" ON "public"."finance_counting_details" 
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "finance_counting_details_update_owner" ON "public"."finance_counting_details";
CREATE POLICY "finance_counting_details_update_owner" ON "public"."finance_counting_details" 
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "finance_counting_details_delete_owner" ON "public"."finance_counting_details";
CREATE POLICY "finance_counting_details_delete_owner" ON "public"."finance_counting_details" 
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 6. Add indexes on user_id for performance
CREATE INDEX IF NOT EXISTS finance_counting_sessions_user_id_idx ON "public"."finance_counting_sessions"(user_id);
CREATE INDEX IF NOT EXISTS finance_counting_details_user_id_idx ON "public"."finance_counting_details"(user_id);
