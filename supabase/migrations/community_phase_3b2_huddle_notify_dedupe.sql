-- PLCC Community Phase 3B.2 — atomic huddle-start notification dedupe
-- Partial unique index only. Does NOT change notification types or other schema.
-- DO NOT apply until manually approved.

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_huddle_started_dedupe_idx
  ON public.user_notifications (user_id, type, source_id)
  WHERE type = 'community_huddle_started'
    AND source_id IS NOT NULL;
