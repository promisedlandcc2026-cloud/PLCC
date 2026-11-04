-- PLCC Bucks Phase 3 — parent inbox when a child earns Bucks.
-- Run in the Supabase SQL editor after events_approval_flow.sql.
-- Keeps every type that constraint already allows, and adds kids_bucks_award.
-- One notice per parent per ledger entry.

BEGIN;

ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_type_check
  CHECK (
    type IN (
      'announcement',
      'prayer',
      'assignment',
      'community_mention',
      'community_reply',
      'community_dm',
      'community_huddle_started',
      'community_feed_comment',
      'community_feed_mention_post',
      'community_feed_mention_comment',
      'event_approval',
      'kids_bucks_award'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_kids_bucks_award_dedupe_idx
  ON public.user_notifications (user_id, type, source_id)
  WHERE type = 'kids_bucks_award' AND source_id IS NOT NULL;

COMMIT;
