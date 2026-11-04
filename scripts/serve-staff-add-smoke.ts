/**
 * Staff "Add volunteer" rules for Serve opportunities.
 * Run: npx tsx scripts/serve-staff-add-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { decideStaffAddVolunteer } from '../api/_utils/serveAdminLogic';

let failed = 0;
const assert = (c: unknown, label: string) => {
  if (c) console.log(`  OK: ${label}`);
  else { failed++; console.error(`  FAIL: ${label}`); }
};
const base = { opportunityStatus: 'open', capacity: 3, activeCount: 1, eligibilityStatus: 'eligible', existingStatus: null };
const d = (o: any) => decideStaffAddVolunteer({ ...base, ...o });
assert(d({}).ok && (d({}) as any).mode === 'insert', 'eligible person, open spot → added');
assert((d({ existingStatus: 'cancelled' }) as any).mode === 'revive', 'cancelled before → brought back');
assert(!d({ existingStatus: 'confirmed' }).ok, 'already on roster refused');
assert(!d({ eligibilityStatus: null }).ok, 'not verified refused');
assert(!d({ eligibilityStatus: 'suspended' }).ok, 'suspended refused');
assert(!d({ activeCount: 3 }).ok, 'full refused');
assert(d({ capacity: null, activeCount: 99 }).ok, 'no cap → always room');
assert(!d({ opportunityStatus: 'cancelled' }).ok, 'closed opportunity refused');
const handler = readFileSync(new URL('../api/_utils/serveAdminHandler.ts', import.meta.url), 'utf8');
assert(handler.includes('decideStaffAddVolunteer') && handler.includes("req.method === 'POST'"), 'handler uses the rule');
assert(handler.indexOf('assertServeAdmin(req, res, supabase)') > -1, 'Serve admin roles only');
if (failed) { console.error(`\n${failed} check(s) failed.`); process.exit(1); }
console.log('\nAll staff add-volunteer checks passed.');
