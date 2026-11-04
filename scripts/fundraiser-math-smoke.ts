/**
 * Fundraiser calculator checks.  Run: npx tsx scripts/fundraiser-math-smoke.ts
 */
import {
  allocatePayment,
  buildFundraiserPayLink,
  parseFundraiserBalanceRef,
  balancesByPerson,
  chargeBreakdown,
  dollarsToCents,
  summarizeFundraiser,
  type FundraiserEntryLike,
} from '../lib/fundraiserMath';

let failed = 0;
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

const e = (p: Partial<FundraiserEntryLike> & Pick<FundraiserEntryLike, 'id' | 'kind'>): FundraiserEntryLike => ({
  source_type: 'member',
  display_name: 'Someone',
  owed_amount_cents: 0,
  received_amount_cents: 0,
  ...p,
});

const entries: FundraiserEntryLike[] = [
  // Gifts given now
  e({ id: 'g1', kind: 'paid', member_id: 'm1', display_name: 'Grace', received_amount_cents: 10000 }),
  e({ id: 'g2', kind: 'paid', source_type: 'game', display_name: 'Bingo night', received_amount_cents: 35000 }),
  e({ id: 'g3', kind: 'paid', source_type: 'online', display_name: 'John (online)', received_amount_cents: 5000 }),
  // Pledges
  e({ id: 'p1', kind: 'pledge', member_id: 'm1', display_name: 'Grace', owed_amount_cents: 50000, received_amount_cents: 20000 }),
  e({ id: 'p2', kind: 'pledge', member_id: 'm2', display_name: 'Peter', owed_amount_cents: 30000, received_amount_cents: 30000 }),
  // Fun charges
  e({ id: 'c1', kind: 'charge', member_id: 'm2', display_name: 'Peter', charge_item_id: 'late', charge_label: 'Coming in late', quantity: 1, owed_amount_cents: 2000 }),
  e({ id: 'c2', kind: 'charge', member_id: 'm3', display_name: 'Mary', charge_item_id: 'late', charge_label: 'Coming in late', quantity: 2, owed_amount_cents: 4000, received_amount_cents: 2000 }),
  e({ id: 'c3', kind: 'charge', member_id: 'm1', display_name: 'Grace', charge_item_id: 'early', charge_label: 'Leaving early', quantity: 1, owed_amount_cents: 5000, received_amount_cents: 5000 }),
  e({ id: 'c4', kind: 'charge', source_type: 'visitor', display_name: 'Visitor Sam', charge_item_id: 'early', charge_label: 'Leaving early', owed_amount_cents: 5000 }),
];

const s = summarizeFundraiser(entries, 200000);
ok(s.givenNowCents === 50000, 'given now = gifts + game + online', s.givenNowCents);
ok(s.onlineCents === 5000 && s.gameCents === 35000, 'online and game split');
ok(s.pledgedCents === 80000 && s.pledgePaidCents === 50000, 'pledged 800, paid 500');
ok(s.chargedCents === 16000 && s.chargePaidCents === 7000, 'charged 160, paid 70');
ok(s.totalRaisedCents === 50000 + 50000 + 7000, 'total raised = given + pledge paid + charge paid', s.totalRaisedCents);
ok(s.stillOwedCents === 30000 + 2000 + 2000 + 5000, 'still owed = 300 + 20 + 20 + 50', s.stillOwedCents);
ok(s.expectedTotalCents === s.totalRaisedCents + s.stillOwedCents, 'expected = raised + owed');
ok(s.goalLeftCents === 200000 - 107000, 'goal left = goal − raised', s.goalLeftCents);
ok(s.goalLeftAfterOwedCents === 200000 - 107000 - 39000, 'goal left after owed', s.goalLeftAfterOwedCents);
ok(s.percentRaised === 53, 'percent raised floors', s.percentRaised);
ok(s.peopleOwingCount === 4, 'four people owe (Grace, Peter, Mary, Sam)', s.peopleOwingCount);

const people = balancesByPerson(entries);
ok(people[0].name === 'Grace' && people[0].leftCents === 30000, 'Grace owes most (pledge 300 left)', people[0]);
ok(people.find((p) => p.name === 'Peter')?.leftCents === 2000, 'Peter owes only the late charge');
ok(people.find((p) => p.name === 'Mary')?.lines[0].label === 'Coming in late × 2', 'quantity shown in line label');
ok(!people.some((p) => p.leftCents === 0), 'people who are paid up are not listed');
ok(people.reduce((a, p) => a + p.leftCents, 0) === s.stillOwedCents, 'people balances add up to still owed');

const charges = chargeBreakdown(entries);
const late = charges.find((c) => c.label === 'Coming in late');
ok(late?.count === 2 && late?.quantity === 3 && late?.chargedCents === 6000 && late?.leftCents === 4000, 'late: 2 entries, 3 times, $60, $40 left', late);
const early = charges.find((c) => c.label === 'Leaving early');
ok(early?.chargedCents === 10000 && early?.paidCents === 5000, 'early: $100 charged, $50 paid', early);

// overpaid entries never count more than owed toward pledges/charges
const over = summarizeFundraiser([e({ id: 'x', kind: 'pledge', owed_amount_cents: 1000, received_amount_cents: 1500 })]);
ok(over.pledgePaidCents === 1000 && over.stillOwedCents === 0, 'overpayment is capped at the pledge');

ok(dollarsToCents('$1,234.50') === 123450, 'parses $1,234.50');
ok(dollarsToCents('20') === 2000, 'parses 20');
ok(Number.isNaN(dollarsToCents('abc')) && Number.isNaN(dollarsToCents('1.234')), 'rejects bad amounts');
ok(summarizeFundraiser([], null).goalLeftCents === null, 'no goal → no goal math');

// Applying a payment across open items
let alloc = allocatePayment([{ entryId: 'p', leftCents: 30000 }, { entryId: 'c', leftCents: 2000 }], 31000);
ok(alloc.allocations[0].amountCents === 30000 && alloc.allocations[1].amountCents === 1000 && alloc.remainderCents === 0, 'pays the pledge first, then the charge');
alloc = allocatePayment([{ entryId: 'p', leftCents: 3000 }], 5000);
ok(alloc.remainderCents === 2000, 'extra beyond what is owed is kept as a gift');
alloc = allocatePayment([{ entryId: 'done', leftCents: 0 }, { entryId: 'c', leftCents: 500 }], 500);
ok(alloc.allocations.length === 1 && alloc.allocations[0].entryId === 'c', 'paid-up items are skipped');

const F = '11111111-2222-4333-8444-555555555555';
const M = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const link = buildFundraiserPayLink({ fundraiserId: F, fundraiserTitle: '2nd Floor Building Fund', titheFundId: 'fund-2nd', person: people[0] as any });
ok(Boolean(link && link.includes('amount=300.00') && link.includes('fund=fund-2nd')), 'pay link carries the balance and fund', link);
ok(buildFundraiserPayLink({ fundraiserId: F, fundraiserTitle: 'x', titheFundId: '', person: people[0] as any }) === null, 'no pay link without a linked Tithe fund');
const parsed = parseFundraiserBalanceRef(`frm:${F}.${M}`);
ok(parsed?.kind === 'member' && parsed.fundraiserId === F && parsed.id === M, 'member balance ref parses');
ok(parseFundraiserBalanceRef('rsvp:abc') === null, 'other refs are ignored');

if (failed) {
  console.error(`\n${failed} fundraiser math check(s) failed.`);
  process.exit(1);
}
console.log('\nFundraiser math checks passed.');
