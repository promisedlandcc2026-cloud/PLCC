/**
 * Phase 2.7D.6 — Kids Family Pass custody pure helpers (no I/O).
 * Child QR identifies the child; staff must confirm authorized guardian.
 */

import { createHash } from 'node:crypto';
import { CARD_TOKEN_RE } from './cardResolverLogic.js';
import { ATTENDANCE_CHECKIN_ROLES } from './attendanceCheckinLogic.js';

export const KIDS_CUSTODY_ROLES = ATTENDANCE_CHECKIN_ROLES;

export const KIDS_CUSTODY_MODES = new Set(['in', 'out'] as const);
export type KidsCustodyMode = 'in' | 'out';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type KidsCustodyErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'method_not_allowed'
  | 'invalid_request'
  | 'invalid_mode'
  | 'invalid_uuid'
  | 'invalid_card_format'
  | 'invalid_token_hash'
  | 'spoof_rejected'
  | 'session_not_found'
  | 'session_not_open'
  | 'session_closed'
  | 'session_type_not_allowed'
  | 'session_required'
  | 'member_not_found'
  | 'card_not_found'
  | 'card_not_valid'
  | 'adult_card_required'
  | 'card_resolution_conflict'
  | 'guardian_required'
  | 'guardian_not_authorized'
  | 'already_checked_in'
  | 'already_checked_out'
  | 'custody_not_found'
  | 'actor_not_found'
  | 'invalid_source'
  | 'custody_unavailable'
  | 'custody_error'
  | 'rate_limited';

export const CUSTODY_SPOOF_FIELDS = [
  'checkedInAt',
  'checked_in_at',
  'checkedOutAt',
  'checked_out_at',
  'checkedInBy',
  'checked_in_by',
  'checkedOutBy',
  'checked_out_by',
  // `source` is client-allowed (digital_card | manual_staff) — parsed in parseCustodyCheckinBody
  'displayName',
  'childDisplayName',
  'guardians',
  'qrTokenHash',
  'qr_token_hash',
  'custodyStatus',
] as const;

export function isKidsCustodyRole(role: unknown): boolean {
  if (role == null) return false;
  return KIDS_CUSTODY_ROLES.has(String(role).toUpperCase());
}

export function asUuid(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

export function isValidCardToken(token: unknown): token is string {
  return typeof token === 'string' && CARD_TOKEN_RE.test(token);
}

export function hashCardToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function detectCustodySpoofFields(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const keys = Object.keys(body as Record<string, unknown>);
  return CUSTODY_SPOOF_FIELDS.filter((k) => keys.includes(k));
}

export type LookupParsed =
  | { ok: true; sessionId: string; mode: KidsCustodyMode; token: string }
  | { ok: false; code: KidsCustodyErrorCode; error: string };

export function parseCustodyLookupBody(body: unknown): LookupParsed {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_request', error: 'Request body is required.' };
  }
  const spoof = detectCustodySpoofFields(body);
  if (spoof.length) {
    return { ok: false, code: 'spoof_rejected', error: 'Client must not supply server-owned fields.' };
  }
  const b = body as Record<string, unknown>;
  const sessionId = asUuid(b.sessionId);
  if (!sessionId) {
    return { ok: false, code: 'invalid_uuid', error: 'sessionId must be a valid UUID.' };
  }
  const modeRaw = String(b.mode || '');
  if (modeRaw !== 'in' && modeRaw !== 'out') {
    return { ok: false, code: 'invalid_mode', error: 'mode must be in or out.' };
  }
  if (!isValidCardToken(b.token)) {
    return { ok: false, code: 'invalid_card_format', error: 'token must be a valid AWC1 card token.' };
  }
  return { ok: true, sessionId, mode: modeRaw, token: b.token as string };
}

export type CheckinParsed =
  | {
      ok: true;
      sessionId: string;
      childMemberId: string;
      guardianUserId: string;
      source: 'digital_card' | 'manual_staff';
    }
  | { ok: false; code: KidsCustodyErrorCode; error: string };

