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
    title: 'Mount Moriah Channel · Live Ka Link',
    description:
      'Join the Live Ka Link on PLCC Canaan — Discuss · Grow · Connect · Pray · Build Together',
    ext: 'jpg',
  },
};

const DEFAULT_PREVIEW: Omit<HuddleSharePreview, 'channelId'> = {
  slug: 'awc-huddle-default',
  title: 'PLCC Live Ka Link',
  description: 'Join the Live Ka Link on Tribes.',
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
      ? `${label.startsWith('#') ? label.slice(1) : label} · Live Ka Link`
      : DEFAULT_PREVIEW.title);
  const description =
    registered?.description ||
    (label
      ? `Join the Live Ka Link in ${label.startsWith('#') ? label : `#${label}`} on Tribes.`
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
  /** Same channel and huddle in the standalone Ka Link app. */
  kaLinkInviteUrl?: string;
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
  const kaLinkUrl = card.kaLinkInviteUrl ? escapeHtml(card.kaLinkInviteUrl) : '';
  const connectUrl = card.connectInviteUrl ? escapeHtml(card.connectInviteUrl) : '';
  const connectJs = card.connectInviteUrl ? JSON.stringify(card.connectInviteUrl) : 'null';
  /*
   * Browsers: show app choices and let people pick —
   * both join the same call. ?app=connect|vault skips straight to that app.
   */
  const redirectJs = card.connectInviteUrl
    ? `(function(){var v=${appInviteJs},c=${connectJs};var q='';try{q=new URLSearchParams(location.search).get('app')||''}catch(e){}
if(q==='vault')location.replace(v);else if(q==='connect')location.replace(c);})();`
    : `location.replace(${appInviteJs});`;
  const bodyHtml = card.connectInviteUrl
    ? `<main class="invite">
    <img class="artwork" src="${imageUrl}" alt="" width="72" height="72" />
    <p class="kicker">Ka Link invitation</p>
    <h1>${title.replace(/\s*·\s*Live (?:Huddle|Ka Link)$/, '')}</h1>
    <a class="join" href="${kaLinkUrl || connectUrl}">${kaLinkUrl ? 'Join in Ka Link' : 'Join in Tribes'}</a>
    <p class="signin">If prompted, sign in to continue to this huddle.</p>
    <details>
      <summary>Other ways to join</summary>
      <div class="alternatives">
        ${kaLinkUrl ? `<a href="${connectUrl}">Open in Tribes</a>` : ''}
        <a href="${appInviteUrl}">Open in Canaan <small>Church staff</small></a>
      </div>
    </details>
  </main>`
    : `<main class="invite">
    <p>Opening Live Ka Link…</p>
    <a class="join" href="${appInviteUrl}">Continue to PLCC Canaan</a>
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
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; min-height: 100svh; padding: 24px 16px;
      display: grid; place-items: center; text-align: center;
      font: 1rem/1.5 system-ui, -apple-system, sans-serif;
      background: radial-gradient(ellipse at top, #19372a, #0d1a14 65%); color: #f9f2e3;
    }
    .invite {
      width: min(100%, 420px); padding: clamp(24px, 7vw, 42px);
      background: #15271e; border: 1px solid #405346; border-radius: 24px;
      box-shadow: 0 22px 60px #060e0a66;
    }
    .artwork { display: block; margin: 0 auto 20px; border-radius: 16px; object-fit: cover; }
    .kicker { margin: 0 0 6px; color: #dec18a; font-size: 0.875rem; font-weight: 650; }
    h1 { margin: 0 0 24px; font-size: clamp(1.55rem, 6vw, 2rem); line-height: 1.2; overflow-wrap: anywhere; }
    .join {
      display: block; background: #dec18a; color: #14241b; padding: 13px 16px;
      border-radius: 12px; font-weight: 750; text-decoration: none;
    }
    .join:hover { background: #efcf95; }
    .signin { margin: 10px 0 20px; color: #c5d0c5; font-size: 0.875rem; }
    details { border-top: 1px solid #405346; }
    summary { padding: 12px 0 0; min-height: 44px; cursor: pointer; color: #dec18a; font-size: 0.875rem; }
    .alternatives { display: grid; text-align: left; }
    .alternatives a {
      padding: 10px 0; min-height: 44px; color: #f9f2e3;
      display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px;
    }
    .alternatives small { color: #c5d0c5; }
    :focus-visible { outline: 2px solid #f4d397; outline-offset: 4px; }
  </style>
</head>
<body>
  ${bodyHtml}
  <script>${redirectJs}</script>
</body>
</html>`;
}
