-- Flyer share links for WhatsApp / text (OG landing via /api/share-flyer).
-- Written and read through vault API (service role); no direct client policies.

CREATE TABLE IF NOT EXISTS public.share_flyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_url text NOT NULL,
  destination_url text NOT NULL,
  slug text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS share_flyers_slug_uidx
  ON public.share_flyers (slug)
  WHERE slug IS NOT NULL AND length(trim(slug)) > 0;

CREATE INDEX IF NOT EXISTS share_flyers_active_created_idx
  ON public.share_flyers (is_active, created_at DESC);

ALTER TABLE public.share_flyers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.share_flyers IS
  'Event flyers for WhatsApp/text share links; OG preview via /api/share-flyer';

-- Thanksgiving Dinner 2026 starter (image in public/images/share/).
INSERT INTO public.share_flyers (
  id,
  title,
  image_url,
  destination_url,
  slug,
  is_active
)
VALUES (
  'b2c3d4e5-f6a7-4890-b123-202611220001',
  'PLCC Table of Thanksgiving Dinner 2026',
  '/images/share/thanksgiving-dinner-2026.jpg',
  '/#/events/86ac9498-ee56-4c6a-baae-079832b0ea73/rsvp',
  'thanksgiving-dinner-2026',
  true
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  image_url = EXCLUDED.image_url,
  destination_url = EXCLUDED.destination_url,
  slug = EXCLUDED.slug,
  is_active = true,
  updated_at = now();
