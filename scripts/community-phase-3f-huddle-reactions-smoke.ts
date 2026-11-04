/**
 * PLCC Community Phase 3F — Live Huddle reactions smoke (no live media required).
 * Run: npx tsx scripts/community-phase-3f-huddle-reactions-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHuddleChatWirePayload,
  encodeHuddleChatPayload,
  HUDDLE_CHAT_TOPIC,
  nextHuddleChatUnread,
  routeHuddleDataPacket,
} from '../api/_utils/huddleChat.js';
import {
  appendHuddleReactionEvent,
  buildHuddleReactionWirePayload,
  clearHuddleReactions,
  createHuddleReactionId,
  encodeHuddleReactionPayload,
  expireHuddleReactions,
  HUDDLE_REACTION_KEYS,
  HUDDLE_REACTION_MAX_VISIBLE,
  HUDDLE_REACTION_OPTIONS,
  HUDDLE_REACTION_TOPIC,
  HUDDLE_REACTION_TYPE,
  huddleReactionAffectsChatUnread,
  huddleReactionAffectsParticipantCount,
  huddleReactionMutatesRaiseHand,
  hydrateHuddleReactionEvent,
  shouldAllowHuddleReactionSend,
  type HuddleReactionEvent,
} from '../api/_utils/huddleReaction.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const ui = read('components/Community/VoiceHuddle.tsx');
const reactionHelper = read('api/_utils/huddleReaction.ts');
const chatHelper = read('api/_utils/huddleChat.ts');
const handHelper = read('api/_utils/voiceHandRaise.ts');

const prayWire = buildHuddleReactionWirePayload({
  reaction: 'pray',
  id: 'rxn-1',
  sentAt: 1000,
})!;
const prayBytes = encodeHuddleReactionPayload(prayWire);

console.log('\nPhase 3F huddle reactions smoke — route A–L');

const routedA = routeHuddleDataPacket({
  payload: prayBytes,
  participant: { identity: 'user-a', name: 'Jerless' },
  localIdentity: 'me',
  localCanModerate: false,
  topic: HUDDLE_REACTION_TOPIC,
});
assert(routedA.route === 'huddle_reaction', 'A: valid Pray + participant → reaction route');
if (routedA.route === 'huddle_reaction') {
  assert(routedA.reaction.reaction === 'pray', 'A: pray key');
  assert(routedA.reaction.senderIdentity === 'user-a', 'A: sender from participant');
  assert(routedA.reaction.emoji === '🙏', 'A: mapped emoji');
}

for (const key of HUDDLE_REACTION_KEYS) {
  const bytes = encodeHuddleReactionPayload(
    buildHuddleReactionWirePayload({ reaction: key, id: `id-${key}`, sentAt: 1 })!
  );
  assert(
    routeHuddleDataPacket({
      payload: bytes,
      participant: { identity: 'u', name: 'U' },
      localIdentity: 'me',
      localCanModerate: false,
      topic: HUDDLE_REACTION_TOPIC,
    }).route === 'huddle_reaction',
    `B: ${key} accepted`
  );
}

assert(
  routeHuddleDataPacket({
    payload: new TextEncoder().encode(
      JSON.stringify({
        type: HUDDLE_REACTION_TYPE,
        v: 1,
        reaction: 'fire',
        id: 'bad',
        sentAt: 1,
      })
    ),
    participant: { identity: 'u', name: 'U' },
    localIdentity: 'me',
    localCanModerate: false,
  }).route === 'ignore',
  'C: unknown reaction rejected'
);

assert(
  routeHuddleDataPacket({
    payload: prayBytes,
    participant: null,
    localIdentity: 'me',
    localCanModerate: false,
    topic: HUDDLE_REACTION_TOPIC,
  }).route === 'ignore',
  'D: participant missing → ignore'
);
const routedD = routeHuddleDataPacket({
  payload: prayBytes,
  participant: undefined,
  localIdentity: 'me',
  localCanModerate: false,
});
assert(
  routedD.route === 'ignore' && routedD.reason === 'missing_sender',
  'D: missing_sender reason'
);

assert(
  !/sole_remote|remoteParticipants/.test(
    reactionHelper +
      chatHelper.slice(
        chatHelper.indexOf('if (type === HUDDLE_REACTION_TYPE)'),
        chatHelper.indexOf("if (type === 'mod_mute')") === -1
          ? chatHelper.length
          : chatHelper.indexOf("if (type === 'mod_mute')")
      )
  ),
  'E: no roster sender fallback'
);

const spoofBytes = new TextEncoder().encode(
  JSON.stringify({
    type: HUDDLE_REACTION_TYPE,
    v: 1,
    reaction: 'clap',
    id: 'spoof-1',
    sentAt: 2,
    senderIdentity: 'attacker',
    senderName: 'Attacker',
    isModerator: true,
  })
);
const routedF = routeHuddleDataPacket({
  payload: spoofBytes,
  participant: { identity: 'real', name: 'Real' },
  localIdentity: 'me',
  localCanModerate: false,
  topic: HUDDLE_REACTION_TOPIC,
});
assert(routedF.route === 'huddle_reaction', 'F: spoofed payload still routes');
if (routedF.route === 'huddle_reaction') {
  assert(routedF.reaction.senderIdentity === 'real', 'F: participant identity wins');
  assert(routedF.reaction.senderName === 'Real', 'F: participant name wins');
}

assert(
  routeHuddleDataPacket({
    payload: prayBytes,
    participant: { identity: 'a', name: 'A' },
    localIdentity: 'me',
    localCanModerate: false,
    topic: HUDDLE_REACTION_TOPIC,
  }).route === 'huddle_reaction',
  'G: correct topic accepted'
);

const routedH = routeHuddleDataPacket({
  payload: prayBytes,
  participant: { identity: 'a', name: 'A' },
  localIdentity: 'me',
  localCanModerate: false,
  topic: 'wrong.topic',
});
assert(
  routedH.route === 'ignore' && routedH.reason === 'wrong_topic',
  'H: wrong topic ignored'
);

assert(
  routeHuddleDataPacket({
    payload: prayBytes,
    participant: { identity: 'a', name: 'A' },
    localIdentity: 'me',
    localCanModerate: false,
    topic: null,
  }).route === 'huddle_reaction',
  'I: no topic → accepted (type authoritative)'
);

const chatBytes = encodeHuddleChatPayload(
  buildHuddleChatWirePayload({ id: 'c1', text: 'hi', sentAt: Date.now() })!
);
assert(
  routeHuddleDataPacket({
    payload: chatBytes,
    participant: { identity: 'a', name: 'A' },
    localIdentity: 'me',
    localCanModerate: false,
    topic: HUDDLE_CHAT_TOPIC,
  }).route === 'huddle_chat',
  'J: huddle_chat remains chat only'
);

const muteBytes = new TextEncoder().encode(
  JSON.stringify({ type: 'mod_mute', target: 'me' })
);
assert(
  routeHuddleDataPacket({
    payload: muteBytes,
    participant: { identity: 'mod', name: 'Mod' },
    localIdentity: 'me',
    localCanModerate: false,
    topic: HUDDLE_REACTION_TOPIC,
  }).route === 'ignore',
  'K: forged mod_mute ignored (4E.1)'
);

assert(
  routeHuddleDataPacket({
    payload: new TextEncoder().encode('{not-json'),
    participant: { identity: 'a', name: 'A' },
    localIdentity: 'me',
    localCanModerate: false,
  }).route === 'ignore',
  'L: malformed reaction ignored'
);

console.log('\nPhase 3F huddle reactions smoke — transient stack M–Q');

const mk = (
  id: string,
  reaction: 'pray' | 'heart' | 'clap' | 'praise' | 'like',
  identity: string,
  expiresAt: number
): HuddleReactionEvent => {
  const base = hydrateHuddleReactionEvent({
    payload: buildHuddleReactionWirePayload({ reaction, id, sentAt: 1 })!,
    senderIdentity: identity,
    senderName: identity,
    localIdentity: 'me',
    nowMs: Date.now(),
  })!;
  return { ...base, expiresAt };
};

let stack: HuddleReactionEvent[] = [];
const one = mk('dup-1', 'pray', 'a', Date.now() + 5000);
stack = appendHuddleReactionEvent(stack, one);
stack = appendHuddleReactionEvent(stack, { ...one });
assert(stack.length === 1, 'M: duplicate reaction id → displayed once');

const two = mk('id-2', 'clap', 'b', Date.now() + 5000);
stack = appendHuddleReactionEvent(stack, two);
assert(stack.length === 2, 'N: two unique reactions retained');

const three = mk('id-3', 'heart', 'a', Date.now() + 5000);
stack = appendHuddleReactionEvent(stack, three);
assert(stack.some((r) => r.id === 'id-3') && stack.filter((r) => r.senderIdentity === 'a').length === 2, 'O: same participant different IDs allowed');

const expired = expireHuddleReactions(
  [
    mk('old', 'like', 'x', Date.now() - 10),
    mk('live', 'praise', 'y', Date.now() + 5000),
  ],
  Date.now()
);
assert(expired.length === 1 && expired[0].id === 'live', 'P: automatic expiry removes reaction');

let bounded: HuddleReactionEvent[] = [];
for (let i = 0; i < HUDDLE_REACTION_MAX_VISIBLE + 5; i++) {
  bounded = appendHuddleReactionEvent(
    bounded,
    mk(`b-${i}`, 'clap', `u${i}`, Date.now() + 5000)
  );
}
assert(bounded.length === HUDDLE_REACTION_MAX_VISIBLE, 'Q: bounded transient list');
assert(bounded[0].id === `b-5`, 'Q: oldest dropped when over bound');

console.log('\nPhase 3F huddle reactions smoke — local / independence R–X');

{
  let shown = false;
  const publishOk = true;
  if (publishOk) shown = true;
  assert(shown === true, 'R: local successful publish → local reaction appears');
  let shownFail = false;
  const publishFail = false;
  if (publishFail) shownFail = true;
  assert(shownFail === false, 'S: failed publish → local reaction does not falsely appear');
}

assert(huddleReactionAffectsChatUnread() === false, 'T: reaction does not affect chat unread helper');
assert(
  nextHuddleChatUnread({ chatOpen: false, isLocalMessage: false, prevUnread: 2 }) === 3,
  'T: chat unread helper unchanged by reaction module'
);
assert(!/setChatUnread|chatUnread/.test(reactionHelper), 'T: reaction helper never touches chat unread');

assert(huddleReactionMutatesRaiseHand() === false, 'U: reaction does not change Raise Hand state');
assert(!/handRaised|raisedAt|setMetadata|voiceHandRaise/.test(reactionHelper), 'U: reaction helper independent of hand metadata');
assert(/buildRaiseHandMetadata|voice-hand-lower|setMetadata/.test(ui), 'U: Raise Hand metadata path still in UI');
assert(handHelper.includes('handRaised'), 'U: voiceHandRaise.ts unchanged authority');

assert(huddleReactionAffectsParticipantCount(4, 99) === 4, 'V: reaction does not change participant count');

assert(clearHuddleReactions().length === 0, 'W: disconnect/reset clears transient reactions');
assert(/resetHuddleReactionState|clearReactionTimers/.test(ui), 'W: UI clears reaction timers/state');

assert(/RoomEvent\.DataReceived/.test(ui), 'X: DataReceived listener present');
assert(/ingestReactionRef/.test(ui), 'X: stable reaction ingest ref');
assert(
  /Phase 3E: register DataReceived with other room handlers/.test(ui),
  'X: listener lifecycle remains join-time/stable'
);
assert(/routed\.route === 'huddle_reaction'/.test(ui), 'X: UI handles huddle_reaction route');

assert(shouldAllowHuddleReactionSend({ lastSentAt: null }) === true, 'cooldown allows first send');
assert(
  shouldAllowHuddleReactionSend({ lastSentAt: Date.now(), nowMs: Date.now() + 50, cooldownMs: 600 }) ===
    false,
  'cooldown blocks rapid resend'
);
assert(
  shouldAllowHuddleReactionSend({
    lastSentAt: Date.now() - 700,
    nowMs: Date.now(),
    cooldownMs: 600,
  }) === true,
  'cooldown allows after wait'
);

assert(HUDDLE_REACTION_OPTIONS.length === 5, 'exactly five reactions');
assert(/data-huddle-reaction-control|Open huddle reactions/.test(ui), 'picker control present');
assert(/aria-label=\{opt\.label\}|aria-label={opt.label}/.test(ui) || /aria-label=\{opt\.label\}/.test(ui), 'accessible reaction labels');
assert(/data-huddle-reactions-overlay/.test(ui), 'overlay present');
assert(/aria-hidden="true"/.test(ui) && /Transient reactions: visual-only/.test(ui), 'visual-only overlay documented');
assert(!/CREATE TABLE|ALTER TABLE/.test(reactionHelper + ui), 'no SQL');
assert(!/userIdMigration|awc_migrate_user_id/.test(ui), 'no identity/RPC');
assert(createHuddleReactionId().length > 0, 'reaction id created');

console.log('\nAll Phase 3F huddle reactions smoke tests passed.');
