-- Add agreements column to prayer_requests table
ALTER TABLE public.prayer_requests 
ADD COLUMN IF NOT EXISTS agreements INTEGER DEFAULT 0;

-- Create a function to safely increment agreements
CREATE OR REPLACE FUNCTION increment_agreements(request_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.prayer_requests
  SET agreements = agreements + 1
  WHERE id = request_id;
END;
$$ LANGUAGE plpgsql;
