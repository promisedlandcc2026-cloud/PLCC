/**
 * PLCC Core Departments — who may see and do what (Nov 25 2026). Pure, no I/O.
 *
 * Church-wide roles (public.users.role):
 *   SUPER_ADMIN (full rights, e.g. the Apostle) — oversight of every department + manages structure.
 *   PASTOR   — oversight: sees every department, including money; approves (later phases).
 *   ADMIN    — "back end rights": manages structure (departments, heads, permissions); no money view.
 *   FINANCE  — sees money for every department (requisition checks in Phase 3).
 *
 * Inside a department (department_members.dept_role): HEAD, ASSISTANT_HEAD, SECRETARY, TREASURER,
 * MEMBER. Each role's permissions come from DEFAULT_MATRIX, overridden by rows an admin saves in
 * department_role_permissions. Any signed-in member may read a department's overview
 * (mission, values, responsibilities, accountability, leadership): every ministry's duties are open.
 */

export const DEPT_ROLES = ['HEAD', 'ASSISTANT_HEAD', 'SECRETARY', 'TREASURER', 'MEMBER'] as const;
export type DeptRole = (typeof DEPT_ROLES)[number];

export const DEPT_ROLE_LABELS: Record<DeptRole, string> = {
  HEAD: 'Head',
  ASSISTANT_HEAD: 'Assistant Head',
  SECRETARY: 'Secretary',
  TREASURER: 'Treasurer',
  MEMBER: 'Member',
};

export const DEPT_PERMISSIONS = [
  'profile.edit',
  'members.view',
  'members.manage',
  'activities.plan',
  'attendance.record',
  'reports.submit',
  'communication.post',
  'requisitions.create',
  'finance.view',
  'audit.view',
] as const;
export type DeptPermission = (typeof DEPT_PERMISSIONS)[number];

export const DEPT_PERMISSION_LABELS: Record<DeptPermission, { label: string; hint: string; financial?: boolean }> = {
  'profile.edit': { label: 'Edit values & responsibilities', hint: 'Mission, core values, responsibilities, accountability' },
  'members.view': { label: 'See the member list', hint: 'Names and roles of everyone in the department' },
  'members.manage': { label: 'Add & remove members', hint: 'Members and Secretary. Heads and Treasurers are set by admins' },
  'activities.plan': { label: 'Plan activities', hint: 'Propose activities for approval (Phase 2)' },
  'attendance.record': { label: 'Record attendance', hint: 'Mark who attended (Phase 3)' },
  'reports.submit': { label: 'Submit reports', hint: 'Department reports to leadership (Phase 3)' },
  'communication.post': { label: 'Post announcements', hint: 'Message the department (Phase 2)' },
  'requisitions.create': { label: 'Raise requisitions', hint: 'Money requests, Head → Finance → Pastor (Phase 3)', financial: true },
  'finance.view': { label: 'See money', hint: 'Requisitions, budgets and amounts', financial: true },
  'audit.view': { label: 'See the audit trail', hint: 'Every change made in the department' },
};

export const DEFAULT_MATRIX: Record<DeptRole, readonly DeptPermission[]> = {
  HEAD: DEPT_PERMISSIONS,
  ASSISTANT_HEAD: ['profile.edit', 'members.view', 'members.manage', 'activities.plan', 'attendance.record', 'reports.submit', 'communication.post', 'audit.view'],
  SECRETARY: ['members.view', 'activities.plan', 'attendance.record', 'reports.submit', 'communication.post'],
  TREASURER: ['members.view', 'reports.submit', 'requisitions.create', 'finance.view'],
  MEMBER: [],
};

/** Roles a department leader with members.manage may hand out; the rest are admin-only. */
export const LEADER_ASSIGNABLE: readonly DeptRole[] = ['MEMBER', 'SECRETARY'];

export type MatrixOverride = { dept_role: string; permission: string; allowed: boolean };
export type Matrix = Record<DeptRole, Set<DeptPermission>>;

