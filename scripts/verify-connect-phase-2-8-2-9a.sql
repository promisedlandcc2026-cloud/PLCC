-- =============================================================================
-- Verify Connect Phase 2.8A → 2.8B → 2.9A (Supabase SQL editor)
-- =============================================================================
-- Apply order (skip any already applied):
--   1) supabase/migrations/connect_phase_2_8a_member_profile_privacy.sql
--   2) supabase/migrations/connect_phase_2_8a1_profile_update_hardening.sql
--   3) supabase/migrations/connect_phase_2_8b_member_directory.sql
--   4) supabase/migrations/connect_phase_2_9a_ministry_join_status.sql
--
-- Expect: 6 function names below + member_directory_privacy table.
-- Tip: In the SQL editor, run the RPC SELECT by itself (select that query only)
-- so results are not replaced by the following to_regclass check.
-- =============================================================================

-- RPCs required for Profile, Directory, and ministry join status
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'get_my_member_profile',
    'update_my_member_profile',
    'update_my_directory_privacy',
    'list_member_directory',
    'search_member_directory',
    'get_my_team_applications'
  )
ORDER BY 1;

-- Privacy prefs table (2.8A) — expect: member_directory_privacy
SELECT to_regclass('public.member_directory_privacy') AS member_directory_privacy;
