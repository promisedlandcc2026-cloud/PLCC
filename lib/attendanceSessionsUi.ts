/**
 * Attendance session admin UI helpers — labels, formatting, validation, errors.
 * Church timezone authority: Africa/Kampala (not browser locale).
 */

import {
  CHURCH_TIMEZONE,
  type AttendanceSession,
  type AttendanceSessionStatus,
  type AttendanceSessionType,
} from './attendanceSessionsTypes';

export const ATTENDANCE_SESSION_UI_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
] as const;

export const ATTENDANCE_SESSION_UI_DENIED_ROLES = [
  'MINISTRY_LEADER',
  'FINANCE',
  'WORSHIP_TEAM',
  'MEMBER',
  'PENDING',
  'YOUTH',
] as const;

export const ATTENDANCE_SESSION_TYPE_OPTIONS: {
  value: AttendanceSessionType;
  label: string;
}[] = [
  { value: 'worship', label: 'Worship' },
  { value: 'event', label: 'Event' },
  { value: 'serve', label: 'Serve' },
  { value: 'bible_study', label: 'Bible Study' },
  { value: 'kids', label: 'Kids' },
  { value: 'other', label: 'Other' },
];

export const SESSION_UI_FORBIDDEN_ACTIONS = [
  'Check In',
  'Scan Member',
  'Mark Present',
  'Attendance Record',
  'Child Check-In',
  'Volunteer Arrived',
  'Reopen',
  'Delete',
] as const;

const TITLE_MAX = 200;

export function typeLabel(type: string): string {
  const found = ATTENDANCE_SESSION_TYPE_OPTIONS.find((o) => o.value === type);
  return found?.label || 'Other';
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'open':
      return 'Open';
    case 'closed':
      return 'Closed';
    default:
      return status || 'Unknown';
  }
}

/** Convert church-local datetime-local value → ISO UTC. */
export function churchLocalInputToIso(
  localInput: string,
  timeZone: string = CHURCH_TIMEZONE
): string | null {
  const raw = String(localInput || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const Y = Number(m[1]);
  const Mo = Number(m[2]);
  const D = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  if (![Y, Mo, D, h, mi].every((n) => Number.isFinite(n))) return null;

  let utcMs = Date.UTC(Y, Mo - 1, D, h, mi, 0);

  const wallParts = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value || '0');
    return { Y: g('year'), Mo: g('month'), D: g('day'), h: g('hour'), mi: g('minute') };
  };

  for (let i = 0; i < 4; i++) {
    const wall = wallParts(utcMs);
    const desired = Date.UTC(Y, Mo - 1, D, h, mi, 0);
    const asWall = Date.UTC(wall.Y, wall.Mo - 1, wall.D, wall.h, wall.mi, 0);
    const diff = desired - asWall;
    if (diff === 0) break;
    utcMs += diff;
  }
  return new Date(utcMs).toISOString();
}

/** ISO → church-local value for datetime-local input. */
export function isoToChurchLocalInput(
  iso: string | null | undefined,
  timeZone: string = CHURCH_TIMEZONE
): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

export function formatSessionDate(
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
    year: 'numeric',
  }).format(new Date(ms));
}

export function formatSessionTime(
  iso: string | null | undefined,
  timeZone: string = CHURCH_TIMEZONE
): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function formatSessionRange(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string = CHURCH_TIMEZONE
): string {
  const date = formatSessionDate(startsAt, timeZone);
  const start = formatSessionTime(startsAt, timeZone);
  const end = endsAt ? formatSessionTime(endsAt, timeZone) : '';
  if (start && end) return `${date} · ${start} – ${end}`;
  if (start) return `${date} · ${start}`;
  return date;
}

export function trimTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t || t.length > TITLE_MAX) return null;
  if (/[<>]/.test(t)) return null;
  return t;
}

