/**
 * PLCC Core Departments — Phase 3 server (Nov 25 2026): attendance, reports, performance, requisitions.
 * Called from handler.ts. Tables: supabase/migrations/plcc_departments_phase3.sql.
 */
import type { ChurchAccess, DeptPermission, DeptRole } from './access.js';
import { UUID, audit, deptMemberIds, isMissingTable, namesFor, notifyMany, oversightIds } from './common.js';
import {
  attendanceRate,
  canActOnReq,
  canCancelReq,
  canMarkPaid,
  computePerformance,
  initialReqStatus,
  nextReqStatus,
  parseMarks,
  parseReport,
  parseRequisition,
  periodLabel,
  type ReqRow,
  type ReqStatus,
} from './workflow3.js';

export const PHASE3_MSG = 'Attendance, reports and requisitions are not set up yet. Run supabase/migrations/plcc_departments_phase3.sql in Supabase first.';
const REQ_COLS = 'id, department_id, activity_id, title, purpose, amount_ugx, needed_by, status, created_by, head_by, head_at, finance_by, finance_at, finance_note, pastor_by, pastor_at, rejected_by, rejected_at, rejected_stage, reject_note, paid_by, paid_at, paid_reference, created_at, updated_at';
const REPORT_COLS = 'id, department_id, period_type, period_start, title, summary, achievements, challenges, plans, support_needed, status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_note';
const OPEN_REQ: ReqStatus[] = ['PENDING_HEAD', 'PENDING_FINANCE', 'PENDING_PASTOR', 'APPROVED'];
const DAY = 864e5;

type Perms = Record<DeptPermission, boolean>;

/** Finance officers: users.role FINANCE, plus the Head and Treasurer of the Finance department. */
export async function isFinanceOfficer(admin: any, userId: string, role: string | null | undefined): Promise<boolean> {
  if (String(role || '').toUpperCase() === 'FINANCE') return true;
  return (await financeOfficerIds(admin)).includes(userId);
}

export async function financeOfficerIds(admin: any): Promise<string[]> {
  const ids = new Set<string>();
  const { data: fin } = await admin.from('users').select('id').eq('role', 'FINANCE');
  for (const u of fin || []) ids.add(u.id);
  const { data: dept } = await admin.from('departments').select('id').eq('slug', 'finance').maybeSingle();
  if (dept?.id) {
    const { data: leaders } = await admin.from('department_members').select('user_id, dept_role').eq('department_id', dept.id);
    for (const l of leaders || []) if (l.dept_role === 'HEAD' || l.dept_role === 'TREASURER') ids.add(l.user_id);
  }
  return [...ids];
}

export function shapeReq(r: any, names: Map<string, { name: string }>, dept?: { id: string; name: string; color: string; icon: string }) {
  const n = (id: string | null) => (id ? names.get(id)?.name || 'Someone' : null);
  return {
    id: r.id,
    departmentId: r.department_id,
    activityId: r.activity_id || null,
    title: r.title,
    purpose: r.purpose || '',
    amountUgx: Number(r.amount_ugx),
    neededBy: r.needed_by || null,
    status: r.status as ReqStatus,
    createdBy: r.created_by,
    createdByName: n(r.created_by),
    headByName: n(r.head_by),
    headAt: r.head_at,
    financeByName: n(r.finance_by),
    financeAt: r.finance_at,
    financeNote: r.finance_note || null,
    pastorByName: n(r.pastor_by),
    pastorAt: r.pastor_at,
    rejectedByName: n(r.rejected_by),
    rejectedStage: r.rejected_stage || null,
    rejectNote: r.reject_note || null,
    paidByName: n(r.paid_by),
    paidAt: r.paid_at,
    paidReference: r.paid_reference || null,
    createdAt: r.created_at,
    headBy: r.head_by,
    financeBy: r.finance_by,
    ...(dept ? { department: dept } : {}),
  };
}

