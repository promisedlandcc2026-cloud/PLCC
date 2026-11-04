-- Create reports table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('Finance', 'People', 'Attendance', 'Other')),
    query_config JSONB NOT NULL,
    created_by UUID REFERENCES public.users(id)
);

-- Enable RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all reports
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
CREATE POLICY "Admins can view all reports" ON public.reports
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND (role ILIKE '%admin%' OR role = 'SUPER_ADMIN' OR role = 'PASTOR')
        )
    );

-- Seed initial reports
INSERT INTO public.reports (name, description, category, query_config)
VALUES 
('Monthly Giving Summary', 'Total inflows grouped by fund for the current month.', 'Finance', '{"type": "finance_summary", "period": "current_month"}'),
('Expense Breakdown', 'Detailed list of outflows categorized by expense type.', 'Finance', '{"type": "expense_breakdown", "period": "last_30_days"}'),
('Member Growth Trend', 'New member registrations over the last 6 months.', 'People', '{"type": "member_growth", "months": 6}'),
('Attendance Heatmap', 'Weekly attendance counts for the last 12 weeks.', 'Attendance', '{"type": "attendance_trends", "weeks": 12}'),
('Demographic Spread', 'Breakdown of members by age group and status.', 'People', '{"type": "demographic_spread"}')
ON CONFLICT DO NOTHING;
