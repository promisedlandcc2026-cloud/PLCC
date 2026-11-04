/**
 * Phase 2.7D.3B — Manual check-in UI helpers.
 * Labels, errors, formatting. Church timezone: Africa/Kampala.
 */

import {
  ATTENDANCE_SEARCH_MIN_CHARS,
  CHURCH_TIMEZONE,
  type AttendancePeopleSearchHit,
  type AttendanceRecordSource,
} from './attendanceRecordsTypes';
import {
  formatSessionRange,
  statusLabel,
  typeLabel,
} from './attendanceSessionsUi';
import { initialsFromDisplayName } from './cardScannerUi';

export const ATTENDANCE_CHECKIN_UI_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
  'SUNDAY_SCHOOL_TEACHER',
  'TEACHER',
  'MINISTRY_LEADER',
  'KIOSK',
] as const;

export const ATTENDANCE_CHECKIN_UI_DENIED_ROLES = [
  'FINANCE',
  'WORSHIP_TEAM',
  'MEMBER',
  'PENDING',
  'YOUTH',
] as const;

export const MANUAL_CHECKIN_UI_FORBIDDEN = [
  'Add Visitor',
  'Remove Visitor',
  'Edit Visitors',
  'Undo',
  'Mark Absent',
  'Checkout',
  'Edit Time',
  'Change Source',
  'Reopen',
  'Open Session',
  'Close Session',
] as const;

/** Entrance scanner success hold before auto-resuming the camera. */
export const DIGITAL_SCAN_SUCCESS_HOLD_MS = 2500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionIdParam(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  return UUID_RE.test(t);
}

export { statusLabel, typeLabel, formatSessionRange, initialsFromDisplayName };

export function sourceLabel(source: string): string {
  switch (String(source || '').toLowerCase()) {
    case 'manual_staff':
      return 'Manual';
    case 'digital_card':
      return 'Digital Card';
    default:
      return 'Manual';
  }
}

export function formatCheckedInAt(
  iso: string | null | undefined,
  timeZone: string = CHURCH_TIMEZONE
): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function emptyRosterCopy(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'draft') return 'No attendance has been recorded.';
  if (s === 'closed') return 'No member attendance was recorded for this session.';
  return 'No members have been checked in yet.';
}

export function draftSessionMessage(): string {
  return 'Open this session before checking in members.';
}

export function closedSessionMessage(): string {
  return 'This attendance session is closed.';
}

export function truncatedRosterMessage(): string {
  return 'Showing the 200 most recent member check-ins.';
}

export function searchHintMessage(): string {
  return 'Search by member name.';
}

export function searchMinMet(query: string): boolean {
  return String(query || '').trim().length >= ATTENDANCE_SEARCH_MIN_CHARS;
}

export function sanitizeAvatarUrl(url: unknown): string | null {
  if (url == null || url === '') return null;
  const s = String(url).trim();
  if (!/^https?:\/\//i.test(s)) return null;
  if (s.length > 2048) return null;
  return s;
}

export function memberDisplayNameFromPeopleRow(row: {
  first_name?: unknown;
  last_name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  name?: unknown;
}): string {
  const first = String(row?.first_name ?? row?.firstName ?? '').trim();
  const last = String(row?.last_name ?? row?.lastName ?? '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined.slice(0, 120);
  const name = String(row?.name || '').trim();
  if (name) return name.slice(0, 120);
  return 'PLCC Member';
}

/** Map People API row → internal search hit (id kept for check-in only). */
export function mapPeopleRowToSearchHit(row: any): AttendancePeopleSearchHit | null {
  const memberId = typeof row?.id === 'string' ? row.id.trim() : '';
  if (!UUID_RE.test(memberId)) return null;
  return {
    memberId,
    displayName: memberDisplayNameFromPeopleRow(row),
    avatarUrl: sanitizeAvatarUrl(row?.avatar_url ?? row?.avatarUrl),
    status: row?.status != null ? String(row.status) : null,
  };
}

export function mapRecordsApiError(body: unknown, fallback?: string): string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const code = String(b.code || '').toLowerCase();
  switch (code) {
    case 'session_not_found':
      return 'Attendance session not found.';
    case 'forbidden':
      return 'You do not have permission to view attendance.';
    case 'unauthorized':
      return 'Please sign in again.';
    case 'attendance_unavailable':
      return 'Attendance is temporarily unavailable. Please try again.';
    case 'invalid_request':
      return String(b.error || fallback || 'Invalid attendance request.');
    default:
      return (
        (typeof b.error === 'string' && b.error) ||
        fallback ||
        'Could not load attendance. Please try again.'
      );
  }
}

export function mapCheckinApiError(body: unknown, fallback?: string): string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const code = String(b.code || '').toLowerCase();
  switch (code) {
    case 'session_not_found':
      return 'Attendance session not found.';
    case 'session_not_open':
      return 'Open this session before checking in members.';
    case 'session_closed':
      return 'This attendance session is closed.';
    case 'session_type_not_allowed':
      return 'This session does not support member attendance check-in.';
    case 'member_not_found':
      return 'This member could not be checked in.';
    case 'invalid_card_format':
    case 'card_not_found':
    case 'card_resolution_conflict':
    case 'resolver_conflict':
      return 'CARD NOT RECOGNIZED — This PLCC card could not be verified.';
    case 'card_not_valid':
      return 'This PLCC card is not valid for check-in.';
    case 'adult_card_required':
      return 'This PLCC card cannot be used for this session.';
    case 'member_link_required':
    case 'member_link_conflict':
      return 'This PLCC card could not be linked to a member for check-in.';
    case 'checkin_rate_limited':
      return 'Too many check-in attempts. Please wait a moment and try again.';
    case 'attendance_unavailable':
      return 'Attendance is temporarily unavailable. Please try again.';
    case 'forbidden':
      return 'You do not have permission to check in members.';
    case 'unauthorized':
      return 'Please sign in again.';
    default:
      return fallback || 'Could not check in this member. Please try again.';
  }
}

export function mapPeopleSearchError(): string {
  return 'Member search is temporarily unavailable.';
}

export function successNewCheckinMessage(displayName: string): string {
  return `${displayName} checked in.`;
}

export function successAlreadyCheckedInMessage(displayName: string): string {
  return `${displayName} is already checked in.`;
}

export function isOpenStatus(status: string): boolean {
  return String(status || '').toLowerCase() === 'open';
}

export function isDraftStatus(status: string): boolean {
  return String(status || '').toLowerCase() === 'draft';
}

export function isClosedStatus(status: string): boolean {
  return String(status || '').toLowerCase() === 'closed';
}

export function attendancePathForSession(sessionId: string): string {
  return `/attendance/sessions/${sessionId}/attendance`;
}

/** Ensure source is a known enum for typing; unknown → manual_staff label path. */
export function normalizeSource(source: unknown): AttendanceRecordSource | string {
  const s = String(source || '');
  if (s === 'manual_staff' || s === 'digital_card') return s;
  return s || 'manual_staff';
}
