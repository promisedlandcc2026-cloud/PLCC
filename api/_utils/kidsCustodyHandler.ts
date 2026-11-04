/**
 * Vault Kids Family Pass custody HTTP handler.
 * Mounted at:
 *   POST /api/vault?resource=attendance&subResource=kids-custody-lookup
 *   POST /api/vault?resource=attendance&subResource=kids-custody-checkin
 *   POST /api/vault?resource=attendance&subResource=kids-custody-checkout
 *   GET  /api/vault?resource=attendance&subResource=kids-custody-open&sessionId=
 *   GET  /api/vault?resource=attendance&subResource=kids-custody-open&list=1
 *
 * Phase 2.7D.6 — child QR identifies child; staff confirms guardian.
 * Does not write legacy public.attendance. Does not mutate Connect.
 */

import { getSupabaseAdmin, requireAuth } from './auth.js';
import { kioskMayListOpenChildren } from './routeAccess.js';
import {
  CUSTODY_RATE_LIMITS,
  evaluateRateLimit,
  hashCardToken,
  humanMessageForCustodyCode,
  httpStatusForCustodyCode,
  isKidsCustodyRole,
  mapRpcErrorMessage,
  parseCustodyCheckinBody,
  parseCustodyCheckoutBody,
  parseCustodyLookupBody,
  sanitizeLookupDto,
  asUuid,
  type KidsCustodyErrorCode,
} from './kidsCustodyLogic.js';

async function getAudit() {
  const { getAudit: loadAudit } = await import('./deps.js');
  return loadAudit();
}

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

function fail(res: any, code: KidsCustodyErrorCode, error?: string) {
  setNoStore(res);
  return res.status(httpStatusForCustodyCode(code)).json({
    ok: false,
    error: error || humanMessageForCustodyCode(code),
    code,
  });
}

function clientIp(req: any): string {
  const xf = req?.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim().slice(0, 64);
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0].trim().slice(0, 64);
  return String(req?.socket?.remoteAddress || 'unknown').slice(0, 64);
}

const rateBuckets = new Map<string, number[]>();

function allowMutation(actorId: string, ip: string): boolean {
  const now = Date.now();
  const windowMs = Math.max(...CUSTODY_RATE_LIMITS.map((l) => l.windowMs));
  const check = (key: string) => {
    const prev = rateBuckets.get(key) || [];
    const kept = prev.filter((t) => t > now - windowMs);
    return {
      key,
      kept,
      allowed: evaluateRateLimit(kept, now, [...CUSTODY_RATE_LIMITS]).allowed,
    };
  };
  const actor = check(`custody:actor:${actorId}`);
  const ipB = check(`custody:ip:${ip}`);
  if (!actor.allowed || !ipB.allowed) return false;
  actor.kept.push(now);
  ipB.kept.push(now);
  rateBuckets.set(actor.key, actor.kept);
  rateBuckets.set(ipB.key, ipB.kept);
  if (rateBuckets.size > 5000) {
    const oldest = rateBuckets.keys().next().value;
    if (oldest) rateBuckets.delete(oldest);
  }
  return true;
}

async function safeAudit(payload: {
  userId?: string | null;
  action: string;
  details?: Record<string, unknown>;
  resourceType?: string;
  resourceId?: string;
  severity?: 'info' | 'warning' | 'critical';
  req?: any;
}) {
  try {
    const logAudit = await getAudit();
    await logAudit(payload);
  } catch (err: any) {
    console.warn('[kids-custody] audit failed (non-fatal):', err?.message || err);
  }
}

function rpcFail(res: any, error: any) {
  const msg = String(error?.message || error || '');
  const code = mapRpcErrorMessage(msg);
  if (code) {
    return fail(res, code);
  }
  if (/relation .* does not exist|function .* does not exist|column .* does not exist/i.test(msg)) {
    return fail(res, 'custody_unavailable');
  }
  console.error('[kids-custody] rpc error:', msg);
  return fail(res, 'custody_error', 'Kids custody request failed.');
}

