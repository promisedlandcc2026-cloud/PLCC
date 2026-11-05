/**
 * WhatsApp / social preview cards for Community Live Huddle invites.
 *
 * HashRouter deep-links (#/community/chat?…) are invisible to crawlers.
 * Share via /api/share-huddle?channel=… so og:image is readable, then redirect humans
 * into the real HashRouter invite.
 *
 * Drop future cards in public/images/share/<slug>.jpg and register them below.
 */

import { buildHuddleInviteUrl, buildHuddlePreviewShareUrl } from './huddleInvite.js';

const CHANNEL_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HuddleSharePreview = {
  /** Matches community_channels.id */
  channelId: string;
  /** File under /images/share/<slug>.jpg (or .png) */
  slug: string;
  /** og:title */
  title: string;
  /** og:description */
  description: string;
  /** Optional override; default .jpg */
  ext?: 'jpg' | 'jpeg' | 'png' | 'webp';
};

/**
 * Channel → share card registry.
 * Add a row here whenever you drop a new image in public/images/share/.
 */
export const HUDDLE_SHARE_PREVIEWS: Record<string, HuddleSharePreview> = {
  'cdd9ed73-6cdc-45a0-a7e7-57beec6eea5e': {
    channelId: 'cdd9ed73-6cdc-45a0-a7e7-57beec6eea5e',
    slug: 'mount-moriah-channel',
    title: 'Mount Moriah Channel · Live Huddle',
    description:
      'Join the Live Huddle on PLCC Canaan — Discuss · Grow · Connect · Pray · Build Together',
    ext: 'jpg',
  },
};

const DEFAULT_PREVIEW: Omit<HuddleSharePreview, 'channelId'> = {
  slug: 'awc-huddle-default',
  title: 'PLCC Live Huddle',
  description: 'Join the Live Huddle on PLCC Connect.',
  ext: 'jpg',
};

/** Fallback image when a channel has no custom card (public/images). */
export const HUDDLE_SHARE_DEFAULT_IMAGE_PATH = '/images/awc-connect-logo.png';

export function normalizeShareChannelId(raw: unknown): string | null {
  const id = String(raw || '').trim();
  return CHANNEL_ID_RE.test(id) ? id.toLowerCase() : null;
}

export function getHuddleSharePreview(channelId: string): HuddleSharePreview | null {
  const id = normalizeShareChannelId(channelId);
  if (!id) return null;
  return HUDDLE_SHARE_PREVIEWS[id] || null;
}

export function huddleShareImagePath(preview: HuddleSharePreview | null): string {
  if (!preview) return HUDDLE_SHARE_DEFAULT_IMAGE_PATH;
  const ext = preview.ext || 'jpg';
  return `/images/share/${preview.slug}.${ext}`;
}

