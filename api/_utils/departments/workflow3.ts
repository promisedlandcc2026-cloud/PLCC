/**
 * PLCC Core Departments — Phase 3 rules (Nov 25 2026): attendance, reports, performance, requisitions. Pure.
 */
import type { ChurchAccess, DeptRole } from './access.js';

// ---------------- Requisitions ----------------
export const REQ_STATUSES = ['PENDING_HEAD', 'PENDING_FINANCE', 'PENDING_PASTOR', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'] as const;
export type ReqStatus = (typeof REQ_STATUSES)[number];
export type ReqStage = 'HEAD' | 'FINANCE' | 'PASTOR';

export type ReqRow = {
  id: string;
  department_id: string;
  title: string;
  amount_ugx: number;
  status: ReqStatus;
  created_by: string | null;
  head_by: string | null;
  finance_by: string | null;
  pastor_by: string | null;
};

export function stageOf(status: ReqStatus): ReqStage | null {
  if (status === 'PENDING_HEAD') return 'HEAD';
  if (status === 'PENDING_FINANCE') return 'FINANCE';
  if (status === 'PENDING_PASTOR') return 'PASTOR';
  return null;
}

/** First status for a new requisition. The Head's own requisitions (or a department with no Head) start at Finance. */
export function initialReqStatus(creatorRole: DeptRole | null, departmentHasHead: boolean): ReqStatus {
  return creatorRole === 'HEAD' || !departmentHasHead ? 'PENDING_FINANCE' : 'PENDING_HEAD';
}

export function nextReqStatus(status: ReqStatus): ReqStatus | null {
  if (status === 'PENDING_HEAD') return 'PENDING_FINANCE';
  if (status === 'PENDING_FINANCE') return 'PENDING_PASTOR';
  if (status === 'PENDING_PASTOR') return 'APPROVED';
  return null;
}

/**
 * May this person approve or send back the requisition at its current stage?
 * HEAD: the department's Head. FINANCE: a finance officer. PASTOR: a Pastor or the Apostle.
 * Separation of duties: never your own requisition, and a different person at each stage.
 */
export function canActOnReq(opts: {
  req: ReqRow;
  actorId: string;
  actorDeptRole: DeptRole | null;
  church: ChurchAccess;
  isFinanceOfficer: boolean;
}): { ok: true; stage: ReqStage } | { ok: false; reason: string } {
  const stage = stageOf(opts.req.status);
  if (!stage) return { ok: false, reason: 'This requisition is not waiting for approval.' };
  if (opts.req.created_by === opts.actorId) return { ok: false, reason: 'You cannot approve your own requisition.' };
  const priorActors = [opts.req.head_by, opts.req.finance_by].filter(Boolean);
  if (priorActors.includes(opts.actorId)) return { ok: false, reason: 'A different person must approve each stage.' };
  if (stage === 'HEAD' && opts.actorDeptRole !== 'HEAD') return { ok: false, reason: 'Waiting for the department Head.' };
  if (stage === 'FINANCE' && !opts.isFinanceOfficer) return { ok: false, reason: 'Waiting for Finance.' };
  if (stage === 'PASTOR' && !opts.church.isOversight) return { ok: false, reason: 'Waiting for a Pastor or the Apostle.' };
  return { ok: true, stage };
}

export function canMarkPaid(opts: { req: ReqRow; actorId: string; isFinanceOfficer: boolean }): boolean {
  return opts.req.status === 'APPROVED' && opts.isFinanceOfficer && opts.req.created_by !== opts.actorId;
}

export function canCancelReq(opts: { req: ReqRow; actorId: string; church: ChurchAccess }): boolean {
  if (!['PENDING_HEAD', 'PENDING_FINANCE', 'PENDING_PASTOR', 'REJECTED'].includes(opts.req.status)) return false;
  return opts.req.created_by === opts.actorId || opts.church.isOversight;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRequisition(body: any): { ok: true; value: { title: string; purpose: string; amountUgx: number; neededBy: string | null; activityId: string | null } } | { ok: false; error: string } {
  const title = String(body?.title || '').trim().replace(/\s+/g, ' ');
  if (title.length < 3 || title.length > 120) return { ok: false, error: 'Say what the money is for (3–120 characters).' };
  const purpose = String(body?.purpose || '').trim();
  if (purpose.length > 2000) return { ok: false, error: 'Purpose is too long.' };
  const amount = Number(String(body?.amountUgx ?? '').replace(/[,\s]/g, ''));
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000_000_000) return { ok: false, error: 'Enter the amount as a whole number of shillings.' };
  const neededBy = body?.neededBy ? String(body.neededBy) : null;
  if (neededBy && !DATE.test(neededBy)) return { ok: false, error: 'Choose a valid date.' };
  const activityId = body?.activityId ? String(body.activityId) : null;
  return { ok: true, value: { title, purpose, amountUgx: amount, neededBy, activityId } };
}

// ---------------- Attendance ----------------
export const ATT_STATUSES = ['PRESENT', 'ABSENT', 'EXCUSED'] as const;
export type AttStatus = (typeof ATT_STATUSES)[number];

export function parseMarks(raw: unknown, memberIds: Set<string>): { ok: true; value: { userId: string; status: AttStatus }[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Mark at least one person.' };
  if (raw.length > 2000) return { ok: false, error: 'Too many people in one session.' };
  const seen = new Set<string>();
  const out: { userId: string; status: AttStatus }[] = [];
  for (const m of raw) {
    const userId = String((m as any)?.userId || '');
    const status = String((m as any)?.status || '') as AttStatus;
    if (!memberIds.has(userId)) return { ok: false, error: 'Only people in this department can be marked.' };
    if (!(ATT_STATUSES as readonly string[]).includes(status)) return { ok: false, error: 'Mark each person present, absent or excused.' };
    if (seen.has(userId)) continue;
    seen.add(userId);
    out.push({ userId, status });
  }
  return { ok: true, value: out };
}

/** Present ÷ (present + absent). Excused does not count against anyone. null when nothing recorded. */
export function attendanceRate(marks: { status: string }[]): number | null {
  const present = marks.filter((m) => m.status === 'PRESENT').length;
  const counted = present + marks.filter((m) => m.status === 'ABSENT').length;
  return counted ? present / counted : null;
}

// ---------------- Reports ----------------
export const REPORT_TYPES = ['MONTHLY', 'QUARTERLY', 'SPECIAL'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Normalise the period: months start on the 1st, quarters on Jan/Apr/Jul/Oct 1st. */
export function normalisePeriod(type: ReportType, date: string): string | null {
  if (!DATE.test(date)) return null;
  const [y, m] = date.split('-').map(Number);
  if (type === 'MONTHLY') return `${y}-${String(m).padStart(2, '0')}-01`;
  if (type === 'QUARTERLY') return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  return date;
}

export function periodLabel(type: ReportType, start: string): string {
  const [y, m] = start.split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  if (type === 'MONTHLY') return `${month} ${y}`;
  if (type === 'QUARTERLY') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  return new Date(`${start}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function parseReport(body: any): { ok: true; value: { periodType: ReportType; periodStart: string; title: string; summary: string; achievements: string; challenges: string; plans: string; supportNeeded: string } } | { ok: false; error: string } {
  const periodType = String(body?.periodType || '') as ReportType;
  if (!(REPORT_TYPES as readonly string[]).includes(periodType)) return { ok: false, error: 'Choose monthly, quarterly or special.' };
  const periodStart = normalisePeriod(periodType, String(body?.periodStart || ''));
  if (!periodStart) return { ok: false, error: 'Choose the period this report covers.' };
  const field = (k: string) => String(body?.[k] || '').trim();
  const v = { summary: field('summary'), achievements: field('achievements'), challenges: field('challenges'), plans: field('plans'), supportNeeded: field('supportNeeded') };
  if (Object.values(v).some((x) => x.length > 3000)) return { ok: false, error: 'Each section can be up to 3000 characters.' };
  if (v.summary.length < 10) return { ok: false, error: 'Write a short summary (at least a sentence).' };
  const title = periodType === 'SPECIAL' ? String(body?.title || '').trim().slice(0, 120) || 'Special report' : `${periodType === 'MONTHLY' ? 'Monthly' : 'Quarterly'} report · ${periodLabel(periodType, periodStart)}`;
  if (title.length < 2) return { ok: false, error: 'Give the report a title.' };
  return { ok: true, value: { periodType, periodStart, title, ...v } };
}

/** The last `n` complete months before `today` (YYYY-MM-01), newest first. */
export function lastMonths(today: Date, n: number): string[] {
  const out: string[] = [];
  let y = today.getUTCFullYear();
  let m = today.getUTCMonth(); // 0-based → previous month is "m" in 1-based
  for (let i = 0; i < n; i++) {
    if (m === 0) { y -= 1; m = 12; }
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
    m -= 1;
  }
  return out;
}

// ---------------- Performance ----------------
export type Performance = {
  attendanceRate: number | null;
  sessions: number;
  activitiesApproved: number;
  activitiesCompleted: number;
  completionRate: number | null;
  reportsDue: number;
  reportsSubmitted: number;
  reportRate: number;
  openRequisitions: number;
  /** 0–100 from the parts that have data; null when there is nothing to judge yet. */
  score: number | null;
};

/**
 * Department health over the last 90 days: attendance (40%), activities carried out (30%),
 * monthly reports for the last three months (30%). Parts with no data are left out, not scored as zero.
 */
export function computePerformance(input: {
  marks: { status: string }[];
  sessions: number;
  pastApprovedOrDone: { status: string }[];
  monthlyReportPeriods: string[];
  today: Date;
  openRequisitions: number;
}): Performance {
  const attendance = attendanceRate(input.marks);
  const approved = input.pastApprovedOrDone.length;
  const completed = input.pastApprovedOrDone.filter((a) => a.status === 'COMPLETED').length;
  const completion = approved ? completed / approved : null;
  const due = lastMonths(input.today, 3);
  const submitted = due.filter((p) => input.monthlyReportPeriods.includes(p)).length;
  const reportRate = submitted / due.length;
  const parts: [number | null, number][] = [[attendance, 0.4], [completion, 0.3], [reportRate, 0.3]];
  const scored = parts.filter(([v]) => v !== null) as [number, number][];
  const weight = scored.reduce((s, [, w]) => s + w, 0);
  const anyActivity = input.sessions > 0 || approved > 0 || submitted > 0;
  const score = anyActivity && weight ? Math.round((scored.reduce((s, [v, w]) => s + v * w, 0) / weight) * 100) : null;
  return {
    attendanceRate: attendance,
    sessions: input.sessions,
    activitiesApproved: approved,
    activitiesCompleted: completed,
    completionRate: completion,
    reportsDue: due.length,
    reportsSubmitted: submitted,
    reportRate,
    openRequisitions: input.openRequisitions,
    score,
  };
}
