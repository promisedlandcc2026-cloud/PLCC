/**
 * Phase 2.7D.3A — Attendance records read helpers (no I/O).
 * Session roster for Vault staff. No mutation / no UI.
 */

import { ATTENDANCE_CHECKIN_ROLES, ATTENDANCE_CHECKIN_DENIED_ROLES } from './attendanceCheckinLogic.js';
import { ATTENDANCE_SESSION_MANAGER_ROLES } from './attendanceSessionLogic.js';
import { sanitizeAvatarUrl } from './cardResolverLogic.js';

export const ATTENDANCE_RECORDS_READ_ROLES = new Set([
  ...ATTENDANCE_CHECKIN_ROLES,
  ...ATTENDANCE_SESSION_MANAGER_ROLES,
]);

export const ATTENDANCE_RECORDS_DENIED_ROLES = ATTENDANCE_CHECKIN_DENIED_ROLES;

/** Hard MVP bound — church scale; truncated flag when more exist. */
export const ATTENDANCE_RECORDS_MAX = 200;

export const ATTENDANCE_RECORD_SOURCES = new Set(['manual_staff', 'digital_card'] as const);

export type AttendanceRecordSource = 'manual_staff' | 'digital_card';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AttendanceRecordsErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'method_not_allowed'
  | 'invalid_request'
  | 'session_not_found'
  | 'attendance_unavailable'
  | 'attendance_records_error';

export type AttendanceSessionContextDto = {
  id: string;
  title: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  visitorCount: number;
};

export type AttendanceRowDto = {
  displayName: string;
  avatarUrl: string | null;
  checkedInAt: string;
  source: AttendanceRecordSource;
};

export type AttendanceRecordsResponse = {
  ok: true;
  session: AttendanceSessionContextDto;
  attendance: AttendanceRowDto[];
  memberCount: number;
  visitorCount: number;
  totalCount: number;
  truncated: boolean;
};

/**
 * Roster read when actor has attendance.checkin OR attendance.session.manage.
 * No attendance.view permission yet.
 */
export function canReadAttendanceRecords(role: unknown): boolean {
  if (role == null) return false;
  const r = String(role).toUpperCase();
  return ATTENDANCE_CHECKIN_ROLES.has(r) || ATTENDANCE_SESSION_MANAGER_ROLES.has(r);
}

export function asUuid(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

export function parseSessionIdQuery(query: unknown): {
  ok: true;
  sessionId: string;
} | {
  ok: false;
  code: 'invalid_request';
  error: string;
} {
  if (query == null || typeof query !== 'object' || Array.isArray(query)) {
    return { ok: false, code: 'invalid_request', error: 'sessionId is required.' };
  }
  const q = query as Record<string, unknown>;
  const raw = q.sessionId ?? q.id;
  if (raw == null || raw === '') {
    return { ok: false, code: 'invalid_request', error: 'sessionId is required.' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, code: 'invalid_request', error: 'sessionId must be a valid UUID.' };
  }
  // Exact UUID — trim only for validation of surrounding whitespace is rejected (invalid).
  if (!UUID_RE.test(raw)) {
    return { ok: false, code: 'invalid_request', error: 'sessionId must be a valid UUID.' };
  }
  return { ok: true, sessionId: raw };
}

export function displayNameFromMemberSafe(row: {
  first_name?: unknown;
  last_name?: unknown;
} | null | undefined): string {
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  const full = `${first} ${last}`.trim().replace(/\s+/g, ' ').slice(0, 120);
  return full || 'PLCC Member';
}

export function normalizeAttendanceSource(value: unknown): AttendanceRecordSource | null {
  if (value === 'manual_staff' || value === 'digital_card') return value;
  return null;
}

export function toSessionContextDto(row: {
  id: string;
  title?: unknown;
  type?: unknown;
  status?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  timezone?: unknown;
  visitor_count?: unknown;
}): AttendanceSessionContextDto {
  const visitorCount = Number(row.visitor_count);
  return {
    id: String(row.id),
    title: String(row.title || '').slice(0, 200),
    type: String(row.type || ''),
    status: String(row.status || ''),
    startsAt: String(row.starts_at || ''),
    endsAt: row.ends_at == null ? null : String(row.ends_at),
    timezone: String(row.timezone || 'Africa/Kampala'),
    visitorCount: Number.isFinite(visitorCount) ? Math.max(0, Math.floor(visitorCount)) : 0,
  };
}

export function toAttendanceRowDto(input: {
  checkedInAt: unknown;
  source: unknown;
  member?: { first_name?: unknown; last_name?: unknown; avatar_url?: unknown } | null;
}): AttendanceRowDto {
  const source = normalizeAttendanceSource(input.source) || 'manual_staff';
  return {
    displayName: displayNameFromMemberSafe(input.member),
    avatarUrl: sanitizeAvatarUrl(input.member?.avatar_url ?? null),
    checkedInAt: String(input.checkedInAt || ''),
    source,
  };
}

export function sanitizeAttendanceRowDto(row: AttendanceRowDto): AttendanceRowDto {
  return {
    displayName: String(row.displayName || 'PLCC Member').slice(0, 120),
    avatarUrl: row.avatarUrl == null ? null : sanitizeAvatarUrl(row.avatarUrl),
    checkedInAt: String(row.checkedInAt || ''),
    source: normalizeAttendanceSource(row.source) || 'manual_staff',
  };
}

export function computeTotals(memberCount: number, visitorCount: number): {
  memberCount: number;
  visitorCount: number;
  totalCount: number;
} {
  const m = Math.max(0, Math.floor(Number(memberCount) || 0));
  const v = Math.max(0, Math.floor(Number(visitorCount) || 0));
  return { memberCount: m, visitorCount: v, totalCount: m + v };
}

export function httpStatusForRecordsCode(code: AttendanceRecordsErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'method_not_allowed':
      return 405;
    case 'invalid_request':
      return 400;
    case 'session_not_found':
      return 404;
    case 'attendance_unavailable':
      return 502;
    case 'attendance_records_error':
    default:
      return 500;
  }
}

/** Forbidden keys that must never appear on row DTOs. */
export const FORBIDDEN_ROW_KEYS = [
  'attendanceId',
  'id',
  'memberId',
  'member_id',
  'userId',
  'user_id',
  'checkedInBy',
  'checked_in_by',
  'email',
  'phone',
  'dob',
  'birthday',
  'address',
  'household',
  'qr',
  'cardNumber',
  'token',
  'hash',
  'role',
  'guardian',
] as const;
