/**
 * Attendance session admin UI — safe API DTO types only.
 * No actor UUIDs (created_by / opened_by / closed_by).
 */

export const ATTENDANCE_SESSIONS_ROUTE = '/attendance/sessions';

export const CHURCH_TIMEZONE = 'Africa/Kampala';

export type AttendanceSessionType =
  | 'worship'
  | 'event'
  | 'serve'
  | 'bible_study'
  | 'kids'
  | 'other';

export type AttendanceSessionStatus = 'draft' | 'open' | 'closed';

export type AttendanceSession = {
  id: string;
  type: AttendanceSessionType | string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: AttendanceSessionStatus | string;
  timezone: string;
  visitorCount: number;
  eventId: string | null;
  serveOpportunityId: string | null;
  openedAt: string | null;
  closedAt: string | null;
};

export type AttendanceSessionCreateInput = {
  type: AttendanceSessionType;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string;
  eventId?: string | null;
  serveOpportunityId?: string | null;
};

export type AttendanceSessionUpdateInput = {
  sessionId: string;
  title?: string;
  type?: AttendanceSessionType;
  startsAt?: string;
  endsAt?: string | null;
  timezone?: string;
  eventId?: string | null;
  serveOpportunityId?: string | null;
};

export type AttendanceSessionsListResponse = {
  ok: boolean;
  sessions: AttendanceSession[];
  totalCount?: number;
  limit?: number;
  offset?: number;
};

export type AttendanceSessionMutationResponse = {
  ok: boolean;
  session?: AttendanceSession;
  alreadyOpen?: boolean;
  alreadyClosed?: boolean;
  code?: string;
  error?: string;
};
