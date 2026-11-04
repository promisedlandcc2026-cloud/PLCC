-- RSVP Archive: an event's RSVP can be archived instead of deleted (signups and paid
-- records are kept). Archived RSVPs are read-only for Pastor, First Lady and Finance;
-- Super Admin can restore them. Safe to re-run.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_archived_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_archived_by text;
