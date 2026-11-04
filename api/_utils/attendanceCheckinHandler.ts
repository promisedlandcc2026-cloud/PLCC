/**
 * Vault Attendance Check-In HTTP handler.
 * Mounted at POST /api/vault?resource=attendance&subResource=check-in
 *
 * Phase 2.7D.2 / 2.7D.5B — server authority only.
 * Manual: attendance_checkin_member
 * Digital: attendance_checkin_by_card_hash (adult or dependent; hash only)
 *
 * Client body stays { mode, sessionId, token }. No memberId spoof.
 * No scanner UI in this handler. No Kids Kiosk mutations. No Connect mutations.
 * No legacy attendance writes.
 */

import { getSupabaseAdmin, requireAuth } from './auth.js';
import {
  ATTENDANCE_CHECKIN_ROLES,
  DIGITAL_CHECKIN_RATE_LIMITS,
  MANUAL_CHECKIN_RATE_LIMITS,
  displayNameFromMemberSafe,
  evaluateRateLimit,
  hashCardToken,
  httpStatusForCheckinCode,
  isAttendanceCheckinRole,
  mapRpcErrorMessage,
  normalizeRpcResult,
  parseCheckinBody,
  sanitizeClientAttendanceDto,
  toClientAttendanceDto,
  type AttendanceCheckinErrorCode,
} from './attendanceCheckinLogic.js';

async function getAudit() {
  const { getAudit: loadAudit } = await import('./deps.js');
  return loadAudit();
}

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

function fail(res: any, code: AttendanceCheckinErrorCode, error: string) {
  setNoStore(res);
  return res.status(httpStatusForCheckinCode(code)).json({ ok: false, error, code });
}

function clientIp(req: any): string {
  const xf = req?.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim().slice(0, 64);
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0].trim().slice(0, 64);
  return String(req?.socket?.remoteAddress || 'unknown').slice(0, 64);
}

const rateBuckets = new Map<string, number[]>();

function allowMutation(
  prefix: string,
  actorId: string,
  ip: string,
  limits: readonly { windowMs: number; max: number }[]
): boolean {
  const now = Date.now();
  const windowMs = Math.max(...limits.map((l) => l.windowMs));
  const check = (key: string) => {
    const prev = rateBuckets.get(key) || [];
    const kept = prev.filter((t) => t > now - windowMs);
    return { key, kept, allowed: evaluateRateLimit(kept, now, [...limits]).allowed };
  };
  const actor = check(`${prefix}:actor:${actorId}`);
  const ipB = check(`${prefix}:ip:${ip}`);
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
    console.warn('[attendance-checkin] audit failed (non-fatal):', err?.message || err);
  }
}

async function loadMemberDisplayName(
  supabase: any,
  memberId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('members')
    .select('first_name, last_name')
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  return displayNameFromMemberSafe(data || {});
}

function rpcFail(res: any, error: any) {
  const msg = String(error?.message || error || '');
  const code = mapRpcErrorMessage(msg);
  if (code) {
    return fail(res, code, humanMessageForCode(code));
  }
  if (/relation .* does not exist|function .* does not exist|column .* does not exist/i.test(msg)) {
    return fail(res, 'attendance_unavailable', 'Attendance check-in is not available.');
  }
  console.error('[attendance-checkin] rpc error:', msg);
  return fail(res, 'attendance_checkin_error', 'Attendance check-in failed.');
}

function humanMessageForCode(code: AttendanceCheckinErrorCode): string {
  switch (code) {
    case 'session_not_found':
      return 'Session not found.';
    case 'session_not_open':
      return 'Session is not open.';
    case 'session_closed':
      return 'Session is closed.';
    case 'session_type_not_allowed':
      return 'Session type is not allowed for digital card check-in.';
    case 'member_not_found':
      return 'Member not found.';
    case 'card_not_found':
      return 'Card not found.';
    case 'card_not_valid':
      return 'Card is not valid for check-in.';
    case 'adult_card_required':
      return 'This PLCC card cannot be used for this session.';
    case 'member_link_required':
      return 'A verified member link is required for digital check-in.';
    case 'member_link_conflict':
      return 'Member link conflict.';
    case 'card_resolution_conflict':
    case 'resolver_conflict':
      return 'Card could not be resolved uniquely.';
    case 'invalid_token_hash':
      return 'Invalid token hash.';
    case 'actor_not_found':
      return 'Actor not found.';
    case 'attendance_unavailable':
      return 'Attendance check-in is not available.';
    case 'serve_signup_required':
      return 'This volunteer must be signed up for the serve opportunity before check-in.';
    default:
      return 'Attendance check-in failed.';
  }
}

