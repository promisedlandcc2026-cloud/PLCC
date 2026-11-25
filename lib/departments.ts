/** PLCC Core Departments — client helpers (Nov 25 2026). Server: api/_utils/departments/handler.ts */
import { getAuthHeaders, parseApiJson } from './api';
import type { DeptPermission, DeptRole } from '../api/_utils/departments/access';

export {
  DEPT_ROLES,
  DEPT_ROLE_LABELS,
  DEPT_PERMISSIONS,
  DEPT_PERMISSION_LABELS,
  LEADER_ASSIGNABLE,
} from '../api/_utils/departments/access';
export type { DeptPermission, DeptRole };

export type ChurchAccess = { isStructureAdmin: boolean; isOversight: boolean; isFinance: boolean };

export type DepartmentSummary = {
  id: string;
  slug: string;
  name: string;
  mission: string;
  coreValues: string[];
  responsibilities: string[];
  accountability: string[];
  color: string;
  icon: string;
  isActive: boolean;
  memberCount: number;
  head: { userId: string; name: string } | null;
  myRole: DeptRole | null;
};

export type DepartmentMember = { userId: string; name: string; deptRole: DeptRole; title: string | null; joinedAt: string };
export type AuditEntry = { id: number; actor: string; action: string; details: Record<string, any>; at: string };

export type ActivityStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type Activity = {
  id: string;
  departmentId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  budgetUgx: number | null;
  status: ActivityStatus;
  createdBy: string | null;
  createdByName: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  completionNote: string | null;
  department?: { id: string; name: string; color: string; icon: string };
};
export type Announcement = { id: string; title: string; body: string; pinned: boolean; createdBy: string | null; createdByName: string; createdAt: string };

export type DepartmentDetail = {
  me: ChurchAccess;
  me_id: string;
  phase2Ready: boolean;
  activities: Activity[] | null;
  announcements: Announcement[] | null;
  department: Omit<DepartmentSummary, 'memberCount' | 'head' | 'myRole'>;
  myRole: DeptRole | null;
  can: Record<DeptPermission, boolean>;
  leadership: DepartmentMember[];
  members: DepartmentMember[] | null;
  memberCount: number;
  amIMember: boolean;
  audit: AuditEntry[] | null;
};

const URL_BASE = '/api/vault?resource=departments';

export class DepartmentsError extends Error {
  setupNeeded: boolean;
  constructor(message: string, setupNeeded = false) {
    super(message);
    this.setupNeeded = setupNeeded;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: await getAuthHeaders() });
  const data = await parseApiJson<any>(res);
  if (!res.ok || data?.ok === false) throw new DepartmentsError(data?.error || 'Something went wrong. Please try again.', Boolean(data?.setupNeeded));
  return data as T;
}

export const departmentsApi = {
  list: () => request<{ me: ChurchAccess; departments: DepartmentSummary[]; pendingApprovals: number }>(URL_BASE),
  approvals: () => request<{ me: ChurchAccess; activities: Activity[] }>(`${URL_BASE}&view=approvals`),
  get: (id: string) => request<DepartmentDetail>(`${URL_BASE}&id=${encodeURIComponent(id)}`),
  matrix: () => request<{ matrix: Record<DeptRole, DeptPermission[]> }>(`${URL_BASE}&view=matrix`),
  post: (body: Record<string, unknown>) => request<{ ok: true; id?: string }>(URL_BASE, { method: 'POST', body: JSON.stringify(body) }),
};

export async function searchPeople(q: string): Promise<{ id: string; name: string; role?: string }[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`/api/vault?resource=community&subResource=chat&subResource=member-picker&q=${encodeURIComponent(q.trim())}`, {
    headers: await getAuthHeaders(),
  });
  const data = await parseApiJson<any>(res);
  return Array.isArray(data) ? data.slice(0, 8) : [];
}

/** Uganda time (EAT, UTC+3) helpers: activities are planned and shown in church time. */
export const KAMPALA = 'Africa/Kampala';
export function kampalaParts(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}
export function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: KAMPALA, weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: KAMPALA, hour: 'numeric', minute: '2-digit', hour12: true });
}
export function fmtUgx(n: number) {
  return `UGX ${n.toLocaleString('en-US')}`;
}

/** Plain-English line for one audit entry. */
export function describeAudit(e: AuditEntry, nameOf: (userId: string) => string): string {
  const d = e.details || {};
  const role = (r: string | null | undefined) => (r ? String(r).replace(/_/g, ' ').toLowerCase() : '');
  switch (e.action) {
    case 'department.created': return `created the department`;
    case 'department.updated': return `updated ${(d.fields || []).map((f: string) => f.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}`;
    case 'member.added': return `added ${nameOf(d.userId)} as ${role(d.to)}`;
    case 'member.removed': return `removed ${nameOf(d.userId)}`;
    case 'member.role_changed': return `changed ${nameOf(d.userId)} from ${role(d.from)} to ${role(d.to)}`;
    case 'activity.submitted': return `submitted “${d.title}” for approval`;
    case 'activity.edited': return `edited “${d.title}”`;
    case 'activity.resubmitted': return `resubmitted “${d.title}”`;
    case 'activity.approved': return `approved “${d.title}”`;
    case 'activity.rejected': return `sent back “${d.title}”${d.note ? `: ${d.note}` : ''}`;
    case 'activity.cancelled': return `cancelled “${d.title}”`;
    case 'activity.completed': return `marked “${d.title}” as done`;
    case 'announcement.posted': return `posted “${d.title}”`;
    case 'announcement.deleted': return `deleted the announcement “${d.title}”`;
    case 'announcement.pinned': return `pinned “${d.title}”`;
    case 'announcement.unpinned': return `unpinned “${d.title}”`;
    default: return e.action.replace(/[._]/g, ' ');
  }
}
