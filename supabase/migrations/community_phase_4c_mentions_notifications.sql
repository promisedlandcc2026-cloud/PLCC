-- PLCC Community Phase 4C — Feed mentions + notification type widen (ADDITIVE)
-- DO NOT apply automatically; review before live apply.
--
-- Reuses public.user_notifications (no second inbox table).
-- Reaction notifications are deferred (spam risk); comment + mention only.
-- Mentions stored relationally; content uses structured @[Name](mention:uuid) tokens.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Widen user_notifications.type CHECK for Feed activity types
-- ---------------------------------------------------------------------------
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
      'community_feed_mention_comment'
    )
  );

-- Idempotent mention notification rows: one per (user, type, source) for Feed mention types.
-- source_id = post_id or comment_id that contains the mention.
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_feed_mention_dedupe_idx
  ON public.user_notifications (user_id, type, source_id)
  WHERE type IN ('community_feed_mention_post', 'community_feed_mention_comment')
    AND source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) community_feed_mentions (relational; service-role API)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_feed_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  comment_id uuid NULL REFERENCES public.feed_comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_feed_mentions_target_xor_check CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL)
    OR (post_id IS NULL AND comment_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS community_feed_mentions_post_user_uidx
  ON public.community_feed_mentions (post_id, mentioned_user_id)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS community_feed_mentions_comment_user_uidx
  ON public.community_feed_mentions (comment_id, mentioned_user_id)
  WHERE comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS community_feed_mentions_mentioned_idx
  ON public.community_feed_mentions (mentioned_user_id);

CREATE INDEX IF NOT EXISTS community_feed_mentions_created_idx
  ON public.community_feed_mentions (created_at DESC);

ALTER TABLE public.community_feed_mentions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_feed_mentions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_feed_mentions TO service_role;

COMMIT;
