/**
 * Kids ministry Sunday plan archive — source contracts.
 * Run: npx tsx scripts/kids-plans-smoke.ts
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('  OK:', msg);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('\nKids Plans smoke\n');

const migration = read('supabase/migrations/create_kids_ministry_plans.sql');
assert(/kids_ministry_plans/.test(migration), 'migration: table');
assert(/kids-ministry-plans/.test(migration), 'migration: storage bucket');

const handler = read('api/_utils/kidsMinistryPlansHandler.ts');
assert(/KIDS_PLANS_BUCKET = 'kids-ministry-plans'/.test(handler), 'handler: bucket name');
assert(/SUNDAY_SCHOOL_TEACHER/.test(handler), 'handler: teacher role gate');
assert(/createSignedUrl/.test(handler), 'handler: signed URLs');
assert(!/auth\.admin\.createUser/.test(handler), 'handler: never creates Auth users');
assert(/Kids Ministry Plan Uploaded/.test(handler), 'handler: audit on upload');

const core = read('api/_utils/core.ts');
assert(/case 'kids-plans'/.test(core), 'core: kids-plans resource wired');
assert(/handleKidsMinistryPlans/.test(core), 'core: dispatches handler');

const perms = read('lib/permissions.ts');
assert(/\/events\/kids-plans/.test(perms), 'permissions: kids-plans path');
assert(/KIDS_PLANS_ROLES/.test(perms), 'permissions: KIDS_PLANS_ROLES');

const app = read('App.tsx');
assert(/path=\"\/events\/kids-plans\"/.test(app), 'App: route registered');
assert(/KidsPlansPage/.test(app), 'App: KidsPlansPage imported');

const nav = read('lib/navBySection.tsx');
assert(/Kids Plans/.test(nav) && /\/events\/kids-plans/.test(nav), 'nav: Events Kids Plans');

const page = read('pages/events/KidsPlans.tsx');
assert(/resource=kids-plans/.test(page), 'UI: calls kids-plans API');
assert(/Upload plan|Upload Sunday plan/.test(page), 'UI: upload flow');

const readme = read('scripts/README.md');
assert(/kids-ministry-plans/.test(readme), 'README: bucket docs');

console.log('\nAll kids-plans smoke tests passed.\n');
