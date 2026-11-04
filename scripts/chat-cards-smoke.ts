/**
 * PLCC Chat event & Serve cards — rules and handler checks against an in-memory DB.
 * Run: npx tsx scripts/chat-cards-smoke.ts
 */
import { readFileSync } from 'node:fs';
import {
  eventServiceDate,
  eventSignupUrl,
  eventStartIso,
  handleChatCards,
  parseCardInput,
  serveCardDto,
} from '../api/_utils/chatCards';

let failed = 0;
const assert = (c: unknown, label: string, d?: unknown) => {
  if (c) console.log(`  OK: ${label}`);
  else { failed++; console.error(`  FAIL: ${label}`, d ?? ''); }
};

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const M1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const M2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const E1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const E2 = 'efefefef-efef-4efe-8efe-efefefefefef';
const S1 = '55555555-5555-4555-8555-555555555555';

// ── Pure rules ────────────────────────────────────────────────────────
assert(parseCardInput({ messageId: M1, kind: 'event', refId: E1 }).ok, 'valid card input');
assert(!parseCardInput({ messageId: M1, kind: 'poll', refId: E1 }).ok, 'unknown kind refused');
assert(!parseCardInput({ messageId: 'x', kind: 'event', refId: E1 }).ok, 'bad message id refused');
assert(eventStartIso({ date: '2026-11-26', time: '5:30 PM' }) === '2026-11-26T17:30:00', 'date + time → start');
assert(eventStartIso({ date: '2026-11-26', starts_at: '2026-11-26T22:30:00Z' }) === '2026-11-26T22:30:00Z', 'starts_at kept when same day');
assert(eventServiceDate({ date: '2026-11-26' }) === '2026-11-26', 'service date from date');
assert(eventSignupUrl({ id: E1, rsvp_enabled: false }) === null, 'no sign-up link when RSVPs off');
assert(String(eventSignupUrl({ id: E1, rsvp_enabled: true })).endsWith(`/#/events/${E1}/rsvp`), 'default sign-up link');
assert(String(eventSignupUrl({ id: E1, rsvp_enabled: true, rsvp_url: '/#/thanksgiving-rsvp' })).endsWith('/#/thanksgiving-rsvp'), 'custom sign-up link');
assert(eventSignupUrl({ id: E1, rsvp_enabled: true, rsvp_url: 'javascript:alert(1)' })?.startsWith('https://'), 'unsafe link ignored');
const sd = serveCardDto({ id: S1, title: 'Ushers', capacity: 4, status: 'open' }, 3, 'confirmed');
assert(sd.spotsLeft === 1 && sd.mySignup === 'confirmed' && sd.open, 'serve spots left + my sign-up');
assert(serveCardDto({ id: S1, title: 'x', capacity: null }, 9, null).spotsLeft === null, 'no cap → no count');

// ── In-memory DB ──────────────────────────────────────────────────────
const db: Record<string, any[]> = {
  chat_messages: [
    { id: M1, channel_id: C1, user_id: U1, created_at: new Date().toISOString(), deleted_at: null },
    { id: M2, channel_id: C1, user_id: U1, created_at: new Date().toISOString(), deleted_at: null },
  ],
  chat_message_cards: [],
  events: [
    { id: E1, name: 'Grand Family Celebration', date: '2099-11-26', time: '5:00 PM', location: 'Exchange Hall', status: 'approved', rsvp_enabled: true },
    { id: E2, name: 'Pending thing', date: '2099-12-01', status: 'pending' },
  ],
  serve_opportunities: [{ id: S1, title: 'Greeters', status: 'open', capacity: 3, starts_at: '2099-11-30T14:00:00Z' }],
  serve_signups: [
    { opportunity_id: S1, user_id: U2, status: 'confirmed' },
    { opportunity_id: S1, user_id: '33333333-3333-4333-8333-333333333333', status: 'cancelled' },
  ],
  attendance_plans: [],
};
function q(table: string) {
  const filters: Array<(r: any) => boolean> = [];
  let op = 'select';
  let payload: any = null;
  let head = false;
  const api: any = {
    select(_c?: string, o?: any) { if (o?.head) head = true; return api; },
    in(c: string, v: any[]) { filters.push((r) => v.map(String).includes(String(r[c]))); return api; },
    eq(c: string, v: any) { filters.push((r) => String(r[c]) === String(v)); return api; },
    gte(c: string, v: any) { filters.push((r) => String(r[c] ?? '') >= String(v)); return api; },
    order() { return api; },
    limit() { return api; },
    insert(v: any) { op = 'insert'; payload = v; return api; },
    upsert(v: any) { op = 'upsert'; payload = v; return api; },
    delete() { op = 'delete'; return api; },
    maybeSingle() { return run(true); },
    then(a: any, b: any) { return run(false).then(a, b); },
  };
  async function run(one: boolean) {
    const rows = db[table];
    const match = rows.filter((r) => filters.every((f) => f(r)));
    if (op === 'insert') {
      if (table === 'chat_message_cards' && rows.some((r) => r.message_id === payload.message_id)) return { error: { code: '23505' } };
      rows.push({ ...payload });
      return { error: null };
    }
    if (op === 'upsert') {
      const i = rows.findIndex((r) => r.user_id === payload.user_id && r.plan_key === payload.plan_key);
      if (i >= 0) rows[i] = { ...rows[i], ...payload }; else rows.push({ id: String(rows.length + 1), ...payload });
      return { error: null };
    }
    if (op === 'delete') { db[table] = rows.filter((r) => !match.includes(r)); return { error: null }; }
    if (head) return { count: match.length, error: null };
    return { data: one ? match[0] ?? null : match, error: null };
  }
  return api;
}
let access = true;
let broadcasts = 0;
const deps = (userId: string) => ({
  supabase: { from: q },
  userId,
  resolveMessageChannelAccess: async (id: string) => {
    const m = db.chat_messages.find((x) => x.id === id);
    if (!m) return { ok: false as const, status: 404, error: 'nf' };
    if (!access) return { ok: false as const, status: 403, error: 'Forbidden' };
    return { ok: true as const, message: m, channel: { id: m.channel_id } };
  },
  broadcast: () => { broadcasts++; },
});
const res = () => {
  const r: any = { code: 0, body: null };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
};

