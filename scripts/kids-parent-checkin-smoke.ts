/**
 * Kids check-in by the parent's phone — pass token smoke.
 * Run: npx tsx scripts/kids-parent-checkin-smoke.ts
 */
import { KIDS_PASS_TTL_MS, signKidsPass, verifyKidsPass } from '../api/_utils/checkinPointsLogic.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const secret = 'test-secret-0123456789abcdef';
const sessionId = '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
const parent = '32678c63-6f0f-4a6e-8998-34311ab410ff';
const other = '12dfb258-28fb-47d4-ad84-056f6333966f';
const t0 = Date.UTC(2026, 10, 1, 14, 0, 0);

console.log('\nKids parent check-in pass');
const pass = signKidsPass(secret, sessionId, parent, t0);
const ok = verifyKidsPass(secret, pass, parent, t0 + 60_000);
assert(ok.ok === true && ok.sessionId === sessionId, 'parent can use their pass for that session');
assert(verifyKidsPass(secret, pass, other, t0).ok === false, 'another login cannot use the pass');
const late = verifyKidsPass(secret, pass, parent, t0 + KIDS_PASS_TTL_MS + 1);
assert(late.ok === false && late.code === 'code_expired', 'pass expires after 10 minutes');
assert(verifyKidsPass(secret, pass.replace(/.$/, pass.endsWith('A') ? 'B' : 'A'), parent, t0).ok === false, 'tampered pass rejected');
assert(verifyKidsPass('another-secret-0123456789', pass, parent, t0).ok === false, 'pass from another key rejected');
console.log('\nKids parent check-in pass checks passed.');
