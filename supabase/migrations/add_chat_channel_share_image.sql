-- WhatsApp / OG huddle share card image per Community channel.
-- Written via vault API (service role); share-huddle reads with service role.

ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS share_image_url text;

COMMENT ON COLUMN public.chat_channels.share_image_url IS
  'Public image URL for /api/share-huddle Open Graph card (WhatsApp / text)';
