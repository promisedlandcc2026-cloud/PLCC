/**
 * PLCC Core Departments API (Nov 25 2026), Phase 1.
 *   GET  /api/vault?resource=departments                 → directory + what I can do
 *   GET  /api/vault?resource=departments&id=<uuid>       → one department's dashboard
 *   GET  /api/vault?resource=departments&view=matrix     → permission matrix (structure admins)
 *   POST /api/vault?resource=departments  { action, ... } → changes (all checked + audited)
 * Tables: supabase/migrations/plcc_departments.sql (server-only).
 */
import { getSupabaseAdmin, verifyAuth } from '../auth.js';
import {
  DEPT_PERMISSIONS,
  DEPT_ROLES,
  buildMatrix,
  canAssignRole,
  churchAccess,
  cleanList,
  departmentPermissions,
  isBlockedRole,
  isDeptPermission,
  isDeptRole,
  slugify,
  type DeptRole,
  type Matrix,
} from './access.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;
const SETUP_MSG = 'Departments are not set up yet. Run supabase/migrations/plcc_departments.sql in Supabase first.';
const DEPT_COLS = 'id, slug, name, mission, core_values, responsibilities, accountability, color, icon, sort_order, is_active, updated_at';

function isMissingTable(error: any): boolean {
  const msg = String(error?.message || error?.code || '').toLowerCase();
  return msg.includes('42p01') || msg.includes('pgrst205') || msg.includes('does not exist') || msg.includes('could not find the table');
}

function shapeDept(d: any) {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    mission: d.mission || '',
    coreValues: d.core_values || [],
    responsibilities: d.responsibilities || [],
    accountability: d.accountability || [],
    color: d.color || '#0f3d2c',
    icon: d.icon || 'Users',
    isActive: d.is_active !== false,
    updatedAt: d.updated_at || null,
  };
}

async function loadMatrix(admin: any): Promise<Matrix> {
  const { data } = await admin.from('department_role_permissions').select('dept_role, permission, allowed');
  return buildMatrix(data || []);
}

async function audit(admin: any, departmentId: string | null, actorId: string, action: string, details: Record<string, unknown>) {
  try {
    await admin.from('department_audit').insert({ department_id: departmentId, actor_id: actorId, action, details });
  } catch {
    /* audit must never block the change itself */
  }
}

async function namesFor(admin: any, ids: string[]): Promise<Map<string, { name: string; role: string | null }>> {
  const map = new Map<string, { name: string; role: string | null }>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data } = await admin.from('users').select('id, name, role').in('id', unique);
  for (const u of data || []) map.set(u.id, { name: u.name || 'Member', role: u.role || null });
  return map;
}

