-- PLCC Community Phase 2B — notification types + community-files storage bucket

-- ---------------------------------------------------------------------------
-- Widen user_notifications.type CHECK (exact constraint name from live DB)
-- Preserves announcement / prayer / assignment; adds community_* types.
-- Idempotent: DROP IF EXISTS then ADD.
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
      'community_dm'
    )
  );

-- ---------------------------------------------------------------------------
-- Storage bucket: community-files (private)
-- Uploads go through service-role API only; no public write policy.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-files',
  'community-files',
  false,
  10485760, -- 10MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated users may read objects only via signed URLs from the API.
-- No INSERT/UPDATE/DELETE policies for authenticated/anon — service role bypasses RLS.
