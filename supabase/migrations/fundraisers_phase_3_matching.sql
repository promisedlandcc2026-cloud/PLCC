-- Fundraisers phase 3: payments from PLCC Tithe are applied to people's pledges and fun charges.
-- external_ref ('tithe:<transaction>') marks every payment row that came from one Tithe gift,
-- so syncing never counts a gift twice and follows refunds. Safe to run more than once.

ALTER TABLE public.fundraiser_payments ADD COLUMN IF NOT EXISTS external_ref text;
CREATE INDEX IF NOT EXISTS idx_fundraiser_payments_external_ref
  ON public.fundraiser_payments (external_ref) WHERE external_ref IS NOT NULL;

-- Online gifts already pulled in: tag their payment rows too
UPDATE public.fundraiser_payments p
SET external_ref = e.external_ref
FROM public.fundraiser_entries e
WHERE p.entry_id = e.id AND e.external_ref IS NOT NULL AND p.external_ref IS NULL;

-- Online gifts someone marked "Keep as gift" drop off the To match list
ALTER TABLE public.fundraiser_entries ADD COLUMN IF NOT EXISTS match_dismissed boolean NOT NULL DEFAULT false;
