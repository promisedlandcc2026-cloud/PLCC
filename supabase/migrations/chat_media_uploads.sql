-- PLCC Chat media: allow voice notes and videos in chat, up to 25 MB.
-- Uploads go straight to Storage with one-time signed URLs issued by the Vault
-- (api/_utils/chatAttachmentUpload.ts). Bucket stays private; reads use signed URLs.
UPDATE storage.buckets
SET
  file_size_limit = 26214400, -- 25 MB (matches CHAT_MEDIA_MAX_BYTES)
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'audio/wav',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
WHERE id = 'community-files';
