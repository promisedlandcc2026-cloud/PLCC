-- Fundraisers phase 4: cash / check (hand-entered) fundraiser payments are also recorded in the DCB.
-- Online gifts from PLCC Tithe already reach the DCB through Tithe, so they are never sent from here.
-- Safe to run more than once.
--
-- dcb_status on fundraiser_payments:
--   NULL          waiting to be sent (sent automatically, retried when the fundraiser is opened)
--   'posted'      in the DCB
--   'review'      in the DCB, waiting in Online Giving review (e.g. Finance picks the donor)
--   'failed'      DCB refused it (dcb_error says why); retried automatically
--   'before_link' entered before this link existed — a finance leader chooses to send them
--   'not_sent'    never sent on purpose (e.g. under $1.00, which the DCB does not accept)

ALTER TABLE public.fundraiser_payments ADD COLUMN IF NOT EXISTS dcb_status text;
ALTER TABLE public.fundraiser_payments ADD COLUMN IF NOT EXISTS dcb_voucher_id text;
ALTER TABLE public.fundraiser_payments ADD COLUMN IF NOT EXISTS dcb_error text;
ALTER TABLE public.fundraiser_payments ADD COLUMN IF NOT EXISTS dcb_synced_at timestamptz;

-- Payments that already existed are NOT sent automatically: Finance may have typed some of them
-- into the DCB by hand. A finance leader sends them from the fundraiser page if they want.
-- (Runs only the first time: afterwards new payments carry a status as soon as they are sent.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fundraiser_payments WHERE dcb_status IS NOT NULL OR dcb_synced_at IS NOT NULL) THEN
    UPDATE public.fundraiser_payments SET dcb_status = 'before_link'
    WHERE external_ref IS NULL AND dcb_status IS NULL;
  END IF;
END $$;

-- Removed payments that still have to be taken back out of the DCB (retried until the DCB answers).
CREATE TABLE IF NOT EXISTS public.fundraiser_dcb_voids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundraiser_id uuid,
  payment_id uuid NOT NULL,
  voucher_id text,
  transaction_id text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  display_name text,
  reason text,
  last_error text,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fundraiser_dcb_voids_open ON public.fundraiser_dcb_voids (fundraiser_id) WHERE done_at IS NULL;
ALTER TABLE public.fundraiser_dcb_voids ENABLE ROW LEVEL SECURITY;