export function isDeptRole(v: unknown): v is DeptRole {
  return typeof v === 'string' && (DEPT_ROLES as readonly string[]).includes(v);
}
export function isDeptPermission(v: unknown): v is DeptPermission {
  return typeof v === 'string' && (DEPT_PERMISSIONS as readonly string[]).includes(v);
}

export function buildMatrix(overrides: readonly MatrixOverride[] | null | undefined): Matrix {
  const m = {} as Matrix;
  for (const r of DEPT_ROLES) m[r] = new Set(DEFAULT_MATRIX[r]);
  for (const o of overrides || []) {
    if (!isDeptRole(o?.dept_role) || !isDeptPermission(o?.permission)) continue;
    // The Head always keeps full control of their own department.
    if (o.dept_role === 'HEAD') continue;
    if (o.allowed) m[o.dept_role].add(o.permission);
    else m[o.dept_role].delete(o.permission);
  }
  return m;
}

export type ChurchAccess = {
  /** Create/archive departments, assign any role, change the permission matrix. */
  isStructureAdmin: boolean;
  /** Sees every department fully, including money. */
  isOversight: boolean;
  /** Sees money for every department. */
  isFinance: boolean;
};

export function churchAccess(role: string | null | undefined): ChurchAccess {
  const r = String(role || '').toUpperCase();
  return {
    isStructureAdmin: r === 'SUPER_ADMIN' || r === 'ADMIN',
    isOversight: r === 'SUPER_ADMIN' || r === 'PASTOR',
    isFinance: r === 'FINANCE',
  };
}

/** Members who may not use departments at all. */
export function isBlockedRole(role: string | null | undefined): boolean {
  const r = String(role || '').toUpperCase();
  return !r || r === 'PENDING' || r === 'GUEST' || r === 'KIOSK';
}

/** Everything this person may do in one department. */
export function departmentPermissions(
  church: ChurchAccess,
  myDeptRole: DeptRole | null,
  matrix: Matrix
): Record<DeptPermission, boolean> {
  const out = {} as Record<DeptPermission, boolean>;
  for (const p of DEPT_PERMISSIONS) out[p] = false;
  if (myDeptRole) for (const p of matrix[myDeptRole]) out[p] = true;
  if (church.isOversight) {
    out['members.view'] = true;
    out['finance.view'] = true;
    out['audit.view'] = true;
  }
  if (church.isFinance) out['finance.view'] = true;
  if (church.isStructureAdmin) {
    out['profile.edit'] = true;
    out['members.view'] = true;
    out['members.manage'] = true;
    out['audit.view'] = true;
  }
  return out;
}

/** May this person give `target` the role `next` (null = remove) in this department? */
export function canAssignRole(opts: {
  church: ChurchAccess;
  perms: Record<DeptPermission, boolean>;
  actorId: string;
  targetId: string;
  targetCurrentRole: DeptRole | null;
  next: DeptRole | null;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.church.isStructureAdmin) return { ok: true };
  if (!opts.perms['members.manage']) return { ok: false, reason: 'You cannot manage members in this department.' };
  if (opts.actorId === opts.targetId) return { ok: false, reason: 'Ask an admin to change your own role.' };
  const touchesLeadership =
    (opts.targetCurrentRole && !LEADER_ASSIGNABLE.includes(opts.targetCurrentRole)) ||
    (opts.next && !LEADER_ASSIGNABLE.includes(opts.next));
  if (touchesLeadership) return { ok: false, reason: 'Only an admin can change the Head, Assistant Head or Treasurer.' };
  return { ok: true };
}

/** Trim, drop empties, cap length and count, for values/responsibilities/accountability lists. */
export function cleanList(v: unknown, maxItems = 15, maxLen = 200): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') return null;
    const t = item.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t.length > maxLen) return null;
    out.push(t);
  }
  return out.length > maxItems ? null : out;
}

export function slugify(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
