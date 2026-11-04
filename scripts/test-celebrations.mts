/**
 * Automatic birthday & anniversary greetings: who is greeted, how it reaches
 * them, kids → parents, and never twice.
 * Run: npx tsx scripts/test-celebrations.mts
 */
import assert from 'node:assert/strict';

const c = await import('../api/_utils/celebrations.ts');

let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`OK  ${name}`);
  } catch (e: any) {
    failed++;
    console.error(`FAIL ${name}`, e?.message || e);
  }
}

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = { year: 2026, month: 4, day: 28 };
const S = c.DEFAULT_CELEBRATION_SETTINGS;

function world() {
  const members = [
    { id: id(1), first_name: 'Grace', last_name: 'Okafor', status: 'Active', birthday: '1904-04-28', email: 'grace@example.com' }, // no-year birthday, app user
    { id: id(2), preferred_name: 'Brother Sam', first_name: 'Samuel', status: 'Active', birthday: '1980-04-28', email: 'sam@example.com' }, // email only
    { id: id(3), first_name: 'Ruth', status: 'Active', anniversary: '2005-04-28', anniversary_kind: 'wedding' }, // app, wedding
    { id: id(4), first_name: 'Naomi', status: 'Active', anniversary: '2010-04-28', anniversary_kind: 'other' }, // other → skipped
    { id: id(5), first_name: 'Boaz', status: 'Active', anniversary: '2001-04-28', anniversary_kind: null }, // unspecified → greeted
    { id: id(6), first_name: 'Joshua', status: 'Active', birthday: '2019-04-28' }, // kid → parents (app)
    { id: id(7), first_name: 'Mary', status: 'Active', email: 'mary@example.com' }, // parent of 6 (app user)
    { id: id(8), first_name: 'Leah', status: 'Active', birthday: '2020-04-28' }, // kid, parent has email only
    { id: id(9), first_name: 'Jacob', status: 'Active', email: 'jacob@example.com' }, // parent of 8
    { id: id(10), first_name: 'Old', status: 'Inactive', birthday: '1950-04-28', email: 'old@example.com' }, // inactive → skipped
    { id: id(11), first_name: 'Visitor', status: 'Visitor', birthday: '1990-04-28' }, // visitor → skipped
    { id: id(12), first_name: 'Nobody', status: 'Active', birthday: '1990-04-28' }, // no way to reach
    { id: id(13), first_name: 'Soon', status: 'Active', birthday: '1990-05-01' }, // in 3 days
  ];
  const links = new Map([[id(1), [uid(1)]], [id(3), [uid(3)]], [id(5), [uid(5)]], [id(7), [uid(7)]]]);
  const homes = [
    { household_id: 'h1', member_id: id(6), relationship_type: 'child' },
    { household_id: 'h1', member_id: id(7), relationship_type: 'self' },
    { household_id: 'h2', member_id: id(8), relationship_type: 'dependent' },
    { household_id: 'h2', member_id: id(9), relationship_type: 'spouse' },
  ];
  return c.buildFamilies(members, links, homes, []);
}

await check('birthdays saved without a year are greeted (1904-MM-DD)', () => {
  const plan = c.planCelebrations(world(), S, today, 0);
  const grace = plan.find((g) => g.memberId === id(1))!;
  assert.equal(grace.occasion, 'birthday');
  assert.deepEqual(grace.delivery, { kind: 'app', userIds: [uid(1)], emails: ['grace@example.com'] });
  assert.match(grace.title, /Happy birthday, Grace!/);
  const [msg, note, verse] = grace.body.split('\n\n');
  assert.equal(msg, 'Pastor Grace & Kennedy Hiire and the entire PLCC Family would like to wish you a Happy and Blessed Birthday.');
  assert.match(note, /treasured part of our church family/);
  assert.match(verse, /^“.+” — [1-3A-Z]/);
  const noExtras = c.planCelebrations(world(), { ...S, birthdayNote: '', includeVerse: false }, today, 0).find((g) => g.memberId === id(1))!;
  assert.equal(noExtras.body, msg, 'note and verse can be turned off');
  const noEmail = c.planCelebrations(world(), { ...S, emailFallback: false }, today, 0).find((g) => g.memberId === id(1))!;
  assert.deepEqual(noEmail.delivery, { kind: 'app', userIds: [uid(1)] }, 'email off → Connect only');
});

await check('no Connect account → email backup; preferred name used', () => {
  const sam = c.planCelebrations(world(), S, today, 0).find((g) => g.memberId === id(2))!;
  assert.deepEqual(sam.delivery, { kind: 'email', emails: ['sam@example.com'] });
  assert.match(sam.title, /Brother Sam/);
  const off = c.planCelebrations(world(), { ...S, emailFallback: false }, today, 0).find((g) => g.memberId === id(2))!;
  assert.equal(off.delivery.kind, 'none');
});

await check('wedding anniversaries (and unspecified) are greeted, "other" is not', () => {
  const plan = c.planCelebrations(world(), S, today, 0);
  assert.match(plan.find((g) => g.memberId === id(3))!.title, /Happy wedding anniversary, Ruth/);
  assert.match(plan.find((g) => g.memberId === id(5))!.title, /^Happy anniversary, Boaz/);
  assert.equal(plan.find((g) => g.memberId === id(4)), undefined);
});

