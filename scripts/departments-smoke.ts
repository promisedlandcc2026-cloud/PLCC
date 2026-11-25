/** PLCC Core Departments — rules + API with an in-memory database. Run: npx tsx scripts/departments-smoke.ts */
import assert from 'node:assert/strict';
import {
  buildMatrix,
  canAssignRole,
  churchAccess,
  cleanList,
  departmentPermissions,
  slugify,
} from '../api/_utils/departments/access.js';
import { handleDepartments } from '../api/_utils/departments/handler.js';
import { canDecide, kampalaToIso, parseActivityInput, visibleActivityStatuses } from '../api/_utils/departments/workflow.js';

// ---------- pure rules ----------
const m = buildMatrix([]);
const none = churchAccess('MEMBER');
assert.equal(departmentPermissions(none, 'HEAD', m)['finance.view'], true, 'head sees money');
assert.equal(departmentPermissions(none, 'ASSISTANT_HEAD', m)['finance.view'], false, 'assistant head does not see money by default');
assert.equal(departmentPermissions(none, 'MEMBER', m)['members.view'], false, 'members do not see other members');
assert.equal(departmentPermissions(none, null, m)['profile.edit'], false, 'outsider cannot edit');
assert.equal(departmentPermissions(churchAccess('PASTOR'), null, m)['finance.view'], true, 'pastor oversight sees money');
assert.equal(departmentPermissions(churchAccess('PASTOR'), null, m)['members.manage'], false, 'pastor oversight does not manage structure');
assert.equal(departmentPermissions(churchAccess('ADMIN'), null, m)['finance.view'], false, 'back-end admin does not see money');
assert.equal(departmentPermissions(churchAccess('ADMIN'), null, m)['members.manage'], true, 'admin manages members');
assert.equal(departmentPermissions(churchAccess('FINANCE'), null, m)['finance.view'], true, 'finance sees money');
assert.equal(departmentPermissions(churchAccess('SUPER_ADMIN'), null, m)['finance.view'], true, 'apostle sees all');

const m2 = buildMatrix([
  { dept_role: 'MEMBER', permission: 'members.view', allowed: true },
  { dept_role: 'HEAD', permission: 'finance.view', allowed: false },
  { dept_role: 'TREASURER', permission: 'finance.view', allowed: false },
  { dept_role: 'BOSS', permission: 'finance.view', allowed: true },
]);
assert.equal(m2.MEMBER.has('members.view'), true, 'override grants');
assert.equal(m2.HEAD.has('finance.view'), true, 'head cannot be limited');
assert.equal(m2.TREASURER.has('finance.view'), false, 'override removes');

const headPerms = departmentPermissions(none, 'HEAD', m);
const a = (o: Partial<Parameters<typeof canAssignRole>[0]>) =>
  canAssignRole({ church: none, perms: headPerms, actorId: 'h', targetId: 't', targetCurrentRole: null, next: 'MEMBER', ...o }).ok;
assert.equal(a({}), true, 'head adds a member');
assert.equal(a({ next: 'SECRETARY' }), true, 'head names a secretary');
assert.equal(a({ next: 'TREASURER' }), false, 'head cannot name treasurer');
assert.equal(a({ next: 'HEAD' }), false, 'head cannot name another head');
assert.equal(a({ targetCurrentRole: 'ASSISTANT_HEAD', next: null }), false, 'head cannot remove assistant head');
assert.equal(a({ targetId: 'h', next: null, targetCurrentRole: 'HEAD' }), false, 'head cannot remove self');
assert.equal(
  canAssignRole({ church: none, perms: departmentPermissions(none, 'SECRETARY', m), actorId: 's', targetId: 't', targetCurrentRole: null, next: 'MEMBER' }).ok,
  false,
  'secretary cannot add members by default'
);
assert.equal(
  canAssignRole({ church: churchAccess('ADMIN'), perms: departmentPermissions(churchAccess('ADMIN'), null, m), actorId: 'x', targetId: 't', targetCurrentRole: null, next: 'HEAD' }).ok,
  true,
  'admin names a head'
);
assert.deepEqual(cleanList(['  a  ', '', 'b']), ['a', 'b']);
assert.equal(cleanList('x'), null);
assert.equal(cleanList(new Array(16).fill('x')), null);
assert.equal(slugify('Ushering & Protocol'), 'ushering-and-protocol');

