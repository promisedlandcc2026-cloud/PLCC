/**
 * Kids ministry Sunday plan archive — resource=kids-plans
 * Metadata in kids_ministry_plans; blobs in Storage bucket kids-ministry-plans.
 */
import { randomUUID } from 'node:crypto';
import { requireAuth, getSupabaseAdmin } from './auth.js';
import { getAudit } from './deps.js';

export const KIDS_PLANS_BUCKET = 'kids-ministry-plans';
export const KIDS_PLANS_MAX_BYTES = 15 * 1024 * 1024;
export const KIDS_PLANS_SIGNED_TTL_SEC = 60 * 60;

const ALLOWED_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
  'SUNDAY_SCHOOL_TEACHER',
  'MINISTRY_LEADER',
  'TEACHER',
]);

const DELETE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR']);

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] || '').trim();
  return String(v || '').trim();
}

function canAccess(role: unknown): boolean {
  return ALLOWED_ROLES.has(String(role || '').toUpperCase());
}

function canForceDelete(role: unknown): boolean {
  return DELETE_ROLES.has(String(role || '').toUpperCase());
}

/** Verified guardian with at least one active guardian_relationships row. */
async function isActiveGuardian(supabase: any, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('guardian_relationships')
    .select('id')
    .eq('guardian_user_id', userId)
    .eq('status', 'active')
    .limit(1);
  if (error) {
    console.warn('[kids-plans] guardian check', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

function parseDataUrl(raw: string): { mime: string; buffer: Buffer } | null {
  const match = String(raw || '').match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase().trim();
  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return null;
    return { mime, buffer };
  } catch {
    return null;
  }
}

function extForMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'jpg';
  }
}

async function signPath(supabase: any, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(KIDS_PLANS_BUCKET)
    .createSignedUrl(path, KIDS_PLANS_SIGNED_TTL_SEC);
  if (error) {
    console.warn('[kids-plans] signed url', error.message);
    return null;
  }
  return data?.signedUrl || null;
}

