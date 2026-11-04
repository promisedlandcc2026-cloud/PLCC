/**
 * WhatsApp-safe huddle OG image proxy.
 * GET /api/share-huddle-image?channel=<uuid>
 *
 * Fetches the channel share image (or static fallback), re-encodes to a small JPEG,
 * and returns it from our domain so WhatsApp can display the preview.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSupabaseAdmin } from './_utils/auth.js';
import {
  HUDDLE_SHARE_DEFAULT_IMAGE_PATH,
  getHuddleSharePreview,
  huddleShareImagePath,
  normalizeShareChannelId,
} from './_utils/huddleSharePreview.js';
import {
  compressImageForWhatsAppOg,
  isAllowedOgImageSourceUrl,
} from './_utils/whatsappOgImage.js';

function requestOrigin(req: VercelRequest): string {
  const protoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (hostHeader) {
    const proto = protoHeader === 'http' ? 'http' : 'https';
    return `${proto}://${hostHeader}`;
  }
  return 'https://plcc-vault.vercel.app';
}

async function loadLocalPublicImage(relPath: string): Promise<Buffer | null> {
  const clean = String(relPath || '').split('?')[0];
  if (!clean.startsWith('/images/')) return null;
  try {
    return await readFile(join(process.cwd(), 'public', clean.replace(/^\//, '')));
  } catch {
    try {
      return await readFile(join(process.cwd(), 'dist', clean.replace(/^\//, '')));
    } catch {
      return null;
    }
  }
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

  const origin = requestOrigin(req);
  let sourceUrl: string | null = null;
  let localPath: string | null = null;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from('chat_channels')
      .select('share_image_url')
      .eq('id', channelId)
      .maybeSingle();
    const dbUrl = String(data?.share_image_url || '').trim();
    if (dbUrl) {
      if (dbUrl.startsWith('/')) localPath = dbUrl;
      else sourceUrl = dbUrl;
    }
  }

  if (!sourceUrl && !localPath) {
    const registered = getHuddleSharePreview(channelId);
    localPath = huddleShareImagePath(registered) || HUDDLE_SHARE_DEFAULT_IMAGE_PATH;
  }

  let input: Buffer | null = null;
  if (localPath) {
    input = await loadLocalPublicImage(localPath);
    if (!input && localPath.startsWith('/')) {
      sourceUrl = `${origin}${localPath}`;
    }
  }

  if (!input && sourceUrl) {
    if (!isAllowedOgImageSourceUrl(sourceUrl, origin)) {
      return res.status(400).send('Image source not allowed.');
    }
    try {
      const imgRes = await fetch(sourceUrl, {
        headers: { Accept: 'image/*', 'User-Agent': 'PLCC-Vault-OG/1.0' },
        redirect: 'follow',
      });
      if (!imgRes.ok) {
        return res.status(502).send('Could not fetch share image.');
      }
      const arr = await imgRes.arrayBuffer();
      input = Buffer.from(arr);
    } catch (err) {
      console.error('[share-huddle-image] fetch', (err as Error)?.message || err);
      return res.status(502).send('Could not fetch share image.');
    }
  }

  if (!input?.length) {
    // Last resort: Connect logo from public
    input = await loadLocalPublicImage(HUDDLE_SHARE_DEFAULT_IMAGE_PATH);
  }
  if (!input?.length) {
    return res.status(404).send('Share image not found.');
  }

  try {
    const compressed = await compressImageForWhatsAppOg(input);
    res.setHeader('Content-Type', compressed.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('X-OG-Width', String(compressed.width));
    res.setHeader('X-OG-Height', String(compressed.height));
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(compressed.buffer);
  } catch (err) {
    console.error('[share-huddle-image] compress', (err as Error)?.message || err);
    return res.status(500).send('Could not process share image.');
  }
}
