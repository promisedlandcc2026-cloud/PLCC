/**
 * Canaan Repair Desk source contracts (no live API).
 * Run: npx tsx scripts/vault-repair-smoke.ts
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

console.log('\nVault Repair smoke — allowlist + gates\n');

const handler = read('api/_utils/vaultRepairHandler.ts');
const expectedActions = [
  'ensure_member_row',
  'promote_onboarded_member',
  'reset_temporary_password',
  'clear_media_notice',
  'force_media_ack',
  'relink_auth_user',
  'set_member_active',
];
for (const a of expectedActions) {
  assert(handler.includes(`'${a}'`), `allowlist: ${a}`);
}
assert(/Only Super Admins can use Vault Repair/.test(handler), 'handler: Super Admin gate');
assert(/confirm === true/.test(handler), 'handler: repair requires confirm:true');
assert(/Action not allowlisted/.test(handler), 'handler: rejects non-allowlisted actions');
assert(/Vault Repair/.test(handler) && /logAudit/.test(handler), 'handler: audits repairs');
assert(/Never invent actions outside the allowlist/.test(handler), 'AI prompt: allowlist-only');
assert(/isAllowlistedAction/.test(handler), 'AI parse: hard-reject non-allowlisted suggestions');

const core = read('api/_utils/core.ts');
assert(/case 'vault-repair'/.test(core), 'core: vault-repair resource wired');

const perms = read('lib/permissions.ts');
assert(/\/admin\/vault-repair/.test(perms) && /SUPER_ADMIN/.test(perms), 'permissions: Super Admin path');

const app = read('App.tsx');
assert(/path=\"\/admin\/vault-repair\"/.test(app), 'App: route registered');
assert(/VaultRepairPage/.test(app), 'App: VaultRepairPage imported');

const page = read('pages/admin/VaultRepair.tsx');
assert(/Only Super Admins can use this console/.test(page), 'UI: Super Admin gate');
assert(/confirm: true/.test(page), 'UI: sends confirm:true');
assert(/AI Repair chat/.test(page), 'UI: AI chat panel');
assert(/Run suggested fix/.test(page), 'UI: confirm AI suggestion before run');

const settings = read('pages/settings/SettingsHub.tsx');
assert(/awc_vault_repair_unlocked/.test(settings) && /repair=1|repair'\) === '1'/.test(settings), 'Settings: ?repair=1 unlock');

const staff = read('pages/admin/AdminUsers.tsx');
assert(/Canaan Repair Desk/.test(staff) && /awc_vault_repair_unlocked/.test(staff), 'Staff & Roles: card entry when unlocked');
assert(/Vault Repair/.test(settings) && /repairUnlocked/.test(settings), 'Settings hub: Admin nav when unlocked');

console.log('\nAll Vault Repair smoke tests passed.\n');
