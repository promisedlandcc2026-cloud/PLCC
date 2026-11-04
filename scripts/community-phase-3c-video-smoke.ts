/**
 * PLCC Community Phase 3C — Live Huddle video smoke (no live media required).
 * Run: npx tsx scripts/community-phase-3c-video-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatCameraPermissionError,
  HUDDLE_CAMERA_CAPTURE,
  HUDDLE_CAMERA_DEFAULT_ON,
  huddleCountIgnoresCameraState,
  huddleVideoGridClass,
  tokenPlanAllowsVideoPublish,
} from '../api/_utils/huddleVideo.js';
import { planVoiceAccessToken, decideVoiceHuddleAccess } from '../api/_utils/livekitVoice.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('Phase 3C video smoke — token + defaults (A/B/R)');

const plan = planVoiceAccessToken({
  userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  displayName: 'Tester',
  channelId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  canModerate: false,
});
assert(tokenPlanAllowsVideoPublish(plan.grant), 'A: token allows publish/subscribe/data/metadata (video+audio)');
assert(plan.grant.roomAdmin === false, 'roomAdmin not broadened for non-moderator');
assert(HUDDLE_CAMERA_DEFAULT_ON === false, 'B: camera defaults off');
assert(HUDDLE_CAMERA_CAPTURE.resolution.height <= 720, 'performance: capture ≤720p');
assert(!/CREATE TABLE|recording|screen.?share/i.test(read('api/_utils/huddleVideo.ts')), 'R: no new DB / recording schema');

console.log('\nPhase 3C video smoke — camera UX contracts (C–E)');

const ui = read('components/Community/VoiceHuddle.tsx');
assert(/setCameraEnabled\(true/.test(ui), 'C: can enable camera');
assert(/setCameraEnabled\(false/.test(ui), 'D: can disable camera');
assert(/formatCameraPermissionError|still connected by audio/i.test(ui), 'E: permission failure keeps audio messaging');
assert(
  formatCameraPermissionError({ message: 'Permission denied' }).includes('still connected by audio'),
  'E: denied message preserves voice'
);
assert(/HUDDLE_CAMERA_DEFAULT_ON/.test(ui), 'B: join path uses default-off constant');

console.log('\nPhase 3C video smoke — tiles / count / speaker (F–I)');

assert(/HuddleTile|scale-x-\[-1\]/.test(ui), 'F/G: local mirror + tile component');
assert(/Camera off|cameraOn/.test(ui), 'G: camera-off fallback path');
assert(huddleCountIgnoresCameraState(2, 1) === 2, 'H: count ignores camera state');
assert(huddleCountIgnoresCameraState(3, 0) === 3, 'H: all cameras off still counts room size');
assert(/ActiveSpeakersChanged|isSpeaking/.test(ui), 'I: active speaker wired');
assert(huddleVideoGridClass(1) === 'grid-cols-1', 'layout: 1 tile');
assert(huddleVideoGridClass(2).includes('sm:grid-cols-2'), 'layout: 2 tiles');
assert(huddleVideoGridClass(4) === 'grid-cols-2', 'layout: 3–4 tiles');
assert(huddleVideoGridClass(6).includes('sm:grid-cols-3'), 'layout: 5+ tiles');

console.log('\nPhase 3C video smoke — voice feature regression (J–M)');

assert(/toggleOwnHand|Raise Hand/.test(ui), 'J: Raise Hand retained');
assert(/moderatorLowerHand|Lower Hand/.test(ui), 'K: moderator Lower Hand retained');
assert(/toggleMute|setMicrophoneEnabled/.test(ui), 'L: Mute retained');
assert(/End Huddle for Everyone|voice-huddle-end/.test(ui), 'M: End for Everyone retained');
assert(/TrackSubscribed|TrackUnsubscribed|LocalTrackPublished/.test(ui), 'video track events wired');
assert(/adaptiveStream:\s*true/.test(ui) && /dynacast:\s*true/.test(ui), 'adaptiveStream + dynacast');

console.log('\nPhase 3C video smoke — ACL (N–Q)');

assert(
  decideVoiceHuddleAccess({
    canAccessChannel: true,
    visibility: 'private',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === true,
  'N: private access still gated by canAccessChannel true'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: false,
    visibility: 'private',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === false,
  'N: private denied without access'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: true,
    visibility: 'ministry',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === true,
  'O: ministry allowed when canAccessChannel'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: true,
    visibility: 'leadership',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === true,
  'P: leadership allowed when canAccessChannel'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: true,
    visibility: 'dm',
    isChannelModerator: true,
    isChannelCreator: true,
    isBroadAdmin: true,
  }).ok === false,
  'Q: DM still denied'
);

console.log('\nPhase 3C video smoke — hygiene / copy');

assert(/Live Huddle/.test(ui), 'UI labeled Live Huddle');
assert(/Join Huddle|Start Huddle/.test(ui), 'CTA uses Huddle not separate Voice/Video rooms');
assert(!/LiveHuddle/.test(read('pages/community/Chat.tsx').replace(/VoiceHuddle/g, '')), 'Chat still not importing AI LiveHuddle');
assert(/VoiceHuddle/.test(read('pages/community/Chat.tsx')), 'Chat still uses same VoiceHuddle component');
assert(!/userIdMigration|awc_migrate_user_id/.test(ui), 'no identity/RPC migration in huddle UI');

console.log('\nAll Phase 3C video smoke tests passed.');
