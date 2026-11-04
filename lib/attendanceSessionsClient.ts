/**
 * Attendance session admin client — Vault API only.
 * GET|POST|PATCH /api/vault?resource=attendance&subResource=sessions
 * No direct Supabase. No DELETE. No person attendance mutations.
 */

import { ApiError, apiFetch } from './api';
import { mapSessionApiError } from './attendanceSessionsUi';
import type {
  AttendanceSession,
  AttendanceSessionCreateInput,
  AttendanceSessionMutationResponse,
  AttendanceSessionUpdateInput,
  AttendanceSessionsListResponse,
} from './attendanceSessionsTypes';

export const ATTENDANCE_SESSIONS_API =
  '/api/vault?resource=attendance&subResource=sessions';

function asSession(raw: any): AttendanceSession {
  return {
    id: String(raw?.id || ''),
    type: String(raw?.type || ''),
    title: String(raw?.title || ''),
    startsAt: String(raw?.startsAt || ''),
    endsAt: raw?.endsAt ?? null,
    status: String(raw?.status || ''),
    timezone: String(raw?.timezone || 'Africa/Kampala'),
    visitorCount: Number(raw?.visitorCount) || 0,
    eventId: raw?.eventId ?? null,
    serveOpportunityId: raw?.serveOpportunityId ?? null,
    openedAt: raw?.openedAt ?? null,
    closedAt: raw?.closedAt ?? null,
  };
}

export async function fetchAttendanceSessions(params?: {
  status?: string;
  type?: string;
  limit?: number;
}): Promise<AttendanceSession[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.type) q.set('type', params.type);
  if (params?.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  const path = qs ? `${ATTENDANCE_SESSIONS_API}&${qs}` : ATTENDANCE_SESSIONS_API;
  try {
    const body = await apiFetch<AttendanceSessionsListResponse>(path, { method: 'GET' });
    return (body.sessions || []).map(asSession);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapSessionApiError(err.body, err.message));
    }
    throw err;
  }
}

export async function createAttendanceSession(
  input: AttendanceSessionCreateInput
): Promise<AttendanceSession> {
  try {
    const body = await apiFetch<AttendanceSessionMutationResponse>(ATTENDANCE_SESSIONS_API, {
      method: 'POST',
      body: JSON.stringify({
        type: input.type,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        timezone: input.timezone || 'Africa/Kampala',
        eventId: input.eventId || null,
        serveOpportunityId: input.serveOpportunityId || null,
      }),
    });
    if (!body.session) throw new Error('Session was not returned.');
    return asSession(body.session);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapSessionApiError(err.body, err.message));
    }
    throw err;
  }
}

export async function updateAttendanceSession(
  input: AttendanceSessionUpdateInput
): Promise<AttendanceSession> {
  try {
    const payload: Record<string, unknown> = {
      action: 'update',
      sessionId: input.sessionId,
    };
    if (input.title !== undefined) payload.title = input.title;
    if (input.type !== undefined) payload.type = input.type;
    if (input.startsAt !== undefined) payload.startsAt = input.startsAt;
    if (input.endsAt !== undefined) payload.endsAt = input.endsAt;
    if (input.timezone !== undefined) payload.timezone = input.timezone;
    if (input.eventId !== undefined) payload.eventId = input.eventId;
    if (input.serveOpportunityId !== undefined) {
      payload.serveOpportunityId = input.serveOpportunityId;
    }

    const body = await apiFetch<AttendanceSessionMutationResponse>(ATTENDANCE_SESSIONS_API, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!body.session) throw new Error('Session was not returned.');
    return asSession(body.session);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapSessionApiError(err.body, err.message));
    }
    throw err;
  }
}

export async function openAttendanceSession(
  sessionId: string
): Promise<{ session: AttendanceSession; alreadyOpen?: boolean }> {
  try {
    const body = await apiFetch<AttendanceSessionMutationResponse>(ATTENDANCE_SESSIONS_API, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'open', sessionId }),
    });
    if (!body.session) throw new Error('Session was not returned.');
    return { session: asSession(body.session), alreadyOpen: !!body.alreadyOpen };
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapSessionApiError(err.body, err.message));
    }
    throw err;
  }
}

export async function closeAttendanceSession(
  sessionId: string
): Promise<{ session: AttendanceSession; alreadyClosed?: boolean }> {
  try {
    const body = await apiFetch<AttendanceSessionMutationResponse>(ATTENDANCE_SESSIONS_API, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'close', sessionId }),
    });
    if (!body.session) throw new Error('Session was not returned.');
    return { session: asSession(body.session), alreadyClosed: !!body.alreadyClosed };
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapSessionApiError(err.body, err.message));
    }
    throw err;
  }
}

/** Super Admin only — close open sessions and purge draft/closed session history. */
export async function resetTestAttendanceSessions(): Promise<{
  closedOpen: number;
  deletedSessions: number;
  deletedCustody: number;
  deletedRecords: number;
}> {
  try {
    const body = await apiFetch<{
      ok?: boolean;
      closedOpen?: number;
      deletedSessions?: number;
      deletedCustody?: number;
      deletedRecords?: number;
    }>(ATTENDANCE_SESSIONS_API, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'test_reset' }),
    });
    return {
      closedOpen: Number(body.closedOpen) || 0,
      deletedSessions: Number(body.deletedSessions) || 0,
      deletedCustody: Number(body.deletedCustody) || 0,
      deletedRecords: Number(body.deletedRecords) || 0,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(mapSessionApiError(err.body, err.message));
    }
    throw err;
  }
}

/** Optional helpers for form selectors — reuse existing Vault event/serve list APIs. */
export async function fetchEventsForSessionForm(): Promise<Array<{ id: string; name: string }>> {
  try {
    const body = await apiFetch<{ ok?: boolean; events?: any[] }>(
      '/api/vault?resource=events&limit=100',
      { method: 'GET' }
    );
    return (body.events || [])
      .map((e) => ({ id: String(e.id || ''), name: String(e.name || 'Event').trim() || 'Event' }))
      .filter((e) => e.id);
  } catch {
    return [];
  }
}

export async function fetchServeOpportunitiesForSessionForm(): Promise<
  Array<{ id: string; title: string }>
> {
  try {
    const body = await apiFetch<{ ok?: boolean; opportunities?: any[] }>(
      '/api/vault?resource=events&subResource=serve&filter=all',
      { method: 'GET' }
    );
    return (body.opportunities || [])
      .map((o) => ({
        id: String(o.id || ''),
        title: String(o.title || 'Serve opportunity').trim() || 'Serve opportunity',
      }))
      .filter((o) => o.id);
  } catch {
    return [];
  }
}
