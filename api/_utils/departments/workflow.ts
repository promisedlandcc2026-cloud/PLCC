/**
 * PLCC Core Departments — Phase 2 rules (Nov 25 2026): activities, approvals, announcements. Pure.
 * Times are entered and shown in Uganda time (Africa/Kampala, UTC+3, no daylight saving).
 */
import type { ChurchAccess, DeptPermission } from './access.js';

export const ACTIVITY_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export type ActivityRow = {
  id: string;
  department_id: string;
  title: string;
  status: ActivityStatus;
  created_by: string | null;
  starts_at: string;
};

export type Perms = Record<DeptPermission, boolean>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "2026-12-05" + "18:30" in Uganda time → ISO string (UTC). */
export function kampalaToIso(date: string, time: string): string | null {
  if (!DATE.test(date) || !TIME.test(time)) return null;
  const d = new Date(`${date}T${time}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type ActivityInput = {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  budgetUgx: number | null;
};

/** Validate a planner's activity form. Budget is kept only when the planner may handle money. */
export function parseActivityInput(body: any, opts: { mayBudget: boolean; now?: Date }): { ok: true; value: ActivityInput } | { ok: false; error: string } {
  const title = String(body?.title || '').trim().replace(/\s+/g, ' ');
  if (title.length < 3 || title.length > 120) return { ok: false, error: 'Give the activity a title (3–120 characters).' };
  const description = String(body?.description || '').trim();
  if (description.length > 2000) return { ok: false, error: 'Description is too long (2000 characters max).' };
  const location = String(body?.location || '').trim().replace(/\s+/g, ' ');
  if (location.length > 160) return { ok: false, error: 'Location is too long.' };
  const startsAt = kampalaToIso(String(body?.date || ''), String(body?.startTime || ''));
  if (!startsAt) return { ok: false, error: 'Choose a date and start time.' };
  const now = opts.now || new Date();
  if (new Date(startsAt).getTime() < now.getTime() - 60 * 60 * 1000) return { ok: false, error: 'The start time has already passed.' };
  let endsAt: string | null = null;
  if (body?.endTime) {
    endsAt = kampalaToIso(String(body.date), String(body.endTime));
    if (!endsAt) return { ok: false, error: 'Choose a valid end time.' };
    if (new Date(endsAt) <= new Date(startsAt)) return { ok: false, error: 'The end time must be after the start time.' };
  }
  let budgetUgx: number | null = null;
  if (opts.mayBudget && body?.budgetUgx !== undefined && body?.budgetUgx !== null && body?.budgetUgx !== '') {
    const n = Number(String(body.budgetUgx).replace(/[,\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000_000 || !Number.isInteger(n)) return { ok: false, error: 'Enter the budget as a whole number of shillings.' };
    budgetUgx = n;
  }
  return { ok: true, value: { title, description, location, startsAt, endsAt, budgetUgx } };
}

/** Pastors and the Apostle decide. Nobody approves their own activity, except the Apostle (full rights). */
export function canDecide(opts: { church: ChurchAccess; role: string | null | undefined; actorId: string; activity: ActivityRow }): { ok: true } | { ok: false; reason: string } {
  if (!opts.church.isOversight) return { ok: false, reason: 'Only a Pastor or the Apostle can approve activities.' };
  if (opts.activity.status !== 'PENDING') return { ok: false, reason: 'This activity is no longer waiting for approval.' };
  if (opts.activity.created_by === opts.actorId && String(opts.role || '').toUpperCase() !== 'SUPER_ADMIN')
    return { ok: false, reason: 'Another Pastor needs to approve an activity you planned.' };
  return { ok: true };
}

/** Edit and resubmit: only while waiting or sent back, by its planner, a department leader or oversight. */
export function canEditActivity(opts: { perms: Perms; church: ChurchAccess; actorId: string; activity: ActivityRow }): boolean {
  if (opts.activity.status !== 'PENDING' && opts.activity.status !== 'REJECTED') return false;
  if (opts.church.isOversight) return true;
  if (opts.activity.created_by === opts.actorId && opts.perms['activities.plan']) return true;
  return opts.perms['members.manage'];
}

export function canCancelActivity(opts: { perms: Perms; church: ChurchAccess; actorId: string; activity: ActivityRow }): boolean {
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(opts.activity.status)) return false;
  if (opts.church.isOversight) return true;
  if (opts.activity.created_by === opts.actorId) return true;
  return opts.perms['members.manage'];
}

export function canCompleteActivity(opts: { perms: Perms; church: ChurchAccess; activity: ActivityRow; now?: Date }): boolean {
  if (opts.activity.status !== 'APPROVED') return false;
  if (new Date(opts.activity.starts_at).getTime() > (opts.now || new Date()).getTime()) return false;
  return opts.church.isOversight || opts.perms['activities.plan'] || opts.perms['members.manage'];
}

/** Who sees which activities: members see approved/completed; planners, leaders and oversight see all. */
export function visibleActivityStatuses(perms: Perms, church: ChurchAccess, amIMember: boolean): ActivityStatus[] | null {
  if (church.isOversight || church.isStructureAdmin || perms['activities.plan'] || perms['members.manage']) return [...ACTIVITY_STATUSES];
  if (amIMember) return ['APPROVED', 'COMPLETED'];
  return null;
}

export function parseAnnouncement(body: any): { ok: true; value: { title: string; body: string; pinned: boolean } } | { ok: false; error: string } {
  const title = String(body?.title || '').trim().replace(/\s+/g, ' ');
  if (title.length < 2 || title.length > 120) return { ok: false, error: 'Give the announcement a title (2–120 characters).' };
  const text = String(body?.body || '').trim();
  if (text.length > 2000) return { ok: false, error: 'Message is too long (2000 characters max).' };
  return { ok: true, value: { title, body: text, pinned: body?.pinned === true } };
}

export function formatKampala(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Kampala', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
