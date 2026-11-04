/**
 * Crawler-friendly flyer share landing (WhatsApp / iMessage / SMS).
 * Route: GET /api/share-flyer?id=<uuid>  (or ?slug=)
 *
 * Returns Open Graph HTML with the flyer as og:image, then redirects browsers
 * to the pasted destination URL.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from './_utils/auth.js';
import {
  STATIC_FLYER_FALLBACKS,
  flyerRowToCard,
  normalizeFlyerId,
  normalizeFlyerSlug,
  renderFlyerSharePreviewHtml,
  type ShareFlyerRow,
} from './_utils/shareFlyerPreview.js';

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

function staticFallback(id: string | null, slug: string | null): ShareFlyerRow | null {
  const key = id || slug;
  if (!key) return null;
  const fb = STATIC_FLYER_FALLBACKS[key];
  if (!fb) return null;
  return {
    id: fb.id,
    title: fb.title,
    image_url: fb.imageUrl,
    destination_url: fb.destinationUrl,
    slug: fb.slug,
    is_active: true,
  };
}

async function loadFlyerRow(
  id: string | null,
  slug: string | null
): Promise<ShareFlyerRow | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      let query = supabase
        .from('share_flyers')
        .select('id, title, image_url, destination_url, slug, is_active')
        .eq('is_active', true)
        .limit(1);
      if (id) query = query.eq('id', id);
      else if (slug) query = query.eq('slug', slug);
      else return staticFallback(id, slug);

      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        return {
          id: String(data.id),
          title: String(data.title || ''),
          image_url: String(data.image_url || ''),
          destination_url: String(data.destination_url || ''),
          slug: data.slug ? String(data.slug) : null,
          is_active: data.is_active !== false,
        };
      }
    } catch (err) {
      console.error('[share-flyer] load', (err as Error)?.message || err);
    }
  }
  return staticFallback(id, slug);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const id = normalizeFlyerId(req.query.id);
  const slug = normalizeFlyerSlug(req.query.slug);
  if (!id && !slug) {
    return res.status(400).send('Missing or invalid flyer id or slug.');
  }

  const row = await loadFlyerRow(id, slug);
  if (!row) {
    return res.status(404).send('Flyer not found.');
  }

  const card = flyerRowToCard(row, requestOrigin(req));
  if (!card) {
    return res.status(400).send('Could not build flyer preview.');
  }

  const html = renderFlyerSharePreviewHtml({
    title: card.title,
    description: 'Promised Land Christian Center — Changing Hearts. Transforming Lives.',
    imageUrl: card.imageUrl,
    previewShareUrl: card.previewShareUrl,
    destinationHref: card.destinationHref,
    // Uploaded flyers are usually portrait; let WhatsApp measure the real size.
    imageWidth: null,
    imageHeight: null,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=120, must-revalidate');
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  return res.status(200).send(html);
}
