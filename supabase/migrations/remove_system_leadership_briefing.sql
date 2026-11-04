-- Remove the auto-seeded "Leadership Briefing" system room (Oct 2026).
-- Keeps the user-created "PLCC Leadership Briefing Channel".
DELETE FROM public.chat_channels
WHERE slug = 'leadership-briefing'
  AND name = 'Leadership Briefing';
