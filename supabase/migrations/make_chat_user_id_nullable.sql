-- Make user_id nullable in chat_messages to allow safe persists for mock/syncing users
ALTER TABLE public.chat_messages ALTER COLUMN user_id DROP NOT NULL;
