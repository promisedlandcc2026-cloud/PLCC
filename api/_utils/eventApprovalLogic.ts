/**
 * Event calendar approval — pure helpers (date lock, visibility, role gates).
 * Used by handleEvents and smoke tests.
 */

export type EventApprovalStatus = 'pending' | 'approved' | 'rejected';

export const EVENT_APPROVE_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'ADMIN',
  'MINISTRY_LEADER',
]);

export const EVENT_SUBMIT_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'ADMIN',
  'MINISTRY_LEADER',
  'FINANCE',
  'WORSHIP_TEAM',
  'SECRETARY',
  'ASST_SECRETARY',
  'ADMIN_STAFF',
  'FIRST_LADY',
  'STAFF',
]);

export type EventRowLike = {
  id?: string;
  date?: string | null;
  status?: string | null;
  submitted_by?: string | null;
};

export function normalizeEventStatus(raw: unknown): EventApprovalStatus {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'pending' || s === 'rejected') return s;
  return 'approved';
}

export function parseApproverUserIdsFromEnv(raw?: string | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((x) => x.trim())
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}

export function mergeApproverUserIds(...lists: (string[] | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const id of list || []) {
      const key = String(id || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(String(id));
    }
  }
  return out;
}

export function isEventApproverRole(role: string | null | undefined): boolean {
  return EVENT_APPROVE_ROLES.has(String(role || '').toUpperCase());
}

export function isEventSubmitterRole(role: string | null | undefined): boolean {
  return EVENT_SUBMIT_ROLES.has(String(role || '').toUpperCase());
}

export function isConfiguredEventApprover(
  userId: string | null | undefined,
  configuredIds: string[]
): boolean {
  if (!userId) return false;
  const key = String(userId).toLowerCase();
  return configuredIds.some((id) => String(id).toLowerCase() === key);
}

export function canApproveEvents(opts: {
  role: string | null | undefined;
  userId: string | null | undefined;
  configuredApproverIds: string[];
}): boolean {
  return isEventApproverRole(opts.role) || isConfiguredEventApprover(opts.userId, opts.configuredApproverIds);
}

export function canSubmitEvents(opts: {
  role: string | null | undefined;
  userId: string | null | undefined;
  configuredApproverIds: string[];
}): boolean {
  if (canApproveEvents(opts)) return true;
  return isEventSubmitterRole(opts.role);
}

/** Only Super Admin may add/move events onto a day that already has an approved event. */
export function canBypassEventDateLock(opts: {
  role: string | null | undefined;
}): boolean {
  return String(opts.role || '').toUpperCase() === 'SUPER_ADMIN';
}

/** Day is locked when any event that day is approved (bypass is role-gated separately). */
export function isEventDateLocked(
  events: EventRowLike[],
  dateYmd: string
): boolean {
  const day = String(dateYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return events.some((ev) => {
    const d = String(ev.date || '').slice(0, 10);
    return d === day && normalizeEventStatus(ev.status) === 'approved';
  });
}

export function lockedDatesFromEvents(events: EventRowLike[]): string[] {
  const locked = new Set<string>();
  for (const ev of events) {
    if (normalizeEventStatus(ev.status) !== 'approved') continue;
    const d = String(ev.date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) locked.add(d);
  }
  return [...locked].sort();
}

/**
 * GET visibility:
 * - approved → everyone
 * - pending/rejected → approvers see all; submitters see their own
 */
export function filterEventsForViewer(
  events: EventRowLike[],
  opts: {
    viewerId: string | null | undefined;
    canApprove: boolean;
  }
): EventRowLike[] {
  return events.filter((ev) => {
    const status = normalizeEventStatus(ev.status);
    if (status === 'approved') return true;
    if (opts.canApprove) return true;
    if (opts.viewerId && ev.submitted_by && String(ev.submitted_by) === String(opts.viewerId)) {
      return true;
    }
    return false;
  });
}

export function canEditEventRow(
  ev: EventRowLike,
  opts: {
    viewerId: string | null | undefined;
    canApprove: boolean;
  }
): boolean {
  if (opts.canApprove) return true;
  if (!opts.viewerId) return false;
  const status = normalizeEventStatus(ev.status);
  return status === 'pending' && String(ev.submitted_by || '') === String(opts.viewerId);
}

export function canDeleteEventRow(
  ev: EventRowLike,
  opts: {
    viewerId: string | null | undefined;
    canApprove: boolean;
  }
): boolean {
  return canEditEventRow(ev, opts);
}

export function resolveCreateStatus(canApprove: boolean): EventApprovalStatus {
  return canApprove ? 'approved' : 'pending';
}

export type ApproveRejectAction = 'approve' | 'reject';

export function parseApproveRejectAction(raw: unknown): ApproveRejectAction | null {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'approve' || s === 'reject') return s;
  return null;
}

export function applyApproveTransition(
  action: ApproveRejectAction,
  actorId: string,
  rejectionReason?: string | null
): Record<string, unknown> {
  if (action === 'approve') {
    return {
      status: 'approved',
      approved_by: actorId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    };
  }
  return {
    status: 'rejected',
    approved_by: actorId,
    approved_at: new Date().toISOString(),
    rejection_reason: rejectionReason ? String(rejectionReason).trim().slice(0, 500) : null,
  };
}

export function eventApprovalDeepLink(baseUrl?: string | null): string {
  const root = (baseUrl || process.env.VITE_APP_URL || 'https://plcc-opal.vercel.app').replace(/\/$/, '');
  return `${root}/#/events/overview?pending=1`;
}