function shapeReport(r: any, names: Map<string, { name: string }>, dept?: any) {
  return {
    id: r.id,
    departmentId: r.department_id,
    periodType: r.period_type,
    periodStart: r.period_start,
    periodLabel: periodLabel(r.period_type, r.period_start),
    title: r.title,
    summary: r.summary || '',
    achievements: r.achievements || '',
    challenges: r.challenges || '',
    plans: r.plans || '',
    supportNeeded: r.support_needed || '',
    status: r.status,
    submittedBy: r.submitted_by,
    submittedByName: names.get(r.submitted_by)?.name || 'Someone',
    submittedAt: r.submitted_at,
    reviewedByName: r.reviewed_by ? names.get(r.reviewed_by)?.name || 'A Pastor' : null,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note || null,
    ...(dept ? { department: dept } : {}),
  };
}

/** Performance for one department (last 90 days). */
export async function departmentPerformance(admin: any, departmentId: string, today = new Date()) {
  const since = new Date(today.getTime() - 90 * DAY).toISOString().slice(0, 10);
  const { data: sessions, error } = await admin.from('department_attendance_sessions').select('id').eq('department_id', departmentId).gte('held_on', since);
  if (error) throw error;
  const sessionIds = (sessions || []).map((s: any) => s.id);
  const { data: marks } = sessionIds.length ? await admin.from('department_attendance').select('status').in('session_id', sessionIds) : { data: [] };
  const { data: acts } = await admin
    .from('department_activities')
    .select('status, starts_at')
    .eq('department_id', departmentId)
    .in('status', ['APPROVED', 'COMPLETED'])
    .gte('starts_at', new Date(today.getTime() - 90 * DAY).toISOString())
    .lte('starts_at', today.toISOString());
  const { data: reports } = await admin.from('department_reports').select('period_start').eq('department_id', departmentId).eq('period_type', 'MONTHLY');
  const { count: openReqs } = await admin.from('department_requisitions').select('id', { count: 'exact', head: true }).eq('department_id', departmentId).in('status', OPEN_REQ);
  return computePerformance({
    marks: marks || [],
    sessions: sessionIds.length,
    pastApprovedOrDone: acts || [],
    monthlyReportPeriods: (reports || []).map((r: any) => r.period_start),
    today,
    openRequisitions: openReqs || 0,
  });
}

