/**
 * Vault Attendance Records Read HTTP handler.
 * Mounted at GET /api/vault?resource=attendance&subResource=records&sessionId=
 *
 * Phase 2.7D.3A — read-only session roster. No mutation / no UI / no Kids / no links.
 */

import { getSupabaseAdmin, requireAuth } from './auth.js';
import {
  ATTENDANCE_RECORDS_MAX,
  canReadAttendanceRecords,
  computeTotals,
  httpStatusForRecordsCode,
  parseSessionIdQuery,
  sanitizeAttendanceRowDto,
  toAttendanceRowDto,
  toSessionContextDto,
  type AttendanceRecordsErrorCode,
  type AttendanceRowDto,
} from './attendanceRecordsLogic.js';

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

function fail(res: any, code: AttendanceRecordsErrorCode, error: string) {
  setNoStore(res);
  return res.status(httpStatusForRecordsCode(code)).json({ ok: false, error, code });
}

const SESSION_COLS =
  'id, title, type, status, starts_at, ends_at, timezone, visitor_count';

export async function handleAttendanceRecords(req: any, res: any) {
  try {
    setNoStore(res);

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return fail(res, 'attendance_unavailable', 'Supabase Admin not initialized.');
    }

    const auth = await requireAuth(req, res, supabase);
    if (!auth) return;

    if (!canReadAttendanceRecords(auth.role)) {
      return fail(res, 'forbidden', 'Attendance roster requires an authorized staff role.');
    }

    const method = String(req.method || '').toUpperCase();
    if (method !== 'GET') {
      return fail(res, 'method_not_allowed', 'Method not allowed.');
    }

    const parsed = parseSessionIdQuery(req.query || {});
    if (!parsed.ok) return fail(res, parsed.code, parsed.error);

    const { data: sessionRow, error: sessErr } = await supabase
      .from('attendance_sessions')
      .select(SESSION_COLS)
      .eq('id', parsed.sessionId)
      .maybeSingle();
    if (sessErr) throw sessErr;
    if (!sessionRow?.id) {
      return fail(res, 'session_not_found', 'Session not found.');
    }

    const session = toSessionContextDto(sessionRow);

    const { count: memberCountRaw, error: countErr } = await supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', parsed.sessionId);
    if (countErr) throw countErr;
    const memberCount = memberCountRaw ?? 0;

    const { data: rows, error: rowsErr } = await supabase
      .from('attendance_records')
      .select('checked_in_at, source, member_id')
      .eq('session_id', parsed.sessionId)
      .order('checked_in_at', { ascending: false })
      .limit(ATTENDANCE_RECORDS_MAX);
    if (rowsErr) throw rowsErr;

    const recordRows = rows || [];
    const memberIds = [...new Set(recordRows.map((r: any) => r.member_id).filter(Boolean))];

    const memberMap = new Map<
      string,
      { first_name?: unknown; last_name?: unknown; avatar_url?: unknown }
    >();
    if (memberIds.length) {
      const { data: members, error: memErr } = await supabase
        .from('members')
        .select('id, first_name, last_name, avatar_url')
        .in('id', memberIds);
      if (memErr) throw memErr;
      for (const m of members || []) {
        if (m?.id) memberMap.set(String(m.id), m);
      }
    }

    const attendance: AttendanceRowDto[] = recordRows.map((r: any) =>
      sanitizeAttendanceRowDto(
        toAttendanceRowDto({
          checkedInAt: r.checked_in_at,
          source: r.source,
          member: memberMap.get(String(r.member_id)) || null,
        })
      )
    );

    const totals = computeTotals(memberCount, session.visitorCount);
    const truncated = totals.memberCount > ATTENDANCE_RECORDS_MAX;

    setNoStore(res);
    return res.status(200).json({
      ok: true,
      session,
      attendance,
      memberCount: totals.memberCount,
      visitorCount: totals.visitorCount,
      totalCount: totals.totalCount,
      truncated,
    });
  } catch (err: any) {
    console.error('[attendance-records]', err?.message || err);
    const msg = String(err?.message || '');
    if (/relation .* does not exist|column .* does not exist/i.test(msg)) {
      return fail(res, 'attendance_unavailable', 'Attendance records are not available.');
    }
    setNoStore(res);
    return res.status(500).json({
      ok: false,
      error: 'Attendance records request failed.',
      code: 'attendance_records_error',
    });
  }
}
