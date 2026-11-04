/**
 * Smoke: Vault → DCB HMAC client + Thanksgiving Mark Paid wiring.
 * Run: npx tsx scripts/dcb-hmac-bridge-smoke.ts
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDcbVoucherNumber,
  isDcbBridgeConfigured,
  resolveDcbIngestUrl,
  signAwcServiceRequest,
} from '../api/_utils/dcbClient.ts';
import { rsvpGiftReferenceId } from '../api/_utils/rsvpGiftPayment.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let failed = 0;
function assert(cond: unknown, label: string) {
  if (cond) console.log(`  OK: ${label}`);
  else {
    failed += 1;
    console.error(`  FAIL: ${label}`);
  }
}

console.log('\nVault → DCB HMAC bridge smoke');

const client = read('api/_utils/dcbClient.ts');
const rsvpPay = read('api/_utils/rsvpGiftPayment.ts');
const core = read('api/_utils/core.ts');
const voucherMig = read('supabase/migrations/add_thanksgiving_dcb_voucher.sql');
const devSetup = read('DEV_SETUP.md');

assert(/signAwcServiceRequest/.test(client), 'client exports signAwcServiceRequest');
assert(/X-PLCC-Timestamp/.test(client) && /X-PLCC-Signature/.test(client), 'client sets PLCC HMAC headers');
assert(/postContributionToDcb/.test(client), 'client posts contributions');
assert(/postSettledContributionToDcb/.test(client), 'client alias for RSVP bridge');
assert(/\/api\/public\/giving\/contributions/.test(client), 'default ingest path');

assert(/postSettledContributionToDcb/.test(rsvpPay), 'RSVP Mark Paid calls DCB client');
assert(/food_contribution_dcb_voucher_id/.test(rsvpPay), 'RSVP tracks DCB voucher id');
assert(/postRsvpGiftToGivingTransactions/.test(core), 'core Mark Paid calls gift bridge');
assert(/food_contribution_dcb_voucher_id/.test(core), 'core persists DCB voucher');
assert(/food_contribution_dcb_voucher_id/.test(voucherMig), 'migration adds DCB voucher column');
assert(/AWC_DCB_SERVICE_SECRET/.test(devSetup), 'DEV_SETUP documents DCB secret');
assert(/AWC_DCB_API_URL/.test(devSetup), 'DEV_SETUP documents DCB URL');

const secret = 'test-secret-for-smoke';
const rawBody = JSON.stringify({ amount: 50, transactionId: 'rsvp:abc' });
const headers = signAwcServiceRequest(rawBody, secret);
assert(Boolean(headers['X-PLCC-Timestamp']), 'timestamp header present');
assert(Boolean(headers['X-PLCC-Signature']), 'signature header present');
const expected = createHmac('sha256', secret)
  .update(`${headers['X-PLCC-Timestamp']}.${rawBody}`)
  .digest('hex');
assert(headers['X-PLCC-Signature'] === expected, 'HMAC matches DCB verify formula');

const ref = rsvpGiftReferenceId('11111111-2222-3333-4444-555555555555');
assert(ref === 'rsvp:11111111-2222-3333-4444-555555555555', 'rsvp reference id shape');
assert(/^PLCC-VOUCH-/.test(buildDcbVoucherNumber(ref)), 'voucher number prefix');

assert(resolveDcbIngestUrl() === '' || resolveDcbIngestUrl().includes('/api/'), 'ingest URL helper');
assert(typeof isDcbBridgeConfigured() === 'boolean', 'isDcbBridgeConfigured boolean');

if (failed) {
  console.error(`\n${failed} smoke check(s) failed.\n`);
  process.exit(1);
}
console.log('\nAll Vault → DCB HMAC bridge smoke tests passed.\n');