export async function handleKidsCustody(req: any, res: any) {
  try {
    setNoStore(res);
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return fail(res, 'custody_unavailable', 'Supabase Admin not initialized.');
    }

    const auth = await requireAuth(req, res, supabase);
    if (!auth) return;

    if (!isKidsCustodyRole(auth.role)) {
      return fail(res, 'forbidden');
    }

    const sub = String(req.query?.subResource || '');
    const method = String(req.method || '').toUpperCase();

    if (sub === 'kids-custody-open' && method === 'GET') {
      return await handleOpenCount(req, res, supabase, auth);
    }

    if (sub === 'kids-custody-lookup' && method === 'POST') {
      return await handleLookup(req, res, supabase, auth);
    }

    if (sub === 'kids-custody-checkin' && method === 'POST') {
      return await handleCheckin(req, res, supabase, auth);
    }

    if (sub === 'kids-custody-checkout' && method === 'POST') {
      return await handleCheckout(req, res, supabase, auth);
    }

    return fail(res, 'method_not_allowed', 'Unsupported kids custody method or path.');
  } catch (err: any) {
    console.error('[kids-custody] handler error:', err?.message || err);
    return fail(res, 'custody_error');
  }
}

async function handleOpenCount(req: any, res: any, supabase: any, auth: { role: string | null }) {
  const sessionId = asUuid(req.query?.sessionId);
  const list =
    String(req.query?.list || '') === '1' ||
    String(req.query?.list || '') === 'true' ||
    String(req.query?.details || '') === '1';

  if (list && !kioskMayListOpenChildren(auth.role, true)) {
    return fail(res, 'forbidden', 'Kiosk cannot list checked-in children.');
  }

  // Desk list: all currently open custody rows on open kids sessions (Who checked in → Kids).
  if (list && !sessionId) {
    const { data: openKids, error: sessErr } = await supabase
      .from('attendance_sessions')
      .select('id, title, type, status')
      .eq('type', 'kids')
      .eq('status', 'open');
    if (sessErr) {
      if (/does not exist/i.test(String(sessErr.message || ''))) {
        return fail(res, 'custody_unavailable');
      }
      throw sessErr;
    }
    const sessions = openKids || [];
    if (!sessions.length) {
      setNoStore(res);
      return res.status(200).json({ ok: true, openCount: 0, records: [] });
    }
    const sessionMap = new Map(
      sessions.map((s: any) => [String(s.id), { title: String(s.title || 'Kids session') }])
    );
    const sessionIds = sessions.map((s: any) => s.id);
    const { data: rows, error } = await supabase
      .from('child_custody_records')
      .select('id, session_id, child_member_id, checked_in_at, source')
      .in('session_id', sessionIds)
      .is('checked_out_at', null)
      .order('checked_in_at', { ascending: false })
      .limit(200);
    if (error) {
      if (/does not exist/i.test(String(error.message || ''))) {
        return fail(res, 'custody_unavailable');
      }
      throw error;
    }
    const memberIds = [
      ...new Set((rows || []).map((r: any) => String(r.child_member_id || '')).filter(Boolean)),
    ];
    const memberMap = new Map<string, string>();
    if (memberIds.length) {
      const { data: members, error: memErr } = await supabase
        .from('members')
        .select('id, first_name, last_name')
        .in('id', memberIds);
      if (memErr) throw memErr;
      for (const m of members || []) {
        const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Child';
        memberMap.set(String(m.id), name);
      }
    }
    const records = (rows || []).map((r: any) => ({
      id: String(r.id),
      sessionId: String(r.session_id || ''),
      sessionTitle: sessionMap.get(String(r.session_id))?.title || 'Kids session',
      childMemberId: String(r.child_member_id || ''),
      childDisplayName: memberMap.get(String(r.child_member_id)) || 'Child',
      checkedInAt: String(r.checked_in_at || ''),
      source: String(r.source || 'digital_card'),
    }));
    setNoStore(res);
    return res.status(200).json({ ok: true, openCount: records.length, records });
  }

  if (!sessionId) {
    return fail(res, 'invalid_uuid', 'sessionId must be a valid UUID.');
  }
  const { count, error } = await supabase
    .from('child_custody_records')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .is('checked_out_at', null);
  if (error) {
    if (/does not exist/i.test(String(error.message || ''))) {
      return fail(res, 'custody_unavailable');
    }
    throw error;
  }
  setNoStore(res);
  return res.status(200).json({ ok: true, openCount: count || 0, sessionId });
}

