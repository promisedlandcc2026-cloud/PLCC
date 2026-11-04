-- PLCC Community Phase 2B — messages extensions + reactions / attachments / mentions

-- ---------------------------------------------------------------------------
-- Extend chat_messages (edited_at already exists; no avatar_url)
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_parent_id_fkey'
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chat_messages_channel_created_idx
  ON public.chat_messages (channel_id, created_at);

CREATE INDEX IF NOT EXISTS chat_messages_parent_idx
  ON public.chat_messages (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_not_deleted_idx
  ON public.chat_messages (channel_id, created_at)
  WHERE deleted_at IS NULL;

-- Optional pinned_message FK now that messages columns are stable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_channels_pinned_message_id_fkey'
  ) THEN
    ALTER TABLE public.chat_channels
      ADD CONSTRAINT chat_channels_pinned_message_id_fkey
      FOREIGN KEY (pinned_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- chat_message_reactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS chat_message_reactions_message_idx
  ON public.chat_message_reactions (message_id);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- chat_attachments (metadata only — files live in Storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  kind text NOT NULL DEFAULT 'file'
    CHECK (kind IN ('image', 'file')),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON public.chat_attachments (message_id);

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- chat_message_mentions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_message_mentions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (message_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS chat_message_mentions_user_idx
  ON public.chat_message_mentions (mentioned_user_id);

ALTER TABLE public.chat_message_mentions ENABLE ROW LEVEL SECURITY;
