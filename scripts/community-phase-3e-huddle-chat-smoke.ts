/**
 * PLCC Community Phase 3E — Live Huddle ephemeral chat smoke (no live media required).
 * Run: npx tsx scripts/community-phase-3e-huddle-chat-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendHuddleChatMessage,
  buildHuddleChatWirePayload,
  canSafelyBroadcastHuddleChatDelete,
  clearHuddleChatUnread,
  copyDataPayloadBytes,
  createHuddleChatId,
  encodeHuddleChatPayload,
  HUDDLE_CHAT_DEFAULT_OPEN,
  HUDDLE_CHAT_MAX_LENGTH,
  HUDDLE_CHAT_TOPIC,
  HUDDLE_CHAT_TYPE,
  huddleCountIgnoresChat,
  hydrateHuddleChatMessage,
  nextHuddleChatUnread,
  parseHuddleChatWirePayload,
  parseHuddleDataReceivedArgs,
  peekDataPacketType,
  resolveHuddleDataSender,
  routeHuddleDataPacket,
  validateHuddleChatText,
} from '../api/_utils/huddleChat.js';
import { tokenPlanAllowsScreenSharePublish } from '../api/_utils/huddleScreenShare.js';
import { planVoiceAccessToken } from '../api/_utils/livekitVoice.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const ui = read('components/Community/VoiceHuddle.tsx');
const helper = read('api/_utils/huddleChat.ts');
const lkEvents = read('node_modules/livekit-client/src/room/events.ts');

console.log('Phase 3E huddle chat smoke — defaults / composer');

assert(HUDDLE_CHAT_DEFAULT_OPEN === false, 'chat default closed');
assert(/data-huddle-chat-control/.test(ui) && /data-huddle-chat-panel/.test(ui), 'Chat UI wired');
assert(/data-huddle-chat-docked/.test(ui), 'Chat docks beside/below video (not overlay)');
assert(/data-huddle-main-split/.test(ui), 'Video + chat split container');
assert(/data-huddle-stage-column/.test(ui), 'Video + controls stay in one column');
assert(!/Dismiss huddle chat backdrop/.test(ui), 'No dimming backdrop over video');
assert(!/absolute z-\[50\][\s\S]*data-huddle-chat-panel/.test(ui), 'Chat panel is not absolute overlay');
assert(/controlIdleClass/.test(ui) && /controlActiveClass/.test(ui), 'Unified control button styles');
assert(validateHuddleChatText('').ok === false, 'reject empty');
assert(validateHuddleChatText('   ').ok === false, 'reject whitespace');
assert(
  validateHuddleChatText('x'.repeat(HUDDLE_CHAT_MAX_LENGTH + 1)).reason === 'too_long',
  'reject oversize'
);

console.log('\nPhase 3E huddle chat smoke — route-level A–O');

const chromeWire = buildHuddleChatWirePayload({
  id: createHuddleChatId(() => 'chrome-test-1'),
  text: 'TEST',
  sentAt: Date.now(),
})!;
const chromeBytes = encodeHuddleChatPayload(chromeWire);

// A. valid remote + participant present → chat
const routedA = routeHuddleDataPacket({
  payload: chromeBytes,
  participant: { identity: 'chrome-user', name: 'Chrome' },
  localIdentity: 'safari-user',
  localCanModerate: false,
  topic: HUDDLE_CHAT_TOPIC,
});
assert(routedA.route === 'huddle_chat', 'A: valid remote huddle_chat + participant → chat');
if (routedA.route === 'huddle_chat') {
  assert(routedA.message.senderIdentity === 'chrome-user', 'A: sender = participant.identity');
  assert(routedA.message.text === 'TEST', 'A: text preserved');
  assert(routedA.message.isLocal === false, 'A: remote not local');
}

// B. participant undefined + zero remotes → ignore
const routedB = routeHuddleDataPacket({
  payload: chromeBytes,
  participant: null,
  localIdentity: 'safari-user',
  localCanModerate: false,
  topic: null,
});
assert(
  routedB.route === 'ignore' && routedB.reason === 'missing_sender',
  'B: participant undefined + zero remotes → missing_sender'
);

// C. participant undefined + one remote would have been guessed before — MUST still ignore
assert(
  resolveHuddleDataSender({
    participant: null,
  }) === null,
  'C: resolve with no participant returns null (no roster arg)'
);
assert(
  !/sole_remote|remoteParticipants/.test(
    helper.slice(helper.indexOf('resolveHuddleDataSender'), helper.indexOf('export type HuddleDataRoute'))
  ),
  'C: no sole-remote / roster guessing in resolveHuddleDataSender'
);
const routedC = routeHuddleDataPacket({
  payload: chromeBytes,
  participant: null,
  localIdentity: 'safari-user',
  localCanModerate: false,
  topic: null,
});
assert(
  routedC.route === 'ignore' && routedC.reason === 'missing_sender',
  'C: participant undefined + one remote still ignore (no roster guessing)'
);

// D. participant undefined + two remotes → ignore (route has no roster; same drop)
const routedD = routeHuddleDataPacket({
  payload: chromeBytes,
  participant: undefined,
  localIdentity: 'local',
  localCanModerate: false,
});
assert(
  routedD.route === 'ignore' && routedD.reason === 'missing_sender',
  'D: participant undefined + two remotes → ignore'
);

// E. spoofed payload sender fields ignored; participant wins
const spoofParsed = parseHuddleChatWirePayload({
  type: HUDDLE_CHAT_TYPE,
  v: 1,
  id: 'spoof-1',
  text: 'hi',
  sentAt: Date.now(),
  senderIdentity: 'attacker',
  senderName: 'Attacker',
  isModerator: true,
})!;
const spoofBytes = encodeHuddleChatPayload(spoofParsed);
const routedE = routeHuddleDataPacket({
  payload: spoofBytes,
  participant: { identity: 'real-id', name: 'Real' },
  localIdentity: 'me',
  localCanModerate: false,
  topic: HUDDLE_CHAT_TOPIC,
});
assert(routedE.route === 'huddle_chat', 'E: spoofed payload still routes when participant present');
if (routedE.route === 'huddle_chat') {
  assert(routedE.message.senderIdentity === 'real-id', 'E: participant identity wins');
  assert(routedE.message.senderName === 'Real', 'E: participant name wins');
  assert(routedE.message.showModeratorBadge === false, 'E: payload isModerator ignored');
}
const hydratedSpoof = hydrateHuddleChatMessage({
  payload: spoofParsed,
  senderIdentity: 'real-id',
  senderName: 'Real',
  localIdentity: 'me',
  localCanModerate: false,
});
assert(hydratedSpoof?.senderIdentity === 'real-id', 'E: hydrate ignores payload sender');

// F. valid chat + correct topic → chat
assert(
  routeHuddleDataPacket({
    payload: chromeBytes,
    participant: { identity: 'chrome-user', name: 'Chrome' },
    localIdentity: 'safari-user',
    localCanModerate: false,
    topic: HUDDLE_CHAT_TOPIC,
  }).route === 'huddle_chat',
  'F: valid chat + correct topic → chat'
);

// G. valid chat + wrong topic → ignore
const routedG = routeHuddleDataPacket({
  payload: chromeBytes,
  participant: { identity: 'chrome-user', name: 'Chrome' },
  localIdentity: 'safari-user',
  localCanModerate: false,
  topic: 'other.topic',
});
assert(
  routedG.route === 'ignore' && routedG.reason === 'wrong_topic',
  'G: valid chat + wrong topic → ignore'
);

// H. valid chat + no topic → allowed (type is authoritative; topic optional)
assert(
  routeHuddleDataPacket({
    payload: chromeBytes,
    participant: { identity: 'chrome-user', name: 'Chrome' },
    localIdentity: 'safari-user',
    localCanModerate: false,
    topic: null,
  }).route === 'huddle_chat',
  'H: valid chat + no topic → chat (type authoritative)'
);

// I. mod_mute → mute only
const muteBytes = new TextEncoder().encode(
  JSON.stringify({ type: 'mod_mute', target: 'safari-user' })
);
assert(
  routeHuddleDataPacket({
    payload: muteBytes,
    participant: { identity: 'chrome-user', name: 'Chrome' },
    localIdentity: 'safari-user',
    localCanModerate: false,
    topic: null,
  }).route === 'ignore',
  'I: forged mod_mute ignored (4E.1 server mute)'
);
assert(
  (
    routeHuddleDataPacket({
      payload: muteBytes,
      participant: { identity: 'chrome-user', name: 'Chrome' },
      localIdentity: 'safari-user',
      localCanModerate: false,
      topic: null,
    }) as { reason?: string }
  ).reason === 'mod_mute_untrusted',
  'I: mod_mute_untrusted reason'
);
assert(
  routeHuddleDataPacket({
    payload: chromeBytes,
    participant: { identity: 'chrome-user', name: 'Chrome' },
    localIdentity: 'safari-user',
    localCanModerate: false,
  }).route === 'huddle_chat',
  'I: huddle_chat does not route as mute'
);
// chat topic must not revive mute authority
assert(
  routeHuddleDataPacket({
    payload: muteBytes,
    participant: { identity: 'chrome-user', name: 'Chrome' },
    localIdentity: 'safari-user',
    localCanModerate: false,
    topic: HUDDLE_CHAT_TOPIC,
  }).route === 'ignore',
  'I: mod_mute ignored even with chat topic'
);

// J. malformed → ignore
assert(
  routeHuddleDataPacket({
    payload: new TextEncoder().encode('{not-json'),
    participant: { identity: 'x', name: 'X' },
    localIdentity: 'me',
    localCanModerate: false,
  }).route === 'ignore',
  'J: malformed packet → ignore'
);

// K. duplicate chat id → one message
if (routedA.route === 'huddle_chat') {
  const once = appendHuddleChatMessage([], routedA.message);
  assert(appendHuddleChatMessage(once, routedA.message).length === 1, 'K: duplicate chat id deduped');
}

// L. remote while open → render, unread 0
if (routedA.route === 'huddle_chat') {
  const openList = appendHuddleChatMessage([], routedA.message);
  assert(openList.length === 1, 'L: remote message while open renders in state');
  assert(
    nextHuddleChatUnread({ chatOpen: true, isLocalMessage: false, prevUnread: 0 }) === 0,
    'L: unread remains 0 while open'
  );
}

// M. remote while closed → unread +1
assert(
  nextHuddleChatUnread({ chatOpen: false, isLocalMessage: false, prevUnread: 0 }) === 1,
  'M: remote while closed → unread +1'
);
assert(
  nextHuddleChatUnread({ chatOpen: false, isLocalMessage: true, prevUnread: 0 }) === 0,
  'M: own message does not increment unread'
);
assert(clearHuddleChatUnread() === 0, 'M: clear unread');

// N. Safari byte-copy helper
const copied = copyDataPayloadBytes(chromeBytes);
assert(copied.byteLength === chromeBytes.byteLength, 'N: byteLength preserved');
assert(
  [...copied].every((b, i) => b === chromeBytes[i]),
  'N: exact bytes preserved'
);
assert(peekDataPacketType(copied) === HUDDLE_CHAT_TYPE, 'N: copied bytes still decode');

// O. join-time / stable listener registration
assert(/RoomEvent\.DataReceived/.test(ui), 'O: DataReceived used');
assert(
  /Phase 3E: register DataReceived with other room handlers/.test(ui) ||
    /register DataReceived with other room handlers/.test(ui),
  'O: join-time registration comment/contract'
);
assert(/ingestChatMessageRef/.test(ui), 'O: stable ingest ref (no effect rebind)');
assert(!/conn !== 'connected'[\s\S]{0,200}DataReceived|DataReceived[\s\S]{0,400}conn !== 'connected'/.test(ui), 'O: not gated on fragile conn useEffect');
assert(/args: \(payload: NonSharedUint8Array, participant:/.test(lkEvents), 'O: SDK signature documented in tree');

const argsModel = parseHuddleDataReceivedArgs(
  chromeBytes,
  { identity: 'chrome-user', name: 'Chrome' },
  1,
  HUDDLE_CHAT_TOPIC
);
assert(argsModel.participant?.identity === 'chrome-user', 'O: DataReceived args model');

console.log('\nPhase 3E huddle chat smoke — hygiene / regression markers');

assert(/HUDDLE_CHAT_TOPIC/.test(ui) && HUDDLE_CHAT_TOPIC === 'awc.huddle.chat', 'publish topic constant');
assert(/huddleChatDebug\('DataReceived'/.test(ui), 'DEV DataReceived diagnostics');
assert(/reason: routed\.reason/.test(ui) || /reason: routed/.test(ui), 'DEV logs missing_sender reason');
assert(!/dangerouslySetInnerHTML/.test(ui), 'no HTML injection');
assert(huddleCountIgnoresChat(3, 50) === 3, 'chat ignores participant count');
assert(/resetHuddleChatState/.test(ui), 'cleanup on disconnect');
assert(/RoomEvent\.TrackPublished/.test(ui) && /autoSubscribe:\s*true/.test(ui), 'screen-share markers intact');
assert(/voice-participant-mute/.test(ui), 'server mute API path in UI');
assert(!/type:\s*['\"]mod_mute['\"]/.test(ui), 'UI no longer publishes mod_mute packets');
assert(/Hide for me/.test(ui), 'local hide label uses Hide for me');
assert(!/Remove for me/.test(ui), 'Remove for me copy removed');
assert(canSafelyBroadcastHuddleChatDelete() === false, 'no broadcast delete');
assert(!/CREATE TABLE|ALTER TABLE/.test(helper + ui), 'no SQL');
assert(!/userIdMigration|awc_migrate_user_id/.test(ui), 'no identity/RPC');
assert(!/sole_remote/.test(helper), 'sole_remote removed from helpers');

const plan = planVoiceAccessToken({
  userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  displayName: 'Tester',
  channelId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  canModerate: false,
});
assert(tokenPlanAllowsScreenSharePublish(plan.grant), 'token publish/data intact');
assert(plan.grant.canPublishData === true, 'canPublishData true');

console.log('\nAll Phase 3E huddle chat smoke tests passed.');