// ---------- Phase 2 pure rules ----------
assert.equal(kampalaToIso('2026-12-05', '18:30'), '2026-12-05T15:30:00.000Z', 'Uganda is UTC+3');
assert.equal(kampalaToIso('2026-12-05', '25:00'), null);
const NOW = new Date('2026-12-01T00:00:00Z');
assert.equal(parseActivityInput({ title: 'Choir retreat', date: '2026-12-05', startTime: '09:00', endTime: '08:00' }, { mayBudget: false, now: NOW }).ok, false, 'end before start');
assert.equal(parseActivityInput({ title: 'Old', date: '2026-11-01', startTime: '09:00' }, { mayBudget: false, now: NOW }).ok, false, 'past date');
const withBudget = parseActivityInput({ title: 'Retreat', date: '2026-12-05', startTime: '09:00', budgetUgx: '1,500,000' }, { mayBudget: true, now: NOW });
assert.ok(withBudget.ok && withBudget.value.budgetUgx === 1500000);
const noBudget = parseActivityInput({ title: 'Retreat', date: '2026-12-05', startTime: '09:00', budgetUgx: '900' }, { mayBudget: false, now: NOW });
assert.ok(noBudget.ok && noBudget.value.budgetUgx === null, 'budget dropped for people who cannot handle money');
const act = { id: 'a', department_id: 'd', title: 'x', status: 'PENDING' as const, created_by: 'p', starts_at: '2026-12-05T06:00:00Z' };
assert.equal(canDecide({ church: churchAccess('PASTOR'), role: 'PASTOR', actorId: 'p', activity: act }).ok, false, 'no self-approval');
assert.equal(canDecide({ church: churchAccess('SUPER_ADMIN'), role: 'SUPER_ADMIN', actorId: 'p', activity: act }).ok, true, 'apostle may');
assert.equal(canDecide({ church: churchAccess('ADMIN'), role: 'ADMIN', actorId: 'z', activity: act }).ok, false, 'admins do not approve');
assert.deepEqual(visibleActivityStatuses(departmentPermissions(none, 'MEMBER', m), none, true), ['APPROVED', 'COMPLETED']);
assert.equal(visibleActivityStatuses(departmentPermissions(none, null, m), none, false), null, 'outsiders see no activities');

// ---------- API with an in-memory database ----------
type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>) {
  const from = (t: string) => {
    tables[t] = tables[t] || [];
    let rows = () => tables[t];
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'update' | 'delete' = 'select';
    let patch: Row = {};
    let inserted: Row[] | null = null;
    const apply = () => rows().filter((r) => filters.every((f) => f(r)));
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, v: any[]) => (filters.push((r) => v.includes(r[c])), q),
      order: () => q,
      limit: () => q,
      insert: (row: Row | Row[]) => {
        if (Array.isArray(row)) { row.forEach((x) => tables[t].push({ ...x })); inserted = row; return q; }
        if (t === 'departments' && tables[t].some((r) => r.slug === row.slug)) {
          inserted = null;
          q._err = { code: '23505', message: 'duplicate' };
          return q;
        }
        const r = { id: row.id || `00000000-0000-4000-8000-${String(tables[t].length + 100).padStart(12, '0')}`, ...row };
        tables[t].push(r);
        inserted = [r];
        return q;
      },
      upsert: (row: Row) => {
        const key = t === 'department_members' ? ['department_id', 'user_id'] : ['dept_role', 'permission'];
        const found = tables[t].find((r) => key.every((k) => r[k] === row[k]));
        if (found) Object.assign(found, row); else tables[t].push({ ...row });
        return Promise.resolve({ error: null });
      },
      update: (p: Row) => ((op = 'update'), (patch = p), q),
      delete: () => ((op = 'delete'), q),
      single: () => Promise.resolve(q._err ? { data: null, error: q._err } : { data: inserted?.[0], error: null }),
      maybeSingle: () => Promise.resolve({ data: apply()[0] ? { ...apply()[0] } : null, error: null }),
      then: (resolve: any) => {
        if (op === 'update') { apply().forEach((r) => Object.assign(r, patch)); return resolve({ error: null }); }
        if (op === 'delete') { const keep = rows().filter((r) => !filters.every((f) => f(r))); tables[t] = keep; return resolve({ error: null }); }
        if (inserted) return resolve({ data: inserted, error: null });
        return resolve({ data: apply().map((r) => ({ ...r })), error: null });
      },
    };
    return q;
  };
  return { from };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DEPT = U(1), DEPT2 = U(2);
