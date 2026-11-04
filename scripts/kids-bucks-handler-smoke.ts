/**
 * PLCC Bucks API handler smoke — fake Supabase, no network.
 * Run: npx tsx scripts/kids-bucks-handler-smoke.ts
 */
import { handleKidsBucks } from '../api/_utils/kidsBucksHandler';

type Call = { fn: string; args: any };
let fails = 0;
const ok = (c: boolean, m: string) => {
  if (c) console.log('  OK:', m);
  else {
    fails++;
    console.error('  FAIL:', m);
  }
};

const CHILD = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'AWC1.' + 'a'.repeat(64);

function fakeDb(opts: { canAward?: boolean; canReverse?: boolean; missing?: boolean; awardResult?: any; decideResult?: any; cardMember?: string | null; tables?: Record<string, any> }) {
  const calls: Call[] = [];
  const tableData: Record<string, any> = {
    awc_bucks_reasons: [{ id: 'kindness', label: 'Showed kindness', amount: 15, sort_order: 20 }],
    awc_bucks_settings: { weekly_cap_per_child: 100, daily_cap_per_issuer_per_child: 60 },
    dependent_digital_cards: opts.cardMember ? { member_id: opts.cardMember, status: 'active' } : null,
    members: [{ id: CHILD, first_name: 'Micah', last_name: 'Ellis' }],
    ...(opts.tables || {}),
  };
  const builder = (table: string) => {
    const result = () => {
      const d = tableData[table];
      return { data: d ?? null, error: opts.missing ? { message: `relation "${table}" does not exist` } : null };
    };
    const b: any = {
      select: () => b, eq: () => b, in: () => b, gte: () => b, order: () => b, limit: () => b,
      maybeSingle: async () => {
        const r = result();
        return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data };
      },
      insert: async (rows: any) => {
        calls.push({ fn: `insert:${table}`, args: rows });
        return { data: rows, error: null };
      },
      then: (resolve: any) => resolve(result()),
    };
    return b;
  };
  return {
    calls,
    client: {
      from: builder,
      rpc: async (fn: string, args: any) => {
        calls.push({ fn, args });
        if (opts.missing) return { data: null, error: { message: `Could not find the function public.${fn}` } };
        if (fn === 'awc_bucks_can_award') return { data: opts.canAward === true, error: null };
        if (fn === 'awc_bucks_can_reverse') return { data: opts.canReverse === true, error: null };
        if (fn === 'awc_bucks_award') return { data: opts.awardResult ?? { ok: true, duplicate: false, entryId: 'e1', amount: 15, reasonLabel: 'Showed kindness', balance: 15 }, error: null };
        if (fn === 'awc_bucks_decide_recommendation') return { data: opts.decideResult ?? { ok: true }, error: null };
        if (fn === 'awc_bucks_set_caps') return { data: { ok: true }, error: null };
        if (fn === 'awc_bucks_reverse') return { data: { ok: true, amount: -15, balance: 0 }, error: null };
        return { data: null, error: null };
      },
    },
  };
}

function fakeRes() {
  const r: any = { statusCode: 0, body: null, headers: {} };
  r.setHeader = (k: string, v: string) => (r.headers[k] = v);
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: any) => ((r.body = b), r);
  return r;
}

async function run(role: string, db: ReturnType<typeof fakeDb>, req: any) {
  const res = fakeRes();
  await handleKidsBucks(req, res, {
    getSupabaseAdmin: () => db.client,
    requireAuth: async () => ({ user: { id: USER }, role }),
  });
  return res;
}

const awardReq = (body: any) => ({ method: 'POST', query: { action: 'award' }, body });

