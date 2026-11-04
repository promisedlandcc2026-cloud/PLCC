/**
 * Vault Attendance Session Admin HTTP handler.
 * Mounted at GET|POST|PATCH /api/vault?resource=attendance&subResource=sessions
 *
 * Phase 2.7B — session lifecycle only.
 * No person check-in, no legacy public.attendance writes, no custody, no scanner.
 */

import { getSupabaseAdmin, requireAuth } from './auth.js';
import {
  ATTENDANCE_SESSION_MANAGER_ROLES,
  asUuid,
  httpStatusForSessionCode,
  isAttendanceSessionManagerRole,
  parseCreateSessionBody,
  parsePatchBody,
  sanitizeSessionDto,
  toSessionDto,
  validateDraftDatePair,
  type AttendanceSessionErrorCode,
  type SessionRow,
} from './attendanceSessionLogic.js';
import { isAttendanceCheckinRole } from './attendanceCheckinLogic.js';

async function getAudit() {
  const { getAudit: loadAudit } = await import('./deps.js');
  return loadAudit();
}

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

function fail(res: any, code: AttendanceSessionErrorCode, error: string) {
  setNoStore(res);
  return res.status(httpStatusForSessionCode(code)).json({ ok: false, error, code });
}

async function safeAudit(payload: Record<string, unknown>) {
  try {
    const logAudit = await getAudit();
    await logAudit(payload);
  } catch (err: any) {
    console.warn('[attendance-session] audit failed (non-fatal):', err?.message || err);
  }
}

const SELECT_COLS =
  'id, type, title, starts_at, ends_at, status, timezone, visitor_count, event_id, serve_opportunity_id, opened_at, closed_at';

export async function handleAttendanceSessions(req: any, res: any) {
  try {
    // Always set no-store first so 401 from requireAuth still carries cache headers.
    setNoStore(res);

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return fail(res, 'attendance_session_unavailable', 'Supabase Admin not initialized.');
    }

    const auth = await requireAuth(req, res, supabase);
    if (!auth) return;

    const method = String(req.method || '').toUpperCase();
    const canManage = isAttendanceSessionManagerRole(auth.role);
    const canDeskRead = isAttendanceCheckinRole(auth.role);

    // Desk roles (e.g. Children's Ministry) may list/open sessions for check-in.
    // Create / patch / close stays manager-only.
    if (method === 'GET') {
      if (!canManage && !canDeskRead) {
        return fail(res, 'forbidden', 'Attendance session management requires an authorized staff role.');
      }
      return await handleGet(req, res, supabase);
    }
    if (!canManage) {
      return fail(res, 'forbidden', 'Attendance session management requires an authorized staff role.');
    }
    if (method === 'POST') {
      return await handleCreate(req, res, supabase, auth);
    }
    if (method === 'PATCH') {
      return await handlePatch(req, res, supabase, auth);
    }
    if (method === 'DELETE') {
      return fail(res, 'delete_not_allowed', 'Hard delete is not allowed for attendance sessions.');
    }
    return fail(res, 'method_not_allowed', 'Method not allowed.');
  } catch (err: any) {
    console.error('[attendance-session]', err?.message || err);
    const msg = String(err?.message || '');
    if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
      return fail(
        res,
        'attendance_session_unavailable',
        'Attendance session tables are not available.'
      );
    }
    setNoStore(res);
    return res.status(500).json({
      ok: false,
      error: 'Attendance session request failed.',
      code: 'attendance_session_error',
    });
  }
}

