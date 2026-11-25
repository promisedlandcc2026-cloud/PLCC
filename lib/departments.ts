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

export type DepartmentDetail = {
  me: ChurchAccess;
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
  list: () => request<{ me: ChurchAccess; departments: DepartmentSummary[] }>(URL_BASE),
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
    default: return e.action.replace(/[._]/g, ' ');
  }
}