/** Extra dashboard data for one department. Never throws when Phase 3 is not installed. */
export async function loadPhase3(admin: any, opts: { departmentId: string; me: string; perms: Perms; church: ChurchAccess; myRole: DeptRole | null; financeOfficer: boolean }) {
  const { departmentId: id, me, perms, church, myRole } = opts;
  try {
    const out: any = { phase3Ready: true, attendance: null, myAttendance: null, reports: null, requisitions: null, performance: null };
    const seeAllAttendance = perms['attendance.record'] || perms['members.view'] || church.isOversight;

    const { data: sessions, error } = await admin.from('department_attendance_sessions').select('id, activity_id, title, held_on, recorded_by').eq('department_id', id).order('held_on', { ascending: false }).limit(60);
    if (error) throw error;
    const sIds = (sessions || []).map((s: any) => s.id);
    const { data: marks } = sIds.length ? await admin.from('department_attendance').select('session_id, user_id, status').in('session_id', sIds) : { data: [] };
    const all = marks || [];
    if (seeAllAttendance) {
      const names = await namesFor(admin, (sessions || []).map((s: any) => s.recorded_by));
      out.attendance = (sessions || []).map((s: any) => {
        const m = all.filter((x: any) => x.session_id === s.id);
        return {
          id: s.id,
          activityId: s.activity_id || null,
          title: s.title,
          heldOn: s.held_on,
          recordedByName: names.get(s.recorded_by)?.name || 'Someone',
          present: m.filter((x: any) => x.status === 'PRESENT').length,
          absent: m.filter((x: any) => x.status === 'ABSENT').length,
          excused: m.filter((x: any) => x.status === 'EXCUSED').length,
          marks: perms['attendance.record'] || church.isOversight ? m.map((x: any) => ({ userId: x.user_id, status: x.status })) : undefined,
        };
      });
    }
    if (myRole) {
      const mine = all.filter((x: any) => x.user_id === me);
      out.myAttendance = {
        rate: attendanceRate(mine),
        sessions: (sessions || [])
          .filter((s: any) => mine.some((x: any) => x.session_id === s.id))
          .slice(0, 12)
          .map((s: any) => ({ id: s.id, title: s.title, heldOn: s.held_on, status: mine.find((x: any) => x.session_id === s.id)?.status })),
      };
    }

    if (perms['reports.submit'] || perms['members.manage'] || church.isOversight) {
      const { data: reps } = await admin.from('department_reports').select(REPORT_COLS).eq('department_id', id).order('period_start', { ascending: false }).limit(40);
      const names = await namesFor(admin, (reps || []).flatMap((r: any) => [r.submitted_by, r.reviewed_by]));
      out.reports = (reps || []).map((r: any) => shapeReport(r, names));
      out.performance = await departmentPerformance(admin, id);
    }

    if (perms['finance.view'] || opts.financeOfficer) {
      const { data: reqs } = await admin.from('department_requisitions').select(REQ_COLS).eq('department_id', id).order('created_at', { ascending: false }).limit(60);
      const names = await namesFor(admin, (reqs || []).flatMap((r: any) => [r.created_by, r.head_by, r.finance_by, r.pastor_by, r.rejected_by, r.paid_by]));
      out.requisitions = (reqs || []).map((r: any) => shapeReq(r, names));
    }
    return out;
  } catch (e) {
    if (isMissingTable(e)) return { phase3Ready: false, attendance: null, myAttendance: null, reports: null, requisitions: null, performance: null };
    throw e;
  }
}

/** Everything waiting for this person: requisition stages, payments, reports to review. */
export async function loadQueues(admin: any, opts: { me: string; church: ChurchAccess; financeOfficer: boolean }) {
  const { me, church, financeOfficer } = opts;
  const { data: headRows } = await admin.from('department_members').select('department_id').eq('user_id', me).eq('dept_role', 'HEAD');
  const headDepts: string[] = (headRows || []).map((r: any) => r.department_id);
  const statuses: ReqStatus[] = [];
  if (church.isOversight) statuses.push('PENDING_PASTOR');
  if (financeOfficer) statuses.push('PENDING_FINANCE', 'APPROVED');
  let reqRows: any[] = [];
  try {
    if (statuses.length) {
      const { data, error } = await admin.from('department_requisitions').select(REQ_COLS).in('status', statuses).order('created_at').limit(200);
      if (error) throw error;
      reqRows = data || [];
    }
    if (headDepts.length) {
      const { data } = await admin.from('department_requisitions').select(REQ_COLS).eq('status', 'PENDING_HEAD').in('department_id', headDepts).order('created_at').limit(200);
      reqRows = reqRows.concat(data || []);
    }
    // Hide the ones this person may not act on (own requisition, or already acted at an earlier stage).
    reqRows = reqRows.filter((r) => r.created_by !== me && r.head_by !== me && (r.status === 'APPROVED' || r.finance_by !== me));
    let reportRows: any[] = [];
    if (church.isOversight) {
      const { data } = await admin.from('department_reports').select(REPORT_COLS).eq('status', 'SUBMITTED').order('submitted_at').limit(200);
      reportRows = (data || []).filter((r: any) => r.submitted_by !== me);
    }
    const deptIds = [...new Set([...reqRows, ...reportRows].map((r) => r.department_id))];
    const { data: depts } = deptIds.length ? await admin.from('departments').select('id, name, color, icon').in('id', deptIds) : { data: [] };
    const dmap = new Map((depts || []).map((d: any) => [d.id, { id: d.id, name: d.name, color: d.color, icon: d.icon }]));
    const names = await namesFor(admin, [...reqRows.flatMap((r) => [r.created_by, r.head_by, r.finance_by, r.pastor_by]), ...reportRows.map((r) => r.submitted_by)]);
    return {
      phase3Ready: true,
      requisitions: reqRows.map((r) => shapeReq(r, names, dmap.get(r.department_id) as any)),
      reports: reportRows.map((r) => shapeReport(r, names, dmap.get(r.department_id))),
      isHead: headDepts.length > 0,
    };
  } catch (e) {
    if (isMissingTable(e)) return { phase3Ready: false, requisitions: [], reports: [], isHead: headDepts.length > 0 };
    throw e;
  }
}