async function handleLookup(req: any, res: any, supabase: any, auth: any) {
  if (!allowMutation(auth.user!.id, clientIp(req))) {
    return fail(res, 'rate_limited');
  }
  const parsed = parseCustodyLookupBody(req.body);
  if (!parsed.ok) return fail(res, parsed.code, parsed.error);

  const tokenHash = hashCardToken(parsed.token);
  const { data, error } = await supabase.rpc('kids_custody_lookup_by_card_hash', {
    p_qr_token_hash: tokenHash,
    p_session_id: parsed.sessionId,
    p_mode: parsed.mode,
  });

  if (error) return rpcFail(res, error);

  const dto = sanitizeLookupDto(data);
  if (!dto) {
    return fail(res, 'custody_error', 'Lookup returned an invalid payload.');
  }

  await safeAudit({
    userId: auth.user!.id,
    action: 'kids_custody.lookup',
    resourceType: 'child_custody',
    resourceId: dto.childMemberId,
    details: {
      sessionId: dto.sessionId,
      mode: dto.mode,
      custodyStatus: dto.custodyStatus,
      guardianCount: dto.guardians.length,
    },
    req,
  });

  setNoStore(res);
  return res.status(200).json({ ok: true, ...dto });
}

async function handleCheckin(req: any, res: any, supabase: any, auth: any) {
  if (!allowMutation(auth.user!.id, clientIp(req))) {
    return fail(res, 'rate_limited');
  }
  const parsed = parseCustodyCheckinBody(req.body);
  if (!parsed.ok) return fail(res, parsed.code, parsed.error);

  const { data, error } = await supabase.rpc('kids_custody_checkin', {
    p_session_id: parsed.sessionId,
    p_child_member_id: parsed.childMemberId,
    p_guardian_user_id: parsed.guardianUserId,
    p_actor_user_id: auth.user!.id,
    p_source: parsed.source,
  });

  if (error) return rpcFail(res, error);

  await safeAudit({
    userId: auth.user!.id,
    action: 'kids_custody.checkin',
    resourceType: 'child_custody',
    resourceId: data?.custodyId || parsed.childMemberId,
    details: {
      sessionId: parsed.sessionId,
      childMemberId: parsed.childMemberId,
      guardianUserId: parsed.guardianUserId,
      source: parsed.source,
    },
    severity: 'info',
    req,
  });

  setNoStore(res);
  return res.status(200).json({
    ok: true,
    custodyId: data?.custodyId,
    sessionId: data?.sessionId,
    childMemberId: data?.childMemberId,
    checkedInAt: data?.checkedInAt,
    checkInGuardianUserId: data?.checkInGuardianUserId,
    source: data?.source,
  });
}

async function handleCheckout(req: any, res: any, supabase: any, auth: any) {
  if (!allowMutation(auth.user!.id, clientIp(req))) {
    return fail(res, 'rate_limited');
  }
  const parsed = parseCustodyCheckoutBody(req.body);
  if (!parsed.ok) return fail(res, parsed.code, parsed.error);

  const { data, error } = await supabase.rpc('kids_custody_checkout', {
    p_custody_id: parsed.custodyId,
    p_guardian_user_id: parsed.guardianUserId,
    p_actor_user_id: auth.user!.id,
  });

  if (error) return rpcFail(res, error);

  await safeAudit({
    userId: auth.user!.id,
    action: 'kids_custody.checkout',
    resourceType: 'child_custody',
    resourceId: parsed.custodyId,
    details: {
      sessionId: data?.sessionId,
      childMemberId: data?.childMemberId,
      guardianUserId: parsed.guardianUserId,
    },
    severity: 'info',
    req,
  });

  setNoStore(res);
  return res.status(200).json({
    ok: true,
    custodyId: data?.custodyId,
    sessionId: data?.sessionId,
    childMemberId: data?.childMemberId,
    checkedInAt: data?.checkedInAt,
    checkedOutAt: data?.checkedOutAt,
    checkOutGuardianUserId: data?.checkOutGuardianUserId,
  });
}
