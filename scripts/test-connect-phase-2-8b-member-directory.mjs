/**
 * Phase 2.8B — Member Directory source contracts.
 * Run: node --test scripts/test-connect-phase-2-8b-member-directory.mjs
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

describe('2.8B member directory migration', () => {
  it('ships opt-in list/search RPCs with field privacy', () => {
    const mig = join(root, 'supabase/migrations/connect_phase_2_8b_member_directory.sql');
    assert.equal(existsSync(mig), true);
    const sql = read('supabase/migrations/connect_phase_2_8b_member_directory.sql');
    assert.ok(sql.includes('list_member_directory'));
    assert.ok(sql.includes('search_member_directory'));
    assert.ok(sql.includes('directory_opt_in'));
    assert.ok(sql.includes('member_directory_is_eligible'));
    assert.ok(sql.includes("'child'"));
    assert.ok(sql.includes("'dependent'"));
    assert.ok(sql.includes('birthdayMd'));
    assert.ok(sql.includes('MM-DD'));
    assert.ok(sql.includes('query_too_short'));
    assert.ok(sql.includes('Does NOT'));
    assert.ok(sql.includes('Never return') || sql.includes('never includes forbidden'));
  });
});

describe('2.8B Connect directory UI', () => {
  it('wires client, page, route, More entry', () => {
    assert.equal(existsSync(join(connectRoot, 'lib/memberDirectoryClient.ts')), true);
    assert.equal(existsSync(join(connectRoot, 'pages/MemberDirectory.tsx')), true);
    const client = readConnect('lib/memberDirectoryClient.ts');
    assert.ok(client.includes("rpc('list_member_directory'"));
    assert.ok(client.includes("rpc('search_member_directory'"));
    const page = readConnect('pages/MemberDirectory.tsx');
    assert.ok(page.includes('Opt in'));
    assert.ok(page.includes('Children are never listed automatically'));
    assert.ok(readConnect('App.tsx').includes('path="/directory"'));
    assert.ok(readConnect('pages/MemberMore.tsx').includes("to: '/directory'"));
    assert.ok(readConnect('lib/memberShell.ts').includes("'/directory'"));
  });
});
