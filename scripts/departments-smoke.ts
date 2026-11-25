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
      insert: (row: Row) => {
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
      maybeSingle: () => Promise.resolve({ data: apply()[0] || null, error: null }),
      then: (resolve: any) => {
        if (op === 'update') { apply().forEach((r) => Object.assign(r, patch)); return resolve({ error: null }); }
        if (op === 'delete') { const keep = rows().filter((r) => !filters.every((f) => f(r))); tables[t] = keep; return resolve({ error: null }); }
        if (inserted) return resolve({ data: inserted, error: null });
        return resolve({ data: apply(), error: null });
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

  console.log('departments smoke: ok');
};
run().catch((e) => { console.error(e); process.exit(1); });
