/**
 * WhatsApp / text flyer share previews.
 * Share via /api/share-flyer?id=… (or ?slug=…) so og:image is crawler-readable,
 * then redirect humans to the pasted destination URL.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export const THANKSGIVING_FLYER_ID = 'b2c3d4e5-f6a7-4890-b123-202611220001';
export const THANKSGIVING_FLYER_SLUG = 'thanksgiving-dinner-2026';

/** Static fallback when DB row is missing (migration not applied yet). */
export const STATIC_FLYER_FALLBACKS: Record<
  string,
  {
    id: string;
    title: string;
    imageUrl: string;
    destinationUrl: string;
    slug: string;
  }
> = {
  [THANKSGIVING_FLYER_ID]: {
    id: THANKSGIVING_FLYER_ID,
    title: 'PLCC Grand Family Celebration 2026',
    imageUrl: '/images/share/thanksgiving-dinner-2026.jpg',
    destinationUrl: '/#/events/86ac9498-ee56-4c6a-baae-079832b0ea73/rsvp',
    slug: THANKSGIVING_FLYER_SLUG,
  },
  [THANKSGIVING_FLYER_SLUG]: {
    id: THANKSGIVING_FLYER_ID,
    title: 'PLCC Grand Family Celebration 2026',
    imageUrl: '/images/share/thanksgiving-dinner-2026.jpg',
    destinationUrl: '/#/events/86ac9498-ee56-4c6a-baae-079832b0ea73/rsvp',
    slug: THANKSGIVING_FLYER_SLUG,
  },
};

export function normalizeFlyerId(raw: unknown): string | null {
  const id = String(raw || '').trim();
  return UUID_RE.test(id) ? id.toLowerCase() : null;
}

export function normalizeFlyerSlug(raw: unknown): string | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s.length > 80 || !SLUG_RE.test(s)) return null;
  return s;
}

export function slugifyFlyerTitle(title: string): string {
  const base = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `flyer-${Date.now().toString(36)}`;
}

/**
 * Allow https destinations and same-app hash/path destinations.
 * Reject javascript:, data:, and other non-http schemes.
 */
