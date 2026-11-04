-- Event RSVP payments through PLCC Tithe (Events → Edit → Payments).
-- NULL means "not set": built-in events (Thanksgiving, Marrieds) keep their defaults.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_payments_enabled boolean;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_gift_min integer;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_gift_options integer[];
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_allow_pledge boolean;

-- Thanksgiving 2026 and The Marrieds Dinner 2026 move onto the same settings.
UPDATE public.events
SET rsvp_payments_enabled = true,
    rsvp_gift_min = COALESCE(rsvp_gift_min, 20),
    rsvp_gift_options = COALESCE(rsvp_gift_options, ARRAY[20, 40, 60, 100]),
    rsvp_allow_pledge = COALESCE(rsvp_allow_pledge, true)
WHERE id IN ('a1b2c3d4-e5f6-4789-a012-202611221400', 'a1b2c3d4-e5f6-4789-a012-202612121800');
