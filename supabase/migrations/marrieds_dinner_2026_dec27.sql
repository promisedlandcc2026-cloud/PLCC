-- Marrieds Dinner 2026 moved to the calendar event on Sun Dec 27, 4:00 PM (id 8cd1c63d-…).
-- The old built-in Dec 12 event (a1b2c3d4-…-202612121800) was deleted Nov 1, 2026.
-- Same setup as before: fellowship RSVP kit, $100 per person (Me and my spouse = $200,
-- Other must be $100 or more), Pledge or Pay Now, fund "Marrieds Dinner 2026",
-- signups close a week before. Safe to run more than once.
UPDATE public.events
SET rsvp_enabled = true,
    rsvp_template = 'fellowship',
    rsvp_close_at = '2026-12-20T23:59:00-05:00'::timestamptz,
    rsvp_payments_enabled = true,
    rsvp_allow_pledge = true,
    rsvp_gift_min = 100,
    rsvp_gift_options = ARRAY[100],
    description = COALESCE(NULLIF(TRIM(description), ''), 'Marrieds Dinner 2026. Sign up at /#/marrieds-dinner-rsvp')
WHERE id = '8cd1c63d-e041-423d-bcd0-8c6a6b9c10bf';
