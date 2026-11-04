/**
 * Smoke: Holiday RSVPs · 2026 nav + Thanksgiving fellowship config.
 * Run: npx tsx scripts/fellowship-holiday-rsvp-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FELLOWSHIP_EVENT_ID,
  MARRIEDS_DINNER_2026_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
  getFellowshipEventConfig,
  isFellowshipRsvpClosed,
  listFellowshipEvents,
} from '../api/_utils/fellowshipEventConfig.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let failed = 0;
function assert(cond: unknown, label: string) {
  if (cond) {
    console.log(`  OK: ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL: ${label}`);
  }
}

console.log('\nFellowship holiday RSVP smoke');

const simpleNav = read('lib/simpleNav.tsx');
const navBySection = read('lib/navBySection.tsx');
const overview = read('pages/events/Overview.tsx');
const core = read('api/_utils/core.ts');
const rsvpConfig = read('api/_utils/eventRsvpConfig.ts');
const app = read('App.tsx');
const migration = read('supabase/migrations/add_thanksgiving_2026_rsvp.sql');
const paymentMigration = read('supabase/migrations/add_thanksgiving_gift_payment_choice.sql');
const sidebar = read('components/Layout/Sidebar.tsx');
const publicRsvp = read('pages/events/FellowshipCookoutRsvp.tsx');

// Sidebar: one "Event RSVPs" entry (events picked on the page; deleted RSVPs disappear).
assert(/label: 'Event RSVPs'/.test(simpleNav), 'N: simpleNav Event RSVPs entry');
assert(/path: '\/events\/cookout-rsvps'/.test(simpleNav), 'N: simpleNav opens the RSVP list');
assert(/label: 'Event RSVPs'/.test(navBySection), 'N: navBySection Event RSVPs entry');
assert(/NestedNavItem/.test(sidebar), 'N: Sidebar nested submenu');
assert(/Grand Family Celebration RSVP/.test(overview), 'U: Overview public Grand Family Celebration RSVP button');
assert(/Marrieds Dinner RSVP/.test(overview), 'U: Overview public Marrieds Dinner RSVP button');
assert(/Staff RSVP lists/.test(overview), 'U: Overview Super Admin staff lists');
assert(/listFellowshipEvents/.test(overview), 'U: Overview lists fellowship events');
assert(/thanksgiving-rsvp/.test(app), 'A: /thanksgiving-rsvp alias route');
assert(/marrieds-dinner-rsvp/.test(app), 'A: /marrieds-dinner-rsvp alias route');
const dashboard = read('pages/Dashboard.tsx');
assert(/THANKSGIVING_PROMO_KEY/.test(dashboard), 'U: Home Thanksgiving promo');
assert(/navigate\('\/thanksgiving-rsvp'\)/.test(dashboard), 'U: Home promo opens public Thanksgiving RSVP');
const permissions = read('lib/permissions.ts');
assert(
  /'\/thanksgiving-rsvp': ALL_APP_ROLES/.test(permissions),
  'P: Thanksgiving RSVP allowed for all app roles'
);
assert(
  /'\/marrieds-dinner-rsvp': ALL_APP_ROLES/.test(permissions),
  'P: Marrieds Dinner RSVP allowed for all app roles'
);
// Old migration seeded the original built-in id (no longer the live Thanksgiving event).
assert(/a1b2c3d4-e5f6-4789-a012-202611221400/.test(migration), 'M: seed uses legacy Thanksgiving UUID');
assert(/Join us at PLCC Table of Thanksgiving 2026/.test(migration), 'M: seed uses Thanksgiving name');
const marriedsMigration = read('supabase/migrations/add_marrieds_dinner_2026_rsvp.sql');
assert(/The Marrieds Dinner 2026/.test(marriedsMigration), 'M: Marrieds seed name');
// Moved to the live Dec 27 calendar event (the Dec 12 built-in copy was deleted Nov 1, 2026)
const marriedsMove = read('supabase/migrations/marrieds_dinner_2026_dec27.sql');
assert(new RegExp(MARRIEDS_DINNER_2026_EVENT_ID).test(marriedsMove), 'M: Marrieds Dec 27 setup uses the live event id');
assert(/rsvp_template = 'fellowship'/.test(marriedsMove) && /ARRAY\[100\]/.test(marriedsMove), 'M: Marrieds Dec 27 is fellowship kit, $100 per person');
assert(/cfg\.tshirtsEnabled/.test(core), 'A: t-shirt required only when enabled');
assert(/MAX_TIMEOUT_MS/.test(publicRsvp), 'U: close timer avoids 32-bit setTimeout overflow');

const tg = getFellowshipEventConfig(THANKSGIVING_2026_EVENT_ID);
assert(tg.eventId === THANKSGIVING_2026_EVENT_ID, 'L: thanksgiving id');
assert(tg.name === 'PLCC GRAND FAMILY CELEBRATION 2026', 'L: renamed to PLCC Grand Family Celebration 2026');
assert(tg.date === '2026-12-06', 'L: thanksgiving date (moved to Dec 6)');
assert(tg.giftMin === 20, 'L: thanksgiving giftMin $20');
assert(tg.tshirtsEnabled === false, 'L: thanksgiving no t-shirts');
assert(tg.paymentChoiceEnabled === true, 'L: thanksgiving payment choice enabled');
assert(
  Array.isArray(tg.paymentMethods) && tg.paymentMethods.some((m) => m.id === 'zelle'),
  'L: thanksgiving has Zelle'
);
assert(
  // Send-to details (Cash App, Zelle) live in PLCC Tithe now — one source of truth.
  tg.paymentMethods!.some((m) => m.id === 'cashapp' && m.value === 'PLCC Tithe'),
  'L: thanksgiving Cash App goes through PLCC Tithe'
);
assert(
  tg.paymentMethods!.some((m) => m.id === 'venmo' && !m.live),
  'L: thanksgiving Venmo placeholder'
);
assert(tg.location === '2nd Floor Sanctuary', 'L: thanksgiving location');
assert(tg.maxAdultsFromHome >= 3, 'L: thanksgiving allows adult children in adults count');
assert(/Grand Family Celebration/i.test(tg.submitLabel), 'L: Grand Family Celebration submit label');
assert(Array.isArray(tg.menuItems) && tg.menuItems.includes('Turkey'), 'L: thanksgiving menu includes Turkey');
assert(tg.menuItems!.includes('Matooke'), 'L: thanksgiving menu includes Matooke');
assert(
  !isFellowshipRsvpClosed(tg, Date.parse('2026-10-05T18:00:00Z')),
  'L: Thanksgiving still open on Oct 5 2026'
);
assert(
  !isFellowshipRsvpClosed(tg, Date.parse('2026-11-17T05:00:00Z')),
  'L: Thanksgiving still open Nov 17 2026 (moved to Dec 6)'
);
assert(
  isFellowshipRsvpClosed(tg, Date.parse('2026-12-05T05:00:00Z')),
  'L: Thanksgiving closed after Dec 4 2026'
);

const cookout = getFellowshipEventConfig(DEFAULT_FELLOWSHIP_EVENT_ID);
assert(cookout.tshirtsEnabled === true, 'L: cookout still has t-shirts');
assert(!cookout.paymentChoiceEnabled, 'L: cookout has no payment choice UI');
assert(/paymentChoiceEnabled/.test(rsvpConfig), 'C: public config exposes paymentChoiceEnabled');
assert(/food_contribution_intent/.test(core), 'A: RSVP API persists gift intent');
assert(/postRsvpGiftToGivingTransactions/.test(core), 'A: mark-paid bridges to giving_transactions');
assert(/add_thanksgiving_gift_payment_choice\.sql/.test(core), 'A: migration hint for payment columns');
assert(/postSettledContributionToDcb|dcbClient/.test(read('api/_utils/rsvpGiftPayment.ts')), 'A: Mark Paid HMAC-posts to DCB');
assert(/food_contribution_dcb_voucher_id/.test(core), 'A: persists DCB voucher on RSVP');
assert(
  /food_contribution_dcb_voucher_id/.test(read('supabase/migrations/add_thanksgiving_dcb_voucher.sql')),
  'M: DCB voucher migration exists'
);
assert(/createHmac/.test(read('api/_utils/dcbClient.ts')), 'A: dcbClient HMAC signer exists');
assert(/food_contribution_intent/.test(paymentMigration), 'M: payment choice migration');
assert(/Pay now or Pledge/.test(publicRsvp), 'U: public RSVP shows Pay now or Pledge');

const marrieds = getFellowshipEventConfig(MARRIEDS_DINNER_2026_EVENT_ID);
assert(marrieds.eventId === MARRIEDS_DINNER_2026_EVENT_ID, 'L: marrieds id');
assert(marrieds.name === 'Marrieds Dinner 2026', 'L: marrieds name');
assert(marrieds.date === '2026-12-27' && /4:00 PM/.test(marrieds.timeLabel), 'L: marrieds date Dec 27, 4:00 PM');
assert(marrieds.giftMin === 100, 'L: marrieds giftMin $100 per person');
assert(JSON.stringify(marrieds.giftOptions) === '[100]', 'L: marrieds shows only the $100 button (plus Other)');
assert(marrieds.giftPerPerson === true, 'L: marrieds contribution is per person (spouse = $200)');
assert(marrieds.paymentChoiceEnabled === true, 'L: marrieds payment choice enabled');
assert(
  Array.isArray(marrieds.paymentMethods) && marrieds.paymentMethods.some((m) => m.id === 'cashapp'),
  'L: marrieds has Cash App'
);
assert(
  marrieds.paymentMethods!.some((m) => m.id === 'zelle' && m.value === 'PLCC Tithe'),
  'L: marrieds Zelle goes through PLCC Tithe'
);
assert(
  marrieds.paymentMethods!.some((m) => m.id === 'venmo' && !m.live),
  'L: marrieds Venmo placeholder'
);
assert(
  !isFellowshipRsvpClosed(marrieds, Date.parse('2026-12-15T18:00:00Z')),
  'L: Marrieds still open on Dec 15 2026'
);
assert(
  isFellowshipRsvpClosed(marrieds, Date.parse('2026-12-21T05:00:00Z')),
  'L: Marrieds closed after Dec 20 2026'
);

const listed = listFellowshipEvents();
assert(listed.length >= 3, 'L: listFellowshipEvents has cookout + thanksgiving + marrieds');
assert(listed[0].date <= listed[1].date, 'L: list sorted by date');
assert(listed.some((e) => e.eventId === MARRIEDS_DINNER_2026_EVENT_ID), 'L: list includes Marrieds Dinner');

if (failed) {
  console.error(`\n${failed} smoke check(s) failed.\n`);
  process.exit(1);
}
console.log('\nAll fellowship holiday RSVP smoke tests passed.\n');
