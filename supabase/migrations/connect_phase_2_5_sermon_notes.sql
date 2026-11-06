-- =============================================================================
-- PLCC Connect Phase 2.5 — private member sermon notes
-- =============================================================================
-- Shared Supabase schema (Canaan-owned migrations).
-- Project: yrpwdrioomdihjlmcfnu (Canaan + Connect)
--
-- DO NOT apply automatically — review before live apply.
--
-- Additive only:
--   * create public.sermon_notes
--   * self-only RLS (SELECT/INSERT/UPDATE/DELETE)
--   * grants for authenticated + service_role
--   * updated_at trigger
--
-- Does NOT:
--   * alter public.sermons content/publishing
--   * add public or group access flags
--   * expose notes to staff by default
--   * create Connect API handlers (direct authenticated client under RLS)
--
-- Identity (locked):
--   sermon_notes.user_id → public.users(id)  (canonical; auth.uid())
--   Do not use membership directory ids for ownership.
--   Optional sermon_id → public.sermons(id) ON DELETE SET NULL
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sermon_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sermon_id uuid NULL REFERENCES public.sermons(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  source_ref text NULL,
  title text NULL,
  content text NOT NULL DEFAULT '',
  sermon_title text NULL,
  speaker_name text NULL,
  sermon_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sermon_notes_source_type_chk
    CHECK (source_type IN ('sermon', 'youtube', 'manual')),
  CONSTRAINT sermon_notes_title_len_chk
    CHECK (title IS NULL OR char_length(title) <= 200),
  CONSTRAINT sermon_notes_content_len_chk
    CHECK (char_length(content) <= 50000),
  CONSTRAINT sermon_notes_source_ref_len_chk
    CHECK (source_ref IS NULL OR char_length(source_ref) <= 500),
  CONSTRAINT sermon_notes_sermon_title_len_chk
    CHECK (sermon_title IS NULL OR char_length(sermon_title) <= 300),
  CONSTRAINT sermon_notes_speaker_len_chk
    CHECK (speaker_name IS NULL OR char_length(speaker_name) <= 200)
);

COMMENT ON TABLE public.sermon_notes IS
  'Private per-member sermon/message notes for PLCC Connect. Self-only via RLS; no public or group flags in MVP.';

COMMENT ON COLUMN public.sermon_notes.user_id IS
  'Canonical owner = public.users(id) matching auth.uid().';

COMMENT ON COLUMN public.sermon_notes.source_type IS
  'sermon | youtube | manual — how the note was started; not an access flag.';

COMMENT ON COLUMN public.sermon_notes.source_ref IS
  'Stable external ref when needed (e.g. YouTube video id). Never full sermon body.';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sermon_notes_user_updated_idx
  ON public.sermon_notes (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS sermon_notes_user_sermon_idx
  ON public.sermon_notes (user_id, sermon_id)
  WHERE sermon_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_sermon_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sermon_notes_set_updated_at ON public.sermon_notes;
CREATE TRIGGER sermon_notes_set_updated_at
  BEFORE UPDATE ON public.sermon_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sermon_notes_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS — self-only; anon denied by omission
-- ---------------------------------------------------------------------------
ALTER TABLE public.sermon_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sermon_notes_select_own ON public.sermon_notes;
CREATE POLICY sermon_notes_select_own
  ON public.sermon_notes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS sermon_notes_insert_own ON public.sermon_notes;
CREATE POLICY sermon_notes_insert_own
  ON public.sermon_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS sermon_notes_update_own ON public.sermon_notes;
CREATE POLICY sermon_notes_update_own
  ON public.sermon_notes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS sermon_notes_delete_own ON public.sermon_notes;
CREATE POLICY sermon_notes_delete_own
  ON public.sermon_notes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sermon_notes TO authenticated;
GRANT ALL ON TABLE public.sermon_notes TO service_role;

-- Match Serve private-table pattern: strip default PUBLIC/anon privileges
REVOKE ALL ON TABLE public.sermon_notes FROM PUBLIC;
REVOKE ALL ON TABLE public.sermon_notes FROM anon;

COMMIT;
