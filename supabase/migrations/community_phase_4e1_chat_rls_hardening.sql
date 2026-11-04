-- PLCC Community Phase 4E.1 — Chat RLS hardening (ADDITIVE SECURITY ONLY)
-- DO NOT apply automatically; review before live apply.
--
-- Root cause: legacy create_chat.sql policies allow authenticated clients to
-- INSERT chat_channels and INSERT chat_messages for type='public' channels,
-- bypassing Community API ACL / CHAT_CHANNEL_CREATE_ROLES / visibility rules.
--
-- Community Chat UI reads/writes exclusively via /api/vault (service role).
-- No frontend Supabase client queries chat_* tables.
--
-- This migration drops the five known legacy authenticated policies so browser
-- anon/authenticated clients cannot bypass the API. With RLS enabled and no
-- remaining policies for these roles, direct client access is denied.
-- Service role continues to bypass RLS for the trusted API path.
--
-- Live project yrpwdrioomdihjlmcfnu: these five policies were already removed
-- manually and verified. Re-apply is idempotent (DROP IF EXISTS).
--
-- Does NOT drop tables, columns, or chat rows.
-- Does NOT change Feed / notifications / huddle schema.

BEGIN;

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Legacy write policies (bypass API ACL)
DROP POLICY IF EXISTS "Authenticated users can create channels"
  ON public.chat_channels;
DROP POLICY IF EXISTS "Users can post messages in visible channels"
  ON public.chat_messages;

-- Legacy read policies keyed to type='public' / participants[] (bypass visibility ACL).
-- Safe to drop: Chat UI does not use direct Supabase SELECT on these tables.
DROP POLICY IF EXISTS "Public channels are viewable by everyone"
  ON public.chat_channels;
DROP POLICY IF EXISTS "Private channels are viewable by participants"
  ON public.chat_channels;
DROP POLICY IF EXISTS "Users can view messages in visible channels"
  ON public.chat_messages;

-- Related chat tables already enable RLS with no authenticated policies (deny-by-default).
-- Keep that posture explicit if tables exist.
DO $$
BEGIN
  IF to_regclass('public.chat_room_members') IS NOT NULL THEN
    ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.chat_read_status') IS NOT NULL THEN
    ALTER TABLE public.chat_read_status ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.chat_message_reactions') IS NOT NULL THEN
    ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.chat_attachments') IS NOT NULL THEN
    ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.chat_message_mentions') IS NOT NULL THEN
    ALTER TABLE public.chat_message_mentions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

COMMIT;
