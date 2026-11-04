/**
 * Vault-wide search — word handling and filter safety.
 * Run: npx tsx scripts/vault-search-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { matchesAll, searchTerms } from '../api/_utils/vaultSearchHandler';

let failed = 0;
const assert = (c: unknown, label: string, d?: unknown) => {
  if (c) console.log(`  OK: ${label}`);
  else { failed++; console.error(`  FAIL: ${label}`, d ?? ''); }
};
assert(searchTerms('  Grace  Hiire ').join() === 'grace,hiire', 'words split and lower-cased');
assert(searchTerms('a').length === 0, 'one-letter words ignored');
assert(!searchTerms('x%,or(id.eq.1)').join(' ').match(/[%,()]/), 'filter characters stripped', searchTerms('x%,or(id.eq.1)'));
assert(searchTerms("o'neil jerless@gmail.com").join() === "o'neil,jerless@gmail.com", 'names with apostrophes and emails kept');
assert(searchTerms('one two three four five six').length === 4, 'at most four words');
assert(matchesAll('Grace Hiire grace@x.com', ['grace', 'mute']), 'all words must match');
assert(!matchesAll('Grace Smith', ['grace', 'mute']), 'missing word → no match');
const h = readFileSync(new URL('../api/_utils/vaultSearchHandler.ts', import.meta.url), 'utf8');
assert(h.includes('canViewPeopleRoster(role)'), 'members only for roles that may see People');
assert(h.includes("normalizeEventStatus(e.status) === 'approved'"), 'pending events hidden');
const core = readFileSync(new URL('../api/_utils/core.ts', import.meta.url), 'utf8');
assert(core.includes("case 'vault-search'"), 'route wired');
const routeAccess = readFileSync(new URL('../api/_utils/routeAccess.ts', import.meta.url), 'utf8');
assert(!/vault-search/.test(routeAccess), 'accountants stay Fundraisers-only (not allow-listed)');
if (failed) { console.error(`\n${failed} check(s) failed.`); process.exit(1); }
console.log('\nAll Vault search checks passed.');