export async function handleAttendanceCheckin(req: any, res: any) {
  try {
    setNoStore(res);

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return fail(res, 'attendance_unavailable', 'Supabase Admin not initialized.');
    }

    const auth = await requireAuth(req, res, supabase);
    if (!auth) return;

    if (!isAttendanceCheckinRole(auth.role)) {
      return fail(res, 'forbidden', 'Attendance check-in requires an authorized staff role.');
    }

    const method = String(req.method || '').toUpperCase();
    if (method !== 'POST') {
      return fail(res, 'method_not_allowed', 'Method not allowed.');
    }

    const parsed = parseCheckinBody(req.body);
    if (!parsed.ok) return fail(res, parsed.code, parsed.error);

    const ip = clientIp(req);
    const actorId = auth.user!.id;

    if (parsed.mode === 'manual_staff') {
      if (!allowMutation('manual', actorId, ip, MANUAL_CHECKIN_RATE_LIMITS)) {
        return fail(res, 'checkin_rate_limited', 'Check-in rate limit exceeded. Try again shortly.');
      }
      return await handleManual(req, res, supabase, auth, parsed.sessionId, parsed.memberId);
    }

    if (!allowMutation('digital', actorId, ip, DIGITAL_CHECKIN_RATE_LIMITS)) {
      return fail(res, 'checkin_rate_limited', 'Check-in rate limit exceeded. Try again shortly.');
    }
    return await handleDigital(req, res, supabase, auth, parsed.sessionId, parsed.token);
  } catch (err: any) {
    console.error('[attendance-checkin]', err?.message || err);
    const msg = String(err?.message || '');
    if (/relation .* does not exist|function .* does not exist|column .* does not exist/i.test(msg)) {
      return fail(res, 'attendance_unavailable', 'Attendance check-in is not available.');
    }
    setNoStore(res);
    return res.status(500).json({
      ok: false,
      error: 'Attendance check-in request failed.',
      code: 'attendance_checkin_error',
    });
  }
}

async function reconcileEventIfNeeded(
  supabase: any,
  rpc: { sessionId: string; memberId: string; attendanceId: string; source: string },
  actorUserId: string
) {
  try {
    await supabase.rpc('attendance_reconcile_event_checkin', {
      p_session_id: rpc.sessionId,
      p_member_id: rpc.memberId,
      p_attendance_record_id: rpc.attendanceId,
      p_actor_user_id: actorUserId,
      p_source:
        rpc.source === 'household_bulk'
          ? 'household_bulk'
          : rpc.source === 'manual_staff'
            ? 'manual_staff'
            : 'digital_card',
    });
  } catch (err: any) {
    console.warn('[attendance-checkin] event reconcile skipped:', err?.message || err);
  }
}

async function handleManual(
  req: any,
  res: any,
  supabase: any,
  auth: { user: { id: string }; role: string | null },
  sessionId: string,
  memberId: string
) {
  const { data, error } = await supabase.rpc('attendance_checkin_member', {
    p_session_id: sessionId,
    p_member_id: memberId,
    p_source: 'manual_staff',
    p_actor_user_id: auth.user!.id,
  });
  if (error) return rpcFail(res, error);

  const rpc = normalizeRpcResult(data);
  if (!rpc) {
    return fail(res, 'attendance_unavailable', 'Attendance check-in returned an unexpected result.');
  }

  const displayName = await loadMemberDisplayName(supabase, rpc.memberId);
  const attendance = sanitizeClientAttendanceDto(toClientAttendanceDto(rpc, displayName));

  await reconcileEventIfNeeded(supabase, rpc, auth.user!.id);

  await safeAudit({
    userId: auth.user!.id,
    action: 'attendance.checkin',
    details: {
      sessionId: rpc.sessionId,
      source: rpc.source,
      alreadyCheckedIn: rpc.alreadyCheckedIn,
      mode: 'manual_staff',
    },
    resourceType: 'member',
    resourceId: rpc.memberId,
    severity: 'info',
    req,
  });

  setNoStore(res);
  return res.status(200).json({ ok: true, attendance });
}

async function handleDigital(
  req: any,
  res: any,
  supabase: any,
  auth: { user: { id: string }; role: string | null },
  sessionId: string,
  token: string
) {
  // Hash in Node; discard raw token after this scope (never log/persist/return).
  const tokenHash = hashCardToken(token);

  // Phase 2.7D.9 — serve sessions with opportunity require signup
  {
    const { error: serveErr } = await supabase.rpc(
      'attendance_require_serve_signup_for_card_hash',
      {
        p_qr_token_hash: tokenHash,
        p_session_id: sessionId,
      }
    );
    if (serveErr) return rpcFail(res, serveErr);
  }

  const { data, error } = await supabase.rpc('attendance_checkin_by_card_hash', {
    p_session_id: sessionId,
    p_qr_token_hash: tokenHash,
    p_actor_user_id: auth.user!.id,
  });
  // token and tokenHash intentionally not passed further / not logged.
  void token;

  if (error) return rpcFail(res, error);

  const rpc = normalizeRpcResult(data);
  if (!rpc) {
    return fail(res, 'attendance_unavailable', 'Attendance check-in returned an unexpected result.');
  }

  const displayName = await loadMemberDisplayName(supabase, rpc.memberId);
  const attendance = sanitizeClientAttendanceDto(toClientAttendanceDto(rpc, displayName));

  // Phase 2.7D.8 — reconcile to event when session.event_id is set
  await reconcileEventIfNeeded(supabase, rpc, auth.user!.id);

  await safeAudit({
    userId: auth.user!.id,
    action: 'attendance.checkin',
    details: {
      sessionId: rpc.sessionId,
      source: rpc.source,
      alreadyCheckedIn: rpc.alreadyCheckedIn,
      mode: 'digital_card',
    },
    resourceType: 'member',
    resourceId: rpc.memberId,
    severity: 'info',
    req,
  });

  setNoStore(res);
  return res.status(200).json({ ok: true, attendance });
}

export function __resetAttendanceCheckinRateLimitForTests() {
  rateBuckets.clear();
}

export { ATTENDANCE_CHECKIN_ROLES };