async function handleGet(req: any, res: any, supabase: any) {
  const sessionId = asUuid(req.query?.sessionId ?? req.query?.id);
  if (sessionId) {
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select(SELECT_COLS)
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail(res, 'session_not_found', 'Session not found.');
    setNoStore(res);
    return res.status(200).json({
      ok: true,
      session: sanitizeSessionDto(toSessionDto(data as SessionRow)),
      rolesAllowed: Array.from(ATTENDANCE_SESSION_MANAGER_ROLES),
    });
  }

  const limit = Math.min(Math.max(parseInt(String(req.query?.limit || '50'), 10) || 50, 1), 100);
  const offset = Math.max(parseInt(String(req.query?.offset || '0'), 10) || 0, 0);
  const status = typeof req.query?.status === 'string' ? req.query.status.trim() : '';
  const type = typeof req.query?.type === 'string' ? req.query.type.trim() : '';

  let q = supabase
    .from('attendance_sessions')
    .select(SELECT_COLS, { count: 'exact' })
    .order('starts_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq('status', status);
  if (type) q = q.eq('type', type);

  const { data, error, count } = await q;
  if (error) throw error;

  setNoStore(res);
  return res.status(200).json({
    ok: true,
    sessions: (data || []).map((row: SessionRow) => sanitizeSessionDto(toSessionDto(row))),
    totalCount: count ?? (data || []).length,
    limit,
    offset,
    rolesAllowed: Array.from(ATTENDANCE_SESSION_MANAGER_ROLES),
  });
}

async function handleCreate(req: any, res: any, supabase: any, auth: { user: { id: string }; role: string | null }) {
  const parsed = parseCreateSessionBody(req.body);
  if (!parsed.ok) return fail(res, parsed.code, parsed.error);

  if (parsed.eventId) {
    const { data: ev, error: evErr } = await supabase
      .from('events')
      .select('id')
      .eq('id', parsed.eventId)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!ev?.id) return fail(res, 'event_not_found', 'Event not found.');
  }

  if (parsed.serveOpportunityId) {
    const { data: opp, error: oppErr } = await supabase
      .from('serve_opportunities')
      .select('id')
      .eq('id', parsed.serveOpportunityId)
      .maybeSingle();
    if (oppErr) throw oppErr;
    if (!opp?.id) return fail(res, 'serve_opportunity_not_found', 'Serve opportunity not found.');
  }

  const insertRow = {
    type: parsed.type,
    title: parsed.title,
    starts_at: parsed.startsAt,
    ends_at: parsed.endsAt,
    timezone: parsed.timezone,
    event_id: parsed.eventId,
    serve_opportunity_id: parsed.serveOpportunityId,
    status: 'draft',
    visitor_count: 0,
    created_by: auth.user!.id,
  };

  const { data, error } = await supabase
    .from('attendance_sessions')
    .insert(insertRow)
    .select(SELECT_COLS)
    .single();
  if (error) throw error;

  await safeAudit({
    action: 'attendance_session.create',
    details: {
      sessionId: data.id,
      type: data.type,
      status: data.status,
      titleLength: String(data.title || '').length,
    },
    resourceType: 'attendance_session',
    resourceId: data.id,
    severity: 'info',
    req,
  });

  setNoStore(res);
  return res.status(201).json({
    ok: true,
    session: sanitizeSessionDto(toSessionDto(data as SessionRow)),
  });
}