export function parseCustodyCheckinBody(body: unknown): CheckinParsed {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_request', error: 'Request body is required.' };
  }
  const spoof = detectCustodySpoofFields(body);
  if (spoof.length) {
    return { ok: false, code: 'spoof_rejected', error: 'Client must not supply server-owned fields.' };
  }
  const b = body as Record<string, unknown>;
  const sessionId = asUuid(b.sessionId);
  const childMemberId = asUuid(b.childMemberId);
  const guardianUserId = asUuid(b.guardianUserId);
  if (!sessionId || !childMemberId) {
    return { ok: false, code: 'invalid_uuid', error: 'sessionId and childMemberId must be valid UUIDs.' };
  }
  if (!guardianUserId) {
    return { ok: false, code: 'guardian_required', error: 'Select an authorized guardian.' };
  }
  const sourceRaw = b.source == null ? 'digital_card' : String(b.source);
  if (sourceRaw !== 'digital_card' && sourceRaw !== 'manual_staff') {
    return { ok: false, code: 'invalid_source', error: 'source must be digital_card or manual_staff.' };
  }
  return {
    ok: true,
    sessionId,
    childMemberId,
    guardianUserId,
    source: sourceRaw,
  };
}

export type CheckoutParsed =
  | { ok: true; custodyId: string; guardianUserId: string }
  | { ok: false; code: KidsCustodyErrorCode; error: string };

export function parseCustodyCheckoutBody(body: unknown): CheckoutParsed {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_request', error: 'Request body is required.' };
  }
  const spoof = detectCustodySpoofFields(body);
  if (spoof.length) {
    return { ok: false, code: 'spoof_rejected', error: 'Client must not supply server-owned fields.' };
  }
  const b = body as Record<string, unknown>;
  const custodyId = asUuid(b.custodyId);
  const guardianUserId = asUuid(b.guardianUserId);
  if (!custodyId) {
    return { ok: false, code: 'invalid_uuid', error: 'custodyId must be a valid UUID.' };
  }
  if (!guardianUserId) {
    return { ok: false, code: 'guardian_required', error: 'Select an authorized guardian.' };
  }
  return { ok: true, custodyId, guardianUserId };
}

export function mapRpcErrorMessage(msg: string): KidsCustodyErrorCode | null {
  const m = String(msg || '');
  const codes: KidsCustodyErrorCode[] = [
    'invalid_request',
    'invalid_mode',
    'invalid_token_hash',
    'invalid_source',
    'session_not_found',
    'session_not_open',
    'session_closed',
    'session_type_not_allowed',
    'member_not_found',
    'card_not_found',
    'card_not_valid',
    'adult_card_required',
    'card_resolution_conflict',
    'guardian_not_authorized',
    'already_checked_in',
    'already_checked_out',
    'custody_not_found',
    'actor_not_found',
  ];
  for (const c of codes) {
    if (m.includes(c)) return c;
  }
  return null;
}

export function httpStatusForCustodyCode(code: KidsCustodyErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'method_not_allowed':
      return 405;
    case 'rate_limited':
      return 429;
    case 'session_not_found':
    case 'member_not_found':
    case 'card_not_found':
    case 'custody_not_found':
      return 404;
    case 'session_not_open':
    case 'session_closed':
    case 'session_type_not_allowed':
    case 'session_required':
    case 'card_not_valid':
    case 'adult_card_required':
    case 'card_resolution_conflict':
    case 'guardian_not_authorized':
    case 'already_checked_in':
    case 'already_checked_out':
      return 409;
    case 'custody_unavailable':
      return 503;
    default:
      return 400;
  }
}

