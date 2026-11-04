CREATE TABLE IF NOT EXISTS public.member_keep_in_touch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  to_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_keep_in_touch_distinct CHECK (from_member_id <> to_member_id),
  CONSTRAINT member_keep_in_touch_pair UNIQUE (from_member_id, to_member_id)
);

CREATE INDEX IF NOT EXISTS member_keep_in_touch_to_status_idx
  ON public.member_keep_in_touch (to_member_id, status);

COMMENT ON TABLE public.member_keep_in_touch IS
  'Private adult keep-in-touch requests. Visible only to the two members.';

ALTER TABLE public.member_keep_in_touch ENABLE ROW LEVEL SECURITY;
