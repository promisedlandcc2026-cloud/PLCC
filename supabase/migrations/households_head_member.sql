-- Households: head of household (approved Households mockup, Oct 2026).
-- Points at the member row; cleared automatically if that member is deleted.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS head_member_id uuid
  REFERENCES public.members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS households_head_member_id_idx
  ON public.households (head_member_id);