export function validateSessionForm(input: {
  type: string;
  title: string;
  startsLocal: string;
  endsLocal: string;
  eventId: string;
}): { ok: true; startsAt: string; endsAt: string | null; title: string } | { ok: false; error: string } {
  const title = trimTitle(input.title);
  if (!title) {
    return { ok: false, error: 'Enter a title (1–200 characters, no HTML).' };
  }
  if (!ATTENDANCE_SESSION_TYPE_OPTIONS.some((o) => o.value === input.type)) {
    return { ok: false, error: 'Select a valid session type.' };
  }
  const startsAt = churchLocalInputToIso(input.startsLocal);
  if (!startsAt) {
    return { ok: false, error: 'Enter a valid start date and time.' };
  }
  let endsAt: string | null = null;
  if (input.endsLocal.trim()) {
    endsAt = churchLocalInputToIso(input.endsLocal);
    if (!endsAt) return { ok: false, error: 'Enter a valid end date and time, or leave blank.' };
    if (Date.parse(endsAt) < Date.parse(startsAt)) {
      return { ok: false, error: 'End time must be on or after the start time.' };
    }
  }
  if (input.type === 'event' && !String(input.eventId || '').trim()) {
    return { ok: false, error: 'Event sessions require a linked event.' };
  }
  return { ok: true, startsAt, endsAt, title };
}

export function mapSessionApiError(body: unknown, fallback = 'Something went wrong.'): string {
  const b = body as { code?: string; error?: string } | null;
  const code = String(b?.code || '');
  switch (code) {
    case 'forbidden':
      return String(b?.error || 'You do not have permission to manage attendance sessions.');
    case 'unauthorized':
      return 'Please sign in again.';
    case 'invalid_type':
      return 'That session type is not allowed.';
    case 'invalid_title':
      return 'Enter a valid title (1–200 characters).';
    case 'invalid_dates':
      return 'Check the start and end times.';
    case 'invalid_timezone':
      return 'Timezone must be Africa/Kampala.';
    case 'event_required':
      return 'Event sessions require a linked event.';
    case 'event_not_found':
      return 'That event could not be found.';
    case 'serve_opportunity_not_found':
      return 'That Serve opportunity could not be found.';
    case 'session_not_found':
      return 'Session not found.';
    case 'session_not_draft':
      return 'Only draft sessions can be edited.';
    case 'session_not_open':
      return 'Only open sessions can be closed.';
    case 'session_already_closed':
      return 'This session is already closed and cannot be reopened.';
    case 'spoof_rejected':
      return 'Some fields cannot be set from the browser.';
    case 'delete_not_allowed':
      return 'Sessions cannot be deleted.';
    case 'attendance_session_unavailable':
      return 'Attendance sessions are temporarily unavailable.';
    default:
      return String(b?.error || fallback).slice(0, 160);
  }
}

export function groupSessionsByStatus(sessions: AttendanceSession[]): {
  open: AttendanceSession[];
  draft: AttendanceSession[];
  closed: AttendanceSession[];
} {
  const open: AttendanceSession[] = [];
  const draft: AttendanceSession[] = [];
  const closed: AttendanceSession[] = [];
  for (const s of sessions) {
    if (s.status === 'open') open.push(s);
    else if (s.status === 'draft') draft.push(s);
    else if (s.status === 'closed') closed.push(s);
  }
  open.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  draft.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  closed.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  return { open, draft, closed };
}

export function emptyStateCopy(filter: 'all' | AttendanceSessionStatus): string {
  switch (filter) {
    case 'draft':
      return 'No draft sessions.';
    case 'open':
      return 'No open attendance sessions.';
    case 'closed':
      return 'No closed sessions yet.';
    default:
      return 'No attendance sessions yet.';
  }
}

export function linkIndicator(session: AttendanceSession): string | null {
  if (session.eventId) return 'Linked Event';
  if (session.serveOpportunityId) return 'Linked Serve Opportunity';
  return null;
}

export function isAttendanceSessionManagerRole(role: unknown): boolean {
  return ATTENDANCE_SESSION_UI_ROLES.includes(String(role || '').toUpperCase() as any);
}
