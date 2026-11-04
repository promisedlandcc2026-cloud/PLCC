-- Create the daily_inspiration table
CREATE TABLE IF NOT EXISTS public.daily_inspiration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    text TEXT NOT NULL,
    reference TEXT,
    publish_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add unique constraint on publish_date to ensure one per day
ALTER TABLE public.daily_inspiration ADD CONSTRAINT unique_publish_date UNIQUE (publish_date);

-- Add RLS policies
ALTER TABLE public.daily_inspiration ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view daily inspiration
CREATE POLICY "Anyone can view daily inspiration"
ON public.daily_inspiration
FOR SELECT
USING (true);

-- Allow admins to manage (This assumes standard admin role check used in other tables)
CREATE POLICY "Admins can manage daily inspiration"
ON public.daily_inspiration
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Seed a sample for today
INSERT INTO public.daily_inspiration (text, reference, publish_date)
VALUES (
    'For I know the plans I have for you,” declares the Lord, “plans to prosper you and not to harm you, plans to give you hope and a future.',
    'Jeremiah 29:11',
    CURRENT_DATE
) ON CONFLICT (publish_date) DO NOTHING;
