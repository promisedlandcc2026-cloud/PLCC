/**
 * PLCC Community Phase 3B — voice huddle smoke (no live LiveKit required).
 * Run: npx tsx scripts/community-phase-3b-voice-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  signHuddleFallbackPass,
  verifyHuddleFallbackPass,
} from '../api/_utils/huddleFallbackPass.js';
import {
  canAccessChannelSync,
  type ChatChannelRow,
} from '../api/_utils/communityChatSecurity.js';
import {
  channelIdFromVoiceRoomName,
  decideVoiceHuddleAccess,
  getLiveKitServerConfig,
  looksLikeLiveKitSecret,
  planVoiceAccessToken,
  voiceRoomNameForChannel,
} from '../api/_utils/livekitVoice.js';
import {
  buildLowerHandMetadata,
  buildRaiseHandMetadata,
  buildRaisedHandQueue,
  decideLocalHandToggle,
  decideModeratorLowerHand,
  formatHandsRaisedStatus,
  parseHandRaiseMetadata,
  raiseHandChangesMuteState,
} from '../api/_utils/voiceHandRaise.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const openChannel: ChatChannelRow = {
  id: 'open-1',
  name: 'General',
  type: 'public',
  visibility: 'open',
};

const privateChannel: ChatChannelRow = {
  id: 'priv-1',
  name: 'Elders',
  type: 'private',
  visibility: 'private',
  created_by: 'creator-1',
  participants: ['creator-1', 'member-a'],
};

const ministryChannel: ChatChannelRow = {
  id: 'min-1',
  name: 'Worship',
  type: 'private',
  visibility: 'ministry',
  ministry_id: 'm1',
  participants: ['leader-1'],
};

const leadership: ChatChannelRow = {
  id: 'lead-1',
  name: 'Leadership',
  type: 'private',
  visibility: 'leadership',
};

const dm: ChatChannelRow = {
  id: 'dm-1',
  name: 'DM_a_b',
  type: 'private',
  visibility: 'dm',
  participants: ['user-a', 'user-b'],
};

console.log('Phase 3B voice smoke — room naming + token identity');

const room = voiceRoomNameForChannel('91942994-7fcc-4348-b139-1ef931c3e407');
assert(
  room === 'awc-channel-91942994-7fcc-4348-b139-1ef931c3e407',
  'E: room name tied to channel id'
);
assert(
  channelIdFromVoiceRoomName(room) === '91942994-7fcc-4348-b139-1ef931c3e407',
  'E: channel id recoverable from room name'
);

const plan = planVoiceAccessToken({
  userId: 'cc16b787-203c-49ed-af94-f77bdaef0c23',
  displayName: 'Jerless',
  channelId: '91942994-7fcc-4348-b139-1ef931c3e407',
  canModerate: true,
});
assert(plan.identity === 'cc16b787-203c-49ed-af94-f77bdaef0c23', 'D: token identity is server-derived user id');
assert(plan.name === 'Jerless', 'D: display name set on token plan');
assert(plan.grant.roomJoin === true, 'A: room join granted for authorized plan');
assert(plan.grant.room === room, 'E: grant.room matches deterministic room');
assert(plan.grant.roomAdmin === true, 'moderator gets roomAdmin');
assert(plan.grant.canPublish === true && plan.grant.canSubscribe === true, 'K: voice token ACL grants unchanged');
assert(plan.grant.canUpdateOwnMetadata === true, 'token allows own metadata updates for raise hand');
assert(plan.ttlSeconds === 6 * 60 * 60, 'default TTL is 6 hours (church service length)');
assert(plan.ttlSeconds > 0 && plan.ttlSeconds <= 60 * 60 * 6, 'TTL bounded at 6 hours');

console.log('\nPhase 3B voice smoke — authorization');

assert(
  canAccessChannelSync(openChannel, 'anyone') === true,
  'A: open channel member-equivalent access ok'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: true,
    visibility: 'open',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === true,
  'A: authorized open channel gets voice decision ok'
);

assert(
  canAccessChannelSync(privateChannel, 'stranger', { isMember: false }) === false,
  'B: private non-member denied channel access'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: false,
    visibility: 'private',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === false,
  'B: non-member voice decision denied'
);

assert(
  canAccessChannelSync(privateChannel, 'member-a', { isMember: true }) === true,
  'C: private membership preserved'
);
assert(
  canAccessChannelSync(leadership, 'pastor-1', { userRole: 'PASTOR' }) === true,
  'C: leadership access preserved'
);
assert(
  canAccessChannelSync(ministryChannel, 'outsider', { isMember: false }) === false,
  'C: ministry non-member denied'
);

const dmDeny = decideVoiceHuddleAccess({
  canAccessChannel: true,
  visibility: 'dm',
  isChannelModerator: false,
  isChannelCreator: false,
  isBroadAdmin: false,
});
assert(dmDeny.ok === false, 'J: DM voice deferred (explicit deny)');

const modPlan = decideVoiceHuddleAccess({
  canAccessChannel: true,
  visibility: 'ministry',
  isChannelModerator: true,
  isChannelCreator: false,
  isBroadAdmin: false,
});
assert(modPlan.ok === true && modPlan.canModerate === true, 'ministry moderator can end huddle');

console.log('\nPhase 3B voice smoke — secret not client-exposed');

assert(getLiveKitServerConfig({}) === null, 'missing env → no config');
assert(
  getLiveKitServerConfig({
    LIVEKIT_URL: 'wss://example.livekit.cloud',
    LIVEKIT_API_KEY: 'APIxxx',
    LIVEKIT_API_SECRET: 'secret',
  }) !== null,
  'full server env loads config'
);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const voiceUi = readFileSync(join(root, 'components/Community/VoiceHuddle.tsx'), 'utf8');
const chatPage = readFileSync(join(root, 'pages/community/Chat.tsx'), 'utf8');
assert(!/LIVEKIT_API_SECRET/.test(voiceUi), 'F: VoiceHuddle does not reference LIVEKIT_API_SECRET');
assert(!/LIVEKIT_API_SECRET/.test(chatPage), 'F: Chat page does not reference LIVEKIT_API_SECRET');
assert(!looksLikeLiveKitSecret(voiceUi), 'F: VoiceHuddle source does not embed secret-like material');
assert(/voice-token/.test(voiceUi), 'client requests server voice-token endpoint');
assert(/voice-token-fallback/.test(voiceUi), 'client can open LiveKit from a saved pass');
assert(!/mintLiveKitAccessToken/.test(voiceUi), 'F: client does not mint tokens locally');
assert(
  /import VoiceHuddle from ['\"].*Community\/VoiceHuddle['\"]/.test(chatPage),
  'Community Chat imports VoiceHuddle'
);
assert(
  !/import\s+LiveHuddle\s+from/.test(chatPage),
  'Community Chat does not import AI LiveHuddle'
);
assert(!/<LiveHuddle[\s/>]/.test(chatPage), 'Community Chat does not render LiveHuddle');
assert(!/PLCC AI Strategist|Initializing Secure Voice Link|primary focus/.test(chatPage), 'Community Chat has no AI Strategist copy');
assert(/Start Huddle|Join Huddle|Start Voice Huddle|Join Voice Huddle/.test(voiceUi), 'VoiceHuddle exposes Start/Join CTAs');
assert(/Live Huddle|Voice Huddle/.test(voiceUi), 'VoiceHuddle shows huddle branding');
assert(/End Huddle for Everyone|End for everyone/.test(voiceUi), 'VoiceHuddle exposes moderator end control');
assert(!/PLCC AI Strategist|Initializing Secure Voice Link|primary focus|END SESSION/.test(voiceUi), 'VoiceHuddle has no legacy AI session UI');
assert(/Raise Hand|Lower Hand/.test(voiceUi), 'VoiceHuddle exposes raise/lower hand controls');
assert(/voice-hand-lower/.test(voiceUi), 'moderator lower uses server voice-hand-lower endpoint');
assert(/ParticipantMetadataChanged|setMetadata|buildRaiseHandMetadata/.test(voiceUi), 'C: raise hand uses LiveKit metadata path');
assert(!/from\(['\"]chat_.*hand|supabase\.from\(['\"]raise/.test(voiceUi), 'C: no raise-hand DB table usage');
assert(/voice-huddle-statuses/.test(chatPage), '3B.2: Chat uses batch voice-huddle-statuses');
assert(/onPresenceChange/.test(voiceUi), '3B.2: VoiceHuddle reports realtime presence');
assert(/fetchWithTimeout/.test(chatPage), 'Chat channel/message fetches use timeouts');
assert(/45_000|45000/.test(chatPage), 'channels fetch allows cold-start budget');
assert(/retrying once|isAbortOrTimeoutError/.test(chatPage), 'channels auto-retries abort/timeout');
assert(/channelsError|Retry/.test(chatPage), 'Chat shows retry when channels fail to load');
assert(/setInterval\(tick,\s*10000\)/.test(chatPage), 'LIVE huddle status polls every 10s');
assert(/fetchHuddleStatuses/.test(chatPage), 'Chat refreshes huddle statuses after channels load');

console.log('\nPhase 3B voice smoke — raise hand queue + ACL');

const raisedA = buildRaiseHandMetadata('{}', 1000);
const raisedB = buildRaiseHandMetadata('{}', 2000);
const raisedC = buildRaiseHandMetadata('{}', 1500);
assert(parseHandRaiseMetadata(raisedA).handRaised === true, 'A: raise metadata marks hand raised');
assert(parseHandRaiseMetadata(buildLowerHandMetadata(raisedA)).handRaised === false, 'B: lower metadata clears hand');

const queue = buildRaisedHandQueue([
  { identity: 'b', name: 'Betty', metadata: raisedB },
  { identity: 'a', name: 'Anna', metadata: raisedA },
  { identity: 'c', name: 'Chris', metadata: raisedC },
  { identity: 'd', name: 'Dana', metadata: buildLowerHandMetadata('{}') },
]);
assert(queue.length === 3, 'D: only raised hands in queue');
assert(queue[0].identity === 'a' && queue[0].position === 1, 'D: earliest raisedAt is #1');
assert(queue[1].identity === 'c' && queue[2].identity === 'b', 'D: order by raisedAt ASC');

const reRaise = buildRaiseHandMetadata(buildLowerHandMetadata(raisedA), 5000);
const queue2 = buildRaisedHandQueue([
  { identity: 'b', name: 'Betty', metadata: raisedB },
  { identity: 'a', name: 'Anna', metadata: reRaise },
  { identity: 'c', name: 'Chris', metadata: raisedC },
]);
assert(queue2[queue2.length - 1].identity === 'a', 'E: re-raise moves to end of queue');

const afterLeave = buildRaisedHandQueue([
  { identity: 'b', name: 'Betty', metadata: raisedB },
  // a disconnected — absent from snapshots
  { identity: 'c', name: 'Chris', metadata: raisedC },
]);
assert(!afterLeave.some((q) => q.identity === 'a'), 'F: disconnect removes hand from queue');
assert(afterLeave[0].position === 1 && afterLeave[0].identity === 'c', 'F: queue renumbers after leave');

assert(decideLocalHandToggle({ actorIdentity: 'u1', targetIdentity: 'u1' }).ok === true, 'A: local raise allowed');
assert(decideLocalHandToggle({ actorIdentity: 'u1', targetIdentity: 'u2' }).ok === false, 'H: cannot raise/lower for another locally');
assert(
  decideModeratorLowerHand({
    actorIdentity: 'mod',
    targetIdentity: 'u2',
    actorIsRoomModerator: true,
  }).ok === true,
  'G: moderator can lower another hand'
);
assert(
  decideModeratorLowerHand({
    actorIdentity: 'member',
    targetIdentity: 'u2',
    actorIsRoomModerator: false,
  }).ok === false,
  'H: non-moderator cannot lower another hand'
);
assert(raiseHandChangesMuteState() === false, 'I: raise hand does not change mute state');
assert(formatHandsRaisedStatus(1) === '✋ 1 hand raised', 'status singular');
assert(formatHandsRaisedStatus(3) === '✋ 3 hands raised', 'status plural');

const voiceSrc = readFileSync(join(root, 'api/_utils/livekitVoice.ts'), 'utf8');
const coreSrc = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
assert(/ensureVoiceRoom/.test(voiceSrc), 'ensureVoiceRoom exported');
assert(/VOICE_ROOM_EMPTY_TIMEOUT_SECONDS/.test(voiceSrc), 'long emptyTimeout constant');
assert(/departureTimeout:\s*VOICE_ROOM_DEPARTURE_TIMEOUT/.test(voiceSrc), 'departureTimeout on createRoom');
assert(/ensureVoiceRoom\(lk,\s*cid\)/.test(coreSrc), 'voice-token ensures room before mint');
assert(/roomAdmin/.test(coreSrc) && /isHuddleSessionModerator/.test(coreSrc), 'roomAdmin only for session host/co-host');
assert(/joinInFlightRef/.test(voiceUi), 'join locked against double-connect / identity kick');
assert(/disconnectRoomRef/.test(voiceUi), 'disconnect via stable ref (no mid-call effect kick)');
assert(/fetchWithTimeout|AbortController/.test(voiceUi), 'end/join use request timeout');
assert(/withClientTimeout/.test(voiceUi), 'room disconnect bounded so Leave cannot hang');
assert(/void checkStatus\(\)/.test(voiceUi), 'leave does not await status (DB hang fix)');
assert(/data-huddle-chat-panel|huddle-chat/.test(voiceUi), 'VoiceHuddle has huddle chat panel');
assert(/max-sm:absolute|scrollIntoView/.test(voiceUi), 'mobile chat opens as visible sheet');
assert(/createPortal/.test(voiceUi) && /data-huddle-portal/.test(voiceUi), 'huddle portals to body (iOS bottom-nav fix)');
assert(/awc-huddle-open/.test(voiceUi), 'body class while huddle open');
assert(/endRoomOnLeave|alone/.test(voiceUi), 'solo moderator Leave ends LiveKit room');
assert(/localTeardown/.test(voiceUi), 'end-for-everyone tears down UI in parallel with server');
assert(/data-huddle-prejoin-end/.test(voiceUi), 'prejoin End clears stuck huddle without joining');
assert(/channelCanModerate/.test(coreSrc) && /voice-huddle-status/.test(coreSrc), 'status returns canModerate for prejoin End');
assert(/presence\.active === false/.test(chatPage), 'Chat clears LIVE badge after End');
assert(/setEnding\(false\)/.test(voiceUi) && /Ending…|Ending\.\.\./.test(voiceUi), 'Ending UI clears ending flag');
assert(/startAudio/.test(voiceUi), 'unlocks audio after join (Safari/WebKit)');
assert(/data-huddle-enable-audio|audioBlocked|Enable huddle sound|enable huddle sound/.test(voiceUi), 'tap-to-enable sound affordance');
assert(/Timed out ending the LiveKit room|timeoutMs/.test(voiceSrc), 'server endVoiceRoom has timeout');
assert(
  planVoiceAccessToken({
    userId: 'u1',
    displayName: 'A',
    channelId: 'c1',
    canModerate: true,
    roomAdmin: false,
  }).grant.roomAdmin === false,
  'roomAdmin can be false while canModerate true'
);

const fallbackPass = signHuddleFallbackPass(
  {
    userId: 'user-1',
    channelId: 'channel-1',
    displayName: 'Jordan Smith',
    canModerate: false,
    channelCanModerate: false,
  },
  'test-secret',
  1_000
);
assert(Boolean(fallbackPass), 'fallback pass signs');
assert(
  verifyHuddleFallbackPass(String(fallbackPass), 'test-secret', 1_000)?.userId === 'user-1',
  'fallback pass verifies'
);
assert(verifyHuddleFallbackPass(String(fallbackPass), 'other-secret', 1_000) === null, 'fallback pass rejects a bad signature');
assert(verifyHuddleFallbackPass(String(fallbackPass), 'test-secret', 1_000 + 13 * 60 * 60) === null, 'fallback pass expires');
assert(/voice-token-fallback/.test(voiceUi), 'client can open LiveKit from a saved pass');
assert(/voice-token-fallback/.test(coreSrc), 'server accepts a saved huddle pass without Supabase');
assert(/connectLiveKitOnce/.test(voiceUi), 'client tries LiveKit once');
assert(/voice-daily-token/.test(readFileSync(join(root, 'lib/huddle/index.ts'), 'utf8')), 'client can request Daily backup audio');
assert(/livekit_quota_exceeded/.test(readFileSync(join(root, 'lib/huddle/index.ts'), 'utf8')), 'client remembers a LiveKit quota block');
assert(/voice-daily-token/.test(coreSrc), 'server exposes the Daily token route');
assert(/Rejoin prayer/.test(voiceUi), 'a dropped call can rejoin in place');
assert(!/room\.connect\(/.test(voiceUi), 'VoiceHuddle does not call room.connect directly');
const dailySrc = readFileSync(join(root, 'api/_utils/dailyVoice.ts'), 'utf8');
assert(!/max_participants/.test(dailySrc), 'Daily room create does not set max_participants');
assert(/start_video_off:\s*true/.test(dailySrc), 'Daily room starts with video off');
assert(/start_audio_off:\s*false/.test(dailySrc), 'Daily room starts with audio on');
assert(/Join the prayer call with your voice/.test(voiceUi), 'pre-join copy is a voice prayer call');
assert(/status\(502\)/.test(coreSrc), 'Daily API failures return 502');

console.log('\nAll Phase 3B voice smoke tests passed.');
