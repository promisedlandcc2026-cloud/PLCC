/**
 * Event RSVP → PLCC Tithe: one-step "Sign up & pay", the guest's status after Tithe,
 * and payment settings for any future event.
 * Run: npx tsx scripts/rsvp-tithe-flow-smoke.ts
 */
import { readFileSync } from 'fs';
import { readFileSync } from 'node:fs';
import {
  buildTitheRsvpPayUrl,
  parseGiftPaymentChoice,
  rsvpPartyLine,
  rsvpPayStatus,
  rsvpReturnUrl,
  shortEventDate,
} from '../api/_utils/rsvpGiftPayment';
import { parseRsvpContribution, rsvpGiftOptions } from '../api/_utils/cookoutFoodContribution';
import { runtimeConfigFromDbEvent, publicRsvpConfigPayload } from '../api/_utils/eventRsvpConfig';
import { THANKSGIVING_2026_EVENT_ID, DEFAULT_FELLOWSHIP_EVENT_ID } from '../api/_utils/fellowshipEventConfig';

let failed = 0;
function assert(cond: unknown, label: string, detail?: unknown) {
  if (cond) console.log(`  OK: ${label}`);
  else {
    failed++;
    console.error(`  FAIL: ${label}`, detail ?? '');
  }
}

const REG = '0b9f2a3e-1c4d-4e5f-8a6b-7c8d9e0f1a2b';

// Pay link carries everything Tithe needs to pre-fill and send the guest back.
const back = rsvpReturnUrl('https://plcc-opal.vercel.app/', THANKSGIVING_2026_EVENT_ID, REG);
assert(back === `https://plcc-opal.vercel.app/#/events/${THANKSGIVING_2026_EVENT_ID}/rsvp?r=${REG}`, 'return address is the RSVP page with r=', back);
const url = new URL(
  buildTitheRsvpPayUrl({
    registrationId: REG,
    amount: 40,
    label: 'Thanksgiving RSVP',
    fund: 'Thanksgiving Dinner 2026',
    name: 'Jerless Mahabir',
    email: 'guest@example.com',
    detail: rsvpPartyLine({ name: 'Jerless Mahabir', adults: 3, children: 2, guests: 0, dateLabel: shortEventDate('2026-11-22') }),
    returnUrl: back,
  })
);
assert(url.origin === 'https://plcc-tithe.vercel.app', 'goes to PLCC Tithe');
assert(url.searchParams.get('ref') === `rsvp:${REG}`, 'ref ties the payment to the RSVP');
assert(url.searchParams.get('amount') === '40.00', 'amount');
assert(url.searchParams.get('fund') === 'Thanksgiving Dinner 2026', 'event fund');
assert(url.searchParams.get('name') === 'Jerless Mahabir' && url.searchParams.get('email') === 'guest@example.com', 'name + email pre-filled');
assert(url.searchParams.get('who') === 'Jerless M. · 3 adults, 2 children · Sun, Nov 22', 'party line', url.searchParams.get('who'));
assert(url.searchParams.get('return') === back, 'return address');
assert(!url.searchParams.has('method'), 'no method: guest picks it on Tithe');

// Pay now no longer needs a method from the RSVP; pledge still works; bad values refused.
const payNow = parseGiftPaymentChoice({ food_contribution_intent: 'pay_now' });
assert(payNow.ok && payNow.intent === 'pay_now' && payNow.method === null, 'pay now without a method');
assert(parseGiftPaymentChoice({ food_contribution_intent: 'pay_now', food_contribution_payment_method: 'venmo' }).ok, 'older form with venmo still accepted');
assert(!parseGiftPaymentChoice({ food_contribution_intent: 'pay_now', food_contribution_payment_method: 'paypal' }).ok, 'unknown method refused');

// Contribution: whole dollars from the event minimum.
assert(parseRsvpContribution('40', 20).ok, '$40 ok');
assert(parseRsvpContribution('33', 20).ok, 'Other amount $33 ok');
assert(!parseRsvpContribution('15', 20).ok, 'under minimum refused');
assert(!parseRsvpContribution('25.50', 20).ok, 'cents refused');
assert(!parseRsvpContribution('5000', 20).ok, 'over $1,000 refused');
assert(JSON.stringify(rsvpGiftOptions(20)) === '[20,40,60,100]', 'default buttons from $20');
assert(JSON.stringify(rsvpGiftOptions(25, [100, 10, 50, 50])) === '[50,100]', 'saved buttons cleaned (min, dupes, order)');