(async () => {
  let r = res();
  await handleChatCards('card-options', { method: 'GET', query: {} }, r, deps(U1));
  assert(r.code === 200 && r.body.events.length === 1 && r.body.serve.length === 1, 'picker: approved events + open Serve only', r.body);

  r = res();
  await handleChatCards('card-create', { method: 'POST', body: { messageId: M1, kind: 'event', refId: E1 } }, r, deps(U2));
  assert(r.code === 403, "can't add a card to someone else's message");
  r = res();
  await handleChatCards('card-create', { method: 'POST', body: { messageId: M1, kind: 'event', refId: E2 } }, r, deps(U1));
  assert(r.code === 404, 'pending event refused');
  r = res();
  await handleChatCards('card-create', { method: 'POST', body: { messageId: M1, kind: 'event', refId: E1 } }, r, deps(U1));
  assert(r.code === 200, 'event card created');
  r = res();
  await handleChatCards('card-create', { method: 'POST', body: { messageId: M1, kind: 'serve', refId: S1 } }, r, deps(U1));
  assert(r.code === 409, 'one card per message');
  r = res();
  await handleChatCards('card-create', { method: 'POST', body: { messageId: M2, kind: 'serve', refId: S1 } }, r, deps(U1));
  assert(r.code === 200, 'serve card created');

  r = res();
  await handleChatCards('card-going', { method: 'POST', body: { eventId: E1, going: true, messageId: M1 } }, r, deps(U2));
  assert(r.code === 200 && r.body.goingCount === 1, "I'll be there saved");
  r = res();
  await handleChatCards('card-going', { method: 'POST', body: { eventId: E1, going: true } }, r, deps(U2));
  assert(r.body.goingCount === 1, 'tapping twice does not double count');
  assert(db.attendance_plans[0].plan_key === `event:${E1}` && db.attendance_plans[0].service_date === '2099-11-26', 'plan shared with Connect format');

  r = res();
  await handleChatCards('cards', { method: 'GET', query: { messageIds: `${M1},${M2}` } }, r, deps(U2));
  const ev = r.body.cards.find((c: any) => c.kind === 'event')?.event;
  const sv = r.body.cards.find((c: any) => c.kind === 'serve')?.serve;
  assert(ev?.going === true && ev.goingCount === 1 && ev.signupUrl, 'event card: my going + count + sign-up link', r.body);
  assert(sv?.spotsLeft === 2 && sv.mySignup === 'confirmed', 'serve card: cancelled sign-ups not counted; mine shown', sv);

  access = false;
  r = res();
  await handleChatCards('cards', { method: 'GET', query: { messageIds: M1 } }, r, deps(U2));
  assert(r.body.cards.length === 0, 'no cards from rooms you cannot open');
  access = true;

  r = res();
  await handleChatCards('card-going', { method: 'POST', body: { eventId: E1, going: false } }, r, deps(U2));
  assert(r.body.goingCount === 0, 'take back "I’ll be there"');
  assert(broadcasts >= 3, 'room refreshes');

  const core = readFileSync(new URL('../api/_utils/core.ts', import.meta.url), 'utf8');
  assert(core.includes("subResource === 'card-create'") && core.includes("import('./chatCards.js')"), 'core routes card requests');

  if (failed) { console.error(`\n${failed} chat card check(s) failed.`); process.exit(1); }
  console.log('\nAll chat card checks passed.');
})();
