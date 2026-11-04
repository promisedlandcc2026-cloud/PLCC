-- PLCC Community Phase 4B — Feed photo posts + leadership moderation (ADDITIVE)
-- DO NOT apply automatically; review before live apply.
--
-- Reuses private storage bucket community-files (Phase 2B).
-- Image objects live under feed/{author_id}/{uuid}.{ext}.
-- Soft-deleted posts keep storage objects but Feed APIs never sign/return them.
-- Moderators remove content (soft-delete); they cannot edit others' words.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Media columns on feed_posts (one image per post)
-- ---------------------------------------------------------------------------
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS image_path text NULL,
  ADD COLUMN IF NOT EXISTS image_mime text NULL,
  ADD COLUMN IF NOT EXISTS image_bytes integer NULL;

ALTER TABLE public.feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_content_len_check;

ALTER TABLE public.feed_posts
  ADD CONSTRAINT feed_posts_content_len_check CHECK (
    char_length(content) <= 3000
    AND (
      char_length(content) >= 1
      OR image_path IS NOT NULL
    )
  );

ALTER TABLE public.feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_image_mime_check;

ALTER TABLE public.feed_posts
  ADD CONSTRAINT feed_posts_image_mime_check CHECK (
    image_mime IS NULL
    OR image_mime IN ('image/jpeg', 'image/png', 'image/webp')
  );

ALTER TABLE public.feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_image_path_prefix_check;

ALTER TABLE public.feed_posts
  ADD CONSTRAINT feed_posts_image_path_prefix_check CHECK (
    image_path IS NULL
    OR image_path LIKE 'feed/%'
  );

ALTER TABLE public.feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_image_pair_check;

ALTER TABLE public.feed_posts
  ADD CONSTRAINT feed_posts_image_pair_check CHECK (
    (image_path IS NULL AND image_mime IS NULL)
    OR (image_path IS NOT NULL AND image_mime IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 2) Soft-delete actor metadata (author self-delete or moderator remove)
-- ---------------------------------------------------------------------------
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.feed_comments
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3) Moderation audit log (leadership accountability; service-role only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  target_author_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_moderation_log_action_check CHECK (
    action IN ('remove_post', 'remove_comment')
  ),
  CONSTRAINT community_moderation_log_target_type_check CHECK (
    target_type IN ('post', 'comment')
  ),
  CONSTRAINT community_moderation_log_reason_len_check CHECK (
    reason IS NULL OR char_length(reason) <= 500
  )
);

CREATE INDEX IF NOT EXISTS community_moderation_log_created_idx
  ON public.community_moderation_log (created_at DESC);

CREATE INDEX IF NOT EXISTS community_moderation_log_target_idx
  ON public.community_moderation_log (target_type, target_id);

CREATE INDEX IF NOT EXISTS community_moderation_log_moderator_idx
  ON public.community_moderation_log (moderator_id);

ALTER TABLE public.community_moderation_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_moderation_log FROM PUBLIC;
GRANT SELECT, INSERT ON public.community_moderation_log TO service_role;

COMMIT;
