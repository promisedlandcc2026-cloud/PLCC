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
  canAssignRole,
  churchAccess,
  cleanList,
  departmentPermissions,
  isBlockedRole,
  isDeptPermission,
  isDeptRole,
  slugify,
  type DeptRole,
} from './access.js';
import {
  canCancelActivity,
  canCompleteActivity,
  canDecide,
  canEditActivity,
  formatKampala,
  parseActivityInput,
  parseAnnouncement,
  visibleActivityStatuses,
  type ActivityRow,
} from './workflow.js';
import { handlePhase3Action, isFinanceOfficer, loadPerformanceOverview, loadPhase3, loadQueues } from './phase3.js';
import { ACT_COLS, PHASE2_MSG, UUID, audit, deptMemberIds, isMissingTable, loadMatrix, namesFor, notifyMany, oversightIds, shapeActivity } from './common.js';

const COLOR = /^#[0-9a-f]{6}$/i;
const SETUP_MSG = 'Departments are not set up yet. Run supabase/migrations/plcc_departments.sql in Supabase first.';
const DEPT_COLS = 'id, slug, name, mission, core_values, responsibilities, accountability, color, icon, sort_order, is_active, updated_at';

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
    if (req.method === 'GET') return await handleGet(req, res, admin, me, church, auth.role);
    if (req.method === 'POST') return await handlePost(req, res, admin, me, church, auth.role);
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (e: any) {
    if (isMissingTable(e)) return res.status(503).json({ ok: false, setupNeeded: true, error: SETUP_MSG });
    console.error('[departments]', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}

async function handleGet(req: any, res: any, admin: any, me: string, church: ReturnType<typeof churchAccess>, role: string | null) {
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

  if (view === 'performance') {
    if (!church.isOversight && !church.isStructureAdmin) return res.status(403).json({ ok: false, error: 'Only Pastors, the Apostle and admins see church-wide performance.' });
    try {
      return res.status(200).json({ ok: true, departments: await loadPerformanceOverview(admin) });
    } catch (e) {
      if (isMissingTable(e)) return res.status(503).json({ ok: false, setupNeeded: true, error: 'Performance needs Phase 3. Run supabase/migrations/plcc_departments_phase3.sql in Supabase first.' });
      throw e;
    }
  }

  if (view === 'approvals') {
    const financeOfficer = await isFinanceOfficer(admin, me, role);
    const queues = await loadQueues(admin, { me, church, financeOfficer });
    if (!church.isOversight && !financeOfficer && !queues.isHead) return res.status(403).json({ ok: false, error: 'Approvals are for Pastors, the Apostle, Finance and department Heads.' });
    let activities: any[] = [];
    if (church.isOversight) {
      const { data: acts, error } = await admin.from('department_activities').select(ACT_COLS).eq('status', 'PENDING').order('starts_at').limit(200);
      if (error) {
        if (isMissingTable(error)) return res.status(503).json({ ok: false, setupNeeded: true, error: PHASE2_MSG });
        throw error;
      }
      const deptIds = [...new Set((acts || []).map((a: any) => a.department_id))];
      const { data: depts } = deptIds.length ? await admin.from('departments').select('id, name, color, icon').in('id', deptIds) : { data: [] };
      const dmap = new Map((depts || []).map((d: any) => [d.id, d]));
      const names = await namesFor(admin, (acts || []).map((a: any) => a.created_by));
      activities = (acts || []).filter((a: any) => a.created_by !== me || String(role).toUpperCase() === 'SUPER_ADMIN').map((a: any) => ({
        ...shapeActivity(a, names, true),
        department: { id: a.department_id, name: (dmap.get(a.department_id) as any)?.name || 'Department', color: (dmap.get(a.department_id) as any)?.color || '#0f3d2c', icon: (dmap.get(a.department_id) as any)?.icon || 'Users' },
      }));
    }
    return res.status(200).json({
      ok: true,
      me: church,
      roles: { oversight: church.isOversight, finance: financeOfficer, head: queues.isHead },
      phase3Ready: queues.phase3Ready,
      activities,
      requisitions: queues.requisitions,
      reports: queues.reports,
    });
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
    let pendingApprovals = 0;
    if (church.isOversight) {
      const { count } = await admin.from('department_activities').select('id', { count: 'exact', head: true }).eq('status', 'PENDING');
      pendingApprovals = count || 0;
    }
    const financeOfficer = await isFinanceOfficer(admin, me, role);
    const queues = await loadQueues(admin, { me, church, financeOfficer });
    pendingApprovals += queues.requisitions.length + queues.reports.length;
    const showApprovals = church.isOversight || financeOfficer || queues.isHead;
    return res.status(200).json({ ok: true, me: { ...church, isFinanceOfficer: financeOfficer }, departments: list, pendingApprovals, showApprovals });
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

  // Phase 2: activities and announcements (tolerate the tables not existing yet).
  let activities: any[] | null = null;
  let announcements: any[] | null = null;
  let phase2Ready = true;
  const statuses = visibleActivityStatuses(perms, church, Boolean(myRole));
  if (statuses) {
    const { data: acts, error: actErr } = await admin.from('department_activities').select(ACT_COLS).eq('department_id', id).in('status', statuses).order('starts_at', { ascending: false }).limit(150);
    if (actErr) phase2Ready = false;
    else {
      const actNames = await namesFor(admin, (acts || []).flatMap((a: any) => [a.created_by, a.decided_by]));
      activities = (acts || []).map((a: any) => shapeActivity(a, actNames, perms['finance.view']));
    }
  }
  if (myRole || church.isOversight || church.isStructureAdmin) {
    const { data: ann, error: annErr } = await admin.from('department_announcements').select('id, title, body, pinned, created_by, created_at').eq('department_id', id).order('created_at', { ascending: false }).limit(50);
    if (annErr) phase2Ready = false;
    else {
      const annNames = await namesFor(admin, (ann || []).map((a: any) => a.created_by));
      announcements = (ann || []).map((a: any) => ({ id: a.id, title: a.title, body: a.body || '', pinned: a.pinned === true, createdBy: a.created_by, createdByName: annNames.get(a.created_by)?.name || 'Someone', createdAt: a.created_at }));
    }
  }

  const financeOfficer = await isFinanceOfficer(admin, me, role);
  const phase3 = await loadPhase3(admin, { departmentId: id, me, perms, church, myRole, financeOfficer });
  if (financeOfficer) perms['finance.view'] = true;

  return res.status(200).json({
    ok: true,
    ...phase3,
    me: { ...church, isFinanceOfficer: financeOfficer },
    me_id: me,
    phase2Ready,
    activities,
    announcements,
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

async function handlePost(req: any, res: any, admin: any, me: string, church: ReturnType<typeof churchAccess>, role: string | null) {
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

  // ---- Phase 2: activities ----
  const link = (tab: string) => `/departments/${id}?tab=${tab}`;
  if (action === 'activity_create') {
    if (!perms['activities.plan']) return res.status(403).json({ ok: false, error: 'You cannot plan activities in this department.' });
    if (dept.is_active === false) return res.status(400).json({ ok: false, error: 'This department is archived.' });
    const parsed = parseActivityInput(body, { mayBudget: perms['finance.view'] || perms['requisitions.create'] });
    if ('error' in parsed) return res.status(400).json({ ok: false, error: parsed.error });
    const v = parsed.value;
    const { data: created, error } = await admin
      .from('department_activities')
      .insert({ department_id: id, title: v.title, description: v.description, location: v.location, starts_at: v.startsAt, ends_at: v.endsAt, budget_ugx: v.budgetUgx, status: 'PENDING', created_by: me })
      .select('id')
      .single();
    if (error) {
      if (isMissingTable(error)) return res.status(503).json({ ok: false, setupNeeded: true, error: PHASE2_MSG });
      throw error;
    }
    await audit(admin, id, me, 'activity.submitted', { activityId: created.id, title: v.title });
    await notifyMany(admin, await oversightIds(admin), me, {
      title: `Approval needed: ${v.title}`,
      body: `${dept.name} · ${formatKampala(v.startsAt)}`,
      link: '/departments/approvals',
      sourceId: created.id,
    });
    return res.status(200).json({ ok: true, id: created.id });
  }

  if (action.startsWith('activity_')) {
    const activityId = String(body.activityId || '');
    if (!UUID.test(activityId)) return res.status(400).json({ ok: false, error: 'Unknown activity.' });
    const { data: act, error: actErr } = await admin.from('department_activities').select('id, department_id, title, status, created_by, starts_at').eq('id', activityId).eq('department_id', id).maybeSingle();
    if (actErr) {
      if (isMissingTable(actErr)) return res.status(503).json({ ok: false, setupNeeded: true, error: PHASE2_MSG });
      throw actErr;
    }
    if (!act) return res.status(404).json({ ok: false, error: 'Activity not found.' });
    const activity = act as ActivityRow;
    const now = new Date().toISOString();

    if (action === 'activity_decide') {
      const decision = String(body.decision || '');
      if (decision !== 'APPROVED' && decision !== 'REJECTED') return res.status(400).json({ ok: false, error: 'Approve or send back.' });
      const role = (await admin.from('users').select('role').eq('id', me).maybeSingle())?.data?.role;
      const check = canDecide({ church, role, actorId: me, activity });
      if ('reason' in check) return res.status(403).json({ ok: false, error: check.reason });
      const note = String(body.note || '').trim().slice(0, 500);
      if (decision === 'REJECTED' && note.length < 3) return res.status(400).json({ ok: false, error: 'Say what needs to change so the department can fix it.' });
      const { error } = await admin.from('department_activities').update({ status: decision, decided_by: me, decided_at: now, decision_note: note || null, updated_at: now }).eq('id', activityId).eq('status', 'PENDING');
      if (error) throw error;
      await audit(admin, id, me, decision === 'APPROVED' ? 'activity.approved' : 'activity.rejected', { activityId, title: activity.title, note: note || undefined });
      const leaders = await deptMemberIds(admin, id, ['HEAD', 'ASSISTANT_HEAD']);
      if (decision === 'APPROVED') {
        await notifyMany(admin, [activity.created_by || '', ...leaders], me, { title: `Approved: ${activity.title}`, body: note || `${dept.name} · ${formatKampala(activity.starts_at)}`, link: link('activities'), sourceId: activityId });
        const everyone = (await deptMemberIds(admin, id)).filter((u) => u !== activity.created_by && !leaders.includes(u));
        await notifyMany(admin, everyone, me, { title: `${dept.name}: ${activity.title}`, body: formatKampala(activity.starts_at), link: link('activities'), sourceId: activityId });
      } else {
        await notifyMany(admin, [activity.created_by || '', ...leaders], me, { title: `Changes needed: ${activity.title}`, body: note, link: link('activities'), sourceId: activityId });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'activity_update') {
      if (!canEditActivity({ perms, church, actorId: me, activity })) return res.status(403).json({ ok: false, error: 'This activity can no longer be edited.' });
      const parsed = parseActivityInput(body, { mayBudget: perms['finance.view'] || perms['requisitions.create'] });
      if ('error' in parsed) return res.status(400).json({ ok: false, error: parsed.error });
      const v = parsed.value;
      const patch: Record<string, unknown> = { title: v.title, description: v.description, location: v.location, starts_at: v.startsAt, ends_at: v.endsAt, status: 'PENDING', decided_by: null, decided_at: null, decision_note: null, updated_at: now };
      if (perms['finance.view'] || perms['requisitions.create']) patch.budget_ugx = v.budgetUgx;
      const { error } = await admin.from('department_activities').update(patch).eq('id', activityId);
      if (error) throw error;
      await audit(admin, id, me, activity.status === 'REJECTED' ? 'activity.resubmitted' : 'activity.edited', { activityId, title: v.title });
      await notifyMany(admin, await oversightIds(admin), me, { title: `Approval needed: ${v.title}`, body: `${dept.name} · ${formatKampala(v.startsAt)}${activity.status === 'REJECTED' ? ' · resubmitted' : ' · updated'}`, link: '/departments/approvals', sourceId: activityId });
      return res.status(200).json({ ok: true });
    }

    if (action === 'activity_cancel') {
      if (!canCancelActivity({ perms, church, actorId: me, activity })) return res.status(403).json({ ok: false, error: 'You cannot cancel this activity.' });
      const reason = String(body.note || '').trim().slice(0, 500);
      const { error } = await admin.from('department_activities').update({ status: 'CANCELLED', decision_note: reason || null, updated_at: now }).eq('id', activityId);
      if (error) throw error;
      await audit(admin, id, me, 'activity.cancelled', { activityId, title: activity.title, note: reason || undefined });
      if (activity.status === 'APPROVED') {
        await notifyMany(admin, await deptMemberIds(admin, id), me, { title: `Cancelled: ${activity.title}`, body: reason || `${dept.name} · ${formatKampala(activity.starts_at)}`, link: link('activities'), sourceId: activityId });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'activity_complete') {
      if (!canCompleteActivity({ perms, church, activity })) return res.status(403).json({ ok: false, error: 'Only approved activities that have started can be marked done.' });
      const note = String(body.note || '').trim().slice(0, 1000);
      const { error } = await admin.from('department_activities').update({ status: 'COMPLETED', completion_note: note || null, updated_at: now }).eq('id', activityId);
      if (error) throw error;
      await audit(admin, id, me, 'activity.completed', { activityId, title: activity.title });
      return res.status(200).json({ ok: true });
    }
  }

  // ---- Phase 2: announcements ----
  if (action === 'announcement_post') {
    if (!perms['communication.post']) return res.status(403).json({ ok: false, error: 'You cannot post announcements in this department.' });
    const parsed = parseAnnouncement(body);
    if ('error' in parsed) return res.status(400).json({ ok: false, error: parsed.error });
    const v = parsed.value;
    const { data: created, error } = await admin.from('department_announcements').insert({ department_id: id, title: v.title, body: v.body, pinned: v.pinned, created_by: me }).select('id').single();
    if (error) {
      if (isMissingTable(error)) return res.status(503).json({ ok: false, setupNeeded: true, error: PHASE2_MSG });
      throw error;
    }
    await audit(admin, id, me, 'announcement.posted', { announcementId: created.id, title: v.title });
    await notifyMany(admin, await deptMemberIds(admin, id), me, { title: `${dept.name}: ${v.title}`, body: v.body.slice(0, 160), link: link('communication'), sourceId: created.id });
    return res.status(200).json({ ok: true, id: created.id });
  }

  if (action === 'announcement_delete' || action === 'announcement_pin') {
    const annId = String(body.announcementId || '');
    if (!UUID.test(annId)) return res.status(400).json({ ok: false, error: 'Unknown announcement.' });
    const { data: ann } = await admin.from('department_announcements').select('id, title, created_by, pinned').eq('id', annId).eq('department_id', id).maybeSingle();
    if (!ann) return res.status(404).json({ ok: false, error: 'Announcement not found.' });
    const mayModerate = perms['members.manage'] || church.isOversight || church.isStructureAdmin;
    if (action === 'announcement_pin') {
      if (!mayModerate && !(perms['communication.post'] && ann.created_by === me)) return res.status(403).json({ ok: false, error: 'You cannot pin this announcement.' });
      const { error } = await admin.from('department_announcements').update({ pinned: !ann.pinned }).eq('id', annId);
      if (error) throw error;
      await audit(admin, id, me, ann.pinned ? 'announcement.unpinned' : 'announcement.pinned', { announcementId: annId, title: ann.title });
      return res.status(200).json({ ok: true });
    }
    if (!mayModerate && ann.created_by !== me) return res.status(403).json({ ok: false, error: 'You cannot delete this announcement.' });
    const { error } = await admin.from('department_announcements').delete().eq('id', annId);
    if (error) throw error;
    await audit(admin, id, me, 'announcement.deleted', { announcementId: annId, title: ann.title });
    return res.status(200).json({ ok: true });
  }

  // ---- Phase 3: attendance, reports, requisitions ----
  const p3 = await handlePhase3Action(action, { admin, me, id, dept, perms, church, myRole, body, role });
  if (p3) return res.status(p3[0]).json(p3[1]);

  return res.status(400).json({ ok: false, error: 'Unknown action.' });
}

export { DEPT_PERMISSIONS };
