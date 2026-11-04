/**
 * PLCC Chat requests — who may do what, and the tracking flow against an in-memory DB.
 * Run: npx tsx scripts/chat-requests-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { decideRequestAction, handleChatRequests, parseRequestInput } from '../api/_utils/chatRequests';

let failed = 0;
const assert = (c: unknown, label: string, d?: unknown) => {
  if (c) console.log(`  OK: ${label}`);
  else { failed++; console.error(`  FAIL: ${label}`, d ?? ''); }
};

const ASKER = '11111111-1111-4111-8111-111111111111';
const HELPER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const LEADER = '44444444-4444-4444-8444-444444444444';
const OUTSIDER = '55555555-5555-4555-8555-555555555555';
const M1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// ── Rules ─────────────────────────────────────────────────────────────
assert(parseRequestInput({ messageId: M1, category: 'ride', details: 'Ride to church Sunday' }).ok, 'valid request');
assert(!parseRequestInput({ messageId: M1, category: 'money', details: 'x' }).ok, 'unknown category refused');
assert(!parseRequestInput({ messageId: M1, category: 'ride', details: '  ' }).ok, 'details required');
const fresh = { status: 'new' as const, created_by: ASKER, assignee_id: null };
const taken = { status: 'assigned' as const, created_by: ASKER, assignee_id: HELPER };
const d = (r: any, a: any, u: string, leader = false, to?: string) => decideRequestAction(r, a, { userId: u, isLeader: leader }, to);
assert(d(fresh, 'volunteer', OTHER).ok, 'anyone can volunteer on a new request');
assert(!d(taken, 'volunteer', OTHER).ok, "can't volunteer when someone is helping");
assert(!d(fresh, 'volunteer', ASKER).ok, "can't volunteer on your own request");
assert(!d(fresh, 'assign', OTHER, false, HELPER).ok, 'members cannot assign');
assert(d(fresh, 'assign', LEADER, true, HELPER).ok, 'leaders assign');
assert(d(taken, 'unassign', HELPER).ok && !d(taken, 'unassign', OTHER).ok, 'helper (not others) can step back');
assert(d(taken, 'done', HELPER).ok && d(taken, 'done', ASKER).ok && !d(taken, 'done', OTHER).ok, 'helper or asker marks done');
assert(d(fresh, 'cancel', ASKER).ok && !d(fresh, 'cancel', OTHER).ok, 'asker cancels, others cannot');
assert(!d({ ...taken, status: 'done' }, 'done', HELPER).ok, 'no double done');
assert(d({ ...taken, status: 'done' }, 'reopen', ASKER).ok && !d({ ...taken, status: 'done' }, 'reopen', HELPER).ok, 'asker reopens');
assert(!d(fresh, 'note', OTHER).ok && d(taken, 'note', HELPER).ok, 'only people on the request add updates');

// ── In-memory DB ──────────────────────────────────────────────────────
const db: Record<string, any[]> = {
  chat_messages: [{ id: M1, channel_id: C1, user_id: ASKER, created_at: new Date().toISOString(), deleted_at: null }],
  chat_requests: [],
  chat_request_updates: [],
  users: [
    { id: ASKER, name: 'Sister Ruth' }, { id: HELPER, name: 'Brother Sam' }, { id: OTHER, name: 'Grace' },
    { id: LEADER, name: 'Deacon Paul' }, { id: OUTSIDER, name: 'Visitor' },
  ],
};
let seq = 0;
function q(table: string) {
  const filters: Array<(r: any) => boolean> = [];
  let op = 'select';
  let payload: any = null;
  const api: any = {
    select() { return api; },
    in(c: string, v: any[]) { filters.push((r) => v.map(String).includes(String(r[c]))); return api; },
    eq(c: string, v: any) { filters.push((r) => String(r[c]) === String(v)); return api; },
    is(c: string, v: any) { filters.push((r) => (r[c] ?? null) === v); return api; },
    order() { return api; },
    limit() { return api; },
    insert(v: any) { op = 'insert'; payload = v; return api; },
    update(v: any) { op = 'update'; payload = v; return api; },
    maybeSingle() { return run(true); },
    single() { return run(true); },
    then(a: any, b: any) { return run(false).then(a, b); },
  };
  async function run(one: boolean) {
    const rows = db[table];
    if (op === 'insert') {
      const row = { id: `${++seq}`.padStart(8, '0') + '-0000-4000-8000-000000000000', created_at: new Date(Date.now() + seq).toISOString(), assignee_id: null, ...payload };
      if (table === 'chat_requests' && rows.some((r) => r.message_id === row.message_id)) return { data: null, error: { code: '23505' } };
      rows.push(row);
      return { data: one ? row : [row], error: null };
    }
    const match = rows.filter((r) => filters.every((f) => f(r)));
    if (op === 'update') { match.forEach((r) => Object.assign(r, payload)); return { data: match, error: null }; }
    return { data: one ? match[0] ?? null : match, error: null };
  }
  return api;
}
const alerts: Array<{ to: string; title: string }> = [];
let broadcasts = 0;
const deps = (userId: string) => ({
  supabase: { from: q },
  userId,
  resolveMessageChannelAccess: async (id: string) => {
    const m = db.chat_messages.find((x) => x.id === id);
    if (!m) return { ok: false as const, status: 404, error: 'nf' };
    if (userId === OUTSIDER) return { ok: false as const, status: 403, error: 'Forbidden' };
    return { ok: true as const, message: m, channel: { id: m.channel_id } };
  },
  fetchChannelForUser: async (cid: string) =>
    userId === OUTSIDER ? { ok: false as const, status: 403, error: 'Forbidden' } : { ok: true as const, channel: { id: cid } },
  isRoomLeader: async () => userId === LEADER,
  canUserOpen: async (_c: any, uid: string) => uid !== OUTSIDER,
  broadcast: () => { broadcasts++; },
  notify: async (to: string, p: { title: string }) => { alerts.push({ to, title: p.title }); },
});
const res = () => {
  const r: any = { code: 0, body: null };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
};
const call = async (type: string, user: string, body?: any, query?: any) => {
  const r = res();
  await handleChatRequests(type, { method: body ? 'POST' : 'GET', body, query: query || {} }, r, deps(user));
  return r;
};

(async () => {
  let r = await call('request-create', HELPER, { messageId: M1, category: 'ride', details: 'x' });
  assert(r.code === 403, "can't attach a request to someone else's message");
  r = await call('request-create', ASKER, { messageId: M1, category: 'ride', details: 'Ride to the doctor Thursday 10am' });
  assert(r.code === 200 && r.body.request.status === 'new' && !r.body.request.can.volunteer && r.body.request.can.cancel, 'asker creates request (can cancel, not volunteer)', r.body);
  const id = r.body.request.id;

  r = await call('request-update', HELPER, { requestId: id, action: 'volunteer' });
  assert(r.code === 200 && r.body.request.status === 'assigned' && r.body.request.helper.name === 'Brother Sam', 'volunteer takes it');
  assert(alerts.some((a) => a.to === ASKER && /Brother Sam will help/.test(a.title)), 'asker is told who is helping');
  r = await call('request-update', OTHER, { requestId: id, action: 'volunteer' });
  assert(r.code === 409, 'second volunteer refused');

  r = await call('request-update', LEADER, { requestId: id, action: 'assign', assigneeId: OUTSIDER });
  assert(r.code === 400, "can't assign someone outside the room");
  r = await call('request-update', LEADER, { requestId: id, action: 'assign', assigneeId: OTHER });
  assert(r.code === 200 && r.body.request.helper.name === 'Grace', 'leader reassigns');
  assert(alerts.some((a) => a.to === OTHER && /asked you to help/.test(a.title)), 'new helper is alerted');

  r = await call('request-update', OTHER, { requestId: id, action: 'note', note: 'I will pick you up at 9:30' });
  assert(r.code === 200 && r.body.request.history.some((h: any) => h.note === 'I will pick you up at 9:30'), 'helper adds an update');
  r = await call('request-update', OTHER, { requestId: id, action: 'done' });
  assert(r.code === 200 && r.body.request.status === 'done' && r.body.request.can.reopen === false, 'helper marks done');
  assert(alerts.some((a) => a.to === ASKER && /marked done/.test(a.title)), 'asker told it is done');

  r = await call('requests', ASKER, undefined, { channelId: C1 });
  assert(r.code === 200 && r.body.requests.length === 0, 'room list shows open requests only');
  r = await call('requests', ASKER, undefined, { channelId: C1, scope: 'all' });
  const hist = r.body.requests[0]?.history?.map((h: any) => h.action).join(',');
  assert(hist === 'created,volunteer,assign,note,done', 'full tracking timeline kept', hist);
  r = await call('requests', OUTSIDER, undefined, { messageIds: M1 });
  assert(r.code === 200 && r.body.requests.length === 0, 'no requests from rooms you cannot open');
  r = await call('requests', OUTSIDER, undefined, { channelId: C1 });
  assert(r.code === 403, 'outsider cannot list the room');
  assert(broadcasts >= 5, 'room refreshes');

  const core = readFileSync(new URL('../api/_utils/core.ts', import.meta.url), 'utf8');
  assert(core.includes("subResource === 'request-update'") && core.includes("import('./chatRequests.js')"), 'core routes requests');
  assert(core.includes("type: 'assignment'"), 'alerts use an allowed notification type');

  if (failed) { console.error(`\n${failed} chat request check(s) failed.`); process.exit(1); }
  console.log('\nAll chat request checks passed.');
})();
