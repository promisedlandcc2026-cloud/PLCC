/**
 * Fundraisers API handler — in-memory Supabase, fake auth and fake PLCC Tithe. No network.
 * Run: npx tsx scripts/fundraisers-handler-smoke.ts
 */
import { randomUUID } from 'crypto';
import { handleFundraisers } from '../api/_utils/fundraisersHandler';

let fails = 0;
const ok = (c: boolean, m: string, detail?: unknown) => {
  if (c) console.log('  OK:', m);
  else {
    fails++;
    console.error('  FAIL:', m, detail ?? '');
  }
};

// ---------------------------------------------------------------------------
// Minimal in-memory Supabase
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
const DEFAULTS: Record<string, Row> = {
  fundraisers: { status: 'open', goal_amount_cents: null, notes: null, tithe_fund_id: null, tithe_fund_name: null, tithe_synced_at: null, closed_at: null },
  fundraiser_charge_items: { active: true, sort_order: 0 },
  fundraiser_entries: { quantity: 1, owed_amount_cents: 0, received_amount_cents: 0, charge_item_id: null, charge_label: null, member_id: null, payment_method: null, notes: null, external_ref: null, match_dismissed: false },
  fundraiser_payments: { notes: null, external_ref: null, entered_by: null, dcb_status: null, dcb_voucher_id: null, dcb_error: null, dcb_synced_at: null },
  fundraiser_dcb_voids: { done_at: null, last_error: null },
};
const CASCADE: Record<string, Array<[string, string]>> = {
  fundraisers: [['fundraiser_entries', 'fundraiser_id'], ['fundraiser_charge_items', 'fundraiser_id']],
  fundraiser_entries: [['fundraiser_payments', 'entry_id']],
};

function makeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    fundraisers: [], fundraiser_charge_items: [], fundraiser_entries: [], fundraiser_payments: [], members: [], users: [],
    ...seed,
  };
  const removeCascade = (table: string, ids: string[]) => {
    for (const [child, col] of CASCADE[table] || []) {
      const doomed = tables[child].filter((r) => ids.includes(r[col])).map((r) => r.id);
      tables[child] = tables[child].filter((r) => !ids.includes(r[col]));
      removeCascade(child, doomed);
    }
  };
  const from = (table: string) => {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let countOnly = false;
    let lim: number | null = null;
    const filters: Array<(r: Row) => boolean> = [];
    const run = () => {
      const all = tables[table] || (tables[table] = []);
      if (op === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({
          id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          ...(DEFAULTS[table] || {}), ...r,
        }));
        for (const r of rows) {
          // Only entries have a unique external_ref (one Tithe gift can pay several pledges/charges)
          if (table === 'fundraiser_entries' && r.external_ref && all.some((x) => x.external_ref === r.external_ref)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
          }
        }
        all.push(...rows);
        return { data: rows.map((r) => ({ ...r })), error: null };
      }
      let rows = all.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        rows.forEach((r) => Object.assign(r, payload));
        return { data: rows.map((r) => ({ ...r })), error: null };
      }
      if (op === 'delete') {
        const ids = rows.map((r) => r.id);
        tables[table] = all.filter((r) => !ids.includes(r.id));
        removeCascade(table, ids);
        return { data: rows, error: null };
      }
      if (lim != null) rows = rows.slice(0, lim);
      if (countOnly) return { data: null, count: rows.length, error: null };
      return { data: rows.map((r) => ({ ...r })), error: null };
    };
    const b: any = {
      select: (_cols?: string, opts?: any) => { if (opts?.head) countOnly = true; return b; },
      insert: (rows: any) => { op = 'insert'; payload = rows; return b; },
      update: (patch: any) => { op = 'update'; payload = patch; return b; },
      delete: () => { op = 'delete'; return b; },
      eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return b; },
      neq: (c: string, v: any) => { filters.push((r) => r[c] !== v); return b; },
      is: (c: string, v: any) => { filters.push((r) => (r[c] ?? null) === v); return b; },
      in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return b; },
      not: (c: string, _o: string, _v: any) => { filters.push((r) => r[c] != null); return b; },
      ilike: (c: string, p: string) => { const pre = p.replace(/%$/, '').toLowerCase(); filters.push((r) => String(r[c] || '').toLowerCase().startsWith(pre)); return b; },
      or: () => b,
      order: () => b,
      limit: (n: number) => { lim = n; return b; },
      maybeSingle: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
      single: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  };
  return { tables, client: { from } };
}

