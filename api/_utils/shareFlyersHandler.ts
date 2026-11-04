/**
 * Vault resource=share-flyers — CRUD for WhatsApp / text flyer share links.
 */
import { requireAuth, getSupabaseAdmin } from './auth.js';
import { canSubmitEvents } from './eventApprovalLogic.js';
import { loadEventApproverUserIds } from './eventApprovalNotify.js';
import {
  buildFlyerShareUrl,
  normalizeDestinationUrl,
  normalizeFlyerId,
  normalizeFlyerSlug,
  normalizeShareMessage,
  slugifyFlyerTitle,
  smsShareHref,
  whatsappShareHref,
} from './shareFlyerPreview.js';

function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] || '').trim();
  return String(v || '').trim();
}

function requestOrigin(req: any): string {
  const protoHeader = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const hostHeader = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .split(',')[0]
    .trim();
  if (hostHeader) {
    const proto = protoHeader === 'http' ? 'http' : 'https';
    return `${proto}://${hostHeader}`;
  }
  return 'https://plcc-opal.vercel.app';
}

function serializeFlyer(row: any, origin: string) {
  const id = String(row.id || '');
  const title = String(row.title || '').trim() || 'PLCC Flyer';
  const shareUrl = buildFlyerShareUrl({ origin, id, slug: row.slug });
  const shareMessage = normalizeShareMessage(row.share_message);
  return {
    id,
    title,
    imageUrl: String(row.image_url || ''),
    destinationUrl: String(row.destination_url || ''),
    shareMessage,
    slug: row.slug ? String(row.slug) : null,
    isActive: row.is_active !== false,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    shareUrl,
    whatsappUrl: shareUrl ? whatsappShareHref(shareUrl, title, shareMessage) : null,
    smsUrl: shareUrl ? smsShareHref(shareUrl, title, shareMessage) : null,
  };
}

async function assertMayManage(req: any, res: any, supabase: any) {
  const auth = await requireAuth(req, res, supabase);
  if (!auth) return null;
  const configuredApproverIds = await loadEventApproverUserIds(supabase);
  const may = canSubmitEvents({
    role: auth.role,
    userId: auth.user?.id,
    configuredApproverIds,
  });
  if (!may) {
    res.status(403).json({ ok: false, error: 'Not allowed to manage flyer share links.' });
    return null;
  }
  return auth;
}

