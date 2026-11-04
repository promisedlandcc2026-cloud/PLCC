-- Automatic birthday & anniversary greetings (Vault Home → Celebrations).
-- Paste into Supabase → SQL Editor and run once. Safe to re-run.
--   * organization_settings.celebration_settings — Pastor's wording, on/off
--   * celebration_greetings — one row per person per occasion per year (never greets twice)
--   * user_notifications.type gains 'celebration' (keeps every existing type)

BEGIN;

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS celebration_settings jsonb;

CREATE TABLE IF NOT EXISTS public.celebration_greetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  occasion text NOT NULL CHECK (occasion IN ('birthday', 'anniversary')),
  greet_year integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('app', 'email')),
  recipients integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT celebration_greetings_once UNIQUE (member_id, occasion, greet_year)
);

ALTER TABLE public.celebration_greetings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.celebration_greetings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.celebration_greetings TO service_role;

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
      'community_dm',
      'community_huddle_started',
      'community_feed_comment',
      'community_feed_mention_post',
      'community_feed_mention_comment',
      'event_approval',
      'kids_bucks_award',
      'celebration'
    )
  ) NOT VALID;

COMMIT;

NOTIFY pgrst, 'reload schema';