export function absoluteUrl(origin: string, path: string): string {
  const base = String(origin || '').trim().replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Image priority: DB share_image_url → static HUDDLE_SHARE_PREVIEWS → Connect logo.
 * Title: registry title → channelName · Live Huddle → default.
 */
export function resolveHuddleShareCard(opts: {
  origin: string;
  channelId: string;
  channelName?: string;
  /** Absolute or site-relative URL from chat_channels.share_image_url */
  shareImageUrl?: string | null;
}): {
  channelId: string;
  appInviteUrl: string;
  previewShareUrl: string;
  title: string;
  description: string;
  imageUrl: string;
} | null {
  const id = normalizeShareChannelId(opts.channelId);
  if (!id) return null;
  const origin = String(opts.origin || '').trim().replace(/\/$/, '');
  if (!origin || !/^https?:\/\//i.test(origin)) return null;

  const appInviteUrl = buildHuddleInviteUrl({ origin, channelId: id });
  const previewShareUrl = buildHuddlePreviewShareUrl({ origin, channelId: id });
  if (!appInviteUrl || !previewShareUrl) return null;

  const registered = getHuddleSharePreview(id);
  const label = String(opts.channelName || '').trim();
  const title =
    registered?.title ||
    (label
      ? `${label.startsWith('#') ? label.slice(1) : label} · Live Huddle`
      : DEFAULT_PREVIEW.title);
  const description =
    registered?.description ||
    (label
      ? `Join the Live Huddle in ${label.startsWith('#') ? label : `#${label}`} on PLCC Connect.`
      : DEFAULT_PREVIEW.description);

  const dbImage = String(opts.shareImageUrl || '').trim();
  let imageUrl: string;
  if (dbImage && (/^https?:\/\//i.test(dbImage) || dbImage.startsWith('/'))) {
    imageUrl = /^https?:\/\//i.test(dbImage) ? dbImage : absoluteUrl(origin, dbImage);
  } else {
    imageUrl = absoluteUrl(origin, huddleShareImagePath(registered));
  }

  return {
    channelId: id,
    appInviteUrl,
    previewShareUrl,
    title,
    description,
    imageUrl,
  };
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
  // Same-origin OG proxy always serves JPEG.
  if (lower.includes('/api/share-huddle-image')) return 'image/jpeg';
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * HTML document with Open Graph tags.
 *
 * Important: do NOT use http-equiv meta refresh. WhatsApp/Facebook follow it and
 * then lose og:image. Also Vercel may cache one HTML for all User-Agents.
 *
 * Humans: JS location.replace (crawlers do not execute JS).
 * Crawlers: read og:* tags; ignore the script.
 */
export function renderHuddleSharePreviewHtml(card: {
  title: string;
  description: string;
  imageUrl: string;
  previewShareUrl: string;
  appInviteUrl: string;
  /**
   * Same huddle in PLCC Connect (member app). When set, browsers go to Connect
   * unless this browser is signed in to the Vault (staff) — both apps join the
   * same live call, this only picks which app opens.
   */
  connectInviteUrl?: string;
  /** @deprecated Ignored — JS redirect is always used for browsers. */
  redirect?: boolean;
}): string {
  const title = escapeHtml(card.title);
  const description = escapeHtml(card.description);
  const imageUrl = escapeHtml(card.imageUrl);
  const previewShareUrl = escapeHtml(card.previewShareUrl);
  const appInviteUrl = escapeHtml(card.appInviteUrl);
  const imageType = escapeHtml(imageMimeFromUrl(card.imageUrl));
  const appInviteJs = JSON.stringify(card.appInviteUrl);
  const connectUrl = card.connectInviteUrl ? escapeHtml(card.connectInviteUrl) : '';
  const connectJs = card.connectInviteUrl ? JSON.stringify(card.connectInviteUrl) : 'null';
  /*
   * Browsers: show two buttons (PLCC Connect / The Vault) and let people pick —
   * both join the same call. ?app=connect|vault skips straight to that app.
   */
  const redirectJs = card.connectInviteUrl
    ? `(function(){var v=${appInviteJs},c=${connectJs};var q='';try{q=new URLSearchParams(location.search).get('app')||''}catch(e){}
if(q==='vault')location.replace(v);else if(q==='connect')location.replace(c);})();`
    : `location.replace(${appInviteJs});`;
  const bodyHtml = card.connectInviteUrl
    ? `<main>
    <img src="${imageUrl}" alt="" width="120" height="120" style="width:120px;height:120px;border-radius:24px;object-fit:cover" />
    <p class="kicker">Live Huddle</p>
    <h1>${title.replace(/\s*·\s*Live Huddle$/, '')}</h1>
    <p class="signin">Sign in to PLCC Connect or PLCC Canaan, then tap the huddle link. It opens right into the prayer call.</p>
    <p class="q" style="margin-top:20px">Join the huddle on:</p>
    <a class="btn gold" href="${connectUrl}">PLCC Connect<small>Most members</small></a>
    <a class="btn plain" href="${appInviteUrl}">The Vault<small>Church staff</small></a>
    <p class="note">Either way, you're in the same prayer call.</p>
  </main>`
    : `<main>
    <p>Opening Live Huddle…</p>
    <p><a href="${appInviteUrl}">Continue to PLCC Canaan</a></p>
    <p style="margin-top:16px"><img src="${imageUrl}" alt="" width="280" height="280" style="max-width:80vw;height:auto;border-radius:16px" /></p>
  </main>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${previewShareUrl}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="PLCC Canaan" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${previewShareUrl}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:secure_url" content="${imageUrl}" />
  <meta property="og:image:type" content="${imageType}" />
  <meta property="og:image:width" content="1024" />
  <meta property="og:image:height" content="1024" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${imageUrl}" />

  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d1a14; color: #f5e6c8; margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center; }
    main { width: 100%; max-width: 380px; }
    a { color: #C9A35A; font-weight: 700; }
    .kicker { margin: 16px 0 4px; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #C9A35A; }
    h1 { margin: 0 0 20px; font-size: 22px; line-height: 1.25; color: #fff; }
    .q { font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 14px; }
    .btn { display: block; text-decoration: none; border-radius: 18px; margin: 0 0 12px; }
    .btn small { display: block; font-size: 13px; font-weight: 600; margin-top: 2px; opacity: .8; }
    .gold { background: #C9A35A; color: #0d1a14; font-size: 22px; font-weight: 800; padding: 18px 16px; }
    .plain { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: #f5e6c8; font-size: 17px; font-weight: 700; padding: 12px 16px; }
    .signin { font-size: 15px; line-height: 1.45; font-weight: 600; color: #fff; background: rgba(201, 163, 90,.15); border: 1px solid rgba(201, 163, 90,.45); border-radius: 14px; padding: 10px 12px; margin: 4px 0 0; }
    .note { font-size: 14px; line-height: 1.5; opacity: .8; margin-top: 16px; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  ${bodyHtml}
  <script>${redirectJs}</script>
</body>
</html>`;
}
