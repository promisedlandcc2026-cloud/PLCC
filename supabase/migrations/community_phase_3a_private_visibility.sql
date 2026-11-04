-- PLCC Community Phase 3A — allow invite-only private channel visibility
-- Additive only. Does NOT change existing rows.
-- DO NOT apply until manually approved.

ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_visibility_check;

ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_visibility_check
  CHECK (
    visibility IS NULL
    OR visibility IN ('open', 'private', 'ministry', 'leadership', 'event', 'dm')
  );
