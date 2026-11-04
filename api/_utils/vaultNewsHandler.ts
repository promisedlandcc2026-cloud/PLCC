/**
 * Home Vault News and a real database health check.
 * Health always answers HTTP 200 so the home page can render during an outage.
 */
import { getSupabaseAdmin, requireAuth, withSupabaseTimeout } from './auth.js';
import { notifyAllUsers } from './notify.js';

const NEWS_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'MINISTRY_LEADER']);
const NEWS_KINDS = new Set(['church', 'database', 'celebration', 'sympathy', 'live_huddle']);
const HEALTH_TIMEOUT_MS = 4_000;
const NEWS_COLUMNS =
  'id, created_at, title, body, kind, author_name, author_role, image_url';
const NEWS_COLUMNS_PLAIN =
  'id, created_at, title, body, kind, author_name, author_role';
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const HOME_NEWS_LIMIT = 3;
const NEWS_PAGE_MAX = 20;

function queryNumber(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function newsIdFrom(req: any): string {
  const fromBody = String(req.body?.id || '').trim();
  const rawQuery = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  const fromQuery = String(rawQuery || '').trim();
  const id = fromBody || fromQuery;
  return /^[0-9a-f-]{36}$/i.test(id) ? id : '';
}

function readNewsFields(req: any): { title: string; body: string; kind: string } | { error: string } {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const kind = String(req.body?.kind || 'church').trim().toLowerCase();
  if (!title || title.length > 120) return { error: 'Add a title of 120 characters or less.' };
  if (!body || body.length > 1000) return { error: 'Add a note of 1,000 characters or less.' };
  if (!NEWS_KINDS.has(kind)) {
    return { error: 'Choose Church, Database, Celebration, Sympathy, or Live Huddle.' };
  }
  return { title, body, kind };
}

function canPostNews(auth: { role?: string }, res: any): boolean {
  const role = String(auth.role || '').toUpperCase();
  if (NEWS_ROLES.has(role)) return true;
  res.status(403).json({
    ok: false,
    error: 'Only Pastor, Ministry Leader, and Super Admin can post Vault News.',
  });
  return false;
}

function newsWriteError(res: any, error: { code?: string; message?: string }, kind: string) {
  if (missingImageColumn(error)) {
    return res.status(503).json({
      ok: false,
      error: 'Run supabase/migrations/vault_news_image.sql in the Supabase SQL editor, then post the photo again.',
    });
  }
  if (kind === 'live_huddle' && /check constraint|23514/i.test(`${error.code || ''} ${error.message || ''}`)) {
    return res.status(503).json({
      ok: false,
      error: 'Run supabase/migrations/vault_news_live_huddle.sql in the Supabase SQL editor, then post Live Huddle again.',
    });
  }
  if (missingNewsTable(error)) {
    return res.status(503).json({
      ok: false,
      error: 'Run supabase/migrations/vault_news.sql in the Supabase SQL editor, then post again.',
    });
  }
  return res.status(500).json({ ok: false, error: 'Could not save that news item.' });
}

function missingNewsTable(error: { message?: string } | null | undefined): boolean {
  const msg = String(error?.message || '');
  if (/image_url/i.test(msg)) return false;
  return /vault_news|does not exist|schema cache/i.test(msg);
}

function missingImageColumn(error: { message?: string } | null | undefined): boolean {
  return /image_url/i.test(String(error?.message || ''));
}

async function storeNewsImage(supabase: any, raw: string): Promise<string> {
  const match = String(raw || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    const err: any = new Error('Choose a JPG, PNG, or WebP image.');
    err.status = 400;
    throw err;
  }
  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) {
    const err: any = new Error('Choose a JPG, PNG, or WebP image.');
    err.status = 400;
    throw err;
  }
  if (buffer.length > IMAGE_MAX_BYTES) {
    const err: any = new Error('That photo is too large. Choose a smaller one.');
    err.status = 400;
    throw err;
  }
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const path = `vault-news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  for (const bucket of ['event-images', 'avatars']) {
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const url = String(data?.publicUrl || '').trim();
      if (url.startsWith('https://')) return url;
    }
  }
  const err: any = new Error('Could not save that photo.');
  err.status = 500;
  throw err;
}

export async function handleVaultHealth(_req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(200).json({ ok: true, database: 'unavailable' });
  }
  try {
    const { error } = await withSupabaseTimeout(
      supabase.from('users').select('id').limit(1),
      HEALTH_TIMEOUT_MS,
      'vault.health'
    );
    if (error) {
      return res.status(200).json({ ok: true, database: 'unavailable' });
    }
    return res.status(200).json({ ok: true, database: 'healthy' });
  } catch {
    return res.status(200).json({ ok: true, database: 'unavailable' });
  }
}

export async function handleVaultNews(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(200).json({ ok: true, news: [], database: 'unavailable' });
  }
  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;

  if (req.method === 'GET') {
    const offset = queryNumber(req.query?.offset, 0, 0, 10_000);
    const limit = queryNumber(req.query?.limit, HOME_NEWS_LIMIT, 1, NEWS_PAGE_MAX);
    try {
      const page = async (columns: string) =>
        withSupabaseTimeout(
          supabase
            .from('vault_news')
            .select(columns)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit),
          8_000,
          'vault.news.list'
        );
      let { data, error } = await page(NEWS_COLUMNS);
      if (error && missingImageColumn(error)) {
        const retry = await page(NEWS_COLUMNS_PLAIN);
        data = retry.data;
        error = retry.error;
      }
      if (error) {
        if (missingNewsTable(error)) {
          return res.status(200).json({ ok: true, news: [], hasMore: false, needsSetup: true });
        }
        return res.status(200).json({ ok: true, news: [], hasMore: false, database: 'unavailable' });
      }
      const rows = Array.isArray(data) ? data : [];
      const hasMore = rows.length > limit;
      return res.status(200).json({ ok: true, news: hasMore ? rows.slice(0, limit) : rows, hasMore });
    } catch {
      return res.status(200).json({ ok: true, news: [], hasMore: false, database: 'unavailable' });
    }
  }

  if (req.method === 'POST') {
    if (!canPostNews(auth, res)) return;
    const role = String(auth.role || '').toUpperCase();
    const fields = readNewsFields(req);
    if ('error' in fields) return res.status(400).json({ ok: false, error: fields.error });
    const { title, body, kind } = fields;
    const authorName =
      String(auth.user.name || '').trim() ||
      String(auth.user.email || '').split('@')[0] ||
      'Leader';
    let imageUrl = '';
    const imageRaw = String(req.body?.imageBase64 || '').trim();
    if (imageRaw) {
      try {
        imageUrl = await storeNewsImage(supabase, imageRaw);
      } catch (err: any) {
        return res.status(err?.status || 500).json({
          ok: false,
          error: err?.message || 'Could not save that photo.',
        });
      }
    }
    const row: Record<string, unknown> = {
      title,
      body,
      kind,
      author_id: auth.user.id,
      author_name: authorName,
      author_role: role,
    };
    if (imageUrl) row.image_url = imageUrl;
    const { data, error } = await supabase
      .from('vault_news')
      .insert(row)
      .select(imageUrl ? NEWS_COLUMNS : NEWS_COLUMNS_PLAIN)
      .single();
    if (error) return newsWriteError(res, error, kind);
    const snippet = body.replace(/\s+/g, ' ').trim();
    await notifyAllUsers(supabase, {
      type: 'announcement',
      title,
      body: snippet.length > 180 ? `${snippet.slice(0, 179)}…` : snippet,
      link: '/dashboard',
      sourceId: data.id,
    });
    return res.status(201).json({ ok: true, item: data });
  }

  if (req.method === 'PATCH') {
    if (!canPostNews(auth, res)) return;
    const id = newsIdFrom(req);
    if (!id) return res.status(400).json({ ok: false, error: 'Choose a news post.' });
    const fields = readNewsFields(req);
    if ('error' in fields) return res.status(400).json({ ok: false, error: fields.error });
    const { title, body, kind } = fields;
    const row: Record<string, unknown> = { title, body, kind };
    const imageRaw = String(req.body?.imageBase64 || '').trim();
    const removeImage = req.body?.removeImage === true;
    if (imageRaw) {
      try {
        row.image_url = await storeNewsImage(supabase, imageRaw);
      } catch (err: any) {
        return res.status(err?.status || 500).json({
          ok: false,
          error: err?.message || 'Could not save that photo.',
        });
      }
    } else if (removeImage) {
      row.image_url = null;
    }
    const touchingPhoto = row.image_url !== undefined;
    let { data, error } = await supabase
      .from('vault_news')
      .update(row)
      .eq('id', id)
      .select(NEWS_COLUMNS)
      .maybeSingle();
    if (error && missingImageColumn(error) && !touchingPhoto) {
      const plain = { title: row.title, body: row.body, kind: row.kind };
      const retry = await supabase
        .from('vault_news')
        .update(plain)
        .eq('id', id)
        .select(NEWS_COLUMNS_PLAIN)
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }
    if (error) return newsWriteError(res, error, kind);
    if (!data) return res.status(404).json({ ok: false, error: 'That news post is no longer on Home.' });
    return res.status(200).json({ ok: true, item: data });
  }

  if (req.method === 'DELETE') {
    if (!canPostNews(auth, res)) return;
    const id = newsIdFrom(req);
    if (!id) return res.status(400).json({ ok: false, error: 'Choose a news post.' });
    const { data, error } = await supabase.from('vault_news').delete().eq('id', id).select('id');
    if (error) {
      if (missingNewsTable(error)) {
        return res.status(503).json({
          ok: false,
          error: 'Run supabase/migrations/vault_news.sql in the Supabase SQL editor, then post again.',
        });
      }
      return res.status(500).json({ ok: false, error: 'Could not take that news post down.' });
    }
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ ok: false, error: 'That news post is no longer on Home.' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
