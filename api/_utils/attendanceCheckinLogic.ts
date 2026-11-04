/**
 * Phase 2.7D.2 / 2.7D.5B — Attendance check-in pure helpers (no I/O).
 * Manual staff + digital_card (adult or dependent) server contracts. No UI.
 */

import { createHash } from 'node:crypto';
import { CARD_TOKEN_RE, evaluateRateLimit } from './cardResolverLogic.js';

export const ATTENDANCE_CHECKIN_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
  // Children's Ministry / kids desk — check-in & check-out (not session create/close)
  'SUNDAY_SCHOOL_TEACHER',
  'TEACHER',
  'MINISTRY_LEADER',
  'KIOSK',
]);

export const ATTENDANCE_CHECKIN_DENIED_ROLES = new Set([
  'FINANCE',
  'WORSHIP_TEAM',
  'MEMBER',
  'PENDING',
  'YOUTH',
  'GUEST',
  'STAFF',
  'VOLUNTEER',
  'PARENT',
  'MEDIA_TEAM',
  'USER',
]);

/**
 * Children's Ministry desk + shared Kiosk tablet may check people in/out.
 * Session create/open/close stays on attendance.session.manage only.
 */
export const MINISTRY_LEADER_CHECKIN_FUTURE_NOTE =
  'MINISTRY_LEADER, SUNDAY_SCHOOL_TEACHER, TEACHER, and KIOSK may use attendance.checkin / kids checkout; session lifecycle stays admin-scoped.';

export const CHECKIN_MODES = new Set(['manual_staff', 'digital_card'] as const);

export type CheckinMode = 'manual_staff' | 'digital_card';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Client must never send these (manual permits memberId only). */
export const CHECKIN_SPOOF_FIELDS = [
  'checkedInAt',
  'checked_in_at',
  'checkedInBy',
  'checked_in_by',
  'source',
  'userId',
  'user_id',
  'displayName',
  'memberName',
  'alreadyCheckedIn',
  'attendanceId',
  'cardNumber',
  'qrTokenHash',
  'qr_token_hash',
  'role',
  'valid',
  'status',
  'subjectType',
  'subject_type',
] as const;

/** Forbidden on digital_card mode specifically. */
export const DIGITAL_FORBIDDEN_FIELDS = [
  'memberId',
  'member_id',
  'cardNumber',
  'card_number',
  'userId',
  'user_id',
] as const;

export type AttendanceCheckinErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'method_not_allowed'
  | 'invalid_request'
  | 'invalid_mode'
  | 'invalid_uuid'
  | 'spoof_rejected'
  | 'invalid_card_format'
  | 'session_not_found'
  | 'session_not_open'
  | 'session_closed'
  | 'session_type_not_allowed'
  | 'member_not_found'
  | 'card_not_found'
  | 'card_not_valid'
  | 'adult_card_required'
  | 'member_link_required'
  | 'member_link_conflict'
  | 'card_resolution_conflict'
  | 'resolver_conflict'
  | 'invalid_source'
  | 'actor_not_found'
  | 'invalid_token_hash'
  | 'checkin_rate_limited'
  | 'attendance_unavailable'
  | 'attendance_checkin_error'
  | 'serve_signup_required';

export type ManualCheckinParsed = {
  ok: true;
  mode: 'manual_staff';
  sessionId: string;
  memberId: string;
};

export type DigitalCheckinParsed = {
  ok: true;
  mode: 'digital_card';
  sessionId: string;
  token: string;
};

export type CheckinParseFail = {
  ok: false;
  code: AttendanceCheckinErrorCode;
  error: string;
};

export type CheckinParsed = ManualCheckinParsed | DigitalCheckinParsed | CheckinParseFail;

export type RpcCheckinResult = {
  attendanceId: string;
  sessionId: string;
  memberId: string;
  checkedInAt: string;
  source: 'digital_card' | 'manual_staff' | string;
  alreadyCheckedIn: boolean;
};

export type ClientAttendanceDto = {
  displayName: string;
  checkedInAt: string;
  source: string;
  alreadyCheckedIn: boolean;
};

export function isAttendanceCheckinRole(role: unknown): boolean {
  if (role == null) return false;
  return ATTENDANCE_CHECKIN_ROLES.has(String(role).toUpperCase());
}

export function asUuid(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

export function isValidCardToken(token: unknown): token is string {
  // Exact format — no trim (malformed whitespace → invalid_card_format).
  return typeof token === 'string' && CARD_TOKEN_RE.test(token);
}

export function hashCardToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function detectSpoofFields(
  body: unknown,
  mode: CheckinMode | null
): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const keys = Object.keys(body as Record<string, unknown>);
  const hits: string[] = [];
  for (const k of CHECKIN_SPOOF_FIELDS) {
    if (keys.includes(k)) hits.push(k);
  }
  if (mode === 'digital_card') {
    for (const k of DIGITAL_FORBIDDEN_FIELDS) {
      if (keys.includes(k) && !hits.includes(k)) hits.push(k);
    }
  }
  return hits;
}

