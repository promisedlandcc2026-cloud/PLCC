-- Text-message sign-in codes (Vault + PLCC Connect). Run once in Supabase → SQL Editor.

-- A phone number proven by an approved text code. Only this column (or a
-- phone sign-up's own number) lets a code sign in to an account — the editable
-- users.phone / members.phone fields are never trusted for that.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verified_phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_verified_phone_key
  ON public.users (verified_phone) WHERE verified_phone IS NOT NULL;

-- One row per code texted: per-number hourly limit and church-wide daily cap.
CREATE TABLE IF NOT EXISTS public.auth_sms_sends (
  id BIGSERIAL PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_sms_sends_phone_time_idx ON public.auth_sms_sends (phone_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sms_sends_time_idx ON public.auth_sms_sends (created_at DESC);
-- Server (service role) only; no browser access.
ALTER TABLE public.auth_sms_sends ENABLE ROW LEVEL SECURITY;
