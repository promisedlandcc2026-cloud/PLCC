/**
 * Vault Serve Eligibility Admin HTTP handler — service-role DB.
 * Mounted at: /api/vault?resource=users&subResource=serve-eligibility
 *
 * Mutations do NOT touch serve_signups, serve_opportunities, or event_volunteers.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { getAudit } from './deps.js';
import {
  asUuid,
  isServeEligibilityAdminRole,
  parseEligibilityMutation,
  toEligibilityAdminDto,
} from './serveEligibilityAdminLogic.js';

async function assertEligibilityAdmin(req: any, res: any, supabase: any) {
  const auth = await requireAuth(req, res, supabase);
  if (!auth) return null;
  const role = String(auth.role || '').toUpperCase();
  if (!isServeEligibilityAdminRole(role)) {
    res.status(403).json({
      ok: false,
      error: 'Forbidden: Serve eligibility admin role required',
      code: 'serve_eligibility_admin_forbidden',
    });
    return null;
  }
  return auth;
}

export async function handleServeEligibilityAdmin(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });
  }

  const auth = await assertEligibilityAdmin(req, res, supabase);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res, supabase);
    }
    if (req.method === 'PATCH') {
      return await handlePatch(req, res, supabase, auth);
    }
    return res.status(405).json({ ok: false, error: 'Method not allowed', code: 'method_not_allowed' });
  } catch (err: any) {
    console.error('[Serve Eligibility Admin]', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: 'Serve eligibility admin failed',
      code: 'serve_eligibility_admin_failed',
    });
  }
}

async function handleGet(req: any, res: any, supabase: any) {
  const userId = asUuid(req.query?.userId ?? req.query?.id);
  if (!userId) {
    return res.status(400).json({
      ok: false,
      error: 'userId must be a valid UUID',
      code: 'invalid_user_id',
    });
  }

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (uErr) throw uErr;
  if (!user?.id) {
    return res.status(404).json({
      ok: false,
      error: 'User not found',
      code: 'user_not_found',
    });
  }

  const { data: row, error } = await supabase
    .from('serve_eligibility')
    .select('user_id, status, reason_code, verified_at, verified_by, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  return res.status(200).json({
    ok: true,
    eligibility: toEligibilityAdminDto(userId, row),
  });
}

async function handlePatch(req: any, res: any, supabase: any, auth: any) {
  const actorId = auth.user?.id;
  const parsed = parseEligibilityMutation(req.body || {}, actorId);
  if (parsed.ok === false) {
    const http =
      parsed.code === 'unauthorized'
        ? 401
        : 400;
    return res.status(http).json({
      ok: false,
      error: parsed.error,
      code: parsed.code,
    });
  }

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id')
    .eq('id', parsed.userId)
    .maybeSingle();
  if (uErr) throw uErr;
  if (!user?.id) {
    return res.status(404).json({
      ok: false,
      error: 'User not found',
      code: 'user_not_found',
    });
  }

  const { data: prior } = await supabase
    .from('serve_eligibility')
    .select('status, reason_code')
    .eq('user_id', parsed.userId)
    .maybeSingle();
  const priorStatus = prior?.status ? String(prior.status) : 'not_verified';

  if (parsed.action === 'reset') {
    const { error: delErr } = await supabase
      .from('serve_eligibility')
      .delete()
      .eq('user_id', parsed.userId);
    if (delErr) throw delErr;

    const logAudit = await getAudit();
    await logAudit({
      userId: actorId,
      action: 'Serve Eligibility Reset',
      details: {
        targetUserId: parsed.userId,
        priorStatus,
        newStatus: 'not_verified',
      },
      resourceType: 'serve_eligibility',
      resourceId: parsed.userId,
      severity: 'warning',
      req,
    });

    return res.status(200).json({
      ok: true,
      action: 'reset',
      idempotent: !prior,
      eligibility: toEligibilityAdminDto(parsed.userId, null),
    });
  }

  const { data: upserted, error: upErr } = await supabase
    .from('serve_eligibility')
    .upsert(parsed.row, { onConflict: 'user_id' })
    .select('user_id, status, reason_code, verified_at, verified_by, created_at, updated_at')
    .single();
  if (upErr) throw upErr;

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: `Serve Eligibility ${String(parsed.status).toUpperCase()}`,
    details: {
      targetUserId: parsed.userId,
      priorStatus,
      newStatus: parsed.status,
      reasonCode: parsed.reasonCode,
    },
    resourceType: 'serve_eligibility',
    resourceId: parsed.userId,
    severity: parsed.status === 'eligible' ? 'info' : 'warning',
    req,
  });

  return res.status(200).json({
    ok: true,
    action: 'set',
    eligibility: toEligibilityAdminDto(parsed.userId, upserted),
  });
}