(async () => {
  console.log('\nRole gates');
  let db = fakeDb({ canAward: true });
  let res = await run('KIOSK', db, awardReq({ childId: CHILD, reasonId: 'kindness', idempotencyKey: 'tap-12345678' }));
  ok(res.statusCode === 403 && !db.calls.some((c) => c.fn === 'awc_bucks_award'), 'KIOSK login refused before any award');

  db = fakeDb({ canAward: false });
  res = await run('VOLUNTEER', db, awardReq({ childId: CHILD, reasonId: 'kindness', idempotencyKey: 'tap-12345678' }));
  ok(res.statusCode === 403 && !db.calls.some((c) => c.fn === 'awc_bucks_award'), 'VOLUNTEER (database says no) refused, no award call');

  db = fakeDb({ canAward: false });
  res = await run('MEMBER', db, { method: 'GET', query: { action: 'wallet', childId: CHILD } });
  ok(res.statusCode === 403, 'a parent cannot use the leader wallet endpoint (parents use kids-view)');

  db = fakeDb({ canAward: true, canReverse: false });
  res = await run('TEACHER', db, { method: 'POST', query: { action: 'reverse' }, body: { entryId: CHILD, note: 'x' } });
  ok(res.statusCode === 403 && !db.calls.some((c) => c.fn === 'awc_bucks_reverse'), 'TEACHER cannot reverse');

  db = fakeDb({ canAward: true, canReverse: true });
  res = await run('MINISTRY_LEADER', db, { method: 'PATCH', query: { action: 'caps' }, body: { weekly: 500, daily: 500 } });
  ok(res.statusCode === 403 && !db.calls.some((c) => c.fn === 'awc_bucks_set_caps'), 'only SUPER_ADMIN can change caps');

  db = fakeDb({ canAward: true, canReverse: true });
  res = await run('SUPER_ADMIN', db, { method: 'PATCH', query: { action: 'caps' }, body: { weekly: 120, daily: 80, by: 'someone-else' } });
  const caps = db.calls.find((c) => c.fn === 'awc_bucks_set_caps');
  ok(res.statusCode === 200 && caps?.args.p_by === USER, 'SUPER_ADMIN caps change is attributed to the signed-in user, not the body');

  console.log('\nThe browser cannot set amounts, balances or names');
  db = fakeDb({ canAward: true });
  res = await run('SUNDAY_SCHOOL_TEACHER', db, awardReq({
    childId: CHILD, reasonId: 'kindness', idempotencyKey: 'tap-12345678',
    amount: 999, balance: 999, issuedBy: 'attacker', issuedByName: 'Pastor', p_issued_by: 'x',
  }));
  const award = db.calls.find((c) => c.fn === 'awc_bucks_award');
  ok(res.statusCode === 200, 'award succeeds');
  ok(JSON.stringify(Object.keys(award?.args || {}).sort()) === JSON.stringify(['p_child_member_id', 'p_idempotency_key', 'p_issued_by', 'p_note', 'p_reason_id']), 'only child, reason, key, note and the signed-in user reach the database');
  ok(award?.args.p_issued_by === USER, 'issuer is always the signed-in user');

  console.log('\nInput checks');
  db = fakeDb({ canAward: true });
  res = await run('TEACHER', db, awardReq({ childId: CHILD, reasonId: 'Kindness!!', idempotencyKey: 'tap-12345678' }));
  ok(res.statusCode === 400 && res.body.code === 'unknown_reason', 'malformed reason refused');
  res = await run('TEACHER', db, awardReq({ childId: CHILD, reasonId: 'kindness', idempotencyKey: 'x' }));
  ok(res.statusCode === 400, 'missing / short idempotency key refused');
  res = await run('TEACHER', db, awardReq({ cardToken: 'not-a-card', reasonId: 'kindness', idempotencyKey: 'tap-12345678' }));
  ok(res.statusCode === 400 && res.body.code === 'invalid_card', 'bad card code refused');

  db = fakeDb({ canAward: true, cardMember: CHILD });
  res = await run('TEACHER', db, awardReq({ cardToken: TOKEN, reasonId: 'kindness', idempotencyKey: 'tap-12345678' }));
  ok(res.statusCode === 200 && db.calls.find((c) => c.fn === 'awc_bucks_award')?.args.p_child_member_id === CHILD, 'scanned Family Pass resolves to the child');

  db = fakeDb({ canAward: true, cardMember: null });
  res = await run('TEACHER', db, awardReq({ cardToken: TOKEN, reasonId: 'kindness', idempotencyKey: 'tap-12345678' }));
  ok(res.statusCode === 404 && !db.calls.some((c) => c.fn === 'awc_bucks_award'), 'unknown card → 404, nothing awarded');

  console.log('\nCaps and setup');
  db = fakeDb({ canAward: true, awardResult: { ok: false, code: 'weekly_cap', remaining: 5 } });
  res = await run('TEACHER', db, awardReq({ childId: CHILD, reasonId: 'kindness', idempotencyKey: 'tap-12345678' }));
  ok(res.statusCode === 409 && /this week/.test(res.body.error) && res.body.remaining === 5, 'weekly cap → friendly 409 with Bucks left');

  db = fakeDb({ missing: true });
  res = await run('TEACHER', db, { method: 'GET', query: { action: 'me' } });
  ok(res.statusCode === 503 && res.body.code === 'bucks_unavailable', 'before the migration runs: clear "not set up yet" message');

  console.log('\nParent earn notice');
  const ENTRY = '33333333-3333-4333-8333-333333333333';
  const PARENT = '44444444-4444-4444-8444-444444444444';
  const ADULT = '55555555-5555-4555-8555-555555555555';
  const CARD = 'AWCD.' + 'ab'.repeat(32);
  const noticeTables = {
    dependent_digital_cards: { member_id: CHILD, status: 'active', card_ref: CARD },
    guardian_relationships: [{ guardian_user_id: PARENT }, { guardian_user_id: USER }],
    household_members: [
      { household_id: '66666666-6666-4666-8666-666666666666', member_id: CHILD, relationship_type: 'child' },
      { household_id: '66666666-6666-4666-8666-666666666666', member_id: '77777777-7777-4777-8777-777777777777', relationship_type: 'parent' },
    ],
    user_member_links: [{ user_id: ADULT }, { user_id: USER }],
  };
  db = fakeDb({
    canAward: true,
    awardResult: { ok: true, duplicate: false, entryId: ENTRY, amount: 15, reasonLabel: 'Showed kindness', balance: 15 },
    tables: noticeTables,
  });
  res = await run('TEACHER', db, awardReq({ childId: CHILD, reasonId: 'kindness', idempotencyKey: 'tap-12345678' }));
  const notices = db.calls.filter((c) => c.fn === 'insert:user_notifications').flatMap((c) => c.args);
  ok(res.statusCode === 200 && notices.length === 2, 'a new award notifies the guardian and the household adult');
  ok(notices.every((n: any) => n.user_id !== USER && n.type === 'kids_bucks_award' && n.source_id === ENTRY), 'the person who gave the Bucks is skipped, once per ledger entry');
  ok(notices.every((n: any) => n.link === `/family/kids/${CARD}` && n.title.includes('Micah') && n.body.includes('15') && n.body.includes('Showed kindness')), 'title, body, and link use the first name, amount, reason, and card ref');
  ok(notices.every((n: any) => !JSON.stringify(n).includes(CHILD)), 'the notice does not include the child id');

  db = fakeDb({
    canAward: true,
    awardResult: { ok: true, duplicate: true, entryId: ENTRY, amount: 15, reasonLabel: 'Showed kindness', balance: 15 },
    tables: noticeTables,
  });
  res = await run('TEACHER', db, awardReq({ childId: CHILD, reasonId: 'kindness', idempotencyKey: 'tap-12345678' }));
  ok(res.statusCode === 200 && !db.calls.some((c) => c.fn === 'insert:user_notifications'), 'a duplicate tap does not send a second notice');

  db = fakeDb({
    canAward: true,
    decideResult: { ok: true, entryId: ENTRY, reasonLabel: 'Showed kindness' },
    tables: {
      ...noticeTables,
      awc_bucks_ledger: [{ id: ENTRY, child_member_id: CHILD, amount: 15, reason_label: 'Showed kindness' }],
    },
  });
  res = await run('TEACHER', db, { method: 'POST', query: { action: 'decide-recommendation' }, body: { recommendationId: ENTRY, approve: true } });
  const decided = db.calls.filter((c) => c.fn === 'insert:user_notifications');
  ok(res.statusCode === 200 && decided.length === 2, 'an approved recommendation notifies the same linked parents');
  res = await run('TEACHER', db, { method: 'POST', query: { action: 'decide-recommendation' }, body: { recommendationId: ENTRY, approve: false } });
  ok(db.calls.filter((c) => c.fn === 'insert:user_notifications').length === 2, 'turning a recommendation down does not notify');

  console.log(fails ? `\n${fails} FAILED` : '\nAll Kids Bucks handler checks passed.');
  process.exit(fails ? 1 : 0);
})();