// Status the guest sees after Tithe.
assert(rsvpPayStatus({ paid: true }) === 'paid', 'paid');
assert(rsvpPayStatus({ titheStatus: 'processing', titheMethod: 'zelle' }) === 'waiting', 'Zelle waits for Finance');
assert(rsvpPayStatus({ titheStatus: 'processing', titheMethod: 'venmo' }) === 'waiting', 'Venmo waits for Finance');
assert(rsvpPayStatus({ titheStatus: 'processing', titheMethod: 'us_bank_account' }) === 'processing', 'bank is processing');
assert(rsvpPayStatus({ intent: 'pledge' }) === 'pledged', 'pledged');
assert(rsvpPayStatus({ intent: 'pay_now', titheStatus: 'started' }) === 'due', 'started but unfinished is due');

// Future events: payments come from the event's own settings.
const base = { name: 'Fall Fellowship 2027', date: '2027-10-10', rsvp_enabled: true, rsvp_template: 'fellowship' };
const on = runtimeConfigFromDbEvent({ id: '11111111-2222-4333-8444-555555555555', ...base, rsvp_payments_enabled: true, rsvp_gift_min: 25, rsvp_gift_options: [25, 50], rsvp_allow_pledge: false });
assert(on?.paymentChoiceEnabled === true, 'new event: payments on');
assert(on?.giftMin === 25 && JSON.stringify(on?.giftOptions) === '[25,50]', 'new event: its minimum and buttons');
assert(on?.allowPledge === false, 'new event: pledges off');
assert(on?.fundName === 'Fall Fellowship 2027', 'new event: Tithe fund is the event name');
assert(publicRsvpConfigPayload(on!).fundName === 'Fall Fellowship 2027', 'public config carries the fund');
const off = runtimeConfigFromDbEvent({ id: '11111111-2222-4333-8444-555555555556', ...base });
assert(off?.paymentChoiceEnabled === false, 'event without settings: payments off (until set)');
const tg = runtimeConfigFromDbEvent({ id: THANKSGIVING_2026_EVENT_ID, name: 'Join us at PLCC Table of Thanksgiving 2026', date: '2026-11-22', rsvp_enabled: true, rsvp_template: 'fellowship' });
assert(tg?.paymentChoiceEnabled === true && tg?.allowPledge === true, 'Thanksgiving keeps payments + pledges before settings are saved');
assert(tg?.fundName === 'PLCC GRAND FAMILY CELEBRATION 2026', 'Grand Family Celebration fund name');
const tgOff = runtimeConfigFromDbEvent({ id: THANKSGIVING_2026_EVENT_ID, name: 'x', date: '2026-11-22', rsvp_enabled: true, rsvp_template: 'fellowship', rsvp_payments_enabled: false });
assert(tgOff?.paymentChoiceEnabled === false, 'staff can turn payments off for a built-in event');
const cookout = runtimeConfigFromDbEvent({ id: DEFAULT_FELLOWSHIP_EVENT_ID, name: 'Fellowship Cookout', date: '2026-09-20', rsvp_enabled: true, rsvp_template: 'fellowship' });
assert(cookout?.paymentChoiceEnabled === false, 'Cookout unchanged (no payments)');

// Wiring
const core = readFileSync('api/_utils/core.ts', 'utf8');
assert(/subResource === 'rsvp-status'/.test(core), 'public rsvp-status endpoint');
assert(/connectEventTitheFund/.test(core), 'saving an event sets up its Tithe fund');
assert(/'rsvp_gift_options'/.test(core), 'event save keeps payment settings');
const page = readFileSync('pages/events/FellowshipCookoutRsvp.tsx', 'utf8');
assert(/window\.location\.assign\(url\)/.test(page), 'Sign up & pay goes straight to Tithe');
assert(/RsvpStatusPanel/.test(page), 'status panel after Tithe');
const sql = readFileSync('supabase/migrations/event_rsvp_payments.sql', 'utf8');
assert(/rsvp_payments_enabled/.test(sql) && /rsvp_gift_options integer\[\]/.test(sql), 'migration adds the columns');

{
  const sync = readFileSync('api/_utils/titheRsvpSync.ts', 'utf8');
  const core = readFileSync('api/_utils/core.ts', 'utf8');
  assert(/titheSignedPost\('rsvp-gift-fund'/.test(sync), 'RSVP list asks Tithe to move misfiled RSVP gifts');
  assert(/repairTitheRsvpGiftFunds\(rsvpFund, rows\)/.test(core), 'repair runs when staff open the RSVP list');
}

if (failed) {
  console.error(`\n${failed} RSVP → Tithe check(s) failed.`);
  process.exit(1);
}
console.log('\nRSVP → Tithe flow checks passed.');
