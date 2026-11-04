/**
 * WhatsApp-ready event signup share links.
 * Hash RSVP URLs (#/events/…/rsvp) cannot carry Open Graph tags.
 * Share /api/share-rsvp?id=<eventUuid> instead — og:image = event calendar flyer.
 */

import {
  absoluteAssetUrl,
  normalizeFlyerId,
  renderFlyerSharePreviewHtml,
  resolveDestinationHref,
} from './shareFlyerPreview.js';

export { renderFlyerSharePreviewHtml };

export function buildEventRsvpShareUrl(opts: {
  origin: string;
  eventId: string;
}): string | null {
  const origin = String(opts.origin || '').trim().replace(/\/$/, '');
  const id = normalizeFlyerId(opts.eventId);
  if (!origin || !/^https?:\/\//i.test(origin) || !id) return null;
  return `${origin}/api/share-rsvp?id=${encodeURIComponent(id)}`;
}

export function eventRsvpAppPath(eventId: string): string {
  const id = normalizeFlyerId(eventId) || String(eventId || '').trim();
  return `/#/events/${encodeURIComponent(id)}/rsvp`;
}

export type EventRsvpShareRow = {
  id: string;
  name?: string | null;
  image_url?: string | null;
  rsvp_enabled?: boolean | null;
};

export function resolveEventRsvpShareCard(opts: {
  origin: string;
  event: EventRsvpShareRow;
  fallbackImageUrl?: string;
}): {
  title: string;
  imageUrl: string;
  previewShareUrl: string;
  destinationHref: string;
} | null {
  const id = normalizeFlyerId(opts.event.id);
  if (!id) return null;
  const previewShareUrl = buildEventRsvpShareUrl({ origin: opts.origin, eventId: id });
  if (!previewShareUrl) return null;

  const imageRaw =
    String(opts.event.image_url || '').trim() ||
    String(opts.fallbackImageUrl || '').trim() ||
    '/images/awc-logo.png';

  return {
    title: String(opts.event.name || 'PLCC Event').trim() || 'PLCC Event',
    imageUrl: absoluteAssetUrl(opts.origin, imageRaw),
    previewShareUrl,
    destinationHref: resolveDestinationHref(opts.origin, eventRsvpAppPath(id)),
  };
}