await check("kids' birthdays go to their parents (app, else parent email)", () => {
  const plan = c.planCelebrations(world(), S, today, 0);
  const joshua = plan.find((g) => g.memberId === id(6))!;
  assert.equal(joshua.isKid, true);
  assert.equal(joshua.delivery.kind, 'app');
  assert.deepEqual((joshua.delivery as any).userIds, [uid(7)]);
  assert.match(joshua.title, /Happy birthday to Joshua/);
  assert.match(joshua.body, /entire PLCC Family would like to wish Joshua a Happy and Blessed Birthday/);
  const leah = plan.find((g) => g.memberId === id(8))!;
  assert.deepEqual(leah.delivery, { kind: 'email', emails: ['jacob@example.com'] });
});

await check('only Active members; unreachable people are listed but not sent', () => {
  const plan = c.planCelebrations(world(), S, today, 0);
  assert.equal(plan.find((g) => g.memberId === id(10)), undefined);
  assert.equal(plan.find((g) => g.memberId === id(11)), undefined);
  assert.equal(plan.find((g) => g.memberId === id(12))!.delivery.kind, 'none');
  assert.equal(plan.find((g) => g.memberId === id(13)), undefined, 'not today');
  const week = c.planCelebrations(world(), S, today, 7);
  assert.equal(week.find((g) => g.memberId === id(13))!.daysAway, 3);
});

await check('personal touches: years with PLCC, verse changes yearly, kids get kid verses', () => {
  assert.equal(c.yearsWithAwc('2010-09-01', { year: 2026, month: 10, day: 31 }), 16);
  assert.equal(c.yearsWithAwc('2010-12-01', { year: 2026, month: 10, day: 31 }), 15);
  assert.equal(c.yearsWithAwc(null, { year: 2026, month: 10, day: 31 }), 0);
  const body = c.birthdayBody(S, { name: 'Sheevon', memberId: id(1), year: 2026, joinedYears: 16 });
  assert.match(body, /Thank you for 16 years of worshipping with us\./);
  assert.match(c.birthdayBody(S, { name: 'A', memberId: id(1), year: 2026, joinedYears: 1 }), /your first year/);
  const years = new Set([2026, 2027, 2028, 2029].map((y) => c.pickVerse(id(1), y, false).ref));
  assert.ok(years.size > 1, 'verse varies by year');
  const kid = c.birthdayBody(S, { child: 'Joshua', memberId: id(6), year: 2026 });
  assert.ok(c.KID_VERSES.some((v) => kid.includes(v.ref)), 'kid verse');
  assert.doesNotMatch(kid, /years of worshipping/);
  const html = c.greetingEmailHtml('Hi', body);
  assert.ok(html.includes('font-style:italic') && (html.match(/<p /g) || []).length >= 3, 'email has paragraphs and a set-apart verse');
});

await check('dates: Feb 29, year wrap, church time zone', () => {
  assert.equal(c.daysUntil({ month: 2, day: 29 }, { year: 2027, month: 2, day: 28 }), 0);
  assert.equal(c.daysUntil({ month: 2, day: 29 }, { year: 2028, month: 2, day: 28 }), 1);
  assert.equal(c.daysUntil({ month: 1, day: 2 }, { year: 2026, month: 12, day: 30 }), 3);
  // 2026-04-29 03:30 UTC is still April 28 at 11:30 PM in New York.
  assert.equal(c.churchDate(new Date('2026-04-29T03:30:00Z')).iso, '2026-04-28');
  assert.equal(c.churchDate(new Date('2026-04-28T11:05:00Z')).hour, 7);
});

