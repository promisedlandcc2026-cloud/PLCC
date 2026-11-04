-- Check if columns exist and their types
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'prayer_requests' 
AND column_name IN ('agreements', 'prayed_count');

-- Check current counts to see if they are in sync
SELECT id, agreements, prayed_count 
FROM prayer_requests 
LIMIT 5;
