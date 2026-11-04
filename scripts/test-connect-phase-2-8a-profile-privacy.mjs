/**
 * Phase 2.8A — My Profile & directory privacy source contracts.
 * Run: node --test scripts/test-connect-phase-2-8a-profile-privacy.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function readConnect(rel) {
  return readFileSync(join(connectRoot, rel), 'utf8');
}

describe('2.8A member profile privacy migration', () => {
  const mig = join(root, 'supabase/migrations/connect_phase_2_8a_member_profile_privacy.sql');

  it('adds preferred_name, anniversary, privacy table, and RPCs', () => {
    assert.equal(existsSync(mig), true);
    const sql = read('supabase/migrations/connect_phase_2_8a_member_profile_privacy.sql');
    assert.ok(sql.includes('preferred_name'));
    assert.ok(sql.includes('anniversary'));
    assert.ok(sql.includes('member_directory_privacy'));
    assert.ok(sql.includes('directory_opt_in boolean NOT NULL DEFAULT false'));
    assert.ok(sql.includes('show_photo boolean NOT NULL DEFAULT false'));
    assert.ok(sql.includes('show_phone boolean NOT NULL DEFAULT false'));
    assert.ok(sql.includes('show_email boolean NOT NULL DEFAULT false'));
    assert.ok(sql.includes('get_my_member_profile'));
    assert.ok(sql.includes('update_my_member_profile'));
    assert.ok(sql.includes('update_my_directory_privacy'));
    assert.ok(sql.includes('forbidden_field'));
    assert.ok(sql.includes('invalid_avatar_url'));
    assert.ok(sql.includes('data:%'));
    assert.ok(sql.includes('avatars_insert_own_folder'));
    // No directory list/search in 2.8A
    assert.equal(sql.includes('list_member_directory'), false);
  });

  it('ships 2.8A.1 save hardening migration', () => {
    const harden = join(root, 'supabase/migrations/connect_phase_2_8a1_profile_update_hardening.sql');
    assert.equal(existsSync(harden), true);
    const sql = read('supabase/migrations/connect_phase_2_8a1_profile_update_hardening.sql');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS birthday'));
    assert.ok(sql.includes('dual-write best-effort') || sql.includes('best-effort'));
  });
});

describe('2.8A Vault staff privacy read', () => {
  it('exposes directory-privacy subResource and Members UI panel', () => {
    const core = read('api/_utils/core.ts');
    assert.ok(core.includes("subResource || '') === 'directory-privacy'"));
    assert.ok(core.includes('member_directory_privacy'));
    const members = read('pages/people/Members.tsx');
    assert.ok(members.includes('Connect directory privacy'));
    assert.ok(members.includes('directory-privacy'));
    assert.ok(members.includes('Directory opt-in'));
  });
});

describe('2.8A Connect My Profile', () => {
  it('ships client, page, route, More/Account wiring', () => {
    assert.equal(existsSync(join(connectRoot, 'lib/memberProfileClient.ts')), true);
    assert.equal(existsSync(join(connectRoot, 'pages/MemberProfile.tsx')), true);
    const client = readConnect('lib/memberProfileClient.ts');
    assert.ok(client.includes("rpc('get_my_member_profile')"));
    assert.ok(client.includes("rpc('update_my_member_profile'"));
    assert.ok(client.includes("rpc('update_my_directory_privacy'"));
    assert.ok(client.includes("storage.from('avatars')"));
    const page = readConnect('pages/MemberProfile.tsx');
    assert.ok(page.includes('Privacy & directory'));
    assert.ok(page.includes('Show me in the Member Directory'));
    assert.ok(page.includes('Children are never listed automatically'));
    const app = readConnect('App.tsx');
    assert.ok(app.includes('path="/profile"'));
    assert.ok(app.includes('MemberProfilePage'));
    const more = readConnect('pages/MemberMore.tsx');
    assert.ok(more.includes("to: '/profile'"));
    assert.ok(more.includes('My Profile'));
    const shell = readConnect('lib/memberShell.ts');
    assert.ok(shell.includes("'/profile'"));
    const account = readConnect('pages/MemberAccount.tsx');
    assert.ok(account.includes('to="/profile"'));
    assert.ok(account.includes('Edit My Profile'));
  });
});
