-- PLCC Community Phase 4D.2 — Pinned Community Feed posts (ADDITIVE ONLY)
-- DO NOT apply automatically; review before live apply.
--
-- Adds optional pin metadata on feed_posts.
-- Pin/unpin is intended via service-role API (requireAuth + Feed moderator).
-- Does NOT change notifications, community_moderation_log CHECK, RLS policies,
-- or existing data. No speculative indexes in 4D.2.

BEGIN;

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pinned_by uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_pin_pair_check;

ALTER TABLE public.feed_posts
  ADD CONSTRAINT feed_posts_pin_pair_check CHECK (
    pinned_by IS NULL OR pinned_at IS NOT NULL
  );

COMMIT;
