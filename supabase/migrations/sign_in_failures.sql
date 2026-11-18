-- Sign-in problems log (Phase 4, Nov 2026, #17)
-- Who is failing to sign in to PLCC apps, and why. Never stores passwords or codes;
-- numbers/emails are masked, with a hash so repeat attempts group together.
-- Shown in PLCC Canaan → More → Sign-in Problems. Server-only (service role).
CREATE TABLE IF NOT EXISTS public.sign_in_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  app text NOT NULL DEFAULT 'canaan',
  method text NOT NULL,
  identifier_masked text,
  identifier_hash text,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  detail text,
  user_agent text,
  source text NOT NULL DEFAULT 'server'
);
CREATE INDEX IF NOT EXISTS sign_in_failures_created_idx ON public.sign_in_failures (created_at DESC);
ALTER TABLE public.sign_in_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sign_in_failures FROM anon, authenticated;
