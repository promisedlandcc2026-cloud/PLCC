-- Create the security_logs table
CREATE TABLE IF NOT EXISTS public.security_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    officer_name TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    description TEXT,
    location TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Create Policy: Allow read access to all authenticated users
CREATE POLICY "Allow read access to all authenticated users"
ON public.security_logs
FOR SELECT
TO authenticated
USING (true);

-- Create Policy: Allow insert access to all authenticated users
CREATE POLICY "Allow insert access to all authenticated users"
ON public.security_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create Policy: Allow delete access to all authenticated users
CREATE POLICY "Allow delete access to all authenticated users"
ON public.security_logs
FOR DELETE
TO authenticated
USING (true);

-- Create an index on timestamp for faster queries
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON public.security_logs(timestamp DESC);
