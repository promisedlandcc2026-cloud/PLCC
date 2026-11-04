-- PLCC Ark: let a parent hide a child's name on the public Ark Champions boards.
-- Hidden players show as "Player K." (first initial only) to everyone outside their family.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.ark_player_privacy (
  member_id  uuid PRIMARY KEY,
  hide_name  boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ark_player_privacy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ark_player_privacy FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ark_player_privacy TO service_role;
