/**
 * Phase 4 smoke (#17): sign-in failure log — masking, grouping, wiring. No DB needed.
 * Run: npx tsx scripts/community-phase-sign-in-failures-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SIGN_IN_FAILURE_LABELS,
  CLIENT_REPORTABLE_REASONS,
  groupSignInFailures,
  identifierHash,
  maskIdentifier,
} from '../api/_utils/signInFailures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
};

ok('masks numbers and emails', () => {
  assert.equal(maskIdentifier('+256772557842'), '+256 772 ***842');
  assert.equal(maskIdentifier('256772557842@phone.awcvault.invalid'), '+256 772 ***842');
  assert.equal(maskIdentifier('jane.doe@gmail.com'), 'ja***@gmail.com');
  assert.ok(!maskIdentifier('+256772557842').includes('557'));
});

ok('same person groups together however the number was typed', () => {
  assert.equal(identifierHash('0772 557842'), identifierHash('+256772557842'));
  assert.equal(identifierHash('256772557842@phone.awcvault.invalid'), identifierHash('+256772557842'));
});

ok('apps cannot report password failures (only the server can)', () => {
  assert.equal(CLIENT_REPORTABLE_REASONS.has('wrong_password' as any), false);
  assert.equal(CLIENT_REPORTABLE_REASONS.has('member_pending'), true);
});

ok('groups by person, newest first, with friendly reasons', () => {
  const rows = [
    { created_at: '2026-11-18T10:00:00Z', app: 'ka-link', method: 'phone', identifier_masked: '+256 772 ***842', identifier_hash: 'h1', user_id: 'u1', reason: 'wrong_password', detail: null, user_agent: 'Android' },
    { created_at: '2026-11-18T10:05:00Z', app: 'ka-link', method: 'phone', identifier_masked: '+256 772 ***842', identifier_hash: 'h1', user_id: 'u1', reason: 'wrong_password', detail: null, user_agent: 'Android' },
    { created_at: '2026-11-18T09:00:00Z', app: 'ka-link', method: 'session', identifier_masked: 'ja***@gmail.com', identifier_hash: 'h2', user_id: null, reason: 'member_pending', detail: null, user_agent: null },
    { created_at: '2026-11-18T09:00:00Z', app: 'x', method: 'phone', identifier_masked: null, identifier_hash: null, user_id: null, reason: 'nonsense', detail: null, user_agent: null },
  ];
  const groups = groupSignInFailures(rows, new Map([['u1', 'Grace N.']]));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, 'Grace N.');
  assert.equal(groups[0].attempts, 2);
  assert.equal(groups[0].reasons[0].label, 'Wrong password');
  assert.equal(groups[1].reasons[0].reason, 'member_pending');
});

ok('wiring: phone sign-in logs failures, router + public access, migration', () => {
  const authPhone = readFileSync(join(root, 'api/_utils/authPhone.ts'), 'utf8');
  for (const r of ['invalid_phone', 'rate_limited', 'no_account', 'wrong_password', 'account_exists']) {
    assert.match(authPhone, new RegExp(`logFailure\\('${r}'|'${r}'`));
  }
  assert.doesNotMatch(authPhone, /logFailure\([^)]*[(, ]password[,)]/, 'never log the password');
  const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  assert.match(core, /case 'sign-in-failures'/);
  const sql = readFileSync(join(root, 'supabase/migrations/sign_in_failures.sql'), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});

ok('every problem says what happened in plain words, who fixes it, and how (step by step)', () => {
  for (const [reason, h] of Object.entries(SIGN_IN_FAILURE_LABELS)) {
    assert.ok(h.simple && h.simple.length < 120, `${reason}: simple`);
    assert.ok(['member', 'leader', 'developer', 'wait'].includes(h.fixer), `${reason}: fixer`);
    assert.ok(h.steps.length >= 1 && h.steps.length <= 4, `${reason}: steps`);
    assert.ok(h.emoji, `${reason}: emoji`);
  }
  const page = readFileSync(join(root, 'pages/admin/SignInProblems.tsx'), 'utf8');
  assert.match(page, /How to fix it:/);
  assert.match(page, /For the developer/);
});

console.log(`\n${passed} checks passed`);
