-- Which media provider an open community huddle is using.
-- Run this in the Vault Supabase SQL editor.
-- Service role writes the columns. Members cannot pick a different provider.

ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS huddle_provider text,
  ADD COLUMN IF NOT EXISTS huddle_provider_set_at timestamptz;

ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_huddle_provider_check;

ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_huddle_provider_check
  CHECK (huddle_provider IS NULL OR huddle_provider IN ('livekit', 'daily'));

COMMENT ON COLUMN public.chat_channels.huddle_provider IS
  'livekit or daily for the current huddle. Empty means the next start tries LiveKit.';

COMMENT ON COLUMN public.chat_channels.huddle_provider_set_at IS
  'When the current provider was chosen. A stale empty room can try LiveKit again.';

-- Members must not write the huddle line, even if an UPDATE policy is added
-- for other channel columns. Table-level UPDATE granted to authenticated does
-- not override this. The server API connects as service_role.
CREATE OR REPLACE FUNCTION public.protect_chat_channel_huddle_provider()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.huddle_provider IS NOT DISTINCT FROM OLD.huddle_provider
     AND NEW.huddle_provider_set_at IS NOT DISTINCT FROM OLD.huddle_provider_set_at THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.huddle_provider IS NULL
     AND NEW.huddle_provider_set_at IS NULL THEN
    RETURN NEW;
  END IF;

  jwt_role := NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.role', true),
      (NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role'
    ),
    ''
  );

  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only the server can change the huddle line'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS chat_channels_huddle_provider_guard ON public.chat_channels;

CREATE TRIGGER chat_channels_huddle_provider_guard
  BEFORE INSERT OR UPDATE ON public.chat_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_chat_channel_huddle_provider();

REVOKE ALL ON FUNCTION public.protect_chat_channel_huddle_provider() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_chat_channel_huddle_provider() TO service_role, postgres, anon, authenticated;
