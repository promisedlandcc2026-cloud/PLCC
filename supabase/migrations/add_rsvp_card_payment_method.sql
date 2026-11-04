-- RSVP "Pay Now": allow 'card' (card or bank on PLCC Tithe) alongside Zelle / Cash App / Venmo.
ALTER TABLE public.event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_food_contribution_payment_method_check;

ALTER TABLE public.event_registrations
  ADD CONSTRAINT event_registrations_food_contribution_payment_method_check
  CHECK (
    food_contribution_payment_method IS NULL
    OR food_contribution_payment_method IN ('card', 'zelle', 'cashapp', 'venmo')
  );
