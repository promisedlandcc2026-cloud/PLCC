-- Meeting Minutes recorder: audio storage + signature/transcript columns.

ALTER TABLE public.minutes_documents
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS typed_signature TEXT,
  ADD COLUMN IF NOT EXISTS secretary_signature TEXT;

ALTER TABLE public.minutes_acknowledgements
  ADD COLUMN IF NOT EXISTS typed_name TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'minutes-audio',
  'minutes-audio',
  false,
  104857600,
  ARRAY[
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Service-role API only (no anon/authenticated write policies).
