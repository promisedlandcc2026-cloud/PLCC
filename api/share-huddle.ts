/**
 * Crawler-friendly Live Huddle share landing (WhatsApp / iMessage / Slack).
 * Route: GET /api/share-huddle?channel=<uuid>
 *
 * Loads channel name + share_image_url from chat_channels, then returns Open Graph
 * HTML and redirects browsers to /#/community/chat?channel=…&huddle=1
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from './_utils/auth.js';
import {
  normalizeShareChannelId,
  renderHuddleSharePreviewHtml,
  resolveHuddleShareCard,
} from './_utils/huddleSharePreview.js';
import { buildHuddleOgImageProxyUrl } from './_utils/whatsappOgImage.js';

/** Member app — the same huddle opens there for anyone not signed in to the Vault. */
const CONNECT_ORIGIN = String(process.env.CONNECT_PUBLIC_ORIGIN || 'https://plcc-connect.vercel.app').replace(/\/+$/, '');

function requestOrigin(req: VercelRequest): string {
  const protoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (hostHeader) {
    const proto = protoHeader === 'http' ? 'http' : 'https';
    return `${proto}://${hostHeader}`;
  }
  return 'https://plcc-opal.vercel.app';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const channelId = normalizeShareChannelId(req.query.channel);
  if (!channelId) {
    return res.status(400).send('Missing or invalid channel id.');
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).send('Service unavailable.');
  }

  const { data: channel, error } = await supabase
    .from('chat_channels')
    .select('id, name, share_image_url')
    .eq('id', channelId)
    .maybeSingle();

  if (error) {
    console.error('[share-huddle] load', error.message);
    return res.status(500).send('Could not load channel.');
  }
  if (!channel) {
    return res.status(404).send('Channel not found.');
  }

  const origin = requestOrigin(req);
  const card = resolveHuddleShareCard({
    origin,
    channelId,
    channelName: String(channel.name || '').trim() || undefined,
    shareImageUrl: channel.share_image_url || null,
  });
  if (!card) {
    return res.status(400).send('Could not build share preview.');
  }

  // Point og:image at a same-origin JPEG proxy. Uploaded Supabase PNGs are often
  // 1MB+ and WhatsApp silently drops those previews.
  const cacheKey = channel.share_image_url
    ? String(channel.share_image_url).slice(-24)
    : 'static';
  const ogImageUrl =
    buildHuddleOgImageProxyUrl({
      origin,
      channelId,
      version: cacheKey,
    }) || card.imageUrl;

  const html = renderHuddleSharePreviewHtml({
    title: card.title,
    description: card.description,
    imageUrl: ogImageUrl,
    previewShareUrl: card.previewShareUrl,
    appInviteUrl: card.appInviteUrl,
    connectInviteUrl: `${CONNECT_ORIGIN}/community/chat/${encodeURIComponent(channelId)}?huddle=join`,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Same HTML for crawlers + browsers (JS redirect only). Avoid UA-varying cache.
  res.setHeader('Cache-Control', 'public, max-age=120, must-revalidate');
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  return res.status(200).send(html);
}
