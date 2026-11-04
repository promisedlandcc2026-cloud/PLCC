/**
 * WhatsApp link-preview images should stay well under ~600KB (often fails above ~300KB).
 * Re-encode to JPEG for reliable OG cards.
 */
import sharp from 'sharp';

export const WHATSAPP_OG_MAX_BYTES = 280 * 1024;
export const WHATSAPP_OG_MAX_EDGE = 1080;

export async function compressImageForWhatsAppOg(
  input: Buffer
): Promise<{ buffer: Buffer; contentType: 'image/jpeg'; width: number; height: number }> {
  let quality = 78;
  let edge = WHATSAPP_OG_MAX_EDGE;
  let last = Buffer.alloc(0);
  let meta = { width: edge, height: edge };

  for (let attempt = 0; attempt < 8; attempt++) {
    const pipeline = sharp(input, { failOn: 'none' })
      .rotate()
      .resize({
        width: edge,
        height: edge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true });

    last = await pipeline.toBuffer();
    const info = await sharp(last).metadata();
    meta = {
      width: Number(info.width || edge),
      height: Number(info.height || edge),
    };
    if (last.length <= WHATSAPP_OG_MAX_BYTES) {
      return { buffer: last, contentType: 'image/jpeg', ...meta };
    }
    if (quality > 52) quality -= 8;
    else edge = Math.max(640, Math.round(edge * 0.85));
  }

  return { buffer: last, contentType: 'image/jpeg', ...meta };
}

export function isAllowedOgImageSourceUrl(url: string, origin: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    const originHost = new URL(origin).hostname.toLowerCase();
    if (host === originHost) return true;
    if (host.endsWith('.supabase.co') && u.pathname.includes('/storage/')) return true;
    if (host === 'plcc-opal.vercel.app') return true;
    return false;
  } catch {
    return false;
  }
}

export function buildHuddleOgImageProxyUrl(opts: {
  origin: string;
  channelId: string;
  version?: string | number | null;
}): string | null {
  const origin = String(opts.origin || '').trim().replace(/\/$/, '');
  const id = String(opts.channelId || '').trim().toLowerCase();
  if (!origin || !id) return null;
  const v = opts.version != null && String(opts.version).trim()
    ? `&v=${encodeURIComponent(String(opts.version).trim())}`
    : '';
  return `${origin}/api/share-huddle-image?channel=${encodeURIComponent(id)}${v}`;
}