export function humanMessageForCustodyCode(code: KidsCustodyErrorCode): string {
  switch (code) {
    case 'unauthorized':
      return 'Sign in required.';
    case 'forbidden':
      return 'Kids custody requires an authorized staff role.';
    case 'session_required':
      return 'Select an open kids attendance session first.';
    case 'session_not_found':
      return 'Attendance session not found.';
    case 'session_not_open':
      return 'That session is not open.';
    case 'session_closed':
      return 'That session is closed.';
    case 'session_type_not_allowed':
      return 'Kids custody requires an open kids session.';
    case 'invalid_card_format':
      return 'That QR is not a valid PLCC membership card.';
    case 'card_not_found':
      return 'No child card matched that QR.';
    case 'card_not_valid':
      return 'That child card is not active.';
    case 'adult_card_required':
      return 'That’s an adult membership card.';
    case 'card_resolution_conflict':
      return 'Card could not be resolved safely.';
    case 'guardian_required':
      return 'Select an authorized guardian.';
    case 'guardian_not_authorized':
      return 'That guardian is not authorized for this action.';
    case 'already_checked_in':
      return 'This child is already checked in for this session.';
    case 'already_checked_out':
      return 'This child is already checked out.';
    case 'custody_not_found':
      return 'No open custody record found.';
    case 'member_not_found':
      return 'Child member record not found.';
    case 'rate_limited':
      return 'Too many attempts. Wait a moment and try again.';
    case 'custody_unavailable':
      return 'Kids custody is not available.';
    default:
      return 'Kids custody request failed.';
  }
}

export type CustodyGuardianDto = {
  guardianUserId: string;
  guardianMemberId: string | null;
  displayName: string;
  relationshipType: string;
};

export type CustodyLookupDto = {
  childMemberId: string;
  childDisplayName: string;
  sessionId: string;
  mode: KidsCustodyMode;
  custodyStatus: 'in' | 'none';
  custodyId: string | null;
  checkedInAt: string | null;
  guardians: CustodyGuardianDto[];
};

export function sanitizeLookupDto(raw: unknown): CustodyLookupDto | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const childMemberId = asUuid(r.childMemberId);
  const sessionId = asUuid(r.sessionId);
  const mode = r.mode === 'in' || r.mode === 'out' ? r.mode : null;
  if (!childMemberId || !sessionId || !mode) return null;
  const status = r.custodyStatus === 'in' ? 'in' : r.custodyStatus === 'none' ? 'none' : null;
  if (!status) return null;
  const guardiansRaw = Array.isArray(r.guardians) ? r.guardians : [];
  const guardians: CustodyGuardianDto[] = [];
  for (const g of guardiansRaw) {
    if (!g || typeof g !== 'object') continue;
    const gr = g as Record<string, unknown>;
    const guardianUserId = asUuid(gr.guardianUserId);
    if (!guardianUserId) continue;
    const guardianMemberId = gr.guardianMemberId == null ? null : asUuid(gr.guardianMemberId);
    guardians.push({
      guardianUserId,
      guardianMemberId,
      displayName: String(gr.displayName || 'Guardian').slice(0, 120),
      relationshipType: String(gr.relationshipType || '').slice(0, 40),
    });
  }
  return {
    childMemberId,
    childDisplayName: String(r.childDisplayName || 'Child').slice(0, 120),
    sessionId,
    mode,
    custodyStatus: status,
    custodyId: r.custodyId == null ? null : asUuid(r.custodyId),
    checkedInAt: r.checkedInAt == null ? null : String(r.checkedInAt),
    guardians,
  };
}

export function evaluateRateLimit(
  timestamps: number[],
  now: number,
  limits: { windowMs: number; max: number }[]
): { allowed: boolean } {
  for (const lim of limits) {
    const count = timestamps.filter((t) => t > now - lim.windowMs).length;
    if (count >= lim.max) return { allowed: false };
  }
  return { allowed: true };
}

export const CUSTODY_RATE_LIMITS = [
  { windowMs: 60_000, max: 40 },
  { windowMs: 10 * 60_000, max: 120 },
] as const;