/** Church-wide performance table for Pastors, the Apostle and admins. */
export async function loadPerformanceOverview(admin: any) {
  const { data: depts } = await admin.from('departments').select('id, name, color, icon, sort_order').eq('is_active', true).order('sort_order').order('name');
  const { data: members } = await admin.from('department_members').select('department_id, user_id, dept_role');
  const heads = (members || []).filter((m: any) => m.dept_role === 'HEAD');
  const names = await namesFor(admin, heads.map((h: any) => h.user_id));
  const rows = [];
  for (const d of depts || []) {
    const head = heads.find((h: any) => h.department_id === d.id);
    rows.push({
      id: d.id,
      name: d.name,
      color: d.color,
      icon: d.icon,
      headName: head ? names.get(head.user_id)?.name || 'Member' : null,
      memberCount: (members || []).filter((m: any) => m.department_id === d.id).length,
      performance: await departmentPerformance(admin, d.id),
    });
  }
  return rows;
}

type Ctx = {
  admin: any;
  me: string;
  id: string;
  dept: { id: string; name: string; is_active: boolean };
  perms: Perms;
  church: ChurchAccess;
  myRole: DeptRole | null;
  body: any;
  role: string | null;
};

/** Phase 3 actions. Returns [status, json] or null when the action is not a Phase 3 one. */
export async function handlePhase3Action(action: string, ctx: Ctx): Promise<[number, any] | null> {
  const { admin, me, id, dept, perms, church, myRole, body } = ctx;
  const link = (tab: string) => `/departments/${id}?tab=${tab}`;
  const now = new Date().toISOString();
  const missing = (e: any): [number, any] | null => (isMissingTable(e) ? [503, { ok: false, setupNeeded: true, error: PHASE3_MSG }] : null);

  // ---------------- Attendance ----------------
  if (action === 'attendance_save') {
    if (!perms['attendance.record']) return [403, { ok: false, error: 'You cannot record attendance in this department.' }];
    const memberIds = new Set(await deptMemberIds(admin, id));
    const parsed = parseMarks(body.marks, memberIds);
    if ('error' in parsed) return [400, { ok: false, error: parsed.error }];
    const heldOn = String(body.heldOn || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return [400, { ok: false, error: 'Choose the date.' }];
    if (new Date(`${heldOn}T00:00:00+03:00`).getTime() > Date.now() + DAY) return [400, { ok: false, error: 'Attendance cannot be recorded for a future date.' }];
    let title = String(body.title || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const activityId = body.activityId && UUID.test(String(body.activityId)) ? String(body.activityId) : null;
    if (activityId) {
      const { data: act } = await admin.from('department_activities').select('id, title, status').eq('id', activityId).eq('department_id', id).maybeSingle();
      if (!act || !['APPROVED', 'COMPLETED'].includes(act.status)) return [400, { ok: false, error: 'Choose an approved activity.' }];
      if (!title) title = act.title;
    }
    if (title.length < 2) return [400, { ok: false, error: 'Name the meeting (e.g. Sunday rehearsal).' }];
    let sessionId = body.sessionId && UUID.test(String(body.sessionId)) ? String(body.sessionId) : null;
    if (sessionId) {
      const { data: s } = await admin.from('department_attendance_sessions').select('id').eq('id', sessionId).eq('department_id', id).maybeSingle();
      if (!s) return [404, { ok: false, error: 'Session not found.' }];
      const { error } = await admin.from('department_attendance_sessions').update({ title, held_on: heldOn, activity_id: activityId, updated_at: now }).eq('id', sessionId);
      if (error) return missing(error) || (() => { throw error; })();
      await admin.from('department_attendance').delete().eq('session_id', sessionId);
    } else {
      const { data: s, error } = await admin.from('department_attendance_sessions').insert({ department_id: id, activity_id: activityId, title, held_on: heldOn, recorded_by: me }).select('id').single();
      if (error) {
        if (String(error.code) === '23505') return [409, { ok: false, error: 'Attendance for this activity is already recorded. Open it to edit.' }];
        return missing(error) || (() => { throw error; })();
      }
      sessionId = s.id;
    }
    const { error: mErr } = await admin.from('department_attendance').insert(parsed.value.map((m) => ({ session_id: sessionId, user_id: m.userId, status: m.status })));
    if (mErr) throw mErr;
    const present = parsed.value.filter((m) => m.status === 'PRESENT').length;
    await audit(admin, id, me, body.sessionId ? 'attendance.updated' : 'attendance.recorded', { sessionId, title, heldOn, present, total: parsed.value.length });
    return [200, { ok: true, id: sessionId }];
  }

  if (action === 'attendance_delete') {
    if (!perms['attendance.record']) return [403, { ok: false, error: 'You cannot change attendance in this department.' }];
    const sessionId = String(body.sessionId || '');
    if (!UUID.test(sessionId)) return [400, { ok: false, error: 'Unknown session.' }];
    const { data: s } = await admin.from('department_attendance_sessions').select('id, title, held_on').eq('id', sessionId).eq('department_id', id).maybeSingle();
    if (!s) return [404, { ok: false, error: 'Session not found.' }];
    const { error } = await admin.from('department_attendance_sessions').delete().eq('id', sessionId);
    if (error) throw error;
    await audit(admin, id, me, 'attendance.deleted', { sessionId, title: s.title, heldOn: s.held_on });
    return [200, { ok: true }];
  }

  // ---------------- Reports ----------------
  if (action === 'report_submit') {
    if (!perms['reports.submit']) return [403, { ok: false, error: 'You cannot submit reports for this department.' }];
    const parsed = parseReport(body);
    if ('error' in parsed) return [400, { ok: false, error: parsed.error }];
    const v = parsed.value;
    const row = { title: v.title, summary: v.summary, achievements: v.achievements, challenges: v.challenges, plans: v.plans, support_needed: v.supportNeeded, status: 'SUBMITTED', submitted_by: me, submitted_at: now, reviewed_by: null, reviewed_at: null, review_note: null, updated_at: now };
    const reportId = body.reportId && UUID.test(String(body.reportId)) ? String(body.reportId) : null;
    let savedId = reportId;
    if (reportId) {
      const { data: existing } = await admin.from('department_reports').select('id, status').eq('id', reportId).eq('department_id', id).maybeSingle();
      if (!existing) return [404, { ok: false, error: 'Report not found.' }];
      if (existing.status === 'REVIEWED') return [400, { ok: false, error: 'This report has already been reviewed.' }];
      const { error } = await admin.from('department_reports').update({ ...row, period_type: v.periodType, period_start: v.periodStart }).eq('id', reportId);
      if (error) {
        if (String(error.code) === '23505') return [409, { ok: false, error: 'A report for that period already exists.' }];
        throw error;
      }
    } else {
      const { data: created, error } = await admin.from('department_reports').insert({ department_id: id, period_type: v.periodType, period_start: v.periodStart, ...row }).select('id').single();
      if (error) {
        if (String(error.code) === '23505') return [409, { ok: false, error: `The ${periodLabel(v.periodType, v.periodStart)} report has already been submitted.` }];
        return missing(error) || (() => { throw error; })();
      }
      savedId = created.id;
    }
    await audit(admin, id, me, reportId ? 'report.resubmitted' : 'report.submitted', { reportId: savedId, title: v.title });
    await notifyMany(admin, await oversightIds(admin), me, { title: `Report to review: ${dept.name}`, body: v.title, link: '/departments/approvals?tab=reports', sourceId: savedId || undefined });
    return [200, { ok: true, id: savedId }];
  }

  if (action === 'report_review') {
    if (!church.isOversight) return [403, { ok: false, error: 'Only Pastors and the Apostle review reports.' }];
    const reportId = String(body.reportId || '');
    if (!UUID.test(reportId)) return [400, { ok: false, error: 'Unknown report.' }];
    const { data: rep } = await admin.from('department_reports').select('id, title, status, submitted_by').eq('id', reportId).eq('department_id', id).maybeSingle();
    if (!rep) return [404, { ok: false, error: 'Report not found.' }];
    if (rep.status !== 'SUBMITTED') return [400, { ok: false, error: 'This report is not waiting for review.' }];
    if (rep.submitted_by === me && String(ctx.role || '').toUpperCase() !== 'SUPER_ADMIN') return [403, { ok: false, error: 'Another Pastor needs to review a report you wrote.' }];
    const decision = String(body.decision || '');
    if (decision !== 'REVIEWED' && decision !== 'RETURNED') return [400, { ok: false, error: 'Mark reviewed or return it.' }];
    const note = String(body.note || '').trim().slice(0, 1000);
    if (decision === 'RETURNED' && note.length < 3) return [400, { ok: false, error: 'Say what needs to be added or changed.' }];
    const { error } = await admin.from('department_reports').update({ status: decision, reviewed_by: me, reviewed_at: now, review_note: note || null, updated_at: now }).eq('id', reportId);
    if (error) throw error;
    await audit(admin, id, me, decision === 'REVIEWED' ? 'report.reviewed' : 'report.returned', { reportId, title: rep.title, note: note || undefined });
    const leaders = await deptMemberIds(admin, id, ['HEAD', 'ASSISTANT_HEAD']);
    await notifyMany(admin, [rep.submitted_by, ...leaders], me, {
      title: decision === 'REVIEWED' ? `Report reviewed: ${rep.title}` : `Report returned: ${rep.title}`,
      body: note || (decision === 'REVIEWED' ? 'Thank you for reporting.' : ''),
      link: link('reports'),
      sourceId: reportId,
    });
    return [200, { ok: true }];
  }

  // ---------------- Requisitions ----------------
  if (action === 'req_create') {
    if (!perms['requisitions.create']) return [403, { ok: false, error: 'You cannot raise requisitions for this department.' }];
    if (dept.is_active === false) return [400, { ok: false, error: 'This department is archived.' }];
    const parsed = parseRequisition(body);
    if ('error' in parsed) return [400, { ok: false, error: parsed.error }];
    const v = parsed.value;
    if (v.activityId) {
      if (!UUID.test(v.activityId)) return [400, { ok: false, error: 'Unknown activity.' }];
      const { data: act } = await admin.from('department_activities').select('id').eq('id', v.activityId).eq('department_id', id).maybeSingle();
      if (!act) return [400, { ok: false, error: 'That activity is not in this department.' }];
    }
    const heads = await deptMemberIds(admin, id, ['HEAD']);
    const status = initialReqStatus(myRole, heads.length > 0);
    const { data: created, error } = await admin
      .from('department_requisitions')
      .insert({ department_id: id, activity_id: v.activityId, title: v.title, purpose: v.purpose, amount_ugx: v.amountUgx, needed_by: v.neededBy, status, created_by: me })
      .select('id')
      .single();
    if (error) return missing(error) || (() => { throw error; })();
    await audit(admin, id, me, 'requisition.raised', { requisitionId: created.id, title: v.title, amountUgx: v.amountUgx });
    const nextUp = status === 'PENDING_HEAD' ? heads : await financeOfficerIds(admin);
    await notifyMany(admin, nextUp, me, { title: `Requisition to approve: ${v.title}`, body: `${dept.name} · UGX ${v.amountUgx.toLocaleString('en-US')}`, link: status === 'PENDING_HEAD' ? link('requisitions') : '/departments/approvals?tab=requisitions', sourceId: created.id });
    return [200, { ok: true, id: created.id }];
  }

  if (action.startsWith('req_')) {
    const reqId = String(body.requisitionId || '');
    if (!UUID.test(reqId)) return [400, { ok: false, error: 'Unknown requisition.' }];
    const { data: r, error: rErr } = await admin.from('department_requisitions').select('id, department_id, title, amount_ugx, status, created_by, head_by, finance_by, pastor_by').eq('id', reqId).eq('department_id', id).maybeSingle();
    if (rErr) return missing(rErr) || (() => { throw rErr; })();
    if (!r) return [404, { ok: false, error: 'Requisition not found.' }];
    const req = r as ReqRow;
    const fin = await isFinanceOfficer(admin, me, ctx.role);
    const amount = `UGX ${Number(req.amount_ugx).toLocaleString('en-US')}`;

    if (action === 'req_decide') {
      const check = canActOnReq({ req, actorId: me, actorDeptRole: myRole, church, isFinanceOfficer: fin });
      if ('reason' in check) return [403, { ok: false, error: check.reason }];
      const decision = String(body.decision || '');
      const note = String(body.note || '').trim().slice(0, 500);
      if (decision !== 'APPROVE' && decision !== 'REJECT') return [400, { ok: false, error: 'Approve or send back.' }];
      if (decision === 'REJECT') {
        if (note.length < 3) return [400, { ok: false, error: 'Say why it is being sent back.' }];
        const { error } = await admin.from('department_requisitions').update({ status: 'REJECTED', rejected_by: me, rejected_at: now, rejected_stage: check.stage, reject_note: note, updated_at: now }).eq('id', reqId).eq('status', req.status);
        if (error) throw error;
        await audit(admin, id, me, 'requisition.rejected', { requisitionId: reqId, title: req.title, stage: check.stage, note });
        await notifyMany(admin, [req.created_by || '', ...(await deptMemberIds(admin, id, ['HEAD']))], me, { title: `Requisition sent back: ${req.title}`, body: note, link: link('requisitions'), sourceId: reqId });
        return [200, { ok: true }];
      }
      const next = nextReqStatus(req.status)!;
      const stamp: Record<string, unknown> = check.stage === 'HEAD' ? { head_by: me, head_at: now } : check.stage === 'FINANCE' ? { finance_by: me, finance_at: now, finance_note: note || null } : { pastor_by: me, pastor_at: now };
      const { error } = await admin.from('department_requisitions').update({ status: next, ...stamp, updated_at: now }).eq('id', reqId).eq('status', req.status);
      if (error) throw error;
      await audit(admin, id, me, `requisition.${check.stage.toLowerCase()}_approved`, { requisitionId: reqId, title: req.title, amountUgx: req.amount_ugx });
      if (next === 'PENDING_FINANCE') {
        await notifyMany(admin, await financeOfficerIds(admin), me, { title: `Requisition to check: ${req.title}`, body: `${dept.name} · ${amount}`, link: '/departments/approvals?tab=requisitions', sourceId: reqId });
      } else if (next === 'PENDING_PASTOR') {
        await notifyMany(admin, await oversightIds(admin), me, { title: `Requisition for final approval: ${req.title}`, body: `${dept.name} · ${amount}`, link: '/departments/approvals?tab=requisitions', sourceId: reqId });
      } else {
        await notifyMany(admin, [req.created_by || '', ...(await deptMemberIds(admin, id, ['HEAD', 'TREASURER']))], me, { title: `Requisition approved: ${req.title}`, body: `${amount} · Finance will arrange payment`, link: link('requisitions'), sourceId: reqId });
        await notifyMany(admin, await financeOfficerIds(admin), me, { title: `Ready to pay: ${req.title}`, body: `${dept.name} · ${amount}`, link: '/departments/approvals?tab=requisitions', sourceId: reqId });
      }
      return [200, { ok: true, status: next }];
    }

    if (action === 'req_paid') {
      if (!canMarkPaid({ req, actorId: me, isFinanceOfficer: fin })) return [403, { ok: false, error: 'Only Finance can record payment of an approved requisition.' }];
      const reference = String(body.reference || '').trim().slice(0, 120);
      if (reference.length < 2) return [400, { ok: false, error: 'Add a payment reference (e.g. Mobile Money ID or voucher number).' }];
      const { error } = await admin.from('department_requisitions').update({ status: 'PAID', paid_by: me, paid_at: now, paid_reference: reference, updated_at: now }).eq('id', reqId).eq('status', 'APPROVED');
      if (error) throw error;
      await audit(admin, id, me, 'requisition.paid', { requisitionId: reqId, title: req.title, amountUgx: req.amount_ugx, reference });
      await notifyMany(admin, [req.created_by || '', ...(await deptMemberIds(admin, id, ['HEAD', 'TREASURER']))], me, { title: `Paid: ${req.title}`, body: `${amount} · Ref ${reference}`, link: link('requisitions'), sourceId: reqId });
      return [200, { ok: true }];
    }

    if (action === 'req_cancel') {
      if (!canCancelReq({ req, actorId: me, church })) return [403, { ok: false, error: 'You cannot cancel this requisition.' }];
      const { error } = await admin.from('department_requisitions').update({ status: 'CANCELLED', updated_at: now }).eq('id', reqId);
      if (error) throw error;
      await audit(admin, id, me, 'requisition.cancelled', { requisitionId: reqId, title: req.title });
      return [200, { ok: true }];
    }

    if (action === 'req_resubmit') {
      if (req.status !== 'REJECTED' || req.created_by !== me || !perms['requisitions.create']) return [403, { ok: false, error: 'Only the person who raised it can resubmit a sent-back requisition.' }];
      const parsed = parseRequisition(body);
      if ('error' in parsed) return [400, { ok: false, error: parsed.error }];
      const v = parsed.value;
      const heads = await deptMemberIds(admin, id, ['HEAD']);
      const status = initialReqStatus(myRole, heads.length > 0);
      const { error } = await admin.from('department_requisitions').update({
        title: v.title, purpose: v.purpose, amount_ugx: v.amountUgx, needed_by: v.neededBy, status,
        head_by: null, head_at: null, finance_by: null, finance_at: null, finance_note: null, pastor_by: null, pastor_at: null,
        rejected_by: null, rejected_at: null, rejected_stage: null, reject_note: null, updated_at: now,
      }).eq('id', reqId);
      if (error) throw error;
      await audit(admin, id, me, 'requisition.resubmitted', { requisitionId: reqId, title: v.title, amountUgx: v.amountUgx });
      const nextUp = status === 'PENDING_HEAD' ? heads : await financeOfficerIds(admin);
      await notifyMany(admin, nextUp, me, { title: `Requisition to approve: ${v.title}`, body: `${dept.name} · UGX ${v.amountUgx.toLocaleString('en-US')} · resubmitted`, link: status === 'PENDING_HEAD' ? link('requisitions') : '/departments/approvals?tab=requisitions', sourceId: reqId });
      return [200, { ok: true }];
    }
  }

  return null;
}
