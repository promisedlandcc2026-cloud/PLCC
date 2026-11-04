/**
 * Parent self-serve dependents — source contracts (no live API).
 * Run: npx tsx scripts/parent-add-dependent-smoke.ts
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

console.log('\nParent add-dependent smoke — gates + wiring\n');

const handler = read('api/_utils/parentDependentsHandler.ts');
assert(/requireAuth/.test(handler), 'handler: requireAuth');
assert(/user_member_links/.test(handler), 'handler: verified parent link / self-link');
assert(/role: 'Child'/.test(handler), 'handler: inserts Child member');
assert(!/auth\.admin\.createUser/.test(handler), 'handler: never creates Auth users');
assert(/household_members/.test(handler), 'handler: household edge');
assert(/guardian_relationships/.test(handler), 'handler: guardian edge');
assert(/can_view_card:\s*true/.test(handler), 'handler: card view for parent');
assert(/children/.test(handler) && /mirrorParentChildrenJson|update\(\{ children/.test(handler), 'handler: JSON mirror');
assert(/Finish onboarding before adding children/.test(handler), 'handler: PENDING gate');
assert(/Parent Dependent Created/.test(handler), 'handler: audit on create');

const huddle = read('api/_utils/familyHuddleHandler.ts');
assert(/subResource === 'dependents'/.test(huddle), 'family: dependents subResource wired');
assert(/handleParentDependents/.test(huddle), 'family: dispatches parent dependents handler');

const client = read('lib/parentDependentsClient.ts');
assert(/subResource=dependents/.test(client), 'client: dependents API path');
assert(/action=create/.test(client), 'client: create action');

const settings = read('pages/settings/UserSettings.tsx');
assert(/createParentDependent/.test(settings), 'Settings: create via API');
assert(/Children do not need their own login/.test(settings), 'Settings: no-login copy');
assert(/promoteChild|Needs family record/.test(settings), 'Settings: promote legacy JSON');

const family = read('pages/family/MyFamily.tsx');
assert(/createParentDependent/.test(family), 'My Family: add child API');
assert(/Add a child/.test(family), 'My Family: add child UI');
assert(/No email, phone, or signup required/.test(family), 'My Family: no-signup copy');

console.log('\nAll parent-add-dependent smoke tests passed.\n');
