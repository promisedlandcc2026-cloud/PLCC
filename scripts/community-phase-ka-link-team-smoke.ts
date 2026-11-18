/**
 * Ka Link Phase 3 smoke: admin team starts prayer rooms (#10), leaders get a
 * reserved seat (#19, #20), team role rides in the token (#18). No LiveKit needed.
 * Run: npx tsx scripts/community-phase-ka-link-team-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canManageKaLinkTeam,
  decideKaLinkPrayerRoomStart,
  isKaLinkPrayerRoom,
  parseKaLinkTeamRole,
} from '../api/_utils/kaLinkTeam.js';
import { VOICE_ROOM_MAX_PARTICIPANTS, VOICE_ROOM_MEMBER_SEATS } from '../api/_utils/livekitVoice.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
};

ok('recognises the prayer rooms by name', () => {
  for (const n of ['Morning Glory', 'PLCC Midnight Watch 🙏', 'midnight-watch', 'Lunch Hour', 'Upper Room', 'Intercessor Channel', 'Intercessors']) {
    assert.equal(isKaLinkPrayerRoom(n), true, n);
  }
  for (const n of ['Youth Ministry', 'Choir', '', null, 'Glory Kids']) assert.equal(isKaLinkPrayerRoom(n as any), false, String(n));
});

ok('prayer rooms: only team admins (and Super Admin) start once admins exist', () => {
  const base = { isPrayerRoom: true, existingCanStart: true, teamHasAdmins: true };
  assert.equal(decideKaLinkPrayerRoomStart({ ...base, teamRole: null, role: 'PASTOR' }), false);
  assert.equal(decideKaLinkPrayerRoomStart({ ...base, teamRole: 'leader', role: 'MEMBER' }), false);
  assert.equal(decideKaLinkPrayerRoomStart({ ...base, teamRole: 'admin', role: 'MEMBER' }), true);
  assert.equal(decideKaLinkPrayerRoomStart({ ...base, teamRole: null, role: 'SUPER_ADMIN' }), true);
});

ok('nothing changes before the team is set up, or outside prayer rooms', () => {
  assert.equal(decideKaLinkPrayerRoomStart({ isPrayerRoom: true, existingCanStart: true, teamHasAdmins: false, teamRole: null, role: 'PASTOR' }), true);
  assert.equal(decideKaLinkPrayerRoomStart({ isPrayerRoom: false, existingCanStart: true, teamHasAdmins: true, teamRole: null, role: 'MINISTRY_LEADER' }), true);
  assert.equal(decideKaLinkPrayerRoomStart({ isPrayerRoom: false, existingCanStart: false, teamHasAdmins: true, teamRole: 'admin', role: 'MEMBER' }), false);
});

ok('reserved seats above the member cap', () => {
  assert.equal(VOICE_ROOM_MEMBER_SEATS, 50);
  assert.ok(VOICE_ROOM_MAX_PARTICIPANTS > VOICE_ROOM_MEMBER_SEATS);
});

ok('team roles and managers', () => {
  assert.equal(parseKaLinkTeamRole('Admin'), 'admin');
  assert.equal(parseKaLinkTeamRole('owner'), null);
  assert.equal(canManageKaLinkTeam('PASTOR'), true);
  assert.equal(canManageKaLinkTeam('MEMBER'), false);
});

ok('server wiring', () => {
  const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  assert.match(core, /chatType === 'ka-link-team'/);
  assert.match(core, /subResource === 'ka-link-team'/);
  assert.match(core, /isVoiceRoomFull\(lk, cid, authUserId, \{ priority: prioritySeat \}\)/);
  assert.match(core, /kaLinkTeam: kaStart\.teamRole/);
  assert.equal((core.match(/resolveKaLinkStart\(/g) || []).length, 3, 'token, can-start and backup line');
  const sql = readFileSync(join(root, 'supabase/migrations/ka_link_team.sql'), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});

console.log(`\n${passed} checks passed`);
