/**
 * Consent acknowledgements on member profile — source contracts.
 * Run: npx tsx scripts/consent-ack-profile-smoke.ts
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

console.log('\nConsent ack profile smoke\n');

const core = read('api/_utils/core.ts');
assert(/action === 'list'/.test(core), 'core: consent list action present');
assert(/parent_id required|child_id or parent_id required/.test(core), 'core: list accepts parent_id');
assert(/parent_id\.eq\.|eq\('parent_id'/.test(core), 'core: filters by parent_id');
assert(!/auth\.admin\.createUser/.test(core.slice(core.indexOf("action === 'list'"), core.indexOf("action === 'list'") + 800)), 'core: list path does not create Auth users');

const section = read('components/people/ConsentAcknowledgementsSection.tsx');
assert(/Acknowledgements/.test(section), 'section: Acknowledgements heading');
assert(/resource=consent&action=list/.test(section), 'section: calls consent list');
assert(/parent_id=/.test(section), 'section: parent_id query for adults');
assert(/child_id=/.test(section), 'section: child_id query for children');
assert(/No consent acknowledgements on file yet/.test(section), 'section: empty state');

const members = read('pages/people/Members.tsx');
assert(/ConsentAcknowledgementsSection/.test(members), 'Members: imports/mounts section');
assert(/memberRole=\{member\.role\}/.test(members), 'Members: passes memberRole');

console.log('\nAll consent-ack-profile smoke tests passed.\n');
