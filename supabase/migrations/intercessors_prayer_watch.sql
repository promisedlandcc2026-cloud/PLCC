-- Intercessors Prayer Watch: "Prayed" and "Answered" marks on prayer requests. Safe to run more than once.
ALTER TABLE public.prayer_requests ADD COLUMN IF NOT EXISTS intercessor_prayed_at timestamptz;
ALTER TABLE public.prayer_requests ADD COLUMN IF NOT EXISTS intercessor_prayed_by uuid;
ALTER TABLE public.prayer_requests ADD COLUMN IF NOT EXISTS answered_at timestamptz;
ALTER TABLE public.prayer_requests ADD COLUMN IF NOT EXISTS answered_by uuid;
CREATE INDEX IF NOT EXISTS idx_prayer_requests_answered_at
  ON public.prayer_requests (answered_at) WHERE answered_at IS NOT NULL;