async function handleTestReset(
  req: any,
  res: any,
  supabase: any,
  auth: { user: { id: string }; role: string | null }
) {
  if (String(auth.role || '').toUpperCase() !== 'SUPER_ADMIN') {
    return fail(res, 'forbidden', 'Only Super Admin can reset test attendance sessions.');
  }

  const { data: allSessions, error: listErr } = await supabase
    .from('attendance_sessions')
    .select('id, status');
  if (listErr) throw listErr;

  const rows = allSessions || [];
  const openIds = rows.filter((s: any) => s.status === 'open').map((s: any) => String(s.id));
  const nowIso = new Date().toISOString();

  let closedOpen = 0;
  if (openIds.length) {
    const { data: closedRows, error: closeErr } = await supabase
      .from('attendance_sessions')
      .update({
        status: 'closed',
        closed_by: auth.user!.id,
        closed_at: nowIso,
      })
      .in('id', openIds)
      .eq('status', 'open')
      .select('id');
    if (closeErr) throw closeErr;
    closedOpen = (closedRows || []).length;
  }

  // Re-read — purge every draft + closed session (including ones just closed).
  const { data: purgeCandidates, error: purgeListErr } = await supabase
    .from('attendance_sessions')
    .select('id, status')
    .in('status', ['draft', 'closed']);
  if (purgeListErr) throw purgeListErr;

  const purgeIds = (purgeCandidates || []).map((s: any) => String(s.id)).filter(Boolean);
  let deletedCustody = 0;
  let deletedRecords = 0;
  let deletedReconcile = 0;
  let deletedSessions = 0;

  if (purgeIds.length) {
    const { data: custDel, error: custErr } = await supabase
      .from('child_custody_records')
      .delete()
      .in('session_id', purgeIds)
      .select('id');
    if (custErr && !/does not exist/i.test(String(custErr.message || ''))) throw custErr;
    deletedCustody = (custDel || []).length;

    const { data: recDel, error: recErr } = await supabase
      .from('attendance_records')
      .delete()
      .in('session_id', purgeIds)
      .select('id');
    if (recErr && !/does not exist/i.test(String(recErr.message || ''))) throw recErr;
    deletedRecords = (recDel || []).length;

    const { data: reconDel, error: reconErr } = await supabase
      .from('event_attendance_reconciliations')
      .delete()
      .in('session_id', purgeIds)
      .select('id');
    if (reconErr && !/does not exist/i.test(String(reconErr.message || ''))) {
      // Table may be absent in some envs — only ignore missing relation
      if (!/relation|schema cache/i.test(String(reconErr.message || ''))) throw reconErr;
    } else {
      deletedReconcile = (reconDel || []).length;
    }

    const { data: sessDel, error: sessErr } = await supabase
      .from('attendance_sessions')
      .delete()
      .in('id', purgeIds)
      .select('id');
    if (sessErr) throw sessErr;
    deletedSessions = (sessDel || []).length;
  }

  await safeAudit({
    userId: auth.user!.id,
    action: 'attendance_session.test_reset',
    details: {
      closedOpen,
      deletedSessions,
      deletedCustody,
      deletedRecords,
      deletedReconcile,
      purgeIdCount: purgeIds.length,
    },
    resourceType: 'attendance_session',
    severity: 'critical',
    req,
  });

  setNoStore(res);
  return res.status(200).json({
    ok: true,
    closedOpen,
    deletedSessions,
    deletedCustody,
    deletedRecords,
    deletedReconcile,
  });
}

