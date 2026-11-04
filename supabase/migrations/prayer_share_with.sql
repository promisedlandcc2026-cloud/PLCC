-- Prayer requests: who the sender shared with. Safe to run more than once.
-- 'wall' = Prayer Wall + Intercessors, 'intercessors' = Intercessors only (private), 'pastor' = Pastor only.
ALTER TABLE public.prayer_requests ADD COLUMN IF NOT EXISTS share_with text;
UPDATE public.prayer_requests
SET share_with = CASE WHEN is_confidential IS TRUE OR status = 'Confidential' THEN 'pastor' ELSE 'wall' END
WHERE share_with IS NULL;