export async function handleDepartments(req: any, res: any, injected?: { admin: any; verify: typeof verifyAuth }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const admin = injected?.admin || getSupabaseAdmin();
  if (!admin) return res.status(503).json({ ok: false, error: 'Departments are unavailable right now.' });
  const auth = await (injected?.verify || verifyAuth)(req, admin);
  if (auth.unavailable) return res.status(503).json({ ok: false, error: 'Sign-in verification unavailable. Please try again.' });
  if (!auth.user) return res.status(401).json({ ok: false, error: 'Please sign in.' });
  if (isBlockedRole(auth.role)) return res.status(403).json({ ok: false, error: 'Departments open once your account is approved.' });

  const me = auth.user.id;
  const church = churchAccess(auth.role);

  try {
    if (req.method === 'GET') return await handleGet(req, res, admin, me, church);
    if (req.method === 'POST') return await handlePost(req, res, admin, me, church);
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (e: any) {
    if (isMissingTable(e)) return res.status(503).json({ ok: false, setupNeeded: true, error: SETUP_MSG });
    console.error('[departments]', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}

async function handleGet(req: any, res: any, admin: any, me: string, church: ReturnType<typeof churchAccess>) {
  const q = req.query || {};
  const view = String(Array.isArray(q.view) ? q.view[0] : q.view || '');
  const id = String(Array.isArray(q.id) ? q.id[0] : q.id || '');

  if (view === 'matrix') {
    if (!church.isStructureAdmin) return res.status(403).json({ ok: false, error: 'Only admins manage department permissions.' });
    const matrix = await loadMatrix(admin);
    const out: Record<string, string[]> = {};
    for (const r of DEPT_ROLES) out[r] = [...matrix[r]];
    return res.status(200).json({ ok: true, matrix: out });
  }

  if (!id) {
    const { data: depts, error } = await admin.from('departments').select(DEPT_COLS).order('sort_order').order('name');
    if (error) {
      if (isMissingTable(error)) return res.status(503).json({ ok: false, setupNeeded: true, error: SETUP_MSG });
      throw error;
    }
    const { data: rows } = await admin.from('department_members').select('department_id, user_id, dept_role');
    const all = rows || [];
    const heads = all.filter((r: any) => r.dept_role === 'HEAD');
    const names = await namesFor(admin, heads.map((h: any) => h.user_id));
    const list = (depts || [])
      .filter((d: any) => d.is_active !== false || church.isStructureAdmin)
      .map((d: any) => {
        const mine = all.find((r: any) => r.department_id === d.id && r.user_id === me);
        const head = heads.find((h: any) => h.department_id === d.id);
        return {
          ...shapeDept(d),
          memberCount: all.filter((r: any) => r.department_id === d.id).length,
          head: head ? { userId: head.user_id, name: names.get(head.user_id)?.name || 'Member' } : null,
          myRole: (mine?.dept_role as DeptRole) || null,
        };
      });
    return res.status(200).json({ ok: true, me: church, departments: list });
  }

  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'Unknown department.' });
  const { data: d, error } = await admin.from('departments').select(DEPT_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!d || (d.is_active === false && !church.isStructureAdmin)) return res.status(404).json({ ok: false, error: 'Department not found.' });

  const { data: memberRows } = await admin
    .from('department_members')
    .select('user_id, dept_role, title, joined_at')
    .eq('department_id', id);
  const members = memberRows || [];
  const myRow = members.find((m: any) => m.user_id === me);
  const myRole = (isDeptRole(myRow?.dept_role) ? myRow.dept_role : null) as DeptRole | null;
  const perms = departmentPermissions(church, myRole, await loadMatrix(admin));
  const names = await namesFor(admin, members.map((m: any) => m.user_id));
  const order = (r: string) => DEPT_ROLES.indexOf(r as DeptRole);
  const shaped = members
    .map((m: any) => ({
      userId: m.user_id,
      name: names.get(m.user_id)?.name || 'Member',
      deptRole: m.dept_role as DeptRole,
      title: m.title || null,
      joinedAt: m.joined_at,
    }))
    .sort((a: any, b: any) => order(a.deptRole) - order(b.deptRole) || a.name.localeCompare(b.name));

  let auditRows: any[] = [];
  if (perms['audit.view']) {
    const { data: a } = await admin
      .from('department_audit')
      .select('id, actor_id, action, details, created_at')
      .eq('department_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    const actorNames = await namesFor(admin, (a || []).map((r: any) => r.actor_id));
    auditRows = (a || []).map((r: any) => ({
      id: r.id,
      actor: actorNames.get(r.actor_id)?.name || 'Someone',
      action: r.action,
      details: r.details || {},
      at: r.created_at,
    }));
  }

  return res.status(200).json({
    ok: true,
    me: church,
    department: shapeDept(d),
    myRole,
    can: perms,
    leadership: shaped.filter((m: any) => m.deptRole !== 'MEMBER'),
    members: perms['members.view'] ? shaped : null,
    memberCount: shaped.length,
    amIMember: Boolean(myRole),
    audit: perms['audit.view'] ? auditRows : null,
  });
}

async function handlePost(req: any, res: any, admin: any, me: string, church: ReturnType<typeof churchAccess>) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || '');

  // ---- Structure (admins) ----
  if (action === 'create') {
    if (!church.isStructureAdmin) return res.status(403).json({ ok: false, error: 'Only admins create departments.' });
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 80) return res.status(400).json({ ok: false, error: 'Give the department a name (2–80 characters).' });
    const slug = slugify(name);
    if (slug.length < 2) return res.status(400).json({ ok: false, error: 'Use letters or numbers in the name.' });
    const mission = String(body.mission || '').trim().slice(0, 600);
    const { data, error } = await admin
      .from('departments')
      .insert({ slug, name, mission, created_by: me, updated_by: me })
      .select('id')
      .single();
    if (error) {
      if (String(error.code) === '23505') return res.status(409).json({ ok: false, error: 'A department with that name already exists.' });
      throw error;
    }
    await audit(admin, data.id, me, 'department.created', { name });
    return res.status(200).json({ ok: true, id: data.id });
  }

  if (action === 'set_permission') {
    if (!church.isStructureAdmin) return res.status(403).json({ ok: false, error: 'Only admins change department permissions.' });
    const { deptRole, permission, allowed } = body;
    if (!isDeptRole(deptRole) || !isDeptPermission(permission) || typeof allowed !== 'boolean')
      return res.status(400).json({ ok: false, error: 'Choose a role and a permission.' });
    if (deptRole === 'HEAD') return res.status(400).json({ ok: false, error: 'The Head always has every permission in their department.' });
    const { error } = await admin
      .from('department_role_permissions')
      .upsert({ dept_role: deptRole, permission, allowed, updated_by: me, updated_at: new Date().toISOString() });
    if (error) throw error;
    await audit(admin, null, me, 'permission.changed', { deptRole, permission, allowed });
    return res.status(200).json({ ok: true });
  }

  // ---- Everything below acts on one department ----
  const id = String(body.id || '');
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'Unknown department.' });
  const { data: dept, error: deptErr } = await admin.from('departments').select('id, name, is_active').eq('id', id).maybeSingle();
  if (deptErr) throw deptErr;
  if (!dept) return res.status(404).json({ ok: false, error: 'Department not found.' });
  const { data: myRow } = await admin
    .from('department_members')
    .select('dept_role')
    .eq('department_id', id)
    .eq('user_id', me)
    .maybeSingle();
  const myRole = (isDeptRole(myRow?.dept_role) ? myRow.dept_role : null) as DeptRole | null;
  const perms = departmentPermissions(church, myRole, await loadMatrix(admin));

  if (action === 'update') {
    if (!perms['profile.edit']) return res.status(403).json({ ok: false, error: 'You cannot edit this department.' });
    const patch: Record<string, unknown> = {};
    const changed: string[] = [];
    if (body.mission !== undefined) {
      if (typeof body.mission !== 'string' || body.mission.length > 600) return res.status(400).json({ ok: false, error: 'Mission is too long (600 characters max).' });
      patch.mission = body.mission.trim();
      changed.push('mission');
    }
    for (const [key, col] of [['coreValues', 'core_values'], ['responsibilities', 'responsibilities'], ['accountability', 'accountability']] as const) {
      if (body[key] === undefined) continue;
      const list = cleanList(body[key]);
      if (!list) return res.status(400).json({ ok: false, error: 'Keep each list to 15 items of 200 characters or less.' });
      patch[col] = list;
      changed.push(key);
    }
    // Name, colour and active state are structure: admins only.
    if (body.name !== undefined || body.color !== undefined || body.isActive !== undefined) {
      if (!church.isStructureAdmin) return res.status(403).json({ ok: false, error: 'Only admins rename, recolour or archive a department.' });
      if (body.name !== undefined) {
        const name = String(body.name).trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 80) return res.status(400).json({ ok: false, error: 'Name must be 2–80 characters.' });
        patch.name = name;
        changed.push('name');
      }
      if (body.color !== undefined) {
        if (!COLOR.test(String(body.color))) return res.status(400).json({ ok: false, error: 'Choose a colour.' });
        patch.color = String(body.color);
        changed.push('color');
      }
      if (body.isActive !== undefined) {
        if (typeof body.isActive !== 'boolean') return res.status(400).json({ ok: false, error: 'Invalid status.' });
        patch.is_active = body.isActive;
        changed.push(body.isActive ? 'restored' : 'archived');
      }
    }
    if (!changed.length) return res.status(400).json({ ok: false, error: 'Nothing to save.' });
    patch.updated_by = me;
    patch.updated_at = new Date().toISOString();
    const { error } = await admin.from('departments').update(patch).eq('id', id);
    if (error) throw error;
    await audit(admin, id, me, 'department.updated', { fields: changed });
    return res.status(200).json({ ok: true });
  }

  if (action === 'set_member' || action === 'remove_member') {
    const userId = String(body.userId || '');
    if (!UUID.test(userId)) return res.status(400).json({ ok: false, error: 'Choose a person.' });
    const next: DeptRole | null = action === 'remove_member' ? null : isDeptRole(body.deptRole) ? body.deptRole : null;
    if (action === 'set_member' && !next) return res.status(400).json({ ok: false, error: 'Choose a role.' });
    const { data: target } = await admin
      .from('department_members')
      .select('dept_role')
      .eq('department_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    const current = (isDeptRole(target?.dept_role) ? target.dept_role : null) as DeptRole | null;
    const decision = canAssignRole({ church, perms, actorId: me, targetId: userId, targetCurrentRole: current, next });
    if ('reason' in decision) return res.status(403).json({ ok: false, error: decision.reason });

    if (!next) {
      if (!current) return res.status(404).json({ ok: false, error: 'That person is not in this department.' });
      const { error } = await admin.from('department_members').delete().eq('department_id', id).eq('user_id', userId);
      if (error) throw error;
      await audit(admin, id, me, 'member.removed', { userId, previousRole: current });
      return res.status(200).json({ ok: true });
    }

    const { data: person } = await admin.from('users').select('id, role').eq('id', userId).maybeSingle();
    if (!person || isBlockedRole(person.role)) return res.status(400).json({ ok: false, error: 'That account cannot join a department yet.' });
    const title = body.title == null ? null : String(body.title).trim().slice(0, 60) || null;

    // One Head per department: an admin naming a new Head moves the old Head to Assistant Head.
    if (next === 'HEAD') {
      const { data: oldHeads } = await admin
        .from('department_members')
        .select('user_id')
        .eq('department_id', id)
        .eq('dept_role', 'HEAD')
        .neq('user_id', userId);
      for (const h of oldHeads || []) {
        await admin.from('department_members').update({ dept_role: 'ASSISTANT_HEAD', updated_at: new Date().toISOString() }).eq('department_id', id).eq('user_id', h.user_id);
        await audit(admin, id, me, 'member.role_changed', { userId: h.user_id, from: 'HEAD', to: 'ASSISTANT_HEAD', reason: 'new head named' });
      }
    }
    const { error } = await admin.from('department_members').upsert({
      department_id: id,
      user_id: userId,
      dept_role: next,
      title,
      added_by: me,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    await audit(admin, id, me, current ? 'member.role_changed' : 'member.added', { userId, from: current, to: next, title });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action.' });
}

export { DEPT_PERMISSIONS };
