-- The Marrieds Dinner 2026: $100 per person is required.
-- RSVP shows one $100 button plus Other (Other must be $100 or more).
UPDATE public.events
SET rsvp_gift_min = 100,
    rsvp_gift_options = ARRAY[100]
WHERE id = 'a1b2c3d4-e5f6-4789-a012-202612121800';