async function handlePatch(req: any, res: any, supabase: any, auth: { user: { id: string }; role: string | null }) {
  const parsed = parsePatchBody(req.body);
  if (!parsed.ok) return fail(res, parsed.code, parsed.error);

  if (parsed.action === 'test_reset') {
    return await handleTestReset(req, res, supabase, auth);
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('attendance_sessions')
    .select(
      'id, type, title, starts_at, ends_at, status, timezone, visitor_count, event_id, serve_opportunity_id, opened_at, closed_at, opened_by, closed_by'
    )
    .eq('id', parsed.sessionId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!existing) return fail(res, 'session_not_found', 'Session not found.');

  if (parsed.action === 'open') {
    if (existing.status === 'closed') {
      return fail(res, 'session_already_closed', 'Closed sessions cannot be reopened.');
    }
    if (existing.status === 'open') {
      setNoStore(res);
      return res.status(200).json({
        ok: true,
        alreadyOpen: true,
        session: sanitizeSessionDto(toSessionDto(existing as SessionRow)),
      });
    }
    if (existing.status !== 'draft') {
      return fail(res, 'session_not_draft', 'Only draft sessions can be opened.');
    }

    const { data, error } = await supabase
      .from('attendance_sessions')
      .update({
        status: 'open',
        opened_by: auth.user!.id,
        opened_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('status', 'draft')
      .select(SELECT_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Race: re-read
      const { data: again } = await supabase
        .from('attendance_sessions')
        .select(SELECT_COLS)
        .eq('id', existing.id)
        .maybeSingle();
      if (again?.status === 'open') {
        setNoStore(res);
        return res.status(200).json({
          ok: true,
          alreadyOpen: true,
          session: sanitizeSessionDto(toSessionDto(again as SessionRow)),
        });
      }
      if (again?.status === 'closed') {
        return fail(res, 'session_already_closed', 'Closed sessions cannot be reopened.');
      }
      return fail(res, 'attendance_session_error', 'Could not open session.');
    }

    await safeAudit({
      action: 'attendance_session.open',
      details: { sessionId: data.id, type: data.type },
      resourceType: 'attendance_session',
      resourceId: data.id,
      severity: 'info',
      req,
    });

    setNoStore(res);
    return res.status(200).json({
      ok: true,
      session: sanitizeSessionDto(toSessionDto(data as SessionRow)),
    });
  }

  if (parsed.action === 'close') {
    if (existing.status === 'closed') {
      setNoStore(res);
      return res.status(200).json({
        ok: true,
        alreadyClosed: true,
        session: sanitizeSessionDto(toSessionDto(existing as SessionRow)),
      });
    }
    if (existing.status !== 'open') {
      return fail(res, 'session_not_open', 'Only open sessions can be closed.');
    }

    const { data, error } = await supabase
      .from('attendance_sessions')
      .update({
        status: 'closed',
        closed_by: auth.user!.id,
        closed_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('status', 'open')
      .select(SELECT_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: again } = await supabase
        .from('attendance_sessions')
        .select(SELECT_COLS)
        .eq('id', existing.id)
        .maybeSingle();
      if (again?.status === 'closed') {
        setNoStore(res);
        return res.status(200).json({
          ok: true,
          alreadyClosed: true,
          session: sanitizeSessionDto(toSessionDto(again as SessionRow)),
        });
      }
      return fail(res, 'session_not_open', 'Only open sessions can be closed.');
    }

    await safeAudit({
      action: 'attendance_session.close',
      details: { sessionId: data.id, type: data.type },
      resourceType: 'attendance_session',
      resourceId: data.id,
      severity: 'info',
      req,
    });

    setNoStore(res);
    return res.status(200).json({
      ok: true,
      session: sanitizeSessionDto(toSessionDto(data as SessionRow)),
    });
  }

  // Draft metadata update
  if (existing.status !== 'draft') {
    return fail(res, 'session_not_draft', 'Only draft sessions can be edited.');
  }

  const nextType = parsed.type ?? existing.type;
  const nextStarts = parsed.startsAt ?? existing.starts_at;
  const nextEnds =
    parsed.clearEndsAt || parsed.endsAt !== undefined
      ? (parsed.endsAt ?? null)
      : existing.ends_at;
  const nextEventId =
    parsed.eventId !== undefined ? parsed.eventId : existing.event_id;
  const nextServeId =
    parsed.serveOpportunityId !== undefined
      ? parsed.serveOpportunityId
      : existing.serve_opportunity_id;

  const dateFail = validateDraftDatePair(nextStarts, nextEnds);
  if (dateFail) return fail(res, dateFail.code, dateFail.error);

  if (nextType === 'event' && !nextEventId) {
    return fail(res, 'event_required', 'type=event requires eventId.');
  }

  if (nextEventId) {
    const { data: ev, error: evErr } = await supabase
      .from('events')
      .select('id')
      .eq('id', nextEventId)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!ev?.id) return fail(res, 'event_not_found', 'Event not found.');
  }

  if (nextServeId) {
    const { data: opp, error: oppErr } = await supabase
      .from('serve_opportunities')
      .select('id')
      .eq('id', nextServeId)
      .maybeSingle();
    if (oppErr) throw oppErr;
    if (!opp?.id) return fail(res, 'serve_opportunity_not_found', 'Serve opportunity not found.');
  }

  const updates: Record<string, unknown> = {};
  if (parsed.title !== undefined) updates.title = parsed.title;
  if (parsed.type !== undefined) updates.type = parsed.type;
  if (parsed.startsAt !== undefined) updates.starts_at = parsed.startsAt;
  if (parsed.clearEndsAt || parsed.endsAt !== undefined) updates.ends_at = nextEnds;
  if (parsed.timezone !== undefined) updates.timezone = parsed.timezone;
  if (parsed.eventId !== undefined) updates.event_id = parsed.eventId;
  if (parsed.serveOpportunityId !== undefined) {
    updates.serve_opportunity_id = parsed.serveOpportunityId;
  }

  const { data, error } = await supabase
    .from('attendance_sessions')
    .update(updates)
    .eq('id', existing.id)
    .eq('status', 'draft')
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return fail(res, 'session_not_draft', 'Only draft sessions can be edited.');
  }

  await safeAudit({
    action: 'attendance_session.update',
    details: {
      sessionId: data.id,
      fields: Object.keys(updates),
    },
    resourceType: 'attendance_session',
    resourceId: data.id,
    severity: 'info',
    req,
  });

  setNoStore(res);
  return res.status(200).json({
    ok: true,
    session: sanitizeSessionDto(toSessionDto(data as SessionRow)),
  });
}
