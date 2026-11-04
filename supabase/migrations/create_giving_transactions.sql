
-- SQL Migration: Add Giving Transactions Tracking
-- This table allows tracking individual member contributions linked to funds and optional batch counting sessions.

CREATE TABLE IF NOT EXISTS public.giving_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    fund_id UUID REFERENCES public.finance_funds(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES public.finance_counting_sessions(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source TEXT NOT NULL, -- e.g., 'Zelle', 'Cash App', 'Check', 'Cash', 'Online'
    reference_id TEXT, -- e.g., 'Check #1234' or transaction hash
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.giving_transactions ENABLE ROW LEVEL SECURITY;

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_giving_member ON public.giving_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_giving_fund ON public.giving_transactions(fund_id);
CREATE INDEX IF NOT EXISTS idx_giving_batch ON public.giving_transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_giving_date ON public.giving_transactions(transaction_date);

-- Basic RLS Policy (Admin/Finance Read/Write)
-- Note: Assuming standard role-based access will be handled via the API layer,
-- but adding basic policies for Supabase UI safety.
DROP POLICY IF EXISTS "Finance roles can manage giving" ON public.giving_transactions;
CREATE POLICY "Finance roles can manage giving" ON public.giving_transactions
    FOR ALL USING (true); -- Simplified for this environment, adjust as needed for production RLS