function fakeRes() {
  const r: any = { statusCode: 0, body: null };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: any) => ((r.body = b), r);
  return r;
}

const audits: string[] = [];
let titheGifts: any[] = [];
let titheCalls = 0;
// Fake DCB
const dcbPosts: any[] = [];
const dcbVoids: any[] = [];
let dcbDown = false;

function caller(db: ReturnType<typeof makeDb>) {
  return async (role: string, method: string, action: string, body: any = {}, query: any = {}) => {
    const res = fakeRes();
    await handleFundraisers({ method, query: { action, ...query }, body, headers: {} }, res, {
      getSupabaseAdmin: () => db.client,
      requireAuth: async () => ({ user: { id: USER_ID[role] || 'u-' + role.toLowerCase(), email: null }, role }),
      logAudit: (async (a: any) => { audits.push(a.action); }) as any,
      isTitheSyncConfigured: () => true,
      titheSignedPost: (async (path: string) => {
        titheCalls++;
        if (path === 'funds') return { ok: true, funds: [{ id: 'fund-2nd', name: '2nd Floor Building Fund', active: true }] };
        return { ok: true, gifts: titheGifts };
      }) as any,
      isDcbConfigured: () => true,
      postToDcb: (async (payload: any) => {
        if (dcbDown) return { ok: false, voucherId: payload.voucherNumber, syncedAt: '', mock: false, error: 'connect ETIMEDOUT' };
        const duplicate = dcbPosts.some((x) => x.transactionId === payload.transactionId);
        if (!duplicate) dcbPosts.push(payload);
        return { ok: true, voucherId: payload.voucherNumber, syncedAt: '', mock: false, posted: true, duplicate };
      }) as any,
      voidInDcb: (async (voucherId: string, body: any) => {
        if (dcbDown) return { ok: false, error: 'connect ETIMEDOUT' };
        dcbVoids.push({ voucherId, ...body });
        return { ok: true };
      }) as any,
    });
    return res;
  };
}

const USER_ID: Record<string, string> = {
  ACCOUNTANT: randomUUID(),
  MEMBER: randomUUID(),
  KIOSK: randomUUID(),
  FINANCE: randomUUID(),
};
const MEMBER_A = randomUUID();
const MEMBER_B = randomUUID();

