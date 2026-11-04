/**
 * Phase 2.7D.3B+ — Attendance records + check-in client.
 * Vault API only. No direct Supabase. Manual + digital_card modes.
 * No Kids / visitor / lifecycle mutation from the browser.
 */

import { ApiError, apiFetch } from './api';
import {
  mapCheckinApiError,
  mapPeopleSearchError,
  mapPeopleRowToSearchHit,
  mapRecordsApiError,
  sanitizeAvatarUrl,
} from './attendanceRecordsUi';
import type {
  AttendanceCheckinResponse,
  AttendanceCheckinResult,
  AttendancePeopleSearchHit,
  AttendanceRecordsResponse,
  AttendanceRosterRow,
  AttendanceSessionContext,
  AttendanceTodayResponse,
  AttendanceTodayRow,
} from './attendanceRecordsTypes';
import {
  ATTENDANCE_CHECKIN_API,
  ATTENDANCE_RECORDS_API,
  ATTENDANCE_TODAY_API,
  PEOPLE_SEARCH_API,
} from './attendanceRecordsTypes';
import { isValidCardToken } from './cardScannerUi';

function asSession(raw: any): AttendanceSessionContext {
  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || ''),
    type: String(raw?.type || ''),
    status: String(raw?.status || ''),
    startsAt: String(raw?.startsAt || ''),
    endsAt: raw?.endsAt ?? null,
    timezone: String(raw?.timezone || 'Africa/Kampala'),
    visitorCount: Number(raw?.visitorCount) || 0,
  };
}

function asRosterRow(raw: any): AttendanceRosterRow {
  return {
    displayName: String(raw?.displayName || 'PLCC Member').slice(0, 120),
    avatarUrl: sanitizeAvatarUrl(raw?.avatarUrl),
    checkedInAt: String(raw?.checkedInAt || ''),
    source: String(raw?.source || 'manual_staff'),
  };
}

function asCheckinResult(raw: any): AttendanceCheckinResult {
  return {
    displayName: String(raw?.displayName || 'PLCC Member').slice(0, 120),
    checkedInAt: String(raw?.checkedInAt || ''),
    source: String(raw?.source || 'manual_staff'),
    alreadyCheckedIn: Boolean(raw?.alreadyCheckedIn),
  };
}

function parseCheckinResponse(body: AttendanceCheckinResponse): AttendanceCheckinResult {
  const attendance = body.attendance
    ? asCheckinResult(body.attendance)
    : asCheckinResult({
        displayName: 'PLCC Member',
        alreadyCheckedIn: body.alreadyCheckedIn,
      });
  if (body.alreadyCheckedIn != null) {
    attendance.alreadyCheckedIn = Boolean(body.alreadyCheckedIn);
  }
  return attendance;
}

export async function fetchAttendanceRecords(
  sessionId: string
): Promise<AttendanceRecordsResponse> {
  const path = `${ATTENDANCE_RECORDS_API}&sessionId=${encodeURIComponent(sessionId)}`;
  try {
    const body = await apiFetch<AttendanceRecordsResponse>(path, { method: 'GET' });
    return {
      ok: true,
      session: asSession(body.session),
      attendance: (body.attendance || []).map(asRosterRow),
      memberCount: Number(body.memberCount) || 0,
      visitorCount: Number(body.visitorCount) || 0,
      totalCount: Number(body.totalCount) || 0,
      truncated: Boolean(body.truncated),
    };
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapRecordsApiError(err.body, err.message));
    }
    throw err;
  }
}

/**
 * Manual staff check-in — exact body contract:
 * { mode: "manual_staff", sessionId, memberId }
 */
export async function checkInMemberManual(input: {
  sessionId: string;
  memberId: string;
}): Promise<AttendanceCheckinResult> {
  try {
    const body = await apiFetch<AttendanceCheckinResponse>(ATTENDANCE_CHECKIN_API, {
      method: 'POST',
      body: JSON.stringify({
        mode: 'manual_staff',
        sessionId: input.sessionId,
        memberId: input.memberId,
      }),
    });
    return parseCheckinResponse(body);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapCheckinApiError(err.body, err.message));
    }
    throw err;
  }
}

/**
 * Digital membership card check-in — exact body contract:
 * { mode: "digital_card", sessionId, token }
 * Token must be AWC1.<64 hex>. Never send memberId / hash from the client.
 */
export async function checkInMemberDigitalCard(input: {
  sessionId: string;
  token: string;
}): Promise<AttendanceCheckinResult> {
  if (!isValidCardToken(input.token)) {
    throw new Error(mapCheckinApiError({ code: 'invalid_card_format' }));
  }
  try {
    const body = await apiFetch<AttendanceCheckinResponse>(ATTENDANCE_CHECKIN_API, {
      method: 'POST',
      body: JSON.stringify({
        mode: 'digital_card',
        sessionId: input.sessionId,
        token: input.token,
      }),
    });
    return parseCheckinResponse(body);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapCheckinApiError(err.body, err.message));
    }
    throw err;
  }
}

export async function searchPeopleForAttendance(
  query: string
): Promise<AttendancePeopleSearchHit[]> {
  const q = String(query || '').trim();
  const path = `${PEOPLE_SEARCH_API}&query=${encodeURIComponent(q)}`;
  try {
    const body = await apiFetch<{ ok?: boolean; members?: any[] }>(path, { method: 'GET' });
    const members = Array.isArray(body?.members) ? body.members : [];
    return members
      .map(mapPeopleRowToSearchHit)
      .filter((h): h is AttendancePeopleSearchHit => h != null);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapPeopleSearchError());
    }
    throw new Error(mapPeopleSearchError());
  }
}

export async function fetchTodayAttendance(opts: {
  kidsOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ attendance: AttendanceTodayRow[]; totalCount: number }> {
  const params = new URLSearchParams();
  if (opts.kidsOnly) params.set('kids', 'true');
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const path = qs ? `${ATTENDANCE_TODAY_API}&${qs}` : ATTENDANCE_TODAY_API;
  try {
    const body = await apiFetch<AttendanceTodayResponse>(path, { method: 'GET' });
    return {
      attendance: Array.isArray(body?.attendance) ? body.attendance : [],
      totalCount: Number(body?.totalCount) || 0,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapRecordsApiError(err.body, err.message));
    }
    throw err;
  }
}

export async function deleteTodayAttendanceRecord(id: string): Promise<void> {
  const path = `${ATTENDANCE_TODAY_API}&id=${encodeURIComponent(id)}`;
  try {
    await apiFetch<{ ok?: boolean }>(path, { method: 'DELETE' });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapRecordsApiError(err.body, err.message));
    }
    throw err;
  }
}
