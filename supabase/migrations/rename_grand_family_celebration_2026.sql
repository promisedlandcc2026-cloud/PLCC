-- PLCC Grand Family Celebration 2026 (was "PLCC Thanksgiving Dinner 2026"), Oct 29, 2026.
-- Same event id, so every signup, pledge and payment stays attached.
-- PLCC Tithe and DCB rename their fund on their own the first time PLCC Canaan talks to them
-- (opening the RSVP list is enough); this only renames PLCC Canaan's own rows.

UPDATE events
SET name = 'PLCC GRAND FAMILY CELEBRATION 2026'
WHERE id = '86ac9498-ee56-4c6a-baae-079832b0ea73';

-- PLCC Canaan ledger fund, unless one with the new name already exists.
UPDATE finance_funds
SET name = 'PLCC GRAND FAMILY CELEBRATION 2026'
WHERE lower(name) IN ('awc thanksgiving dinner 2026', 'join us at awc table of thanksgiving 2026')
  AND NOT EXISTS (
    SELECT 1 FROM finance_funds WHERE lower(name) = 'awc grand family celebration 2026'
  );

-- The shared flyer card title (the image itself is unchanged).
UPDATE public.share_flyers
SET title = 'PLCC Grand Family Celebration 2026'
WHERE id = 'b2c3d4e5-f6a7-4890-b123-202611220001';