(async () => {
  const db = makeDb({
    members: [
      { id: MEMBER_A, first_name: 'Grace', last_name: 'Okello' },
      { id: MEMBER_B, first_name: 'Peter', last_name: 'Mukasa' },
    ],
    users: [
      { id: USER_ID.ACCOUNTANT, name: 'Ann Accountant', email: 'ann@example.org', role: 'ACCOUNTANT', fundraiser_access: false },
      { id: USER_ID.MEMBER, name: 'Mark Member', email: 'mark@example.org', role: 'MEMBER', fundraiser_access: false },
      { id: USER_ID.KIOSK, name: 'Kids Desk', email: 'desk@example.org', role: 'KIOSK', fundraiser_access: false },
    ],
  });
  const call = caller(db);

  console.log('\nAccess (by role, or the switch)');
  ok((await call('MEMBER', 'GET', 'list')).statusCode === 403, 'a member without the switch cannot open fundraisers');
  ok((await call('ACCOUNTANT', 'GET', 'list')).statusCode === 403, 'an accountant without the switch cannot open fundraisers');
  ok((await call('ADMIN_STAFF', 'GET', 'list')).statusCode === 403, 'admin staff (not listed) cannot open fundraisers');
  for (const r of ['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'FIRST_LADY', 'SECRETARY', 'ASST_SECRETARY', 'FINANCE']) {
    ok((await call(r, 'GET', 'list')).statusCode === 200, `${r} has access by role`);
  }
  let acc = await call('MEMBER', 'GET', 'access');
  ok(acc.statusCode === 200 && acc.body.allowed === false, 'access check says no for a plain member');

  ok((await call('MEMBER', 'POST', 'set-access', { userId: USER_ID.MEMBER, allowed: true })).statusCode === 403, 'a member cannot switch themselves on');
  ok((await call('SECRETARY', 'POST', 'set-access', { userId: USER_ID.MEMBER, allowed: true })).statusCode === 403, 'secretary cannot give the switch');
  ok((await call('FINANCE', 'POST', 'set-access', { userId: USER_ID.KIOSK, allowed: true })).statusCode === 400, 'a kids-desk login cannot get the switch');
  let sw = await call('FINANCE', 'POST', 'set-access', { userId: USER_ID.ACCOUNTANT, allowed: true });
  ok(sw.statusCode === 200, 'finance turns the switch on for the accountant');
  sw = await call('FIRST_LADY', 'POST', 'set-access', { userId: USER_ID.MEMBER, allowed: true });
  ok(sw.statusCode === 200, 'First Lady turns the switch on for a member who runs the fundraiser');
  ok((await call('ACCOUNTANT', 'GET', 'list')).statusCode === 200, 'accountant with the switch can open fundraisers');
  acc = await call('MEMBER', 'GET', 'access');
  ok(acc.body.allowed === true && acc.body.canManage === false && acc.body.canDelete === false, 'member with the switch: use only');
  const list = await call('FINANCE', 'GET', 'access-list');
  ok(list.body.people?.length === 2, 'who-has-access lists the two switch holders', list.body);
  ok((await call('ACCOUNTANT', 'GET', 'access-list')).statusCode === 403, 'switch holders cannot see or change who has access');

  const created = await call('MEMBER', 'POST', 'create', { title: '2nd Floor Building Fund', goalAmountCents: 500000 });
  ok(created.statusCode === 201, 'a member with the switch starts the fundraiser', created.body);
  const F = created.body.fundraiser.id;
  let up = await call('MEMBER', 'POST', 'update', { fundraiserId: F, goalAmountCents: 600000 });
  ok(up.statusCode === 200 && up.body.fundraiser.goal_amount_cents === 600000, 'switch holder edits the goal');
  up = await call('MEMBER', 'POST', 'update', { fundraiserId: F, titheFundId: 'fund-tithes', titheFundName: 'Tithes & Offerings' });
  ok(up.statusCode === 403, 'switch holder cannot link a Tithe fund (it shows donor names)');
  up = await call('MEMBER', 'POST', 'update', { fundraiserId: F, goalAmountCents: 500000 });

  let r = await call('ACCOUNTANT', 'POST', 'add-charge-item', { fundraiserId: F, label: 'Coming in late', amountCents: 2000 });
  ok(r.statusCode === 200, 'accountant with the switch adds "Coming in late" $20');
  r = await call('FINANCE', 'POST', 'add-charge-item', { fundraiserId: F, label: 'Leaving early', amountCents: 5000 });
  const late = r.body.chargeItems.find((i: any) => i.label === 'Coming in late');
  const early = r.body.chargeItems.find((i: any) => i.label === 'Leaving early');
  ok(Boolean(late && early), 'price list has both charges');

  console.log('\nEntries');
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'member', memberId: MEMBER_A, kind: 'paid', amountCents: 10000, paymentMethod: 'cash' });
  ok(r.statusCode === 201 && r.body.entries[0].display_name === 'Grace Okello', 'member gift $100 cash uses the member name', r.body);
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'member', memberId: MEMBER_A, kind: 'pledge', pledgedAmountCents: 50000, paidNowCents: 20000, paymentMethod: 'airtel' });
  ok(r.statusCode === 201, 'pledge $500 with $200 paid');
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'member', memberId: MEMBER_B, kind: 'charge', chargeItemId: late.id, quantity: 2 });
  ok(r.statusCode === 201, 'Peter charged Coming in late × 2 (owes)');
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'member', memberId: MEMBER_A, kind: 'charge', chargeItemId: early.id, paidNow: true, paymentMethod: 'mtn' });
  ok(r.statusCode === 201, 'Grace charged Leaving early, paid now');
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'visitor', displayName: 'Visitor Sam', kind: 'charge', chargeItemId: early.id, unitAmountCents: 3000 });
  ok(r.statusCode === 201, 'visitor charged with an adjusted price $30');
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'game', displayName: 'Bingo night', amountCents: 35000, paymentMethod: 'cash' });
  ok(r.statusCode === 201, 'game night cash $350');
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'member', memberId: MEMBER_A, kind: 'paid', amountCents: 500 });
  ok(r.statusCode === 400, 'a gift needs a payment method');
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'member', memberId: MEMBER_A, kind: 'pledge', pledgedAmountCents: 1000, paidNowCents: 2000, paymentMethod: 'cash' });
  ok(r.statusCode === 400, 'paid so far cannot exceed the pledge');

  let s = r.body.summary ?? (await call('ACCOUNTANT', 'GET', 'get', {}, { id: F })).body.summary;
  r = await call('ACCOUNTANT', 'GET', 'get', {}, { id: F });
  s = r.body.summary;
  ok(s.givenNowCents === 45000, 'given now = $100 + $350', s);
  ok(s.pledgedCents === 50000 && s.pledgePaidCents === 20000, 'pledged $500, $200 paid');
  ok(s.chargedCents === 4000 + 5000 + 3000 && s.chargePaidCents === 5000, 'charged $120, $50 paid');
  ok(s.totalRaisedCents === 45000 + 20000 + 5000, 'total raised $700', s.totalRaisedCents);
  ok(s.stillOwedCents === 30000 + 4000 + 3000, 'still owed $370', s.stillOwedCents);
  ok(s.goalLeftCents === 500000 - 70000, 'goal left $4,300');
  const grace = r.body.balances.find((p: any) => p.name === 'Grace Okello');
  const peter = r.body.balances.find((p: any) => p.name === 'Peter Mukasa');
  ok(grace?.leftCents === 30000 && peter?.leftCents === 4000, 'who owes: Grace $300, Peter $40', r.body.balances);
  ok(r.body.balances[0].name === 'Grace Okello', 'biggest balance first');
  const lateRow = r.body.charges.find((c: any) => c.label === 'Coming in late');
  ok(lateRow?.quantity === 2 && lateRow?.chargedCents === 4000, 'charge totals: Coming in late × 2 = $40');

  console.log('\nPayments and corrections');
  const peterCharge = r.body.entries.find((e: any) => e.display_name === 'Peter Mukasa');
  r = await call('ACCOUNTANT', 'POST', 'add-payment', { fundraiserId: F, entryId: peterCharge.id, amountCents: 5000, paymentMethod: 'cash' });
  ok(r.statusCode === 400, 'cannot pay more than is left');
  r = await call('ACCOUNTANT', 'POST', 'add-payment', { fundraiserId: F, entryId: peterCharge.id, amountCents: 2000, paymentMethod: 'cash' });
  ok(r.statusCode === 200 && r.body.balances.find((p: any) => p.name === 'Peter Mukasa')?.leftCents === 2000, 'Peter pays $20, owes $20');
  const peterPayment = r.body.entries.find((e: any) => e.id === peterCharge.id).payments[0];
  r = await call('ACCOUNTANT', 'POST', 'delete-payment', { fundraiserId: F, entryId: peterCharge.id, paymentId: peterPayment.id });
  ok(r.statusCode === 403, 'accountant cannot remove a payment');
  r = await call('FIRST_LADY', 'POST', 'delete-payment', { fundraiserId: F, entryId: peterCharge.id, paymentId: peterPayment.id });
  ok(r.statusCode === 200 && r.body.balances.find((p: any) => p.name === 'Peter Mukasa')?.leftCents === 4000, 'First Lady removes it; Peter owes $40 again');

  const gracePledge = r.body.entries.find((e: any) => e.kind === 'pledge');
  r = await call('ACCOUNTANT', 'POST', 'update-entry', { fundraiserId: F, entryId: gracePledge.id, pledgedAmountCents: 10000 });
  ok(r.statusCode === 400, 'a pledge cannot drop below what is paid');
  r = await call('ACCOUNTANT', 'POST', 'update-entry', { fundraiserId: F, entryId: gracePledge.id, pledgedAmountCents: 60000 });
  ok(r.statusCode === 200 && r.body.summary.pledgedCents === 60000, 'pledge raised to $600');
  const giftEntry = r.body.entries.find((e: any) => e.kind === 'paid' && e.display_name === 'Grace Okello');
  r = await call('ACCOUNTANT', 'POST', 'update-entry', { fundraiserId: F, entryId: giftEntry.id, amountCents: 12000, paymentMethod: 'check' });
  ok(r.statusCode === 200 && r.body.entries.find((e: any) => e.id === giftEntry.id).received_amount_cents === 12000, 'gift corrected to $120 by check');
  r = await call('ACCOUNTANT', 'POST', 'delete-entry', { fundraiserId: F, entryId: giftEntry.id });
  ok(r.statusCode === 403, 'accountant cannot delete an entry');

  console.log('\nAWC Tithe online gifts');
  r = await call('ACCOUNTANT', 'POST', 'update', { fundraiserId: F, titheFundId: 'fund-2nd', titheFundName: '2nd Floor Building Fund' });
  ok(r.statusCode === 403, 'accountant cannot link a Tithe fund');
  titheGifts = [
    { transactionId: 'pi_1', receiptNumber: 'PLCC-2026-000101', donorName: 'John Doe', amount: 75, refundedAmount: 0, paymentMethod: 'card', contributedAt: '2026-10-19T15:00:00Z', status: 'completed' },
    { transactionId: 'mg_2', receiptNumber: 'PLCC-2026-000102', donorName: 'Anonymous', amount: 40, refundedAmount: 0, paymentMethod: 'cash_app', contributedAt: '2026-10-19T16:00:00Z', status: 'completed' },
  ];
  r = await call('FINANCE', 'POST', 'update', { fundraiserId: F, titheFundId: 'fund-2nd', titheFundName: '2nd Floor Building Fund' });
  ok(r.statusCode === 200, 'finance links the Tithe fund');
  let online = r.body.entries.filter((e: any) => e.source_type === 'online');
  ok(online.length === 2 && r.body.summary.onlineCents === 11500, 'two online gifts ($115) appear right away', r.body.summary);
  ok(online.some((e: any) => e.payment_method === 'airtel' && e.display_name === 'Anonymous'), 'Airtel gift stays anonymous');

  r = await call('FINANCE', 'POST', 'sync-tithe', { fundraiserId: F });
  ok(r.body.entries.filter((e: any) => e.source_type === 'online').length === 2, 'syncing again adds no duplicates');

  titheGifts[0] = { ...titheGifts[0], refundedAmount: 25, status: 'refunded' };
  r = await call('FINANCE', 'POST', 'sync-tithe', { fundraiserId: F });
  const john = r.body.entries.find((e: any) => e.display_name === 'John Doe');
  ok(john?.received_amount_cents === 5000 && r.body.summary.onlineCents === 9000, 'a partial refund in Tithe lowers it to $50');
  r = await call('SUPER_ADMIN', 'POST', 'update-entry', { fundraiserId: F, entryId: john.id, notes: 'x' });
  ok(r.statusCode === 400, 'online gifts are read-only in the Vault');

  console.log('\n"Pay my balance" and matching');
  r = await call('ACCOUNTANT', 'GET', 'get', {}, { id: F });
  const owedBefore = r.body.summary.stillOwedCents;
  ok(r.body.balances.find((p: any) => p.name === 'Peter Mukasa')?.leftCents === 4000, 'Peter owes $40 before paying online');
  const gracePledgeRow = r.body.entries.find((e: any) => e.kind === 'pledge' && e.display_name === 'Grace Okello');
  ok(gracePledgeRow.payments.some((p: any) => p.recorded_by_name === 'Ann Accountant'), 'each payment shows who recorded it', gracePledgeRow.payments);

  // Peter pays $50 through his "Pay my balance" link
  titheGifts.push({ transactionId: 'pi_3', receiptNumber: 'PLCC-2026-000103', donorName: 'Peter M', amount: 50, refundedAmount: 0, paymentMethod: 'card', contributedAt: '2026-10-20T10:00:00Z', status: 'completed', externalRef: `frm:${F}.${MEMBER_B}` });
  r = await call('ACCOUNTANT', 'POST', 'sync-tithe', { fundraiserId: F });
  ok(!r.body.balances.some((p: any) => p.name === 'Peter Mukasa'), "Peter's $40 charge is paid by his Tithe payment");
  const over = r.body.entries.find((e: any) => e.source_type === 'online' && e.external_ref === 'tithe:pi_3');
  ok(over?.received_amount_cents === 1000, 'the extra $10 is kept as an online gift', over);
  ok(r.body.summary.stillOwedCents === owedBefore - 4000, 'still owed drops by $40');
  const peterCharge2 = r.body.entries.find((e: any) => e.display_name === 'Peter Mukasa' && e.kind === 'charge');
  ok(peterCharge2.payments.some((p: any) => p.recorded_by_name === 'PLCC Tithe'), 'Tithe payments show "PLCC Tithe" as the recorder');
  const snapshot = JSON.stringify(r.body.summary);
  r = await call('ACCOUNTANT', 'POST', 'sync-tithe', { fundraiserId: F });
  ok(JSON.stringify(r.body.summary) === snapshot, 'checking Tithe again changes nothing');

  // John's online gift ($50 after refund) had no link — match it to Grace's pledge by hand
  r = await call('ACCOUNTANT', 'POST', 'match-online', { fundraiserId: F, entryId: john.id, targetEntryIds: [gracePledgeRow.id] });
  ok(r.statusCode === 200, 'online gift matched to Grace', r.body);
  ok(r.body.balances.find((p: any) => p.name === 'Grace Okello')?.leftCents === 35000, "Grace's pledge drops from $400 to $350 left");
  ok(!r.body.entries.some((e: any) => e.id === john.id), 'the matched gift no longer shows as a separate gift');
  const matchedSummary = JSON.stringify(r.body.summary);
  r = await call('ACCOUNTANT', 'POST', 'sync-tithe', { fundraiserId: F });
  ok(JSON.stringify(r.body.summary) === matchedSummary, 'a matched gift is not added again on the next check');
  const graceTithePay = r.body.entries.find((e: any) => e.id === gracePledgeRow.id).payments.find((p: any) => p.external_ref === 'tithe:pi_1');
  r = await call('SUPER_ADMIN', 'POST', 'delete-payment', { fundraiserId: F, entryId: gracePledgeRow.id, paymentId: graceTithePay.id });
  ok(r.statusCode === 400, 'a Tithe payment cannot be deleted here (refund it in Tithe)');

  r = await call('ACCOUNTANT', 'GET', 'get', {}, { id: F });
  const anon = r.body.entries.find((e: any) => e.source_type === 'online' && e.display_name === 'Anonymous');
  r = await call('ACCOUNTANT', 'POST', 'keep-as-gift', { fundraiserId: F, entryId: anon.id });
  ok(r.statusCode === 200 && r.body.entries.find((e: any) => e.id === anon.id)?.match_dismissed === true, 'an online gift can be kept as a gift');
  ok((await call('ACCOUNTANT', 'POST', 'keep-as-gift', { fundraiserId: F, entryId: gracePledgeRow.id })).statusCode === 404, 'only online gifts can be kept as gifts');

  // Peter's payment is refunded in Tithe
  titheGifts[2] = { ...titheGifts[2], refundedAmount: 50, status: 'refunded' };
  r = await call('ACCOUNTANT', 'POST', 'sync-tithe', { fundraiserId: F });
  ok(r.body.balances.find((p: any) => p.name === 'Peter Mukasa')?.leftCents === 4000, 'after a full refund Peter owes $40 again');
  ok(!r.body.entries.some((e: any) => e.external_ref === 'tithe:pi_3'), 'and the extra $10 gift is gone');

  const callsBefore = titheCalls;
  await call('ACCOUNTANT', 'GET', 'get', {}, { id: F });
  ok(titheCalls === callsBefore, 'opening again within a minute does not re-ask Tithe');

  const tf = await call('FINANCE', 'GET', 'tithe-funds');
  ok(tf.body.funds?.[0]?.name === '2nd Floor Building Fund', 'Tithe funds listed for linking');
  ok((await call('ACCOUNTANT', 'GET', 'tithe-funds')).statusCode === 403, 'accountant cannot list Tithe funds');

  const search = await call('ACCOUNTANT', 'GET', 'member-search', {}, { q: 'Gra' });
  ok(search.body.members?.[0]?.name === 'Grace Okello' && Object.keys(search.body.members[0]).length === 2, 'member search returns names only');

  console.log('\nCash and check go to the DCB');
  {
    const pays = db.tables.fundraiser_payments;
    const byId = new Map(pays.map((p: any) => [p.id, p]));
    ok(dcbPosts.length > 0, 'hand-entered payments were sent to the DCB');
    ok(
      dcbPosts.every((x) => { const p: any = byId.get(String(x.transactionId).replace('fundraiser:', '')); return !p || !p.external_ref; }),
      'online gifts from PLCC Tithe are never sent from the Vault (Tithe already sent them)'
    );
    ok(pays.filter((p: any) => p.external_ref).every((p: any) => p.dcb_status == null), 'Tithe payment rows carry no DCB status');
    ok(pays.filter((p: any) => !p.external_ref && p.amount_cents >= 100).every((p: any) => p.dcb_status === 'posted'), 'every cash/check payment is marked In DCB', pays.map((p: any) => p.dcb_status));
    const first = dcbPosts[0];
    ok(first.donorName === 'Grace Okello' && first.amount === 100 && first.paymentMethod === 'cash' && first.fundraiserFund === true, 'first post: Grace, $100 cash, fundraiser fund', first);
    ok(/^PLCC-FR-/.test(first.voucherNumber) && /^fundraiser:/.test(first.transactionId), 'voucher and transaction id are fundraiser ones');

    const before = dcbPosts.length;
    r = await call('MEMBER', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'member', memberId: MEMBER_B, kind: 'pledge', pledgedAmountCents: 30000 });
    ok(r.statusCode === 201 && dcbPosts.length === before, 'a pledge with nothing paid sends nothing (not money yet)');
    const pledge = r.body.entries.find((e: any) => e.kind === 'pledge' && e.owed_amount_cents === 30000);
    r = await call('MEMBER', 'POST', 'add-payment', { fundraiserId: F, entryId: pledge.id, amountCents: 5000, paymentMethod: 'check' });
    ok(r.statusCode === 200 && dcbPosts.length === before + 1 && dcbPosts.at(-1).paymentMethod === 'check' && /Pledge payment/.test(dcbPosts.at(-1).memo), 'a $50 check on the pledge goes to the DCB');
    ok(dcbPosts.at(-1).fundName === '2nd Floor Building Fund', 'DCB fund is the linked Tithe fund / fundraiser name', dcbPosts.at(-1).fundName);

    r = await call('MEMBER', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'member', memberId: MEMBER_B, kind: 'paid', amountCents: 4000, paymentMethod: 'cash' });
    const gift = r.body.entries.find((e: any) => e.kind === 'paid' && e.received_amount_cents === 4000 && e.display_name === 'Peter Mukasa');
    const posts1 = dcbPosts.length;
    const voids0 = dcbVoids.length;
    ok(voids0 > 0, 'corrections made earlier (removed / changed payments) were taken back out of the DCB');
    r = await call('MEMBER', 'POST', 'update-entry', { fundraiserId: F, entryId: gift.id, amountCents: 4000, paymentMethod: 'cash', notes: 'thanks' });
    ok(r.statusCode === 200 && dcbVoids.length === voids0 && dcbPosts.length === posts1, 'editing only the notes does not touch the DCB');
    r = await call('MEMBER', 'POST', 'update-entry', { fundraiserId: F, entryId: gift.id, amountCents: 4500, paymentMethod: 'cash' });
    ok(r.statusCode === 200 && dcbVoids.length === voids0 + 1 && dcbPosts.length === posts1 + 1 && dcbPosts.at(-1).amount === 45, 'changing the amount takes the old one back out and sends the new one');

    const pledgePay = db.tables.fundraiser_payments.find((p: any) => p.entry_id === pledge.id);
    r = await call('PASTOR', 'POST', 'delete-payment', { fundraiserId: F, entryId: pledge.id, paymentId: pledgePay.id });
    ok(r.statusCode === 200 && dcbVoids.length === voids0 + 2 && dcbVoids.at(-1).transactionId === `fundraiser:${pledgePay.id}`, 'removing a payment takes it back out of the DCB');

    dcbDown = true;
    r = await call('MEMBER', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'game', displayName: 'Bake sale', amountCents: 3000, paymentMethod: 'cash' });
    const bake = db.tables.fundraiser_payments.find((p: any) => p.amount_cents === 3000 && !p.external_ref);
    ok(r.statusCode === 201 && bake?.dcb_status === 'failed' && Boolean(r.body.dcbWarning), 'DCB down: entry still saves, payment waits as failed, warning shown');
    ok(r.body.dcb?.failed?.count === 1, 'page summary shows 1 waiting on the DCB');
    dcbDown = false;
    bake.dcb_synced_at = new Date(Date.now() - 10 * 60_000).toISOString();
    r = await call('MEMBER', 'GET', 'get', {}, { id: F });
    ok(bake.dcb_status === 'posted' && r.body.dcb.failed.count === 0, 'opening the fundraiser later retries and it reaches the DCB');

    r = await call('MEMBER', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'game', displayName: 'Penny jar', amountCents: 50, paymentMethod: 'cash' });
    ok(db.tables.fundraiser_payments.find((p: any) => p.amount_cents === 50)?.dcb_status === 'not_sent', 'under $1.00 is not sent (DCB does not take it)');

    const earlierPay = db.tables.fundraiser_payments.find((p: any) => p.id === bake.id);
    earlierPay.dcb_status = 'before_link';
    const old = dcbPosts.findIndex((x) => x.transactionId === `fundraiser:${bake.id}`);
    dcbPosts.splice(old, 1);
    const posts2 = dcbPosts.length;
    r = await call('MEMBER', 'GET', 'get', {}, { id: F });
    ok(dcbPosts.length === posts2 && r.body.dcb.beforeLink.count === 1, 'payments from before the link are not sent on their own');
    ok((await call('MEMBER', 'POST', 'send-earlier-to-dcb', { fundraiserId: F })).statusCode === 403, 'only finance leaders send earlier payments');
    r = await call('FINANCE', 'POST', 'send-earlier-to-dcb', { fundraiserId: F });
    ok(r.statusCode === 200 && earlierPay.dcb_status === 'posted' && dcbPosts.length === posts2 + 1 && r.body.dcb.beforeLink.count === 0, 'finance sends earlier payments to the DCB');
  }

  console.log('\nClose and delete');
  r = await call('FINANCE', 'POST', 'update', { fundraiserId: F, status: 'closed' });
  ok(r.statusCode === 200 && r.body.fundraiser.status === 'closed', 'finance closes the fundraiser');
  r = await call('ACCOUNTANT', 'POST', 'add-entry', { fundraiserId: F, sourceType: 'game', displayName: 'Late cash', amountCents: 100, paymentMethod: 'cash' });
  ok(r.statusCode === 400, 'closed fundraiser takes no new entries');
  r = await call('ACCOUNTANT', 'POST', 'delete', { fundraiserId: F, confirmTitle: '2nd Floor Building Fund' });
  ok(r.statusCode === 403, 'accountant cannot delete the fundraiser');
  r = await call('PASTOR', 'POST', 'delete', { fundraiserId: F, confirmTitle: 'wrong' });
  ok(r.statusCode === 400, 'delete needs the exact name');
  r = await call('PASTOR', 'POST', 'delete', { fundraiserId: F, confirmTitle: '2nd floor building fund' });
  ok(r.statusCode === 200 && db.tables.fundraiser_entries.length === 0 && db.tables.fundraiser_payments.length === 0, 'Pastor deletes it; entries and payments go too');
  ok(audits.includes('FUNDRAISER_DELETED') && audits.includes('FUNDRAISER_PAYMENT_DELETED'), 'deletions are logged');
  ok(audits.includes('FUNDRAISER_ACCESS_GRANTED'), 'giving access is logged');

  sw = await call('PASTOR', 'POST', 'set-access', { userId: USER_ID.MEMBER, allowed: false });
  ok(sw.statusCode === 200 && (await call('MEMBER', 'GET', 'list')).statusCode === 403, 'switch off: the member loses access right away');
  ok(audits.includes('FUNDRAISER_ACCESS_REMOVED'), 'removing access is logged');

  if (fails) {
    console.error(`\n${fails} fundraiser handler check(s) failed.`);
    process.exit(1);
  }
  console.log('\nFundraiser handler checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
