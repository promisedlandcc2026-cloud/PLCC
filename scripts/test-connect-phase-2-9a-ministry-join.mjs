/**
 * Phase 2.9A — Ministry join status source contracts.
 * Run: node --test scripts/test-connect-phase-2-9a-ministry-join.mjs
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

describe('2.9A ministry join status', () => {
  it('migration allows own application read + RPC', () => {
    const mig = join(root, 'supabase/migrations/connect_phase_2_9a_ministry_join_status.sql');
    assert.equal(existsSync(mig), true);
    const sql = read('supabase/migrations/connect_phase_2_9a_ministry_join_status.sql');
    assert.ok(sql.includes('team_applications_select_own'));
    assert.ok(sql.includes('get_my_team_applications'));
  });

  it('Connect hub shows membership / request status', () => {
    assert.equal(existsSync(join(connectRoot, 'lib/ministryJoinClient.ts')), true);
    const hub = readConnect('pages/MemberMinistryHub.tsx');
    assert.ok(hub.includes('fetchMyTeamApplications'));
    assert.ok(hub.includes('Request to join'));
    assert.ok(hub.includes('ministryId={ministry.id}'));
    const joinMod = readConnect('components/JoinTeamModule.tsx');
    assert.ok(joinMod.includes('ministryId'));
    assert.ok(joinMod.includes('Request to join'));
    const hubs = readConnect('lib/ministryHubData.ts');
    assert.ok(hubs.includes('user_member_links'));
  });
});