export async function handleShareFlyers(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Service unavailable' });
  }

  const auth = await assertMayManage(req, res, supabase);
  if (!auth) return;

  const origin = requestOrigin(req);
  const userId = String(auth.user?.id || '') || null;

  try {
    if (req.method === 'GET') {
      const includeInactive = String(first(req.query?.includeInactive) || '') === '1';
      let query = supabase
        .from('share_flyers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      const { data, error } = await query;
      if (error) {
        console.error('[share-flyers] list', error.message);
        return res.status(500).json({ ok: false, error: 'Could not load flyers.' });
      }
      const flyers = (data || []).map((row: any) => serializeFlyer(row, origin));
      return res.status(200).json({ ok: true, flyers });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const title = first(body.title).slice(0, 200);
      const imageUrl = first(body.image_url || body.imageUrl).slice(0, 2000);
      const destinationRaw = first(body.destination_url || body.destinationUrl);
      const destinationUrl = normalizeDestinationUrl(destinationRaw);
      const slugRaw = first(body.slug);
      const slug = slugRaw
        ? normalizeFlyerSlug(slugRaw)
        : normalizeFlyerSlug(slugifyFlyerTitle(title));

      if (!title) {
        return res.status(400).json({ ok: false, error: 'Title is required.' });
      }
      if (!imageUrl || !/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('/')) {
        return res.status(400).json({ ok: false, error: 'A flyer image URL is required.' });
      }
      if (!destinationUrl) {
        return res.status(400).json({
          ok: false,
          error: 'Destination must be an https:// link or an app path like /#/events/…/rsvp.',
        });
      }
      if (slugRaw && !slug) {
        return res.status(400).json({ ok: false, error: 'Invalid slug.' });
      }

      const shareMessage = normalizeShareMessage(body.share_message ?? body.shareMessage);
      const baseRow: Record<string, unknown> = {
        title,
        image_url: imageUrl,
        destination_url: destinationUrl,
        slug: slug || null,
        created_by: userId,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      if (shareMessage) baseRow.share_message = shareMessage;

      const insertRow = (row: Record<string, unknown>) =>
        supabase.from('share_flyers').insert(row).select('*').single();

      let row = { ...baseRow };
      let { data, error } = await insertRow(row);

      // Database not migrated yet (no share_message column): save without it.
      if (error && shareMessage && /share_message/i.test(error.message)) {
        delete row.share_message;
        ({ data, error } = await insertRow(row));
      }

      // Auto slug from a reused title (e.g. a re-made flyer): add a short suffix.
      if (
        error &&
        !slugRaw &&
        slug &&
        (/share_flyers_slug/i.test(error.message) || error.code === '23505')
      ) {
        row = {
          ...row,
          slug: normalizeFlyerSlug(`${slug.slice(0, 70)}-${Date.now().toString(36)}`),
        };
        ({ data, error } = await insertRow(row));
      }

      if (error) {
        console.error('[share-flyers] create', error.message);
        if (/share_flyers_slug/i.test(error.message) || error.code === '23505') {
          return res.status(409).json({ ok: false, error: 'That slug is already in use.' });
        }
        return res.status(500).json({ ok: false, error: 'Could not create flyer.' });
      }

      return res.status(201).json({ ok: true, flyer: serializeFlyer(data, origin) });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const id = normalizeFlyerId(body.id || first(req.query?.id));
      if (!id) {
        return res.status(400).json({ ok: false, error: 'Flyer id is required.' });
      }

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (body.title !== undefined) {
        const title = first(body.title).slice(0, 200);
        if (!title) {
          return res.status(400).json({ ok: false, error: 'Title cannot be empty.' });
        }
        patch.title = title;
      }
      if (body.image_url !== undefined || body.imageUrl !== undefined) {
        const imageUrl = first(body.image_url || body.imageUrl).slice(0, 2000);
        if (!imageUrl) {
          return res.status(400).json({ ok: false, error: 'Image URL cannot be empty.' });
        }
        patch.image_url = imageUrl;
      }
      if (body.destination_url !== undefined || body.destinationUrl !== undefined) {
        const destinationUrl = normalizeDestinationUrl(
          body.destination_url ?? body.destinationUrl
        );
        if (!destinationUrl) {
          return res.status(400).json({
            ok: false,
            error: 'Destination must be an https:// link or an app path like /#/events/…/rsvp.',
          });
        }
        patch.destination_url = destinationUrl;
      }
      if (body.share_message !== undefined || body.shareMessage !== undefined) {
        patch.share_message = normalizeShareMessage(body.share_message ?? body.shareMessage);
      }
      if (body.slug !== undefined) {
        const slugRaw = first(body.slug);
        if (!slugRaw) {
          patch.slug = null;
        } else {
          const slug = normalizeFlyerSlug(slugRaw);
          if (!slug) {
            return res.status(400).json({ ok: false, error: 'Invalid slug.' });
          }
          patch.slug = slug;
        }
      }
      if (body.is_active !== undefined || body.isActive !== undefined) {
        const active = body.is_active ?? body.isActive;
        patch.is_active = active === true || active === 'true' || active === 1 || active === '1';
      }

      if (Object.keys(patch).length <= 1) {
        return res.status(400).json({ ok: false, error: 'No updates provided.' });
      }

      const { data, error } = await supabase
        .from('share_flyers')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('[share-flyers] patch', error.message);
        if (/share_flyers_slug/i.test(error.message) || error.code === '23505') {
          return res.status(409).json({ ok: false, error: 'That slug is already in use.' });
        }
        return res.status(500).json({ ok: false, error: 'Could not update flyer.' });
      }
      if (!data) {
        return res.status(404).json({ ok: false, error: 'Flyer not found.' });
      }

      return res.status(200).json({ ok: true, flyer: serializeFlyer(data, origin) });
    }

    if (req.method === 'DELETE') {
      const id = normalizeFlyerId(first(req.query?.id) || req.body?.id);
      if (!id) {
        return res.status(400).json({ ok: false, error: 'Flyer id is required.' });
      }
      const { data, error } = await supabase
        .from('share_flyers')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) {
        console.error('[share-flyers] deactivate', error.message);
        return res.status(500).json({ ok: false, error: 'Could not deactivate flyer.' });
      }
      if (!data) {
        return res.status(404).json({ ok: false, error: 'Flyer not found.' });
      }
      return res.status(200).json({ ok: true, flyer: serializeFlyer(data, origin) });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[share-flyers]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Flyer share request failed.' });
  }
}
