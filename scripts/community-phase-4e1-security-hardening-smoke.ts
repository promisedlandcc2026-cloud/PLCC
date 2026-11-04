/**
 * PLCC Community Phase 4E.1 — security hardening smoke (no live DB / LiveKit required).
 * Run: npx tsx scripts/community-phase-4e1-security-hardening-smoke.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BROAD_CHAT_ADMIN_ROLES,
  CHAT_CHANNEL_CREATE_ROLES,
  canAccessChannelSync,
  isClientVaultAiSpoofAttempt,
  isVaultAiChatMessage,
  sanitizeHumanChatDisplayName,
  type ChatChannelRow,
} from '../api/_utils/communityChatSecurity.js';
import {
  HUDDLE_CHAT_TOPIC,
  HUDDLE_CHAT_TYPE,
  routeHuddleDataPacket,
} from '../api/_utils/huddleChat.js';
import {
  HUDDLE_REACTION_TOPIC,
  HUDDLE_REACTION_TYPE,
} from '../api/_utils/huddleReaction.js';
import {
  decideVoiceHuddleAccess,
  huddlePublishSources,
  isLiveKitMicrophoneTrackSource,
  microphoneRestoreIsSelf,
  selectMicrophoneTrackSids,
  planVoiceAccessToken,
} from '../api/_utils/livekitVoice.js';
import { TrackSource } from 'livekit-server-sdk';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(process.cwd());
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const core = read('api/_utils/core.ts');
const voiceHelper = read('api/_utils/livekitVoice.ts');
const chatHelper = read('api/_utils/huddleChat.ts');
const ui = read('components/Community/VoiceHuddle.tsx');
const chatPage = read('pages/community/Chat.tsx');
const migration = read('supabase/migrations/community_phase_4e1_chat_rls_hardening.sql');
const handRaise = read('api/_utils/voiceHandRaise.ts');

console.log('\nPhase 4E.1 — A/B moderator mute trusted path');

const muteBytes = new TextEncoder().encode(
  JSON.stringify({ type: 'mod_mute', target: 'victim-id' })
);
const forged = routeHuddleDataPacket({
  payload: muteBytes,
  participant: { identity: 'member-attacker', name: 'Member' },
  localIdentity: 'victim-id',
  localCanModerate: false,
  topic: null,
});
assert(forged.route === 'ignore', 'A: MEMBER forged mod_mute rejected/ignored');
assert(
  (forged as { reason?: string }).reason === 'mod_mute_untrusted',
  'A: mod_mute_untrusted reason'
);

assert(/muteParticipantMicrophoneTracks/.test(voiceHelper), 'B: RoomService mute helper exists');
assert(/mutePublishedTrack/.test(voiceHelper), 'B: uses mutePublishedTrack');
assert(/voice-participant-mute/.test(core), 'B: API voice-participant-mute endpoint');
assert(/voice-participant-mute/.test(ui), 'B: VoiceHuddle calls server mute API');
assert(!/type:\s*['"]mod_mute['"]/.test(ui), 'B: UI no longer publishes mod_mute');

const memberMute = decideVoiceHuddleAccess({
  canAccessChannel: true,
  visibility: 'open',
  isChannelModerator: false,
  isChannelCreator: false,
  isBroadAdmin: false,
});
assert(memberMute.ok === true && memberMute.canModerate === false, 'B: MEMBER cannot moderate');

const modMute = decideVoiceHuddleAccess({
  canAccessChannel: true,
  visibility: 'open',
  isChannelModerator: true,
  isChannelCreator: false,
  isBroadAdmin: false,
});
assert(modMute.ok === true && modMute.canModerate === true, 'B: room moderator can moderate');

assert(
  /Only moderators can mute another participant/.test(core),
  'B: non-moderator mute returns 403 copy'
);
assert(isLiveKitMicrophoneTrackSource(TrackSource.MICROPHONE), 'B: mic source helper');
assert(!isLiveKitMicrophoneTrackSource(TrackSource.CAMERA), 'B: camera not treated as mic');
assert(
  selectMicrophoneTrackSids([
    { sid: 'TR_mic', source: 'MICROPHONE' },
    { sid: 'TR_music', source: 'UNKNOWN', name: 'awc-huddle-music', mimeType: 'audio/mpeg' },
    { sid: 'TR_cam', source: TrackSource.CAMERA, type: 'VIDEO' },
  ]).join(',') === 'TR_mic',
  'B: mute selects the microphone sid only'
);
assert(
  huddlePublishSources(true).includes(TrackSource.MICROPHONE),
  'B: restore includes microphone publish'
);
assert(!/canPublishSources: huddlePublishSources\(false\)/.test(voiceHelper), 'B: mute does not revoke mic publish');
assert(/setMicrophonePublishAllowed\([\s\S]*true\)/.test(voiceHelper), 'B: unmute restores mic publish');
assert(/voice-mic-restore/.test(core), 'B: member mic restore endpoint');
assert(microphoneRestoreIsSelf('member-a', 'member-a'), 'B: member can restore own mic');
assert(!microphoneRestoreIsSelf('member-a', 'member-b'), 'B: member cannot restore someone else');
assert(/You can only restore your own microphone/.test(core), 'B: restore rejects another identity');
assert(/voice-mic-restore/.test(ui), 'B: mic button restores own permission');
assert(/muted: wantMuted/.test(ui) || /muted \}/.test(ui), 'B: UI sends muted flag');

console.log('\nPhase 4E.1 — C/D/E/F/G data-plane + raise hand intact');

assert(/routeHuddleDataPacket/.test(chatHelper), 'C: single shared DataReceived router');
assert(/mod_mute_untrusted/.test(chatHelper), 'C: router strips mute authority');

const chatBytes = new TextEncoder().encode(
  JSON.stringify({
    type: HUDDLE_CHAT_TYPE,
    v: 1,
    id: 'c1',
    text: 'hello',
    sentAt: Date.now(),
  })
);
assert(
  routeHuddleDataPacket({
    payload: chatBytes,
    participant: { identity: 'a', name: 'A' },
    localIdentity: 'me',
    localCanModerate: false,
    topic: HUDDLE_CHAT_TOPIC,
  }).route === 'huddle_chat',
  'D: Huddle Chat unaffected'
);

const reactionBytes = new TextEncoder().encode(
  JSON.stringify({
    type: HUDDLE_REACTION_TYPE,
    v: 1,
    reaction: 'clap',
    id: 'r1',
    sentAt: Date.now(),
  })
);
assert(
  routeHuddleDataPacket({
    payload: reactionBytes,
    participant: { identity: 'a', name: 'A' },
    localIdentity: 'me',
    localCanModerate: false,
    topic: HUDDLE_REACTION_TOPIC,
  }).route === 'huddle_reaction',
  'E: reactions unaffected'
);

assert(/setMetadata|buildRaiseHandMetadata|buildLowerHandMetadata/.test(ui), 'F: Raise Hand metadata path');
assert(/voice-hand-lower/.test(ui) && /voice-hand-lower/.test(core), 'G: lower-hand server path intact');
assert(/clearParticipantHandRaise/.test(voiceHelper), 'G: RoomService lower-hand helper intact');
assert(/ParticipantMetadataChanged/.test(ui), 'F/G: metadata change listener retained');

console.log('\nPhase 4E.1 — H/I/J/K Chat RLS migration contracts');

assert(/community_phase_4e1_chat_rls_hardening/.test(migration) || migration.includes('4E.1'), 'H: migration present');
assert(
  migration.includes('DROP POLICY IF EXISTS "Authenticated users can create channels"'),
  'H: drops authenticated channel INSERT policy'
);
assert(
  migration.includes('DROP POLICY IF EXISTS "Users can post messages in visible channels"'),
  'I: drops authenticated message INSERT policy'
);
assert(
  migration.includes('DROP POLICY IF EXISTS "Public channels are viewable by everyone"'),
  'H/I: drops legacy public SELECT policy'
);
assert(
  migration.includes('DROP POLICY IF EXISTS "Private channels are viewable by participants"'),
  'H/I: drops legacy private SELECT policy'
);
assert(
  migration.includes('DROP POLICY IF EXISTS "Users can view messages in visible channels"'),
  'I: drops legacy message SELECT policy'
);
assert(!/FROM pg_policies/.test(migration), 'H: no diagnostic drop-all pg_policies loop');
assert(!/FORCE ROW LEVEL SECURITY/.test(migration), 'H: no FORCE RLS (verified live fix did not require it)');
assert(!/REVOKE ALL ON TABLE public\.chat_channels/.test(migration), 'H: no blanket REVOKE on channels');
assert(!/REVOKE ALL ON TABLE public\.chat_messages/.test(migration), 'I: no blanket REVOKE on messages');
assert(!/DROP TABLE|TRUNCATE|DELETE FROM/.test(migration), 'J: no destructive data SQL');
assert(/service role/i.test(migration), 'J: documents service-role API path');
assert(/DO NOT apply automatically/i.test(migration), 'J: not auto-applied');

const privateCh: ChatChannelRow = {
  id: 'p1',
  name: 'Private',
  type: 'private',
  visibility: 'private',
  participants: ['u1'],
};
assert(
  canAccessChannelSync(privateCh, 'u1', { isMember: true }) === true,
  'K: private ACL helper unchanged (member)'
);
assert(
  canAccessChannelSync(privateCh, 'u2', { isMember: false }) === false,
  'K: private ACL helper unchanged (outsider)'
);
const leadership: ChatChannelRow = {
  id: 'l1',
  name: 'Leadership',
  visibility: 'leadership',
  type: 'private',
};
assert(
  canAccessChannelSync(leadership, 'ml', { userRole: 'MINISTRY_LEADER' }) === true,
  'K: leadership ACL for MINISTRY_LEADER unchanged'
);
assert(
  canAccessChannelSync(leadership, 'mem', { userRole: 'MEMBER' }) === false,
  'K: leadership ACL denies MEMBER'
);

console.log('\nPhase 4E.1 — L/M/N/O Vault AI spoof prevention');

assert(isClientVaultAiSpoofAttempt({ isAi: true }) === true, 'L: isAi=true detected');
assert(
  isClientVaultAiSpoofAttempt({ userName: 'Vault AI' }) === true,
  'M: display name Vault AI detected'
);
assert(
  isClientVaultAiSpoofAttempt({ user_name: 'vault ai' }) === true,
  'M: user_name case-insensitive'
);
assert(isClientVaultAiSpoofAttempt({ content: 'hi' } as { isAi?: unknown }) === false, 'O: normal body not spoof');
assert(/isClientVaultAiSpoofAttempt\(req\.body\)/.test(core), 'L: messages POST rejects spoof');
assert(/chatType === 'ai-message'/.test(core), 'N: trusted ai-message path exists');
assert(/subResource=ai-message/.test(chatPage), 'N: Chat UI uses ai-message endpoint');
assert(!/isAi:\s*true/.test(chatPage), 'N: Chat UI no longer sends isAi:true');
assert(
  isVaultAiChatMessage({ user_id: null, user_name: 'Vault AI' }) === true,
  'N: legitimate AI row recognized'
);
assert(
  isVaultAiChatMessage({ user_id: 'u1', user_name: 'Vault AI' }) === false,
  'M: human row cannot present as AI via name alone'
);
assert(sanitizeHumanChatDisplayName('Vault AI') === 'Member', 'M: human display sanitized');
assert(sanitizeHumanChatDisplayName('Jane') === 'Jane', 'O: normal display preserved');
assert(/sanitizeHumanChatDisplayName\(authDisplayName\)/.test(core), 'O: human insert uses sanitizer');

console.log('\nPhase 4E.1 — hygiene');

assert(!/Prayer|EventSettings|Stories|followers/.test(migration), 'no Prayer/Event/Stories in migration');
assert(/Boolean\(input\.canModerate\)/.test(voiceHelper), 'token roomAdmin intact');
const plan = planVoiceAccessToken({
  userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  displayName: 'Tester',
  channelId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  canModerate: true,
});
assert(plan.grant.canPublishData === true, 'canPublishData still true for chat/reactions');
assert(plan.grant.roomAdmin === true, 'moderator still gets roomAdmin grant');

assert(
  CHAT_CHANNEL_CREATE_ROLES.has('MINISTRY_LEADER') && !BROAD_CHAT_ADMIN_ROLES.has('MINISTRY_LEADER'),
  'Part D note: ML in create-roles but not Broad (policy unchanged in 4E.1)'
);
assert(/CHAT_CHANNEL_CREATE_ROLES\.has\(authRole\)/.test(core), 'Part D: delete still uses create-roles');
assert(/buildModeratorLowerHandPayload|MOD_LOWER_HAND/.test(handRaise), 'hand-raise helper file intact');

console.log('\nPhase 4E.1 security hardening smoke — ALL PASSED\n');
