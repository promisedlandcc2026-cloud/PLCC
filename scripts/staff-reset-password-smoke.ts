/**
 * Staff & Roles → Reset password (Super Admin only).
 * Run: npx tsx scripts/staff-reset-password-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateTemporaryPassword } from '../api/_utils/tempPassword';

for (let i = 0; i < 200; i++) assert.match(generateTemporaryPassword(), /^Plcc[2-9]{6}$/);
const core = readFileSync('api/_utils/core.ts', 'utf8');
const block = core.slice(core.indexOf("'reset-password'"), core.indexOf("'reset-password'") + 1600);
assert.match(block, /if \(!user \|\| !isSuperAdmin\) return res\.status\(403\)/, 'Super Admin only');
assert.match(block, /targetId === user\.id/, 'not for your own account');
assert.match(block, /auth\.admin\.updateUserById\(targetId, \{ password: temporaryPassword \}\)/);
assert.match(block, /action: 'Password Reset'/, 'audited');
assert.doesNotMatch(block, /details: \{[^}]*temporaryPassword/, 'password never in the audit log');
assert.doesNotMatch(block, /console\.\w+\([^)]*temporaryPassword/, 'password never logged');
const page = readFileSync('pages/admin/AdminUsers.tsx', 'utf8');
assert.match(page, /subResource=reset-password/);
assert.match(page, /data-testid="staff-reset-password"/);
assert.match(page, /u\.id !== userId \?/, 'no reset button on your own row');
console.log('staff reset password smoke: ok');
