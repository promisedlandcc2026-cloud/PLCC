/**
 * Phase 3G / 3G.1 — Huddle invite / share link helpers (pure; UI + smokes).
 * Invite is a Community channel deep-link + open-intent flag — never a LiveKit credential.
 *
 * For WhatsApp / social previews, prefer /api/share-huddle?channel=… (Open Graph landing).
 */

export const HUDDLE_INVITE_ROUTE = '/community/chat';
export const HUDDLE_INVITE_INTENT_KEY = 'huddle';
export const HUDDLE_INVITE_INTENT_VALUE = '1';

const CHANNEL_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Relative HashRouter path used by Chat deep-link + Copy/Share. */
export function buildHuddleInvitePath(channelId: string): string | null {
  const id = String(channelId || '').trim();
  if (!id || !CHANNEL_ID_RE.test(id)) return null;
  return `${HUDDLE_INVITE_ROUTE}?channel=${encodeURIComponent(id)}&${HUDDLE_INVITE_INTENT_KEY}=${HUDDLE_INVITE_INTENT_VALUE}`;
}

/**
 * Absolute shareable URL for the current host.
 * HashRouter: https://host/#/community/chat?channel=<uuid>&huddle=1
 */
export function buildHuddleInviteUrl(opts: {
  origin: string;
  channelId: string;
}): string | null {
  const path = buildHuddleInvitePath(opts.channelId);
  if (!path) return null;
  const origin = String(opts.origin || '').trim().replace(/\/$/, '');
  if (!origin || !/^https?:\/\//i.test(origin)) return null;
  return `${origin}/#${path}`;
}

/**
 * Crawler-friendly share URL for WhatsApp / iMessage / Slack previews.
 * Kept here (not huddleSharePreview) to avoid circular imports with invite helpers.
 */
export function buildHuddlePreviewShareUrl(opts: {
  origin: string;
  channelId: string;
}): string | null {
  const id = String(opts.channelId || '').trim();
  if (!id || !CHANNEL_ID_RE.test(id)) return null;
  const origin = String(opts.origin || '').trim().replace(/\/$/, '');
  if (!origin || !/^https?:\/\//i.test(origin)) return null;
  return `${origin}/api/share-huddle?channel=${encodeURIComponent(id)}`;
}

export function buildHuddleSharePayload(opts: {
  origin: string;
  channelId: string;
  channelName?: string;
}): { title: string; text: string; url: string } | null {
  // Prefer crawler-friendly /api/share-huddle so WhatsApp shows the channel card image.
  const previewUrl = buildHuddlePreviewShareUrl({
    origin: opts.origin,
    channelId: opts.channelId,
  });
  const appUrl = buildHuddleInviteUrl({
    origin: opts.origin,
    channelId: opts.channelId,
  });
  const url = previewUrl || appUrl;
  if (!url) return null;
  const raw = String(opts.channelName || 'channel').trim() || 'channel';
  const label = raw.startsWith('#') ? raw.slice(1) : raw;
  return {
    title: 'PLCC Live Huddle',
    text: `Join the Live Huddle in #${label}. Sign in to PLCC Connect or PLCC Vault, then tap the huddle link. It opens right into the prayer call:`,
    url,
  };
}

/** True when query value is the non-secret open-intent flag. */
export function parseHuddleInviteIntent(raw: unknown): boolean {
  return String(raw ?? '').trim() === HUDDLE_INVITE_INTENT_VALUE;
}

/**
 * Decide what a consumed invite deep-link should do.
 * Never grants access — caller must already have ACL-checked the channel.
 */
export function decideHuddleInviteDeepLink(opts: {
  huddleIntent: boolean;
  channelAccessible: boolean;
  huddleActive: boolean;
}): 'open_prejoin' | 'ended' | 'ignore' {
  if (!opts.huddleIntent) return 'ignore';
  if (!opts.channelAccessible) return 'ignore';
  if (opts.huddleActive) return 'open_prejoin';
  return 'ended';
}

/** Remove only huddle intent; preserve channel= and other safe params. */
export function stripHuddleIntentFromSearch(search: string): string {
  const raw = String(search || '').trim();
  if (!raw) return '';
  const qs = raw.startsWith('?') ? raw.slice(1) : raw;
  const params = new URLSearchParams(qs);
  params.delete(HUDDLE_INVITE_INTENT_KEY);
  const next = params.toString();
  return next ? `?${next}` : '';
}

/** Defense-in-depth: invite URLs must never embed LiveKit/auth secrets. */
export function huddleInviteLooksSafe(url: string): boolean {
  const u = String(url || '');
  if (!u) return false;
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\./.test(u)) return false; // JWT-like
  if (/livekit|API[_-]?KEY|API[_-]?SECRET|access[_-]?token|Bearer\s/i.test(u)) return false;
  if (/[?&#](token|jwt|secret|apiKey|api_key|roomToken)=/i.test(u)) return false;
  // WhatsApp / social OG landing
  if (/\/api\/share-huddle\?channel=/i.test(u)) return true;
  if (!/#\/community\/chat\?channel=/i.test(u) && !/\/community\/chat\?channel=/i.test(u)) {
    return false;
  }
  return true;
}

export function canUseNavigatorClipboard(
  nav: { clipboard?: { writeText?: unknown } } | null | undefined = typeof navigator !== 'undefined'
    ? navigator
    : undefined
): boolean {
  return Boolean(nav?.clipboard && typeof nav.clipboard.writeText === 'function');
}

export function canUseNavigatorShare(
  nav: { share?: unknown } | null | undefined = typeof navigator !== 'undefined'
    ? navigator
    : undefined
): boolean {
  return typeof nav?.share === 'function';
}

/** Invite opens pre-join only — never connects LiveKit by itself. */
export function huddleInviteAutoJoinsLiveKit(): boolean {
  return false;
}

export function huddleInviteAutoConnectsLiveKit(): boolean {
  return false;
}

export function huddleInviteAutoEnablesMic(): boolean {
  return false;
}

export function huddleInviteAutoEnablesCamera(): boolean {
  return false;
}
