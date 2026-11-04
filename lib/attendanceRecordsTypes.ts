/**
 * Phase 2.7D.3B — Manual member check-in UI types.
 * Mirrors safe server DTOs only. No attendanceId / memberId / checkedInBy on roster.
 */

export const ATTENDANCE_SESSION_ATTENDANCE_ROUTE =
  '/attendance/sessions/:sessionId/attendance';

export const ATTENDANCE_RECORDS_API =
  '/api/vault?resource=attendance&subResource=records';

export const ATTENDANCE_TODAY_API =
  '/api/vault?resource=attendance&subResource=today';

export const ATTENDANCE_CHECKIN_API =
  '/api/vault?resource=attendance&subResource=check-in';

export const PEOPLE_SEARCH_API = '/api/vault?resource=people';

export const CHURCH_TIMEZONE = 'Africa/Kampala';

export const ATTENDANCE_SEARCH_MIN_CHARS = 2;
export const ATTENDANCE_SEARCH_DEBOUNCE_MS = 300;

export type AttendanceRecordSource = 'manual_staff' | 'digital_card';

export type AttendanceSessionContext = {
  id: string;
  title: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  visitorCount: number;
};

/** Safe roster row — no IDs. */
export type AttendanceRosterRow = {
  displayName: string;
  avatarUrl: string | null;
  checkedInAt: string;
  source: AttendanceRecordSource | string;
};

export type AttendanceRecordsResponse = {
  ok: true;
  session: AttendanceSessionContext;
  attendance: AttendanceRosterRow[];
  memberCount: number;
  visitorCount: number;
  totalCount: number;
  truncated: boolean;
};

/** Safe check-in mutation response — no IDs. */
export type AttendanceCheckinResult = {
  displayName: string;
  checkedInAt: string;
  source: AttendanceRecordSource | string;
  alreadyCheckedIn: boolean;
};

export type AttendanceCheckinResponse = {
  ok: true;
  attendance: AttendanceCheckinResult;
  alreadyCheckedIn?: boolean;
};

/**
 * Internal search hit — memberId retained only for the check-in POST.
 * Never render memberId in the UI.
 */
export type AttendancePeopleSearchHit = {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  status: string | null;
};

/** Cross-session today's check-in row (Who checked in). */
export type AttendanceTodayRow = {
  id: string;
  checkedInAt: string;
  source: string;
  memberName: string;
  sessionId: string;
  sessionTitle: string;
  sessionType: string;
};

export type AttendanceTodayResponse = {
  ok: true;
  attendance: AttendanceTodayRow[];
  totalCount: number;
  kidsOnly: boolean;
  timezone: string;
  dayStart: string;
  dayEnd: string;
};