export function parseCheckinBody(body: unknown): CheckinParsed {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_request', error: 'Request body is required.' };
  }
  const b = body as Record<string, unknown>;
  const modeRaw = b.mode;
  if (modeRaw !== 'manual_staff' && modeRaw !== 'digital_card') {
    return { ok: false, code: 'invalid_mode', error: 'mode must be manual_staff or digital_card.' };
  }
  const mode = modeRaw as CheckinMode;

  const spoof = detectSpoofFields(body, mode);
  if (spoof.length) {
    return {
      ok: false,
      code: 'spoof_rejected',
      error: `Client must not supply: ${spoof.join(', ')}.`,
    };
  }

  const sessionId = asUuid(b.sessionId);
  if (!sessionId) {
    return { ok: false, code: 'invalid_uuid', error: 'sessionId must be a valid UUID.' };
  }

  if (mode === 'manual_staff') {
    const memberId = asUuid(b.memberId);
    if (!memberId) {
      return { ok: false, code: 'invalid_uuid', error: 'memberId must be a valid UUID.' };
    }
    if ('token' in b) {
      return {
        ok: false,
        code: 'spoof_rejected',
        error: 'manual_staff must not include token.',
      };
    }
    return { ok: true, mode: 'manual_staff', sessionId, memberId };
  }

  // digital_card
  if ('memberId' in b || 'member_id' in b) {
    return {
      ok: false,
      code: 'spoof_rejected',
      error: 'digital_card must not include memberId.',
    };
  }
  if (!isValidCardToken(b.token)) {
    return {
      ok: false,
      code: 'invalid_card_format',
      error: 'token must match AWC1.<64 hex> exactly.',
    };
  }
  return { ok: true, mode: 'digital_card', sessionId, token: b.token as string };
}

export function displayNameFromMemberSafe(row: {
  first_name?: unknown;
  last_name?: unknown;
}): string {
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  const full = `${first} ${last}`.trim().replace(/\s+/g, ' ').slice(0, 120);
  return full || 'PLCC Member';
}

export function toClientAttendanceDto(
  rpc: RpcCheckinResult,
  displayName: string
): ClientAttendanceDto {
  return {
    displayName: displayName || 'PLCC Member',
    checkedInAt: String(rpc.checkedInAt || ''),
    source: String(rpc.source || ''),
    alreadyCheckedIn: Boolean(rpc.alreadyCheckedIn),
  };
}

/** Strip internal IDs from any accidental spread into client DTO. */
export function sanitizeClientAttendanceDto(
  dto: ClientAttendanceDto
): ClientAttendanceDto {
  return {
    displayName: String(dto.displayName || 'PLCC Member').slice(0, 120),
    checkedInAt: String(dto.checkedInAt || ''),
    source: String(dto.source || ''),
    alreadyCheckedIn: Boolean(dto.alreadyCheckedIn),
  };
}

/**
 * Map PostgREST / RAISE EXCEPTION message to stable code.
 * Supabase often surfaces: `session_not_found` or longer strings containing it.
 */
export function mapRpcErrorMessage(message: unknown): AttendanceCheckinErrorCode | null {
  const msg = String(message || '');
  const codes: AttendanceCheckinErrorCode[] = [
    'session_not_found',
    'session_not_open',
    'session_closed',
    'session_type_not_allowed',
    'member_not_found',
    'card_not_found',
    'card_not_valid',
    'adult_card_required',
    'member_link_required',
    'member_link_conflict',
    'card_resolution_conflict',
    'invalid_source',
    'actor_not_found',
    'invalid_token_hash',
    'invalid_request',
    'attendance_unavailable',
    'serve_signup_required',
  ];
  for (const c of codes) {
    if (msg.includes(c)) return c;
  }
  // Alias legacy resolver wording if surfaced
  if (msg.includes('resolver_conflict')) return 'card_resolution_conflict';
  return null;
}

export function httpStatusForCheckinCode(code: AttendanceCheckinErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
    case 'card_not_valid':
      return 403;
    case 'method_not_allowed':
      return 405;
    case 'invalid_request':
    case 'invalid_mode':
    case 'invalid_uuid':
    case 'spoof_rejected':
    case 'invalid_card_format':
    case 'invalid_token_hash':
    case 'invalid_source':
      return 400;
    case 'session_not_found':
    case 'member_not_found':
    case 'card_not_found':
    case 'actor_not_found':
      return 404;
    case 'session_not_open':
    case 'session_closed':
    case 'session_type_not_allowed':
    case 'adult_card_required':
    case 'member_link_required':
    case 'member_link_conflict':
    case 'card_resolution_conflict':
    case 'resolver_conflict':
    case 'checkin_rate_limited':
    case 'serve_signup_required':
      return 409;
    case 'attendance_unavailable':
      return 502;
    case 'attendance_checkin_error':
    default:
      return 500;
  }
}

/** Digital path: tighter than manual. Best-effort per isolate. */
export const DIGITAL_CHECKIN_RATE_LIMITS = [
  { windowMs: 10_000, max: 8 },
  { windowMs: 60_000, max: 40 },
] as const;

/** Manual path: modest staff limiter. */
export const MANUAL_CHECKIN_RATE_LIMITS = [
  { windowMs: 10_000, max: 20 },
  { windowMs: 60_000, max: 120 },
] as const;

export { evaluateRateLimit };

export function normalizeRpcResult(data: unknown): RpcCheckinResult | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const attendanceId = d.attendanceId ?? d.attendance_id;
  const sessionId = d.sessionId ?? d.session_id;
  const memberId = d.memberId ?? d.member_id;
  const checkedInAt = d.checkedInAt ?? d.checked_in_at;
  const source = d.source;
  const alreadyCheckedIn = d.alreadyCheckedIn ?? d.already_checked_in;
  if (
    typeof attendanceId !== 'string' ||
    typeof sessionId !== 'string' ||
    typeof memberId !== 'string' ||
    checkedInAt == null ||
    typeof source !== 'string'
  ) {
    return null;
  }
  return {
    attendanceId,
    sessionId,
    memberId,
    checkedInAt: String(checkedInAt),
    source,
    alreadyCheckedIn: Boolean(alreadyCheckedIn),
  };
}
