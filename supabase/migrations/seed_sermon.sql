
-- Seed a sample sermon to fix the "0 rows" error
INSERT INTO public.sermons (title, scripture, book, version, speaker, outline, date)
VALUES (
  'The Beginning of Wisdom',
  'Proverbs 1:7',
  'Proverbs',
  'KJV',
  'Pastor Grace Hiire',
  '[
    {"id": 1, "text": "The fear of the Lord is the beginning of ________.", "missingWord": "knowledge"},
    {"id": 2, "text": "Fools despise wisdom and ________.", "missingWord": "instruction"}
  ]'::jsonb,
  CURRENT_DATE
);