export function normalizeDestinationUrl(raw: unknown): string | null {
  const s = String(raw || '').trim();
  if (!s || s.length > 2000) return null;
  if (/^(javascript|data|vbscript|file):/i.test(s)) return null;

  if (/^https:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  // Relative app paths (HashRouter)
  if (s.startsWith('/#/')) return s;
  if (s.startsWith('#/')) return `/${s}`;
  if (s.startsWith('/') && !s.startsWith('//')) return s;

  return null;
}

export function resolveDestinationHref(origin: string, destinationUrl: string): string {
  const dest = String(destinationUrl || '').trim();
  if (/^https:\/\//i.test(dest)) return dest;
  const base = String(origin || '').trim().replace(/\/$/, '');
  if (dest.startsWith('/')) return `${base}${dest}`;
  return `${base}/${dest}`;
}

export function absoluteAssetUrl(origin: string, imageUrl: string): string {
  const img = String(imageUrl || '').trim();
  if (/^https?:\/\//i.test(img)) return img;
  const base = String(origin || '').trim().replace(/\/$/, '');
  const path = img.startsWith('/') ? img : `/${img}`;
  return `${base}${path}`;
}

export function buildFlyerShareUrl(opts: {
  origin: string;
  id?: string | null;
  slug?: string | null;
}): string | null {
  const origin = String(opts.origin || '').trim().replace(/\/$/, '');
  if (!origin || !/^https?:\/\//i.test(origin)) return null;
  const id = normalizeFlyerId(opts.id);
  if (id) return `${origin}/api/share-flyer?id=${encodeURIComponent(id)}`;
  const slug = normalizeFlyerSlug(opts.slug);
  if (slug) return `${origin}/api/share-flyer?slug=${encodeURIComponent(slug)}`;
  return null;
}

/** Longest share message we keep (WhatsApp captions allow far more; keep it readable). */
export const SHARE_MESSAGE_MAX = 1500;

export function normalizeShareMessage(raw: unknown): string | null {
  const s = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, SHARE_MESSAGE_MAX);
  return s || null;
}

/**
 * Text sent with the link. With a message: the message, a blank line, then the
 * link (WhatsApp builds the flyer preview from the link). Without: title + link.
 */
export function shareText(shareUrl: string, title?: string, message?: string | null): string {
  const msg = normalizeShareMessage(message);
  if (msg) {
    return msg.includes(shareUrl) ? msg : `${msg}\n\n${shareUrl}`;
  }
  const label = String(title || 'Join us at PLCC').trim() || 'Join us at PLCC';
  return `${label}\n${shareUrl}`;
}

export function whatsappShareHref(shareUrl: string, title?: string, message?: string | null): string {
  return `https://wa.me/?text=${encodeURIComponent(shareText(shareUrl, title, message))}`;
}

export function smsShareHref(shareUrl: string, title?: string, message?: string | null): string {
  return `sms:?&body=${encodeURIComponent(shareText(shareUrl, title, message))}`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function imageMimeFromUrl(imageUrl: string): string {
  const lower = String(imageUrl || '').toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export function renderFlyerSharePreviewHtml(card: {
  title: string;
  description?: string;
  imageUrl: string;
  previewShareUrl: string;
  destinationHref: string;
  /**
   * og:image size. Defaults to 1200×630 (landscape cards). Pass null when the
   * real size is unknown (uploaded flyers are often portrait) so crawlers
   * measure the image themselves instead of trusting a wrong size.
   */
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** @deprecated Ignored — JS redirect is always used for browsers. */
  redirect?: boolean;
}): string {
  const title = escapeHtml(card.title);
  const description = escapeHtml(
    card.description || 'Promised Land Christian Center — Where Everybody is Somebody'
  );
  const imageUrl = escapeHtml(card.imageUrl);
  const previewShareUrl = escapeHtml(card.previewShareUrl);
  const destinationHref = escapeHtml(card.destinationHref);
  const imageType = escapeHtml(imageMimeFromUrl(card.imageUrl));
  const destJs = JSON.stringify(card.destinationHref);
  const w = card.imageWidth === undefined ? 1200 : card.imageWidth;
  const h = card.imageHeight === undefined ? 630 : card.imageHeight;
  const sizeMeta =
    w && h
      ? `\n  <meta property="og:image:width" content="${Math.round(w)}" />\n  <meta property="og:image:height" content="${Math.round(h)}" />`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${previewShareUrl}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="PLCC Vault" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${previewShareUrl}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:secure_url" content="${imageUrl}" />
  <meta property="og:image:type" content="${imageType}" />${sizeMeta}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${imageUrl}" />

  <style>
    body { font-family: system-ui, sans-serif; background: #0d1a14; color: #f5e6c8; margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center; }
    a { color: #C9A35A; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <p>Opening…</p>
    <p><a href="${destinationHref}">Continue</a></p>
    <p style="margin-top:16px"><img src="${imageUrl}" alt="" style="max-width:min(320px,80vw);height:auto;border-radius:12px" /></p>
  </main>
  <script>location.replace(${destJs});</script>
</body>
</html>`;
}

export type ShareFlyerRow = {
  id: string;
  title: string;
  image_url: string;
  destination_url: string;
  slug: string | null;
  is_active?: boolean;
  share_message?: string | null;
};

export function flyerRowToCard(
  row: ShareFlyerRow,
  origin: string
): {
  id: string;
  title: string;
  slug: string | null;
  imageUrl: string;
  destinationHref: string;
  previewShareUrl: string;
} | null {
  const id = normalizeFlyerId(row.id);
  if (!id) return null;
  const previewShareUrl = buildFlyerShareUrl({ origin, id, slug: row.slug });
  if (!previewShareUrl) return null;
  const dest = normalizeDestinationUrl(row.destination_url);
  if (!dest) return null;
  return {
    id,
    title: String(row.title || 'PLCC Flyer').trim() || 'PLCC Flyer',
    slug: row.slug ? normalizeFlyerSlug(row.slug) : null,
    imageUrl: absoluteAssetUrl(origin, row.image_url),
    destinationHref: resolveDestinationHref(origin, dest),
    previewShareUrl,
  };
}
