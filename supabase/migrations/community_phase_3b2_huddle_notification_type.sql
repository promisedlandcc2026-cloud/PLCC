-- PLCC Community Phase 3B.2 — widen user_notifications.type CHECK
-- Adds community_huddle_started only. Additive / non-destructive.

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
      'community_huddle_started'
    )
  );