const users = { apostle: U(10), admin: U(11), head: U(12), member: U(13), outsider: U(14), pastor: U(15), newbie: U(16), treasurer: U(17), headB: U(18) };
const tables: Record<string, Row[]> = {
  users: [
    { id: users.apostle, name: 'Apostle Joshua', role: 'SUPER_ADMIN' },
    { id: users.admin, name: 'Admin A', role: 'ADMIN' },
    { id: users.head, name: 'Head H', role: 'MEMBER' },
    { id: users.member, name: 'Member M', role: 'MEMBER' },
    { id: users.outsider, name: 'Outsider O', role: 'MEMBER' },
    { id: users.pastor, name: 'Ps Grace', role: 'PASTOR' },
    { id: users.newbie, name: 'New N', role: 'MEMBER' },
    { id: users.treasurer, name: 'Treasurer T', role: 'MEMBER' },
    { id: users.headB, name: 'Head B', role: 'MEMBER' },
  ],
  departments: [
    { id: DEPT, slug: 'worship', name: 'Worship', mission: 'Lead worship', core_values: ['Excellence'], responsibilities: ['Rehearse'], accountability: ['Report'], is_active: true, sort_order: 1 },
    { id: DEPT2, slug: 'youth', name: 'Youth', mission: '', core_values: [], responsibilities: [], accountability: [], is_active: true, sort_order: 2 },
  ],
  department_members: [
    { department_id: DEPT, user_id: users.head, dept_role: 'HEAD' },
    { department_id: DEPT, user_id: users.member, dept_role: 'MEMBER' },
    { department_id: DEPT, user_id: users.treasurer, dept_role: 'TREASURER' },
    { department_id: DEPT2, user_id: users.headB, dept_role: 'HEAD' },
  ],
  department_role_permissions: [],
  department_audit: [],
};
const db = fakeDb(tables);
const roleOf = (id: string) => tables.users.find((u) => u.id === id)!.role;

async function call(as: string, method: 'GET' | 'POST', input: Row = {}) {
  let status = 0;
  let body: any = null;
  const res: any = { setHeader() {}, status(s: number) { status = s; return res; }, json(b: any) { body = b; return res; } };
  const req: any = method === 'GET' ? { method, query: input } : { method, query: {}, body: input };
  await handleDepartments(req, res, { admin: db, verify: (async () => ({ user: { id: as }, role: roleOf(as) })) as any });
  return { status, body };
}

