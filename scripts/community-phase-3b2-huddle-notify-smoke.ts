/**
 * PLCC Community Phase 3B.2 — huddle-start notification smoke (blocker fixes).
 * Run: npx tsx scripts/community-phase-3b2-huddle-notify-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDmChannel, normalizeVisibility } from '../api/_utils/communityChatSecurity.js';
import {
  isCommunityNotifyEligibleUser,
  isMemberPickerEligibleUser,
  isSyntheticOrphanEmail,
} from '../api/_utils/communityMembership.js';
import {
  formatHuddleStartedBody,
  formatHuddleStartedTitle,
  huddleNotificationSourceId,
  huddleStartedLink,
  resolveHuddleNotifyChannelId,
  shouldNotifyForLiveKitEvent,
} from '../api/_utils/livekitHuddleNotify.js';
import { isUniqueViolation, mergeHuddleStartedNotifyRows } from '../api/_utils/notify.js';
import { voiceRoomNameForChannel } from '../api/_utils/livekitVoice.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const channelId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const sid1 = 'RM_session_one';
const sid2 = 'RM_session_two';
const src1 = huddleNotificationSourceId(sid1);
const src2 = huddleNotificationSourceId(sid2);

console.log('Phase 3B.2 huddle notify — atomic dedupe model (A–D)');

assert(src1 === huddleNotificationSourceId(sid1), 'same room.sid → same source_id');
assert(src1 !== src2, 'C: new room.sid → new source_id');

const once = mergeHuddleStartedNotifyRows([], [{ user_id: userA, source_id: src1 }]);
assert(once.length === 1, 'A: first insert keeps one row');

const twice = mergeHuddleStartedNotifyRows(once, [{ user_id: userA, source_id: src1 }]);
assert(twice.length === 1, 'A: same recipient + same room.sid twice → one row');

// B: simulate concurrent duplicate webhook deliveries (both "insert" same set)
const concurrentA = mergeHuddleStartedNotifyRows([], [
  { user_id: userA, source_id: src1 },
  { user_id: userB, source_id: src1 },
]);
const concurrentB = mergeHuddleStartedNotifyRows(concurrentA, [
  { user_id: userA, source_id: src1 },
  { user_id: userB, source_id: src1 },
]);
assert(concurrentB.length === 2, 'B: concurrent duplicate path → still one row per recipient');
assert(
  concurrentB.filter((r) => r.user_id === userA && r.source_id === src1).length === 1,
  'B: userA not duplicated'
);

const newSession = mergeHuddleStartedNotifyRows(twice, [{ user_id: userA, source_id: src2 }]);
assert(newSession.length === 2, 'C: same recipient + new room.sid → new insert allowed');

const twoRecipients = mergeHuddleStartedNotifyRows([], [
  { user_id: userA, source_id: src1 },
  { user_id: userB, source_id: src1 },
]);
assert(twoRecipients.length === 2, 'D: two recipients + same room.sid → one each');

assert(isUniqueViolation({ code: '23505' }) === true, 'unique_violation 23505 recognized');
assert(isUniqueViolation({ message: 'duplicate key value violates unique constraint' }) === true, 'duplicate key message recognized');
assert(isUniqueViolation({ code: '42P01' }) === false, 'non-unique errors not swallowed');

console.log('\nPhase 3B.2 huddle notify — open eligibility (E–I)');

assert(isCommunityNotifyEligibleUser({ role: 'PENDING', email: 'a@x.com' }) === false, 'E: PENDING excluded');
assert(
  isCommunityNotifyEligibleUser({ role: 'MEMBER', email: 'orphaned+abc@awc-vault.local' }) === false,
  'F: orphaned+ excluded'
);
assert(
  isCommunityNotifyEligibleUser({ role: 'SUPER_ADMIN', email: 'retired@awc-vault.local' }) === false,
  'G: generic @awc-vault.local synthetic excluded'
);
assert(isSyntheticOrphanEmail('x@awc-vault.local') === true, 'G: synthetic helper');
assert(
  isCommunityNotifyEligibleUser({ role: 'MEMBER', email: 'invitee@church.org' }) === true,
  'H: legitimate real-email invitee remains eligible (Auth not required)'
);
assert(
  isMemberPickerEligibleUser({ role: 'MEMBER', email: 'invitee@church.org' }) ===
    isCommunityNotifyEligibleUser({ role: 'MEMBER', email: 'invitee@church.org' }),
  'H: Community notify eligibility matches member picker'
);
assert(
  isCommunityNotifyEligibleUser({ role: 'PASTOR', email: 'pastor@church.org' }) === true,
  'I: normal member eligible (initiator exclusion is by id at fan-out)'
);

console.log('\nPhase 3B.2 huddle notify — ACL / events / rooms (J–N)');

assert(normalizeVisibility({ visibility: 'private' } as any) === 'private', 'J: private visibility');
assert(normalizeVisibility({ visibility: 'ministry' } as any) === 'ministry', 'K: ministry visibility');
assert(normalizeVisibility({ visibility: 'leadership' } as any) === 'leadership', 'L: leadership visibility');
assert(isDmChannel({ visibility: 'dm', name: 'DM_x' } as any) === true, 'M: DM detected');
assert(shouldNotifyForLiveKitEvent('room_started') === true, 'room_started notifies');
assert(shouldNotifyForLiveKitEvent('participant_joined') === false, 'joins do not notify');
assert(resolveHuddleNotifyChannelId(voiceRoomNameForChannel(channelId)) === channelId, 'room resolves');
assert(resolveHuddleNotifyChannelId('bad-room') === null, 'malformed room rejected');
assert(formatHuddleStartedTitle() === 'Voice Huddle Started', 'title copy');
assert(
  formatHuddleStartedBody('General') === 'A Voice Huddle has started in #General.',
  'body copy'
);
assert(huddleStartedLink(channelId) === `/community/chat?channel=${channelId}`, 'deep-link');

console.log('\nPhase 3B.2 huddle notify — file contracts (N + wiring)');

const webhook = read('api/livekit-webhook.ts');
const notifyHelper = read('api/_utils/livekitHuddleNotify.ts');
const notifyTs = read('api/_utils/notify.ts');
const membership = read('api/_utils/communityMembership.ts');
const drawer = read('components/Admin/NotificationDrawer.tsx');
const chat = read('pages/community/Chat.tsx');
const vercel = read('vercel.json');
const typeSql = read('supabase/migrations/community_phase_3b2_huddle_notification_type.sql');
const dedupeSql = read('supabase/migrations/community_phase_3b2_huddle_notify_dedupe.sql');
const envEx = read('env.livekit.example');

assert(/WebhookReceiver/.test(webhook) && /receiver\.receive\(/.test(webhook), 'N: signed receive');
assert(/status\(401\)/.test(webhook), 'N: unsigned → 401');
assert(/notifyHuddleStartedUsers/.test(notifyHelper), 'conflict-safe huddle insert used');
assert(!/notifyAllUsers/.test(notifyHelper), 'open path does not use notifyAllUsers');
assert(/listCommunityNotifyEligibleUserIds/.test(notifyHelper), 'open uses Community eligibility list');
assert(/filterCommunityNotifyEligibleUserIds/.test(notifyHelper), 'restricted filters eligibility');
assert(/isUniqueViolation/.test(notifyTs), 'unique violation treated as success');
assert(/notifyHuddleStartedUsers/.test(notifyTs), 'huddle-specific notify helper present');
assert(/isCommunityNotifyEligibleUser/.test(membership), 'shared Community notify eligibility helper');
assert(/user_notifications_huddle_started_dedupe_idx/.test(dedupeSql), 'dedupe migration present');
assert(/community_huddle_started/.test(typeSql), 'type migration unchanged/present');
assert(!/alreadyNotifiedForSession/.test(notifyHelper), 'no SELECT-before-INSERT correctness path');
assert(/community_huddle_started/.test(drawer) && /Mic/.test(drawer), 'drawer support');
assert(/searchParams\.get\('channel'\)/.test(chat), 'Chat deep-link');
assert(/livekit-webhook/.test(vercel), 'vercel dedicated webhook route');
assert(/awc-vault-git-feature-awc-commun-35f748/.test(envEx), 'preview stable alias documented');
assert(/ONE active webhook|one active webhook/i.test(envEx), 'single webhook destination ops rule');
assert(!/CREATE TABLE/i.test(dedupeSql), 'no huddle-state table');

console.log('\nAll Phase 3B.2 huddle notification smoke tests passed.');
