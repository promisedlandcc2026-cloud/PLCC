/**
 * Vault Attendance Today HTTP handler.
 * GET/DELETE /api/vault?resource=attendance&subResource=today
 *
 * Cross-session day roster from attendance_records (Phase 2.7).
 * No legacy public.attendance reads/writes.
 */

import { getSupabaseAdmin, requireAuth } from './auth.js';
import {
  ATTENDANCE_TODAY_DEFAULT_TZ,
  ATTENDANCE_TODAY_MAX_FETCH,
  canDeleteAttendanceToday,
  canReadAttendanceRecords,
  churchDayBoundsUtc,
  httpStatusForTodayCode,
  isKidsTodayRow,
  paginateTodayRows,
  parseTodayQuery,
  parseTodayRecordId,
  toTodayRowDto,
  type AttendanceTodayErrorCode,
  type AttendanceTodayRowDto,
} from './attendanceTodayLogic.js';

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

function fail(res: any, code: AttendanceTodayErrorCode, error: string) {
  setNoStore(res);
  return res.status(httpStatusForTodayCode(code)).json({ ok: false, error, code });
}

export async function handleAttendanceToday(req: any, res: any) {
  try {
    setNoStore(res);

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return fail(res, 'attendance_unavailable', 'Supabase Admin not initialized.');
    }

    const auth = await requireAuth(req, res, supabase);
    if (!auth) return;

    const method = String(req.method || '').toUpperCase();

    if (method === 'DELETE') {
      if (!canDeleteAttendanceToday(auth.role)) {
        return fail(res, 'forbidden', 'Removing a check-in requires an authorized staff role.');
      }
      const recordId = parseTodayRecordId(req.query || {}, req.body);
      if (!recordId) {
        return fail(res, 'invalid_request', 'id is required.');
      }
      const { data: existing, error: findErr } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('id', recordId)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!existing?.id) {
        return fail(res, 'record_not_found', 'Check-in record not found.');
      }
      const { error: delErr } = await supabase
        .from('attendance_records')
        .delete()
        .eq('id', recordId);
      if (delErr) throw delErr;
      return res.status(200).json({ ok: true, deletedId: recordId });
    }

    if (method !== 'GET') {
      return fail(res, 'method_not_allowed', 'Method not allowed.');
    }

    if (!canReadAttendanceRecords(auth.role)) {
      return fail(res, 'forbidden', 'Today’s check-ins require an authorized staff role.');
    }

    const parsed = parseTodayQuery(req.query || {});
    if (!parsed.ok) return fail(res, parsed.code, parsed.error);

    const { dayStart, dayEnd } = churchDayBoundsUtc(new Date(), ATTENDANCE_TODAY_DEFAULT_TZ);

    const { data: rows, error: rowsErr } = await supabase
      .from('attendance_records')
      .select('id, checked_in_at, source, member_id, session_id')
      .gte('checked_in_at', dayStart)
      .lt('checked_in_at', dayEnd)
      .order('checked_in_at', { ascending: false })
      .limit(ATTENDANCE_TODAY_MAX_FETCH);
    if (rowsErr) throw rowsErr;

    const recordRows = rows || [];
    const memberIds = [
      ...new Set(recordRows.map((r: any) => String(r.member_id || '')).filter(Boolean)),
    ];
    const sessionIds = [
      ...new Set(recordRows.map((r: any) => String(r.session_id || '')).filter(Boolean)),
    ];

    const memberMap = new Map<string, { first_name?: unknown; last_name?: unknown }>();
    if (memberIds.length) {
      const { data: members, error: memErr } = await supabase
        .from('members')
        .select('id, first_name, last_name')
        .in('id', memberIds);
      if (memErr) throw memErr;
      for (const m of members || []) {
        if (m?.id) memberMap.set(String(m.id), m);
      }
    }

    const sessionMap = new Map<
      string,
      { id: string; title?: unknown; type?: unknown }
    >();
    if (sessionIds.length) {
      const { data: sessions, error: sessErr } = await supabase
        .from('attendance_sessions')
        .select('id, title, type')
        .in('id', sessionIds);
      if (sessErr) throw sessErr;
      for (const s of sessions || []) {
        if (s?.id) sessionMap.set(String(s.id), s);
      }
    }

    let childMemberIds = new Set<string>();
    if (parsed.kidsOnly && memberIds.length > 0) {
      const { data: hm, error: hmErr } = await supabase
        .from('household_members')
        .select('member_id')
        .in('member_id', memberIds)
        .eq('status', 'active')
        .in('relationship_type', ['child', 'dependent']);
      if (hmErr) throw hmErr;
      childMemberIds = new Set(
        (hm || []).map((r: any) => String(r.member_id || '')).filter(Boolean)
      );
    }

    const mapped: AttendanceTodayRowDto[] = [];
    for (const r of recordRows as any[]) {
      const session = sessionMap.get(String(r.session_id || '')) || null;
      const sessionType = String(session?.type || '');
      if (
        parsed.kidsOnly &&
        !isKidsTodayRow({
          sessionType,
          memberId: String(r.member_id || ''),
          childMemberIds,
        })
      ) {
        continue;
      }
      mapped.push(
        toTodayRowDto({
          id: r.id,
          checkedInAt: r.checked_in_at,
          source: r.source,
          memberId: r.member_id,
          member: memberMap.get(String(r.member_id || '')) || null,
          session,
        })
      );
    }

    const { page, totalCount } = paginateTodayRows(mapped, parsed.limit, parsed.offset);

    return res.status(200).json({
      ok: true,
      attendance: page,
      totalCount,
      kidsOnly: parsed.kidsOnly,
      timezone: ATTENDANCE_TODAY_DEFAULT_TZ,
      dayStart,
      dayEnd,
    });
  } catch (err: any) {
    console.error('[attendance-today]', err?.message || err);
    return fail(res, 'attendance_today_error', 'Unable to load today’s check-ins.');
  }
}
