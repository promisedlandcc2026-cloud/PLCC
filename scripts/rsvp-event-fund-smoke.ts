/**
 * Event RSVP payments are tracked under each event's own fund
 * (e.g. "Thanksgiving Dinner 2026") in the Vault, PLCC Tithe and DCB.
 *
 * Run: npx tsx scripts/rsvp-event-fund-smoke.ts
 */
import { readFileSync } from 'fs';
import {
  MARRIEDS_DINNER_2026_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
  cleanEventFundName,
  eventFundName,
  eventFundPreviousNames,
} from '../api/_utils/fellowshipEventConfig';
import { buildTitheRsvpPayUrl } from '../api/_utils/rsvpGiftPayment';

let failed = 0;
function assert(cond: unknown, name: string, _detail?: unknown) {
  if (cond) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`);
  }
}

assert(eventFundName(THANKSGIVING_2026_EVENT_ID, 'Join us at PLCC Table of Thanksgiving 2026') === 'PLCC GRAND FAMILY CELEBRATION 2026', 'renamed event fund');
// Renames: the fund follows the event id; old names are handed over once so the same fund is renamed.
assert(
  JSON.stringify(eventFundPreviousNames(THANKSGIVING_2026_EVENT_ID)) ===
    JSON.stringify(['Join us at PLCC Table of Thanksgiving 2026', 'PLCC THANKSGIVING DINNER 2026']),
  'built-in event passes its old fund names',
  eventFundPreviousNames(THANKSGIVING_2026_EVENT_ID)
);
assert(
  JSON.stringify(eventFundPreviousNames('b1b2c3d4-0000-4000-8000-0000000000d1', '2027 Fundraiser Dance')) === JSON.stringify(['2027 Fundraiser Dance']),
  'a renamed calendar event passes its old name'
);
assert(eventFundPreviousNames('b1b2c3d4-0000-4000-8000-0000000000d1', null).length === 0, 'no rename, no old names');
{
  const core = readFileSync('api/_utils/core.ts', 'utf8');
  assert(/connectEventTitheFund\(row, existing\?\.name/.test(core), 'event edit passes the old name so funds are renamed, not duplicated');
  assert(/ensureTitheEventFund\(fund, \{ eventId: row\.id, previousNames \}\)/.test(core), 'Tithe fund setup carries the event id');
  const pay = readFileSync('api/_utils/rsvpGiftPayment.ts', 'utf8');
  assert(/eventKey: eventFund && eventId \? eventId/.test(pay), 'Mark Paid tells DCB the event id');
}
assert(eventFundName(MARRIEDS_DINNER_2026_EVENT_ID, 'The Marrieds Dinner 2026') === 'Marrieds Dinner 2026', 'Marrieds fund');
assert(eventFundName('b1b2c3d4-0000-4000-8000-000000000001', '  Thanksgiving   Dinner 2027 ') === 'Thanksgiving Dinner 2027', 'new event uses its own name');
assert(eventFundName('x', '') === null && eventFundName('x', 'A') === null, 'no name, no fund');
assert(cleanEventFundName('Youth <Retreat> 2027 🎉') === 'Youth Retreat 2027', 'markup and emoji removed (same rule as Tithe)');
assert((cleanEventFundName('x'.repeat(90)) || '').length === 60, 'max 60 characters');

const url = new URL(
  buildTitheRsvpPayUrl({
    registrationId: 'a1b2c3d4-e5f6-4789-a012-0000000000aa',
    amount: 40,
    method: 'zelle',
    label: 'Thanksgiving RSVP',
    fund: 'Thanksgiving Dinner 2026',
  })
);
assert(url.searchParams.get('fund') === 'Thanksgiving Dinner 2026', 'pay link names the event fund');
assert(url.searchParams.get('ref') === 'rsvp:a1b2c3d4-e5f6-4789-a012-0000000000aa', 'pay link keeps the RSVP reference');

const dcb = readFileSync('api/_utils/dcbClient.ts', 'utf8');
assert(!/fundName \|\| 'Special Offerings'\} · /.test(dcb), 'DCB fund name is no longer mixed with the note');
assert(/memo: payload\.memo/.test(dcb) && /eventFund: payload\.eventFund/.test(dcb), 'DCB gets the note and the event flag');
const pay = readFileSync('api/_utils/rsvpGiftPayment.ts', 'utf8');
assert(/fundName: eventFund \|\| dcbRsvpFundName\(\)/.test(pay), 'Mark Paid posts to the event fund in DCB');
assert(/findOrCreateVaultEventFund/.test(pay), 'Vault ledger uses the event fund');
const core = readFileSync('api/_utils/core.ts', 'utf8');
assert(/ensureTitheEventFund\(eventFundName\(/.test(core), 'Pay Now signup sets up the fund in Tithe');
const rsvpPage = readFileSync('pages/events/FellowshipCookoutRsvp.tsx', 'utf8');
const staffPage = readFileSync('pages/events/CookoutRsvps.tsx', 'utf8');
assert(/fund: (eventCfg\.fundName \|\| )?eventFundName\(/.test(rsvpPage) && /fund: eventFundName\(/.test(staffPage), 'both pay links pass the fund');

if (failed) {
  console.error(`\n${failed} event fund check(s) failed.`);
  process.exit(1);
}
console.log('\nEvent fund checks passed.');
