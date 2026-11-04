-- Change start_time to TEXT to allow flexible input (e.g. "10:00 AM", "15 mins")
ALTER TABLE event_run_of_show 
ALTER COLUMN start_time TYPE TEXT USING start_time::TEXT;
