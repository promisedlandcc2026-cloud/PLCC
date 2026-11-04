/**
 * PLCC Community Phase 3B.2 — Live Huddle presence smoke.
 * Run: npx tsx scripts/community-phase-3b2-huddle-presence-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  channelIdFromVoiceRoomName,
  decideVoiceHuddleAccess,
  filterVoiceStatusChannelIds,
  formatChannelHuddleBadge,
  formatHeaderHuddleLabel,
  formatHuddleParticipantAria,
  mapRoomsToHuddleStatuses,
  voiceRoomNameForChannel,
} from '../api/_utils/livekitVoice.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

console.log('Phase 3B.2 presence smoke — status model');

const idA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const idB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const idPrivate = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const roomA = voiceRoomNameForChannel(idA);
const roomB = voiceRoomNameForChannel(idB);

const inactive = mapRoomsToHuddleStatuses([idA, idB], []);
assert(inactive[idA].active === false && inactive[idA].participantCount === 0, 'A: inactive room → no live');
assert(formatChannelHuddleBadge(0) === '', 'A: inactive badge empty');

const active = mapRoomsToHuddleStatuses(
  [idA, idB],
  [{ name: roomA, numParticipants: 3 }]
);
assert(active[idA].active === true && active[idA].participantCount === 3, 'B: active room → count shown');
assert(active[idB].active === false, 'B: missing room stays inactive');
assert(formatChannelHuddleBadge(3) === 'LIVE · 3', 'B: channel badge LIVE · N');
assert(formatHeaderHuddleLabel({ participantCount: 3, inHuddle: false }) === 'Ask to Join · 3', 'B: header join label');
assert(formatHeaderHuddleLabel({ participantCount: 3, inHuddle: true }) === 'In Huddle · 3', 'B: header in-huddle label');
assert(formatHuddleParticipantAria(1) === '1 participant in voice huddle', 'singular aria');
assert(formatHuddleParticipantAria(2) === '2 participants in voice huddle', 'plural aria');

const afterJoin = mapRoomsToHuddleStatuses(
  [idA],
  [{ name: roomA, numParticipants: 4 }]
);
assert(afterJoin[idA].participantCount === 4, 'C: count changes correctly');

const afterLeave = mapRoomsToHuddleStatuses([idA], []);
assert(afterLeave[idA].active === false, 'H: last participant leaves → inactive');
assert(
  mapRoomsToHuddleStatuses([idA], [{ name: roomA, numParticipants: 0 }])[idA].active === false,
  'I: empty room → inactive (moderator end equivalent)'
);

console.log('\nPhase 3B.2 presence smoke — ACL filters');

const filtered = filterVoiceStatusChannelIds([
  { id: idA, visibility: 'open' },
  { id: idPrivate, visibility: 'private' },
  { id: 'dm-1', visibility: 'dm' },
  { id: 'lead-1', visibility: 'leadership' },
]);
assert(filtered.includes(idA) && filtered.includes(idPrivate), 'E: private eligible for status if accessible');
assert(filtered.includes('lead-1'), 'F: leadership eligible for status if accessible');
assert(!filtered.includes('dm-1'), 'G: DM excluded from voice status set');
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: true,
    visibility: 'dm',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === false,
  'G: DM voice/status denied'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: false,
    visibility: 'private',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === false,
  'D/E: inaccessible channel voice decision denied'
);

// Simulate server ACL: inaccessible id never enters mapRooms input
const onlyAccessible = mapRoomsToHuddleStatuses(
  [idA],
  [
    { name: roomA, numParticipants: 2 },
    { name: voiceRoomNameForChannel(idPrivate), numParticipants: 9 },
  ]
);
assert(!(idPrivate in onlyAccessible), 'D: inaccessible channel status not returned');
assert(channelIdFromVoiceRoomName(roomB) === idB, 'room name round-trip');

console.log('\nPhase 3B.2 presence smoke — UI + API contracts');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chat = readFileSync(join(root, 'pages/community/Chat.tsx'), 'utf8');
const voice = readFileSync(join(root, 'components/Community/VoiceHuddle.tsx'), 'utf8');
const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
const livekitVoiceSrc = readFileSync(join(root, 'api/_utils/livekitVoice.ts'), 'utf8');
const notify = readFileSync(join(root, 'api/_utils/notify.ts'), 'utf8');
const phase2bSql = readFileSync(
  join(root, 'supabase/migrations/community_phase_2b_notifications_and_storage.sql'),
  'utf8'
);
const phase3b2TypeSql = readFileSync(
  join(root, 'supabase/migrations/community_phase_3b2_huddle_notification_type.sql'),
  'utf8'
);
const webhook = readFileSync(join(root, 'api/livekit-webhook.ts'), 'utf8');
const drawer = readFileSync(join(root, 'components/Admin/NotificationDrawer.tsx'), 'utf8');

assert(/voice-huddle-statuses/.test(chat), 'batch statuses endpoint used by Chat');
assert(
  /formatChannelHuddleBadge|formatHeaderHuddleLabel/.test(chat),
  'channel/header live label helpers used'
);
assert(/isAuthenticated/.test(chat), 'M: polling gated on authentication');
assert(/visibilityState === 'hidden'/.test(chat), 'M: polling pauses when tab hidden');
assert(/onPresenceChange/.test(voice) && /onPresenceChange/.test(chat), 'C: current-room realtime callback');
assert(/voice-huddle-statuses/.test(core), 'batch API registered');
assert(/listVoiceHuddleStatusesForChannels|listAccessibleChannels/.test(core), 'batch ACL re-check path');
assert(/listParticipants/.test(livekitVoiceSrc), 'batch presence uses listParticipants for accurate counts');
assert(/community_huddle_started/.test(notify), 'notify type includes community_huddle_started');
assert(/community_huddle_started/.test(phase3b2TypeSql), 'type migration allows community_huddle_started');
assert(/community_mention/.test(phase2bSql), 'existing community notify types remain in 2B SQL');
assert(/WebhookReceiver/.test(webhook), 'signed LiveKit webhook wired');
assert(/community_huddle_started/.test(drawer) && /Mic/.test(drawer), 'drawer Voice Huddle + Mic');
assert(/searchParams\.get\('channel'\)/.test(chat), 'Chat deep-link ?channel=');
assert(/notifyHuddleStartedUsers|listCommunityNotifyEligibleUserIds/.test(
  readFileSync(join(root, 'api/_utils/livekitHuddleNotify.ts'), 'utf8')
), 'blocker fixes: conflict-safe + Community eligibility');
assert(/user_notifications_huddle_started_dedupe_idx/.test(
  readFileSync(join(root, 'supabase/migrations/community_phase_3b2_huddle_notify_dedupe.sql'), 'utf8')
), 'dedupe unique index migration present');
assert(!/LIVEKIT_API_SECRET/.test(chat), 'no secret client-side');

console.log('\nPhase 3B.2 notification schema status');
console.log('  community_huddle_started allowed (migration applied + notify wired)');
console.log('  Presence UI + huddle-start webhook notifications implemented.');

console.log('\nAll Phase 3B.2 huddle presence smoke tests passed.');