export async function handleKidsMinistryPlans(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Service unavailable' });
  }

  const auth = await requireAuth(req, res, supabase);
  if (!auth) return;

  const userId = String(auth.user?.id || '');
  const role = String(auth.role || '').toUpperCase();
  const staffAccess = canAccess(auth.role);

  try {
    if (req.method === 'GET') {
      // Staff roles OR active guardians (Connect parents) — read-only list.
      if (!staffAccess) {
        const guardian = await isActiveGuardian(supabase, userId);
        if (!guardian) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have access to Kids Plans.',
          });
        }
      }

      const year = first(req.query?.year);
      const classroom = first(req.query?.classroom);
      let query = supabase
        .from('kids_ministry_plans')
        .select(
          'id, service_date, classroom, title, notes, storage_path, file_name, content_type, byte_size, uploaded_by, created_at'
        )
        .order('service_date', { ascending: false })
        .limit(200);

      if (year && /^\d{4}$/.test(year)) {
        query = query
          .gte('service_date', `${year}-01-01`)
          .lte('service_date', `${year}-12-31`);
      }
      if (classroom) {
        query = query.ilike('classroom', classroom);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[kids-plans] list', error.message);
        return res.status(500).json({ ok: false, error: 'Could not load plans.' });
      }

      const plans = [];
      for (const row of data || []) {
        const signedUrl = row.storage_path
          ? await signPath(supabase, String(row.storage_path))
          : null;
        plans.push({
          id: row.id,
          serviceDate: row.service_date,
          classroom: row.classroom,
          title: row.title,
          notes: row.notes,
          fileName: row.file_name,
          contentType: row.content_type,
          byteSize: row.byte_size,
          uploadedBy: staffAccess ? row.uploaded_by : null,
          createdAt: row.created_at,
          signedUrl,
          canDelete: staffAccess
            ? row.uploaded_by === userId || canForceDelete(role)
            : false,
        });
      }

      return res.status(200).json({ ok: true, plans, bucket: KIDS_PLANS_BUCKET });
    }

    // Upload / delete remain staff-only.
    if (!staffAccess) {
      return res.status(403).json({
        ok: false,
        error: 'You do not have access to Kids Plans.',
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const serviceDate = first(body.serviceDate || body.service_date);
      const classroom = first(body.classroom).slice(0, 80);
      const title = first(body.title).slice(0, 200) || null;
      const notes = first(body.notes).slice(0, 1000) || null;
      const fileName = first(body.fileName || body.file_name).slice(0, 200) || 'plan.jpg';
      const dataUrl = String(body.dataUrl || body.fileData || body.base64 || '');

      if (!serviceDate || !/^\d{4}-\d{2}-\d{2}/.test(serviceDate)) {
        return res.status(400).json({ ok: false, error: 'serviceDate (YYYY-MM-DD) is required.' });
      }
      if (!classroom) {
        return res.status(400).json({ ok: false, error: 'classroom is required.' });
      }
      if (!dataUrl) {
        return res.status(400).json({ ok: false, error: 'File data is required.' });
      }

      const parsed = parseDataUrl(dataUrl);
      if (!parsed) {
        return res.status(400).json({ ok: false, error: 'Invalid file data. Use a JPEG, PNG, WebP, GIF, or PDF.' });
      }
      if (!ALLOWED_MIME.has(parsed.mime)) {
        return res.status(400).json({ ok: false, error: 'Unsupported file type. Use image or PDF.' });
      }
      if (parsed.buffer.length > KIDS_PLANS_MAX_BYTES) {
        return res.status(400).json({ ok: false, error: 'File too large (max 15MB).' });
      }

      // Never create Auth users for this path
      const id = randomUUID();
      const datePart = serviceDate.slice(0, 10);
      const safeClass = classroom.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'class';
      const storagePath = `${safeClass}/${datePart}/${id}.${extForMime(parsed.mime)}`;

      const { error: upErr } = await supabase.storage
        .from(KIDS_PLANS_BUCKET)
        .upload(storagePath, parsed.buffer, {
          contentType: parsed.mime,
          upsert: false,
        });

      if (upErr) {
        console.error('[kids-plans] upload', upErr.message);
        return res.status(500).json({
          ok: false,
          error: 'Could not upload file. Confirm the kids-ministry-plans Storage bucket exists.',
        });
      }

      const { data: row, error: insErr } = await supabase
        .from('kids_ministry_plans')
        .insert({
          id,
          service_date: datePart,
          classroom,
          title,
          notes,
          storage_path: storagePath,
          file_name: fileName,
          content_type: parsed.mime,
          byte_size: parsed.buffer.length,
          uploaded_by: userId || null,
        })
        .select(
          'id, service_date, classroom, title, notes, storage_path, file_name, content_type, byte_size, uploaded_by, created_at'
        )
        .single();

      if (insErr || !row) {
        await supabase.storage.from(KIDS_PLANS_BUCKET).remove([storagePath]).catch(() => null);
        console.error('[kids-plans] insert', insErr?.message);
        return res.status(500).json({ ok: false, error: 'Could not save plan record.' });
      }

      try {
        const logAudit = await getAudit();
        await logAudit({
          userId,
          action: 'Kids Ministry Plan Uploaded',
          details: {
            planId: row.id,
            classroom,
            serviceDate: datePart,
            storagePath,
          },
          resourceType: 'kids_ministry_plans',
          resourceId: row.id,
          severity: 'info',
          req,
        });
      } catch {
        /* optional */
      }

      const signedUrl = await signPath(supabase, storagePath);
      return res.status(200).json({
        ok: true,
        plan: {
          id: row.id,
          serviceDate: row.service_date,
          classroom: row.classroom,
          title: row.title,
          notes: row.notes,
          fileName: row.file_name,
          contentType: row.content_type,
          byteSize: row.byte_size,
          uploadedBy: row.uploaded_by,
          createdAt: row.created_at,
          signedUrl,
          canDelete: true,
        },
      });
    }

    if (req.method === 'DELETE') {
      const planId = first(req.query?.id || req.body?.id);
      if (!planId) {
        return res.status(400).json({ ok: false, error: 'Plan id required.' });
      }

      const { data: row, error } = await supabase
        .from('kids_ministry_plans')
        .select('id, storage_path, uploaded_by, classroom, service_date')
        .eq('id', planId)
        .maybeSingle();

      if (error || !row) {
        return res.status(404).json({ ok: false, error: 'Plan not found.' });
      }

      if (row.uploaded_by !== userId && !canForceDelete(role)) {
        return res.status(403).json({ ok: false, error: 'Only the uploader or an admin can delete this plan.' });
      }

      if (row.storage_path) {
        await supabase.storage.from(KIDS_PLANS_BUCKET).remove([String(row.storage_path)]).catch(() => null);
      }

      const { error: delErr } = await supabase.from('kids_ministry_plans').delete().eq('id', planId);
      if (delErr) {
        return res.status(500).json({ ok: false, error: 'Could not delete plan.' });
      }

      try {
        const logAudit = await getAudit();
        await logAudit({
          userId,
          action: 'Kids Ministry Plan Deleted',
          details: {
            planId,
            classroom: row.classroom,
            serviceDate: row.service_date,
          },
          resourceType: 'kids_ministry_plans',
          resourceId: planId,
          severity: 'warning',
          req,
        });
      } catch {
        /* optional */
      }

      return res.status(200).json({ ok: true, deleted: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[kids-plans]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Kids Plans request failed.' });
  }
}
