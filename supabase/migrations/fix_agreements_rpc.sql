-- Redefine increment_agreements with SECURITY DEFINER and multi-column sync
-- This ensures that regardless of which column the UI or schema expects, the counts stay in sync.
CREATE OR REPLACE FUNCTION increment_agreements(request_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.prayer_requests
  SET 
    agreements = COALESCE(agreements, 0) + 1,
    prayed_count = COALESCE(prayed_count, 0) + 1
  WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to all users
GRANT EXECUTE ON FUNCTION increment_agreements(UUID) TO authenticated, anon;