await check('settings are cleaned and templates filled', () => {
  const s = c.cleanCelebrationSettings({ enabled: false, signature: '  Pastor Kim  ', birthdayMessage: '', bogus: 1 });
  assert.equal(s.enabled, false);
  assert.equal(s.signature, 'Pastor Kim');
  assert.equal(s.birthdayMessage, S.birthdayMessage);
  assert.equal(c.fillTemplate('Hi {NAME} — {signature}', { name: 'Ann', signature: 'P' }), 'Hi Ann — P');
  assert.ok(!c.greetingEmailHtml('<b>x</b>', 'a & b').includes('<b>x</b>'));
  const card = c.greetingEmailHtml('Happy birthday, Grace! 🎂', 'Blessings');
  assert.ok(card.includes(c.CHURCH_SEAL_URL) && /^https:\/\//.test(c.CHURCH_SEAL_URL), 'card shows the church seal');
  assert.ok(card.includes('Promised Land Christian Center'), 'card has the church header');
});

// --- Sending with a stand-in database ----------------------------------------------
type Tables = Record<string, any[]>;
function fakeDb(t: Tables) {
  return {
    t,
    from(table: string) {
      const rows = (t[table] ||= []);
      const filters: ((r: any) => boolean)[] = [];
      let op: 'select' | 'insert' | 'delete' | 'update' = 'select';
      let payload: any = null;
      let single = false;
      const api: any = {
        select() { return api; },
        order() { return api; },
        range() { return api; },
        eq(col: string, v: any) { filters.push((r) => r[col] === v); return api; },
        in(col: string, v: any[]) { filters.push((r) => v.includes(r[col])); return api; },
        contains() { return api; },
        maybeSingle() { single = true; return api; },
        insert(p: any) { op = 'insert'; payload = Array.isArray(p) ? p : [p]; return api; },
        delete() { op = 'delete'; return api; },
        update(p: any) { op = 'update'; payload = p; return api; },
        upsert(p: any) { op = 'insert'; payload = [p]; return api; },
        then(resolve: any) {
          if (op === 'insert') {
            if (table === 'celebration_greetings') {
              for (const p of payload) {
                if (rows.some((r) => r.member_id === p.member_id && r.occasion === p.occasion && r.greet_year === p.greet_year)) {
                  return resolve({ data: null, error: { code: '23505', message: 'duplicate' } });
                }
              }
            }
            rows.push(...payload);
            return resolve({ data: payload, error: null });
          }
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (op === 'delete') for (const r of hit) rows.splice(rows.indexOf(r), 1);
          if (op === 'update') for (const r of hit) Object.assign(r, payload);
          return resolve({ data: single ? hit[0] ?? null : hit, error: null });
        },
      };
      return api;
    },
  };
}

function dbFor() {
  const w = world();
  return fakeDb({
    organization_settings: [{ id: 1, celebration_settings: { enabled: true, signature: 'Pastor K' } }],
    members: w.members,
    user_member_links: [...w.userIdsByMember].flatMap(([member_id, ids]) => ids.map((user_id) => ({ user_id, member_id, status: 'verified' }))),
    household_members: [
      { household_id: 'h1', member_id: id(6), relationship_type: 'child', status: 'active' },
      { household_id: 'h1', member_id: id(7), relationship_type: 'self', status: 'active' },
      { household_id: 'h2', member_id: id(8), relationship_type: 'dependent', status: 'active' },
      { household_id: 'h2', member_id: id(9), relationship_type: 'spouse', status: 'active' },
    ],
    guardian_relationships: [],
    celebration_greetings: [],
    user_notifications: [],
  });
}

const sevenAM = new Date('2026-04-28T11:05:00Z');

await check('7 AM run sends app greetings once; second run sends nothing', async () => {
  const db = dbFor();
  delete process.env.RESEND_API_KEY;
  delete process.env.VITE_RESEND_API_KEY;
  const r1 = await c.runCelebrationGreetings(db as any, sevenAM);
  // Grace, Ruth, Boaz, Joshua→Mary via app (4). Sam & Leah are email — no email service here → failed & released.
  assert.equal(r1.sent, 4);
  assert.equal(r1.failed, 2);
  const notes = db.t.user_notifications;
  assert.equal(notes.length, 4);
  assert.ok(notes.every((n: any) => n.type === 'celebration' && n.link === '/'));
  assert.ok(notes.some((n: any) => n.user_id === uid(7) && /Joshua/.test(n.title)));
  assert.ok(notes.every((n: any) => /Pastor K/.test(n.body)));
  assert.equal(db.t.celebration_greetings.length, 4, 'failed emails are released for a retry');
  const r2 = await c.runCelebrationGreetings(db as any, new Date('2026-04-28T11:40:00Z'));
  assert.equal(r2.sent, 0);
  assert.equal(db.t.user_notifications.length, 4);
});

await check('outside 7 AM, when turned off, or before setup: nothing is sent', async () => {
  const db = dbFor();
  assert.match(String((await c.runCelebrationGreetings(db as any, new Date('2026-04-28T15:00:00Z'))).skippedReason), /church hour is 11/);
  db.t.organization_settings[0].celebration_settings = { enabled: false };
  assert.equal((await c.runCelebrationGreetings(db as any, sevenAM)).skippedReason, 'greetings are off');
  assert.equal(db.t.user_notifications.length, 0);
  const broken = { from: (t: string) => (t === 'organization_settings'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'column celebration_settings does not exist' } }) }) }) }
    : dbFor().from(t)) };
  assert.match(String((await c.runCelebrationGreetings(broken as any, sevenAM)).skippedReason), /celebration_greetings\.sql/);
});

await check('staff list marks who was greeted today', () => {
  const plan = c.planCelebrations(world(), S, today, 7);
  const rows = c.staffRows(plan, new Map([[`${id(1)}:birthday`, 'app' as const]]));
  assert.equal(rows.find((r) => r.memberId === id(1))!.greeted, 'app');
  assert.equal(rows.find((r) => r.memberId === id(2))!.reach, 'email');
  assert.equal(rows.find((r) => r.memberId === id(13))!.greeted, null);
  assert.ok(c.CELEBRATION_ROLES.has('PASTOR') && c.CELEBRATION_ROLES.has('SUPER_ADMIN') && !c.CELEBRATION_ROLES.has('MINISTRY_LEADER'));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll celebration checks passed');