const run = async () => {
  // Directory
  let r = await call(users.member, 'GET');
  assert.equal(r.status, 200);
  assert.equal(r.body.departments.find((d: any) => d.id === DEPT).myRole, 'MEMBER');
  assert.equal(r.body.departments.find((d: any) => d.id === DEPT).head.name, 'Head H');

  // Member: sees overview + leadership, not member list or audit
  r = await call(users.member, 'GET', { id: DEPT });
  assert.equal(r.status, 200);
  assert.equal(r.body.members, null, 'member cannot see member list');
  assert.equal(r.body.audit, null);
  assert.equal(r.body.can['finance.view'], false);
  assert.ok(r.body.leadership.some((l: any) => l.deptRole === 'HEAD'));

  // Outsider: overview only
  r = await call(users.outsider, 'GET', { id: DEPT });
  assert.equal(r.status, 200);
  assert.equal(r.body.amIMember, false);
  assert.equal(r.body.members, null);

  // Head sees everything in own department
  r = await call(users.head, 'GET', { id: DEPT });
  assert.equal(r.body.members.length, 3);
  assert.equal(r.body.can['finance.view'], true);

  // Head edits own department, not another
  r = await call(users.head, 'POST', { action: 'update', id: DEPT, coreValues: ['Excellence', 'Holiness'] });
  assert.equal(r.status, 200);
  assert.deepEqual(tables.departments[0].core_values, ['Excellence', 'Holiness']);
  r = await call(users.head, 'POST', { action: 'update', id: DEPT2, mission: 'Hijack' });
  assert.equal(r.status, 403, 'head limited to own department');
  r = await call(users.head, 'POST', { action: 'update', id: DEPT, name: 'Renamed' });
  assert.equal(r.status, 403, 'head cannot rename');

  // Head adds a member; cannot appoint treasurer; member cannot add anyone
  r = await call(users.head, 'POST', { action: 'set_member', id: DEPT, userId: users.newbie, deptRole: 'MEMBER' });
  assert.equal(r.status, 200);
  r = await call(users.head, 'POST', { action: 'set_member', id: DEPT, userId: users.newbie, deptRole: 'TREASURER' });
  assert.equal(r.status, 403);
  r = await call(users.member, 'POST', { action: 'set_member', id: DEPT, userId: users.outsider, deptRole: 'MEMBER' });
  assert.equal(r.status, 403);
  r = await call(users.head, 'POST', { action: 'set_member', id: DEPT2, userId: users.outsider, deptRole: 'MEMBER' });
  assert.equal(r.status, 403, 'head cannot add to another department');

  // Admin names a new head; old head moves to assistant head
  r = await call(users.admin, 'POST', { action: 'set_member', id: DEPT, userId: users.newbie, deptRole: 'HEAD' });
  assert.equal(r.status, 200);
  assert.equal(tables.department_members.find((x) => x.user_id === users.head && x.department_id === DEPT)!.dept_role, 'ASSISTANT_HEAD');
  assert.equal(tables.department_members.filter((x) => x.department_id === DEPT && x.dept_role === 'HEAD').length, 1);

  // Pastor oversight: sees everything, cannot change structure
  r = await call(users.pastor, 'GET', { id: DEPT2 });
  assert.equal(r.body.can['finance.view'], true);
  assert.ok(Array.isArray(r.body.members));
  r = await call(users.pastor, 'POST', { action: 'set_member', id: DEPT2, userId: users.outsider, deptRole: 'MEMBER' });
  assert.equal(r.status, 403);

  // Permissions matrix: admins only; head can't be limited
  r = await call(users.head, 'GET', { view: 'matrix' });
  assert.equal(r.status, 403);
  r = await call(users.admin, 'POST', { action: 'set_permission', deptRole: 'MEMBER', permission: 'members.view', allowed: true });
  assert.equal(r.status, 200);
  r = await call(users.member, 'GET', { id: DEPT });
  assert.ok(Array.isArray(r.body.members), 'member sees list after admin allows it');
  r = await call(users.admin, 'POST', { action: 'set_permission', deptRole: 'HEAD', permission: 'finance.view', allowed: false });
  assert.equal(r.status, 400);

  // Create + duplicate
  r = await call(users.apostle, 'POST', { action: 'create', name: 'Hospitality' });
  assert.equal(r.status, 200);
  r = await call(users.apostle, 'POST', { action: 'create', name: 'hospitality' });
  assert.equal(r.status, 409);
  r = await call(users.head, 'POST', { action: 'create', name: 'Rogue' });
  assert.equal(r.status, 403);

  // Archive hides from members
  r = await call(users.admin, 'POST', { action: 'update', id: DEPT2, isActive: false });
  assert.equal(r.status, 200);
  r = await call(users.member, 'GET');
  assert.ok(!r.body.departments.some((d: any) => d.id === DEPT2));
  r = await call(users.member, 'GET', { id: DEPT2 });
  assert.equal(r.status, 404);

  // Every change is audited
  assert.ok(tables.department_audit.length >= 7, `audit rows: ${tables.department_audit.length}`);
  assert.ok(tables.department_audit.some((x) => x.action === 'member.role_changed'));

  // Pending accounts are blocked
  tables.users.push({ id: U(99), name: 'Pending', role: 'PENDING' });
  r = await call(U(99), 'GET');
  assert.equal(r.status, 403);

  // ---------- Phase 2: activities, approvals, announcements ----------
  tables.department_activities = [];
  tables.department_announcements = [];
  tables.user_notifications = [];
  const kampalaDate = new Date(Date.now() + 3 * 864e5 + 3 * 36e5).toISOString().slice(0, 10);
  // Head of DEPT is now 'newbie'; 'head' is Assistant Head.
  r = await call(users.member, 'POST', { action: 'activity_create', id: DEPT, title: 'Rogue plan', date: kampalaDate, startTime: '10:00' });
  assert.equal(r.status, 403, 'members cannot plan');
  r = await call(users.head, 'POST', { action: 'activity_create', id: DEPT, title: 'Worship night', date: kampalaDate, startTime: '18:00', endTime: '21:00', location: 'Main hall', budgetUgx: '500000' });
  assert.equal(r.status, 200);
  const actId = r.body.id;
  assert.equal(tables.department_activities[0].status, 'PENDING');
  assert.equal(tables.department_activities[0].budget_ugx, null, 'assistant head cannot set a budget by default');
  assert.ok(tables.user_notifications.some((n) => n.user_id === users.pastor && n.link === '/departments/approvals'), 'pastor notified');

  r = await call(users.member, 'GET', { id: DEPT });
  assert.equal(r.body.activities.length, 0, 'members do not see pending activities');
  r = await call(users.pastor, 'GET', { view: 'approvals' });
  assert.equal(r.body.activities.length, 1);
  r = await call(users.head, 'GET', { view: 'approvals' });
  assert.equal(r.status, 403);

  r = await call(users.admin, 'POST', { action: 'activity_decide', id: DEPT, activityId: actId, decision: 'APPROVED' });
  assert.equal(r.status, 403, 'admins do not approve');
  r = await call(users.pastor, 'POST', { action: 'activity_decide', id: DEPT, activityId: actId, decision: 'REJECTED' });
  assert.equal(r.status, 400, 'sending back needs a note');
  r = await call(users.pastor, 'POST', { action: 'activity_decide', id: DEPT, activityId: actId, decision: 'REJECTED', note: 'Please move to Saturday' });
  assert.equal(r.status, 200);
  assert.ok(tables.user_notifications.some((n) => n.user_id === users.head && n.title.startsWith('Changes needed')));

  r = await call(users.head, 'POST', { action: 'activity_update', id: DEPT, activityId: actId, title: 'Worship night (Sat)', date: kampalaDate, startTime: '17:00' });
  assert.equal(r.status, 200);
  assert.equal(tables.department_activities[0].status, 'PENDING', 'resubmitted');
  r = await call(users.pastor, 'POST', { action: 'activity_decide', id: DEPT, activityId: actId, decision: 'APPROVED' });
  assert.equal(r.status, 200);
  assert.ok(tables.user_notifications.some((n) => n.user_id === users.member && n.title.includes('Worship night')), 'members told about approved activity');
  r = await call(users.member, 'GET', { id: DEPT });
  assert.equal(r.body.activities.length, 1, 'members see approved');
  r = await call(users.head, 'POST', { action: 'activity_update', id: DEPT, activityId: actId, title: 'Sneaky change', date: kampalaDate, startTime: '17:00' });
  assert.equal(r.status, 403, 'approved activities cannot be edited');
  r = await call(users.head, 'POST', { action: 'activity_complete', id: DEPT, activityId: actId });
  assert.equal(r.status, 403, 'cannot complete before it starts');
  r = await call(users.member, 'POST', { action: 'activity_cancel', id: DEPT, activityId: actId });
  assert.equal(r.status, 403);
  r = await call(users.head, 'POST', { action: 'activity_cancel', id: DEPT, activityId: actId, note: 'Venue unavailable' });
  assert.equal(r.status, 200);
  assert.ok(tables.user_notifications.some((n) => n.title.startsWith('Cancelled')));

  // Pastor cannot approve their own (pastor joins as head of DEPT2? use apostle instead): apostle can.
  tables.department_members.push({ department_id: DEPT, user_id: users.pastor, dept_role: 'SECRETARY' });
  r = await call(users.pastor, 'POST', { action: 'activity_create', id: DEPT, title: 'Pastor plan', date: kampalaDate, startTime: '08:00' });
  const own = r.body.id;
  r = await call(users.pastor, 'POST', { action: 'activity_decide', id: DEPT, activityId: own, decision: 'APPROVED' });
  assert.equal(r.status, 403, 'no self-approval');
  r = await call(users.apostle, 'POST', { action: 'activity_decide', id: DEPT, activityId: own, decision: 'APPROVED' });
  assert.equal(r.status, 200);

  // Announcements
  r = await call(users.member, 'POST', { action: 'announcement_post', id: DEPT, title: 'Hi all' });
  assert.equal(r.status, 403, 'members cannot post by default');
  const before = tables.user_notifications.length;
  r = await call(users.head, 'POST', { action: 'announcement_post', id: DEPT, title: 'Rehearsal moved', body: 'Now at 5pm', pinned: true });
  assert.equal(r.status, 200);
  assert.ok(tables.user_notifications.length > before, 'members notified');
  r = await call(users.member, 'GET', { id: DEPT });
  assert.equal(r.body.announcements[0].title, 'Rehearsal moved');
  r = await call(users.outsider, 'GET', { id: DEPT });
  assert.equal(r.body.announcements, null, 'outsiders do not see announcements');
  r = await call(users.member, 'POST', { action: 'announcement_delete', id: DEPT, announcementId: tables.department_announcements[0].id });
  assert.equal(r.status, 403);
  r = await call(users.head, 'POST', { action: 'announcement_delete', id: DEPT, announcementId: tables.department_announcements[0].id });
  assert.equal(r.status, 200);
  assert.ok(tables.department_audit.some((x) => x.action === 'activity.approved') && tables.department_audit.some((x) => x.action === 'announcement.deleted'));

  console.log('departments smoke: ok');
};
run().catch((e) => { console.error(e); process.exit(1); });
