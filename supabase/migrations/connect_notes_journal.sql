-- =============================================================================
-- PLCC Connect — Sermon Notes → "My Notes & Journal"
-- =============================================================================
-- Shared Supabase schema (Vault-owned migrations). Project: Vault + Connect.
--
-- Additive only. Safe to run more than once.
--   * entry_type   — sermon | prayer | reflection | gratitude (existing notes = sermon)
--   * answered_at  — date a prayer entry was answered (prayer entries only)
--   * answer_note  — optional "How God answered" (prayer entries only)
--
-- RLS is unchanged: notes stay self-only (user_id = auth.uid()).
-- =============================================================================

BEGIN;

ALTER TABLE public.sermon_notes
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'sermon';
ALTER TABLE public.sermon_notes
  ADD COLUMN IF NOT EXISTS answered_at date NULL;
ALTER TABLE public.sermon_notes
  ADD COLUMN IF NOT EXISTS answer_note text NULL;

ALTER TABLE public.sermon_notes DROP CONSTRAINT IF EXISTS sermon_notes_entry_type_chk;
ALTER TABLE public.sermon_notes ADD CONSTRAINT sermon_notes_entry_type_chk
  CHECK (entry_type IN ('sermon', 'prayer', 'reflection', 'gratitude'));

ALTER TABLE public.sermon_notes DROP CONSTRAINT IF EXISTS sermon_notes_answered_prayer_chk;
ALTER TABLE public.sermon_notes ADD CONSTRAINT sermon_notes_answered_prayer_chk
  CHECK (entry_type = 'prayer' OR (answered_at IS NULL AND answer_note IS NULL));

ALTER TABLE public.sermon_notes DROP CONSTRAINT IF EXISTS sermon_notes_answer_note_len_chk;
ALTER TABLE public.sermon_notes ADD CONSTRAINT sermon_notes_answer_note_len_chk
  CHECK (answer_note IS NULL OR char_length(answer_note) <= 2000);

CREATE INDEX IF NOT EXISTS sermon_notes_user_answered_idx
  ON public.sermon_notes (user_id, answered_at DESC)
  WHERE answered_at IS NOT NULL;

COMMENT ON COLUMN public.sermon_notes.entry_type IS
  'sermon | prayer | reflection | gratitude — what kind of entry; not an access flag.';
COMMENT ON COLUMN public.sermon_notes.answered_at IS
  'Prayer entries: the date the member marked the prayer answered.';

COMMIT;

-- Tell the API about the new columns right away
NOTIFY pgrst, 'reload schema';
