CREATE TABLE IF NOT EXISTS public.bank_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deposit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    bank_name TEXT NOT NULL,
    account_name TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    type TEXT DEFAULT 'Combined Cash & Check',
    status TEXT DEFAULT 'Submitted',
    depositor TEXT,
    depositor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verifier TEXT,
    linked_sessions JSONB DEFAULT '[]',
    notes TEXT,
    receipt_url TEXT
);

ALTER TABLE public.bank_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access" ON public.bank_deposits
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
