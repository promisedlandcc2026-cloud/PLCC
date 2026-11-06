-- Fundraisers (moved from DCB): gifts, pledges, fun charges, game cash, online gifts from PLCC Tithe.
-- Safe to run more than once. Data is only reached through PLCC Canaan API (service role); RLS on, no policies.

CREATE TABLE IF NOT EXISTS public.fundraisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  start_date date NOT NULL DEFAULT current_date,
  goal_amount_cents bigint CHECK (goal_amount_cents IS NULL OR goal_amount_cents >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text,
  -- PLCC Tithe fund whose confirmed online gifts flow in automatically
  tithe_fund_id text,
  tithe_fund_name text,
  tithe_synced_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Price list for fun charges ("Coming in late" $20, "Leaving early" $50, …)
CREATE TABLE IF NOT EXISTS public.fundraiser_charge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundraiser_id uuid NOT NULL REFERENCES public.fundraisers(id) ON DELETE CASCADE,
  label text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per gift / pledge / charge / game cash / online gift.
--   kind 'paid'   : money given now (owed = 0, received = amount)
--   kind 'pledge' : promise to give (owed = pledged, received grows with payments)
--   kind 'charge' : fun charge (owed = price × quantity, received grows with payments)
CREATE TABLE IF NOT EXISTS public.fundraiser_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundraiser_id uuid NOT NULL REFERENCES public.fundraisers(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT current_date,
  source_type text NOT NULL DEFAULT 'member' CHECK (source_type IN ('member', 'visitor', 'game', 'online')),
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('paid', 'pledge', 'charge')),
  charge_item_id uuid REFERENCES public.fundraiser_charge_items(id) ON DELETE SET NULL,
  charge_label text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  owed_amount_cents bigint NOT NULL DEFAULT 0 CHECK (owed_amount_cents >= 0),
  received_amount_cents bigint NOT NULL DEFAULT 0 CHECK (received_amount_cents >= 0),
  payment_method text,
  notes text,
  -- 'tithe:<payment id>' for gifts pulled from PLCC Tithe; never entered by hand
  external_ref text UNIQUE,
  entered_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Money received against a pledge or a charge (and the single payment of a paid gift).
CREATE TABLE IF NOT EXISTS public.fundraiser_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.fundraiser_entries(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT current_date,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  payment_method text NOT NULL,
  notes text,
  entered_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fundraiser_entries_fundraiser ON public.fundraiser_entries (fundraiser_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_fundraiser_entries_member ON public.fundraiser_entries (member_id);
CREATE INDEX IF NOT EXISTS idx_fundraiser_payments_entry ON public.fundraiser_payments (entry_id);
CREATE INDEX IF NOT EXISTS idx_fundraiser_charge_items_fundraiser ON public.fundraiser_charge_items (fundraiser_id, sort_order);

ALTER TABLE public.fundraisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundraiser_charge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundraiser_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundraiser_payments ENABLE ROW LEVEL SECURITY;
