/**
 * PLCC Chat polls — input rules, vote rules, and the shape each member sees,
 * plus the handler's access checks against an in-memory database.
 * Run: npx tsx scripts/chat-polls-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { handleChatPolls, parsePollInput, parseVoteChoice, summarizePoll } from '../api/_utils/chatPolls';

let failed = 0;
const assert = (c: unknown, label: string, d?: unknown) => {
  if (c) console.log(`  OK: ${label}`);
  else { failed++; console.error(`  FAIL: ${label}`, d ?? ''); }
};

// ── Input ─────────────────────────────────────────────────────────────
const good = parsePollInput({ question: '  Which Sunday works?  ', options: ['Nov 9', ' Nov 16 ', '', 'nov 9', 'Nov 23'] });
assert(good.ok && good.question === 'Which Sunday works?', 'question trimmed');
assert(good.ok && good.options.map((o) => o.id + ':' + o.text).join('|') === 'o1:Nov 9|o2:Nov 16|o3:Nov 23', 'blank and duplicate choices dropped, ids o1..');
assert(good.ok && good.multi === false && good.anonymous === false, 'single choice, names shown by default');
assert(!parsePollInput({ question: '', options: ['a', 'b'] }).ok, 'question required');
assert(!parsePollInput({ question: 'Q', options: ['only one'] }).ok, 'needs two choices');
assert(!parsePollInput({ question: 'Q', options: Array.from({ length: 11 }, (_, i) => `c${i}`) }).ok, 'max 10 choices');
assert(!parsePollInput({ question: 'x'.repeat(301), options: ['a', 'b'] }).ok, 'question length capped');

// ── Votes ─────────────────────────────────────────────────────────────
const single = { options: [{ id: 'o1', text: 'A' }, { id: 'o2', text: 'B' }], multi: false };
assert(parseVoteChoice(['o1'], single).ok, 'one valid choice');
assert(!parseVoteChoice(['o1', 'o2'], single).ok, 'single-choice poll refuses two');
assert(parseVoteChoice(['o1', 'o2'], { ...single, multi: true }).ok, 'multi-choice allows two');
assert(!parseVoteChoice(['o9'], single).ok, 'unknown option refused');
const none = parseVoteChoice([], single);
assert(none.ok && none.ids.length === 0, 'empty takes the vote back');

// ── Summary ───────────────────────────────────────────────────────────
const poll = { id: 'p1', message_id: 'm1', question: 'Q', options: single.options, multi: false, anonymous: false, closed_at: null, created_by: 'u1' };
const votes = [{ user_id: 'u1', option_id: 'o1' }, { user_id: 'u2', option_id: 'o1' }, { user_id: 'u3', option_id: 'o2' }, { user_id: 'u4', option_id: 'zz' }];
const names = new Map([['u1', 'Ann'], ['u2', 'Ben'], ['u3', 'Cy']]);
const s1 = summarizePoll(poll, votes, 'u2', names);
assert(s1.totalVoters === 3 && s1.options[0].count === 2 && s1.options[1].count === 1, 'counts (stray option ignored)');
assert(s1.myVotes.join() === 'o1' && s1.isMine === false, 'viewer votes and ownership');
assert(s1.options[0].voters.join() === 'Ann,Ben', 'names shown when not anonymous');
const s2 = summarizePoll({ ...poll, anonymous: true }, votes, 'u1', names);
assert(s2.options.every((o) => o.voters.length === 0) && s2.isMine, 'anonymous hides names');

// ── Handler (in-memory DB) ────────────────────────────────────────────
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const M1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const M2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const db: Record<string, any[]> = {
  chat_messages: [
    { id: M1, channel_id: C1, user_id: U1, created_at: new Date().toISOString(), deleted_at: null },
    { id: M2, channel_id: C1, user_id: U1, created_at: new Date(Date.now() - 3600_000).toISOString(), deleted_at: null },
  ],
  chat_polls: [],
  chat_poll_votes: [],
  users: [{ id: U1, name: 'Ann' }, { id: U2, name: 'Ben' }],
};
let seq = 0;
function q(table: string) {
  let rows = db[table];
  let op: 'select' | 'delete' | 'update' | 'insert' = 'select';
  let payload: any = null;
  const filters: Array<(r: any) => boolean> = [];
  const api: any = {
    select() { return api; },
    in(col: string, vals: any[]) { filters.push((r) => vals.map(String).includes(String(r[col]))); return api; },
    eq(col: string, val: any) { filters.push((r) => String(r[col]) === String(val)); return api; },
    delete() { op = 'delete'; return api; },
    update(v: any) { op = 'update'; payload = v; return api; },
    insert(v: any) { op = 'insert'; payload = v; return api; },
    maybeSingle() { return run(true); },
    single() { return run(true); },
    then(res: any, rej: any) { return run(false).then(res, rej); },
  };
  async function run(one: boolean) {
    const match = rows.filter((r) => filters.every((f) => f(r)));
    if (op === 'insert') {
      const list = (Array.isArray(payload) ? payload : [payload]).map((r: any) => ({ id: `${++seq}`.padStart(8, '0') + '-0000-4000-8000-000000000000', closed_at: null, ...r }));
      if (table === 'chat_polls' && list.some((r: any) => rows.some((x) => x.message_id === r.message_id))) return { data: null, error: { code: '23505' } };
      rows.push(...list);
      return { data: one ? list[0] : list, error: null };
    }
    if (op === 'delete') { db[table] = rows.filter((r) => !match.includes(r)); return { data: null, error: null }; }
    if (op === 'update') { match.forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
    return { data: one ? match[0] ?? null : match, error: null };
  }
  return api;
}
const supabase = { from: q };
function res() {
  const r: any = { code: 0, body: null };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}
let roomAccess = true;
let broadcasts = 0;
const deps = (userId: string, leader = false) => ({
  supabase,
  userId,
  resolveMessageChannelAccess: async (id: string) => {
    const m = db.chat_messages.find((x) => x.id === id);
    if (!m) return { ok: false as const, status: 404, error: 'Message not found' };
    if (!roomAccess) return { ok: false as const, status: 403, error: 'Forbidden' };
    return { ok: true as const, message: m, channel: { id: m.channel_id } };
  },
  isRoomLeader: async () => leader,
  broadcast: () => { broadcasts++; },
});

(async () => {
  let r = res();
  await handleChatPolls('poll-create', { method: 'POST', body: { messageId: M1, question: 'Q', options: ['A', 'B'] } }, r, deps(U2));
  assert(r.code === 403, "can't add a poll to someone else's message");
  r = res();
  await handleChatPolls('poll-create', { method: 'POST', body: { messageId: M2, question: 'Q', options: ['A', 'B'] } }, r, deps(U1));
  assert(r.code === 400, 'old message refused (10-minute window)');
  r = res();
  await handleChatPolls('poll-create', { method: 'POST', body: { messageId: M1, question: 'Q', options: ['A', 'B'] } }, r, deps(U1));
  assert(r.code === 200 && r.body.poll.options.length === 2, 'author creates poll', r.body);
  const pollId = r.body.poll.id;
  r = res();
  await handleChatPolls('poll-create', { method: 'POST', body: { messageId: M1, question: 'Q2', options: ['A', 'B'] } }, r, deps(U1));
  assert(r.code === 409, 'one poll per message');

  r = res();
  await handleChatPolls('poll-vote', { method: 'POST', body: { pollId, optionIds: ['o2'] } }, r, deps(U2));
  assert(r.code === 200, 'member votes');
  r = res();
  await handleChatPolls('poll-vote', { method: 'POST', body: { pollId, optionIds: ['o1'] } }, r, deps(U2));
  assert(r.code === 200 && db.chat_poll_votes.filter((v) => v.user_id === U2).length === 1, 'changing a vote replaces it');

  r = res();
  await handleChatPolls('polls', { method: 'GET', query: { messageIds: `${M1},not-a-uuid` } }, r, deps(U2));
  assert(r.code === 200 && r.body.polls[0].options[0].count === 1 && r.body.polls[0].myVotes.join() === 'o1', 'GET shows counts and my vote', r.body);
  assert(r.body.polls[0].options[0].voters.join() === 'Ben', 'GET shows voter names');

  roomAccess = false;
  r = res();
  await handleChatPolls('polls', { method: 'GET', query: { messageIds: M1 } }, r, deps(U2));
  assert(r.code === 200 && r.body.polls.length === 0, 'no polls from rooms you cannot open');
  r = res();
  await handleChatPolls('poll-vote', { method: 'POST', body: { pollId, optionIds: ['o2'] } }, r, deps(U2));
  assert(r.code === 403, 'cannot vote without room access');
  roomAccess = true;

  r = res();
  await handleChatPolls('poll-close', { method: 'POST', body: { pollId } }, r, deps(U2));
  assert(r.code === 403, 'members cannot close someone else’s poll');
  r = res();
  await handleChatPolls('poll-close', { method: 'POST', body: { pollId } }, r, deps(U2, true));
  assert(r.code === 200, 'room leader closes poll');
  r = res();
  await handleChatPolls('poll-vote', { method: 'POST', body: { pollId, optionIds: ['o2'] } }, r, deps(U2));
  assert(r.code === 400, 'no voting after close');
  assert(broadcasts >= 3, 'room is told to refresh');

  const core = readFileSync(new URL('../api/_utils/core.ts', import.meta.url), 'utf8');
  assert(core.includes("subResource === 'poll-create'") && core.includes("import('./chatPolls.js')"), 'core routes the poll requests');
  const sql = readFileSync(new URL('../supabase/migrations/chat_polls.sql', import.meta.url), 'utf8');
  assert(/ENABLE ROW LEVEL SECURITY/.test(sql) && /UNIQUE REFERENCES public\.chat_messages/.test(sql), 'migration: RLS on, one poll per message');

  if (failed) { console.error(`\n${failed} chat poll check(s) failed.`); process.exit(1); }
  console.log('\nAll chat poll checks passed.');
})();
