-- PLCC Community Phase 4A — Community Feed foundation (ADDITIVE ONLY)
-- DO NOT apply automatically; review before live apply.
--
-- Creates persistent Feed tables distinct from chat_messages / community_voices.
-- Access is intended via service-role API (requireAuth + Community eligibility).
-- RLS is enabled with no anon/authenticated policies (deny-by-default for direct clients).

BEGIN;

CREATE TABLE IF NOT EXISTS public.feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT feed_posts_category_check CHECK (
    category IN (
      'general',
      'prayer',
      'praise',
      'ministry_update',
      'event',
      'encouragement'
    )
  ),
  CONSTRAINT feed_posts_content_len_check CHECK (
    char_length(content) >= 1 AND char_length(content) <= 3000
  )
);

CREATE INDEX IF NOT EXISTS feed_posts_created_idx
  ON public.feed_posts (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS feed_posts_author_idx
  ON public.feed_posts (author_id);

CREATE INDEX IF NOT EXISTS feed_posts_category_idx
  ON public.feed_posts (category)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.feed_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT feed_comments_content_len_check CHECK (
    char_length(content) >= 1 AND char_length(content) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS feed_comments_post_created_idx
  ON public.feed_comments (post_id, created_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS feed_comments_author_idx
  ON public.feed_comments (author_id);

-- Reactions: one row per (user, target, reaction_key).
-- Users may hold multiple different reactions on the same target;
-- toggling the same reaction_key removes it.
CREATE TABLE IF NOT EXISTS public.feed_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_reactions_target_type_check CHECK (
    target_type IN ('post', 'comment')
  ),
  CONSTRAINT feed_reactions_reaction_check CHECK (
    reaction IN ('love', 'pray', 'praise', 'like')
  ),
  CONSTRAINT feed_reactions_unique UNIQUE (target_type, target_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS feed_reactions_target_idx
  ON public.feed_reactions (target_type, target_id);

CREATE INDEX IF NOT EXISTS feed_reactions_user_idx
  ON public.feed_reactions (user_id);

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;

-- Explicitly no policies for anon/authenticated → deny direct client access.
-- Service role used by /api/vault Community handlers bypasses RLS.

REVOKE ALL ON public.feed_posts FROM PUBLIC;
REVOKE ALL ON public.feed_comments FROM PUBLIC;
REVOKE ALL ON public.feed_reactions FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_posts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_comments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_reactions TO service_role;

COMMIT;
