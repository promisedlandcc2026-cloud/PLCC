
-- Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
    check_in_time TIMESTAMPTZ DEFAULT now(),
    check_in_method TEXT DEFAULT 'Manual',
    service_type TEXT DEFAULT 'Sunday Service',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Attendance (Randomized over last few weeks)
INSERT INTO public.attendance (member_id, check_in_time)
SELECT id, now() - (random() * interval '30 days')
FROM public.members
LIMIT 20;

-- Finance Ledger Seed (If empty)
-- Assuming finance_ledger already exists but might be empty
INSERT INTO public.finance_ledger (transaction_date, description, amount, type, category, status)
VALUES 
(CURRENT_DATE - INTERVAL '5 days', 'Online Offering - General Fund', 500.00, 'Inflow', 'Offerings', 'Finalized'),
(CURRENT_DATE - INTERVAL '10 days', 'Utility Bill Payment', 150.00, 'Outflow', 'Utilities', 'Finalized'),
(CURRENT_DATE - INTERVAL '15 days', 'Building Maintenance', 300.00, 'Outflow', 'Maintenance', 'Finalized'),
(CURRENT_DATE - INTERVAL '2 days', 'Guest Speaker Honorarium', 200.00, 'Outflow', 'Missions', 'Finalized'),
(CURRENT_DATE - INTERVAL '20 days', 'Tithes & Offerings', 1200.00, 'Inflow', 'Offerings', 'Finalized');
