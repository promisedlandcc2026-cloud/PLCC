/**
 * Smoke: calendar event signup pages (rsvp_enabled + templates).
 * Run: npx tsx scripts/event-rsvp-signup-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closedMessageForName,
  deriveDefaultRsvpCloseAt,
  isKnownFellowshipKitId,
  isValidRsvpTemplate,
  runtimeConfigFromDbEvent,
} from '../api/_utils/eventRsvpConfig.ts';
import {
  DEFAULT_FELLOWSHIP_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
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

console.log('\nEvent RSVP signup smoke');

const migration = read('supabase/migrations/add_event_rsvp_signup_flags.sql');
const overview = read('pages/events/Overview.tsx');
const publicRsvp = read('pages/events/FellowshipCookoutRsvp.tsx');
const core = read('api/_utils/core.ts');
const staff = read('pages/events/CookoutRsvps.tsx');
const helper = read('api/_utils/eventRsvpConfig.ts');

assert(/rsvp_enabled/.test(migration), 'M: rsvp_enabled column');
assert(/rsvp_template/.test(migration), 'M: rsvp_template column');
assert(/rsvp_close_at/.test(migration), 'M: rsvp_close_at column');
assert(/simple.*fellowship|fellowship.*simple/.test(migration), 'M: template check constraint');
assert(new RegExp(DEFAULT_FELLOWSHIP_EVENT_ID).test(migration), 'M: backfill cookout');
assert(/a1b2c3d4-e5f6-4789-a012-202611221400/.test(migration), 'M: backfill legacy thanksgiving id');

assert(/Create signup page/.test(overview), 'U: Overview signup toggle');
assert(/rsvpTemplate/.test(overview) && /fellowship/.test(overview), 'U: Overview template picker');
assert(/publicEventRsvpPath|\/events\/.*\/rsvp/.test(overview), 'U: Overview signup URL helper');
assert(/signupLinkBanner/.test(overview), 'U: Overview copyable signup link banner');

assert(/subResource === 'rsvp-config'/.test(core), 'A: rsvp-config GET');
assert(/subResource === 'rsvp-enabled-events'/.test(core), 'A: rsvp-enabled-events GET');
assert(/Signup is not enabled for this event/.test(core), 'A: reject disabled signup');
assert(/Event not found or signup not enabled/.test(core), 'A: reject unknown eventId');
assert(/rsvp_enabled/.test(core) && /pickEventFields/.test(core), 'A: pickEventFields includes RSVP flags');
assert(/template === 'simple'/.test(core), 'A: simple template POST branch');

assert(/rsvp-config/.test(publicRsvp), 'U: public form loads rsvp-config');
assert(/isSimple/.test(publicRsvp), 'U: public form simple template branch');
assert(/How many are coming/.test(publicRsvp), 'U: simple headcount field');
assert(/Food allergies/.test(publicRsvp) || /allergies/.test(publicRsvp), 'U: allergies still present');

assert(/rsvp-enabled-events/.test(staff), 'U: staff loads enabled events');
assert(/RSVP event/.test(staff), 'U: staff event picker');

assert(/deriveDefaultRsvpCloseAt/.test(helper), 'L: default close helper');
assert(isValidRsvpTemplate('simple') && isValidRsvpTemplate('fellowship'), 'L: valid templates');
assert(!isValidRsvpTemplate('other'), 'L: invalid template rejected');
assert(isKnownFellowshipKitId(DEFAULT_FELLOWSHIP_EVENT_ID), 'L: cookout kit id');
assert(isKnownFellowshipKitId(THANKSGIVING_2026_EVENT_ID), 'L: thanksgiving kit id');
assert(!isKnownFellowshipKitId('not-a-real-id'), 'L: random id not kit');

const close = deriveDefaultRsvpCloseAt('2026-11-22');
assert(/2026-11-2[01]/.test(close), 'L: default close is day before event');

const disabled = runtimeConfigFromDbEvent({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Test',
  date: '2026-12-01',
  rsvp_enabled: false,
  rsvp_template: 'simple',
});
assert(disabled === null, 'L: disabled event → null config');

const simple = runtimeConfigFromDbEvent({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Potluck',
  date: '2026-12-01',
  rsvp_enabled: true,
  rsvp_template: 'simple',
});
assert(simple?.template === 'simple' && simple?.giftMin === 0, 'L: simple runtime config');

const fellowship = runtimeConfigFromDbEvent({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Dinner',
  date: '2026-12-01',
  rsvp_enabled: true,
  rsvp_template: 'fellowship',
});
assert(fellowship?.template === 'fellowship' && fellowship!.giftMin >= 20, 'L: fellowship runtime config');

assert(/closed/.test(closedMessageForName('Dinner')), 'L: closed message includes name');

// RSVP delete + Archive
// Marrieds Dinner: an old $20 minimum saved on the event can't lower the $100/person floor.
const marriedsOld = runtimeConfigFromDbEvent({
  id: '8cd1c63d-e041-423d-bcd0-8c6a6b9c10bf',
  name: 'Marrieds Dinner 2026',
  date: '2026-12-27',
  rsvp_enabled: true,
  rsvp_template: 'fellowship',
  rsvp_payments_enabled: true,
  rsvp_gift_min: 20,
  rsvp_gift_options: [20, 40, 60, 100],
});
assert(marriedsOld?.giftMin === 100, 'L: marrieds keeps $100 minimum even with $20 saved');
assert(JSON.stringify(marriedsOld?.giftOptions) === '[100]', 'L: marrieds shows only $100 even with old buttons saved');
assert(marriedsOld?.giftPerPerson === true, 'L: marrieds is per person');

const archivePage = read('pages/events/RsvpArchive.tsx');
const perms = read('lib/permissions.ts');
assert(/subResource === 'rsvp-list'/.test(core), 'D: delete-RSVP endpoint');
assert(/RSVP_HAS_GIFTS/.test(core), 'D: delete refused when anyone paid or pledged');
assert(/subResource === 'rsvp-archive'/.test(core), 'A: archive endpoint');
assert(/RSVP_ARCHIVE_VIEW_ROLES = new Set\(\['SUPER_ADMIN', 'PASTOR', 'FIRST_LADY', 'FINANCE'\]\)/.test(core), 'A: archive view roles');
assert(/Only Super Admin can archive or restore/.test(core), 'A: only Super Admin archives/restores');
assert(/This RSVP is archived\. Restore it before making changes/.test(core), 'A: archived RSVPs are read-only');
assert(/'\/events\/rsvp-archive': \[Role\.SUPER_ADMIN, Role\.PASTOR, Role\.FIRST_LADY, Role\.FINANCE\]/.test(perms), 'A: archive page roles');
assert(/data-testid="rsvp-archive"/.test(staff) && /data-testid="rsvp-delete-list"/.test(staff), 'A: Archive + Delete RSVP buttons');
assert(/canRestore/.test(archivePage) && !/openEdit|deleteRsvp/.test(archivePage), 'A: archive page is view-only (restore for Super Admin)');

assert(/if \(!email && !staffAdd\) return res\.status\(400\)/.test(core), 'E: public RSVP requires an email (staff add may leave it blank)');
assert(/id="cookout-email"\s+required/.test(publicRsvp) && !/Email <span[^>]*>\(optional\)/.test(publicRsvp), 'E: RSVP form marks email required');

if (failed) {
  console.error(`\n${failed} smoke check(s) failed.\n`);
  process.exit(1);
}
console.log('\nAll event RSVP signup smoke tests passed.\n');
