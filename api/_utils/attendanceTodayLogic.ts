/**
 * Phase 2.7 — Cross-session "today's check-ins" helpers (no I/O).
 * Powers Who checked in / Today's check-ins from attendance_records.
 */

import { canReadAttendanceRecords, displayNameFromMemberSafe, asUuid } from './attendanceRecordsLogic.js';
import { ATTENDANCE_CHECKIN_ROLES } from './attendanceCheckinLogic.js';

export const ATTENDANCE_TODAY_DEFAULT_TZ = 'Africa/Kampala';
export const ATTENDANCE_TODAY_PAGE_SIZE = 25;
export const ATTENDANCE_TODAY_MAX_FETCH = 500;

export type AttendanceTodaySource = 'manual_staff' | 'digital_card' | 'household_bulk';

export type AttendanceTodayErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'method_not_allowed'
  | 'invalid_request'
  | 'record_not_found'
  | 'attendance_unavailable'
  | 'attendance_today_error';

export type AttendanceTodayRowDto = {
  id: string;
  checkedInAt: string;
  source: AttendanceTodaySource;
  memberName: string;
  sessionId: string;
  sessionTitle: string;
  sessionType: string;
};

export type AttendanceTodayResponse = {
  ok: true;
  attendance: AttendanceTodayRowDto[];
  totalCount: number;
  kidsOnly: boolean;
  timezone: string;
  dayStart: string;
  dayEnd: string;
};

export { canReadAttendanceRecords };

export function canDeleteAttendanceToday(role: unknown): boolean {
  if (role == null) return false;
  return ATTENDANCE_CHECKIN_ROLES.has(String(role).toUpperCase());
}

export function normalizeTodaySource(value: unknown): AttendanceTodaySource {
  if (value === 'digital_card' || value === 'household_bulk' || value === 'manual_staff') {
    return value;
  }
  return 'manual_staff';
}

/**
 * Inclusive start / exclusive end of "today" in church timezone, as UTC ISO strings.
 */
export function churchDayBoundsUtc(
  now: Date = new Date(),
  timeZone: string = ATTENDANCE_TODAY_DEFAULT_TZ
): { dayStart: string; dayEnd: string; ymd: string } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // Noon UTC anchors avoid DST edge ambiguity when probing offset for that civil day.
  const probe = new Date(`${ymd}T12:00:00.000Z`);
  const offsetMinutes = tzOffsetMinutes(probe, timeZone);
  const startMs = Date.parse(`${ymd}T00:00:00.000Z`) - offsetMinutes * 60_000;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return {
    ymd,
    dayStart: new Date(startMs).toISOString(),
    dayEnd: new Date(endMs).toISOString(),
  };
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  // GMT, GMT+4, GMT-5, GMT+05:30
  const m = raw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2]) || 0;
  const mins = Number(m[3] || 0) || 0;
  return sign * (hours * 60 + mins);
}

export function parseTodayQuery(query: unknown): {
  ok: true;
  kidsOnly: boolean;
  limit: number;
  offset: number;
} | {
  ok: false;
  code: 'invalid_request';
  error: string;
} {
  const q =
    query != null && typeof query === 'object' && !Array.isArray(query)
      ? (query as Record<string, unknown>)
      : {};

  const kidsRaw = q.kids;
  const kidsOnly =
    kidsRaw === true ||
    kidsRaw === 'true' ||
    kidsRaw === '1' ||
    kidsRaw === 1;

  let limit = ATTENDANCE_TODAY_PAGE_SIZE;
  if (q.limit != null && q.limit !== '') {
    const n = Number(q.limit);
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      return { ok: false, code: 'invalid_request', error: 'limit must be 1–100.' };
    }
    limit = Math.floor(n);
  }

  let offset = 0;
  if (q.offset != null && q.offset !== '') {
    const n = Number(q.offset);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, code: 'invalid_request', error: 'offset must be >= 0.' };
    }
    offset = Math.floor(n);
  }

  return { ok: true, kidsOnly, limit, offset };
}

export function parseTodayRecordId(query: unknown, body?: unknown): string | null {
  const fromQuery =
    query != null && typeof query === 'object' && !Array.isArray(query)
      ? (query as Record<string, unknown>).id ?? (query as Record<string, unknown>).recordId
      : null;
  const fromBody =
    body != null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).id ?? (body as Record<string, unknown>).recordId
      : null;
  return asUuid(fromQuery) || asUuid(fromBody);
}

export function isKidsTodayRow(opts: {
  sessionType: string;
  memberId: string;
  childMemberIds: Set<string>;
}): boolean {
  if (String(opts.sessionType || '').toLowerCase() === 'kids') return true;
  return opts.childMemberIds.has(String(opts.memberId || ''));
}

export function toTodayRowDto(input: {
  id: unknown;
  checkedInAt: unknown;
  source: unknown;
  memberId: unknown;
  member?: { first_name?: unknown; last_name?: unknown } | null;
  session?: { id?: unknown; title?: unknown; type?: unknown } | null;
}): AttendanceTodayRowDto {
  return {
    id: String(input.id || ''),
    checkedInAt: String(input.checkedInAt || ''),
    source: normalizeTodaySource(input.source),
    memberName: displayNameFromMemberSafe(input.member),
    sessionId: String(input.session?.id || ''),
    sessionTitle: String(input.session?.title || 'Session').slice(0, 200),
    sessionType: String(input.session?.type || ''),
  };
}

export function paginateTodayRows<T>(
  rows: T[],
  limit: number,
  offset: number
): { page: T[]; totalCount: number } {
  const totalCount = rows.length;
  const page = rows.slice(offset, offset + limit);
  return { page, totalCount };
}

export function httpStatusForTodayCode(code: AttendanceTodayErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'method_not_allowed':
      return 405;
    case 'invalid_request':
      return 400;
    case 'record_not_found':
      return 404;
    case 'attendance_unavailable':
      return 503;
    default:
      return 500;
  }
}
