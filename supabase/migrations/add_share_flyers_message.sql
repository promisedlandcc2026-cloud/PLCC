-- Optional message sent with a flyer share link (WhatsApp / text caption).
ALTER TABLE public.share_flyers
  ADD COLUMN IF NOT EXISTS share_message text;

COMMENT ON COLUMN public.share_flyers.share_message IS
  'Message sent with the share link; the link is added at the end automatically';
