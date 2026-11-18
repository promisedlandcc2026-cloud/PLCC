/**
 * Ka Link Phase 2 moderator tools smoke (mic lock, Bible readers, block) — no LiveKit required.
 * Run: npx tsx scripts/community-phase-huddle-stage-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrackSource } from 'livekit-server-sdk';
import {
  applyHuddleStageAction,
  buildHuddleStageMetadata,
  emptyHuddleStage,
  huddleMicAllowed,
  huddleUserBlocked,
  parseHuddleStage,
  parseHuddleStageAction,
} from '../api/_utils/huddleStage.js';
import { buildHuddleRoomRolesMetadata, parseHuddleRoomRoles } from '../api/_utils/huddleModeration.js';
import { planVoiceAccessToken } from '../api/_utils/livekitVoice.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
};

ok('empty / broken metadata = no lock', () => {
  assert.deepEqual(parseHuddleStage(''), emptyHuddleStage());
  assert.deepEqual(parseHuddleStage('{bad'), emptyHuddleStage());
  assert.deepEqual(parseHuddleStage(JSON.stringify({ stage: [] })), emptyHuddleStage());
});

ok('stage and host roles live side by side in room metadata', () => {
  const withRoles = buildHuddleRoomRolesMetadata('', { hostId: 'host', coHostIds: ['co'] });
  const locked = applyHuddleStageAction(emptyHuddleStage(), 'mic-lock');
  assert.equal(locked.ok, true);
  const meta = buildHuddleStageMetadata(withRoles, (locked as any).stage);
  assert.equal(parseHuddleStage(meta).micLock, true);
  assert.equal(parseHuddleRoomRoles(meta).hostId, 'host');
  // Writing roles again keeps the stage.
  const again = buildHuddleRoomRolesMetadata(meta, { hostId: 'host2', coHostIds: [] });
  assert.equal(parseHuddleStage(again).micLock, true);
});

ok('actions parse strictly', () => {
  assert.equal(parseHuddleStageAction('MIC-LOCK'), 'mic-lock');
  assert.equal(parseHuddleStageAction('drop-table'), null);
});

ok('Bible readers and moderators keep the mic when locked', () => {
  let stage = emptyHuddleStage();
  stage = (applyHuddleStageAction(stage, 'mic-lock') as any).stage;
  stage = (applyHuddleStageAction(stage, 'reader-add', 'reader') as any).stage;
  assert.equal(huddleMicAllowed({ stage, userId: 'member', isModerator: false }), false);
  assert.equal(huddleMicAllowed({ stage, userId: 'reader', isModerator: false }), true);
  assert.equal(huddleMicAllowed({ stage, userId: 'mod', isModerator: true }), true);
  stage = (applyHuddleStageAction(stage, 'reader-remove', 'reader') as any).stage;
  assert.equal(huddleMicAllowed({ stage, userId: 'reader', isModerator: false }), false);
  const unlocked = (applyHuddleStageAction(stage, 'mic-unlock') as any).stage;
  assert.equal(huddleMicAllowed({ stage: unlocked, userId: 'member', isModerator: false }), true);
});

ok('block keeps someone out and drops them as reader', () => {
  let stage = (applyHuddleStageAction(emptyHuddleStage(), 'reader-add', 'x') as any).stage;
  stage = (applyHuddleStageAction(stage, 'block', 'x') as any).stage;
  assert.equal(huddleUserBlocked(stage, 'x'), true);
  assert.equal(stage.readerIds.includes('x'), false);
  assert.equal(applyHuddleStageAction(stage, 'block').ok, false);
});

ok('locked token: member joins without microphone; moderator unrestricted', () => {
  const member = planVoiceAccessToken({ userId: 'u', displayName: 'U', channelId: 'c', canModerate: false, allowMicrophone: false });
  assert.deepEqual(member.grant.canPublishSources, [TrackSource.CAMERA]);
  const open = planVoiceAccessToken({ userId: 'u', displayName: 'U', channelId: 'c', canModerate: false });
  assert.ok(open.grant.canPublishSources?.includes(TrackSource.MICROPHONE));
  const mod = planVoiceAccessToken({ userId: 'm', displayName: 'M', channelId: 'c', canModerate: true, allowMicrophone: false });
  assert.equal(mod.grant.canPublishSources, undefined);
});

ok('server wires the stage endpoint, block check and lock-aware mic restore', () => {
  const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  assert.match(core, /chatType === 'voice-huddle-stage'/);
  assert.match(core, /subResource === 'voice-huddle-stage'/);
  assert.match(core, /HUDDLE_BLOCKED/);
  assert.match(core, /HUDDLE_MIC_LOCKED/);
  assert.match(core, /allowMicrophone,/);
});

console.log(`\n${passed} checks passed`);
