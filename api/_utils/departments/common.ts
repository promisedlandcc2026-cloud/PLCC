/** Shared server helpers for PLCC Core Departments (Phases 1–3). */
import { buildMatrix, type Matrix } from './access.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMissingTable(error: any): boolean {
  const msg = String(error?.message || error?.code || '').toLowerCase();
  return msg.includes('42p01') || msg.includes('pgrst205') || msg.includes('does not exist') || msg.includes('could not find the table');
}

export async function loadMatrix(admin: any): Promise<Matrix> {
  const { data } = await admin.from('department_role_permissions').select('dept_role, permission, allowed');
  return buildMatrix(data || []);
}

export async function audit(admin: any, departmentId: string | null, actorId: string, action: string, details: Record<string, unknown>) {
  try {
    await admin.from('department_audit').insert({ department_id: departmentId, actor_id: actorId, action, details });
  } catch {
    /* audit must never block the change itself */
  }
}

export async function namesFor(admin: any, ids: string[]): Promise<Map<string, { name: string; role: string | null }>> {
  const map = new Map<string, { name: string; role: string | null }>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data } = await admin.from('users').select('id, name, role').in('id', unique);
  for (const u of data || []) map.set(u.id, { name: u.name || 'Member', role: u.role || null });
  return map;
}

export const PHASE2_MSG = 'Activities are not set up yet. Run supabase/migrations/plcc_departments_phase2.sql in Supabase first.';
export const ACT_COLS = 'id, department_id, title, description, location, starts_at, ends_at, budget_ugx, status, created_by, decided_by, decided_at, decision_note, completion_note, created_at, updated_at';

/** Bell notifications (type 'department'), one batch insert. Never blocks the change. */
export async function notifyMany(admin: any, userIds: string[], actorId: string, n: { title: string; body?: string; link: string; sourceId?: string }) {
  const ids = [...new Set(userIds.filter((id) => id && id !== actorId && UUID.test(id)))];
  if (!ids.length) return;
  try {
    const rows = ids.map((user_id) => ({
      user_id,
      type: 'department',
      title: n.title.slice(0, 200),
      body: n.body ? n.body.slice(0, 500) : null,
      link: n.link,
      source_id: n.sourceId && UUID.test(n.sourceId) ? n.sourceId : null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from('user_notifications').insert(rows.slice(i, i + 500));
      if (error) { console.error('[departments] notify failed:', error.message); return; }
    }
  } catch (e: any) {
    console.error('[departments] notify error:', e?.message || e);
  }
}

export async function oversightIds(admin: any): Promise<string[]> {
  const { data } = await admin.from('users').select('id, role').in('role', ['SUPER_ADMIN', 'PASTOR']);
  return (data || []).map((u: any) => u.id);
}

export async function deptMemberIds(admin: any, departmentId: string, roles?: string[]): Promise<string[]> {
  const { data } = await admin.from('department_members').select('user_id, dept_role').eq('department_id', departmentId);
  return (data || []).filter((m: any) => !roles || roles.includes(m.dept_role)).map((m: any) => m.user_id);
}

export function shapeActivity(a: any, names: Map<string, { name: string }>, showMoney: boolean) {
  return {
    id: a.id,
    departmentId: a.department_id,
    title: a.title,
    description: a.description || '',
    location: a.location || '',
    startsAt: a.starts_at,
    endsAt: a.ends_at || null,
    budgetUgx: showMoney ? (a.budget_ugx ?? null) : null,
    status: a.status,
    createdBy: a.created_by,
    createdByName: names.get(a.created_by)?.name || 'Someone',
    decidedByName: a.decided_by ? names.get(a.decided_by)?.name || 'A Pastor' : null,
    decidedAt: a.decided_at || null,
    decisionNote: a.decision_note || null,
    completionNote: a.completion_note || null,
  };
}

