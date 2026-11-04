/**
 * Crawler-friendly event signup landing (WhatsApp / iMessage).
 * Route: GET /api/share-rsvp?id=<eventUuid>
 *
 * Uses the event calendar flyer as og:image, then redirects to /#/events/…/rsvp.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from './_utils/auth.js';
import {
  buildEventRsvpShareUrl,
  renderFlyerSharePreviewHtml,
  resolveEventRsvpShareCard,
} from './_utils/eventRsvpSharePreview.js';
import { normalizeFlyerId } from './_utils/shareFlyerPreview.js';

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

  const eventId = normalizeFlyerId(req.query.id);
  if (!eventId) {
    return res.status(400).send('Missing or invalid event id.');
  }

  const origin = requestOrigin(req);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).send('Service unavailable.');
  }

  const { data, error } = await supabase
    .from('events')
    .select('id, name, image_url, rsvp_enabled')
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    console.error('[share-rsvp] load', error.message);
    return res.status(500).send('Could not load event.');
  }
  if (!data) {
    return res.status(404).send('Event not found.');
  }

  const card = resolveEventRsvpShareCard({
    origin,
    event: data,
    fallbackImageUrl: '/images/awc-logo.png',
  });
  if (!card) {
    return res.status(400).send('Could not build signup preview.');
  }

  // Ensure preview URL uses this request origin (resolve already does).
  const previewShareUrl =
    buildEventRsvpShareUrl({ origin, eventId }) || card.previewShareUrl;

  const html = renderFlyerSharePreviewHtml({
    title: card.title,
    description: 'Promised Land Christian Center — Changing Hearts. Transforming Lives.',
    imageUrl: card.imageUrl,
    previewShareUrl,
    destinationHref: card.destinationHref,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=120, must-revalidate');
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  return res.status(200).send(html);
}
