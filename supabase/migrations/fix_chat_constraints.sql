-- Relax foreign key constraints in chat tables to allow "mock" or unsynced users
ALTER TABLE public.chat_channels DROP CONSTRAINT IF EXISTS chat_channels_created_by_fkey;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;

-- Ensure columns are nullable
ALTER TABLE public.chat_channels ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.chat_messages ALTER COLUMN user_id DROP NOT NULL;
