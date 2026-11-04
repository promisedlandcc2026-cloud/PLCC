/**
 * Live Huddle MOD stage + session co-host (add/pass) smoke — no LiveKit required.
 * Run: npx tsx scripts/community-phase-huddle-mod-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyHuddleModAction,
  buildHuddleRoomRolesMetadata,
  emptyHuddleRoomRoles,
  isHuddleSessionModerator,
  mergeHuddleModParticipantMetadata,
  mergeSessionCanModerate,
  parseHuddleModAction,
  parseHuddleModFromParticipantMetadata,
  parseHuddleRoomRoles,
  pickFeaturedHuddleIdentity,
  splitFeaturedHuddleRoster,
} from '../api/_utils/huddleModeration.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const modHelper = read('api/_utils/huddleModeration.ts');
const voiceHelper = read('api/_utils/livekitVoice.ts');
const core = read('api/_utils/core.ts');
const ui = read('components/Community/VoiceHuddle.tsx');

console.log('\nHuddle MOD smoke — pure role parse / merge');

const empty = emptyHuddleRoomRoles();
assert(empty.hostId === null && empty.coHostIds.length === 0, 'empty roles');

const parsed = parseHuddleRoomRoles(
  JSON.stringify({ hostId: 'host-1', coHostIds: ['co-1', 'co-1', 'host-1'], other: true })
);
assert(parsed.hostId === 'host-1', 'parse hostId');
assert(parsed.coHostIds.includes('co-1'), 'parse coHostIds');
assert(parsed.coHostIds.filter((id) => id === 'co-1').length === 1, 'dedupe coHostIds on parse');

const built = buildHuddleRoomRolesMetadata('{"foo":1,"hostId":"old"}', {
  hostId: 'host-1',
  coHostIds: ['co-1', 'host-1'],
});
const builtObj = JSON.parse(built);
assert(builtObj.foo === 1, 'preserve unrelated room metadata keys');
assert(builtObj.hostId === 'host-1', 'build hostId');
assert(Array.isArray(builtObj.coHostIds) && !builtObj.coHostIds.includes('host-1'), 'build strips host from coHosts');

assert(isHuddleSessionModerator(parsed, 'host-1'), 'host is session moderator');
assert(isHuddleSessionModerator({ ...empty, coHostIds: ['co-1'] }, 'co-1'), 'co-host is session moderator');
assert(!isHuddleSessionModerator(parsed, 'member-9'), 'member is not session moderator');

assert(
  mergeSessionCanModerate({
    channelCanModerate: false,
    roles: { v: 1, hostId: 'u1', coHostIds: [] },
    userId: 'u1',
  }) === true,
  'session host gets canModerate'
);
assert(
  mergeSessionCanModerate({
    channelCanModerate: true,
    roles: empty,
    userId: 'anyone',
  }) === true,
  'channel mod gets canModerate'
);
assert(
  mergeSessionCanModerate({
    channelCanModerate: false,
    roles: empty,
    userId: 'member',
  }) === false,
  'plain member does not get canModerate'
);

console.log('\nHuddle MOD smoke — claim / add / pass');

const claimed = applyHuddleModAction(empty, { action: 'claim', actorId: 'mod-a' });
assert(claimed.ok === true && claimed.roles.hostId === 'mod-a', 'claim sets host when empty');

const claimNoop = applyHuddleModAction(claimed.roles, { action: 'claim', actorId: 'mod-b' });
assert(claimNoop.ok === true && claimNoop.roles.hostId === 'mod-a', 'claim no-op when host set');

const added = applyHuddleModAction(claimed.roles, {
  action: 'add',
  actorId: 'mod-a',
  targetId: 'pastor-1',
});
assert(added.ok === true && added.roles.coHostIds.includes('pastor-1'), 'add appends co-host');
assert(added.roles.hostId === 'mod-a', 'add keeps original host');

const passed = applyHuddleModAction(added.roles, {
  action: 'pass',
  actorId: 'mod-a',
  targetId: 'pastor-1',
});
assert(passed.ok === true && passed.roles.hostId === 'pastor-1', 'pass makes target host');
assert(passed.roles.coHostIds.includes('mod-a'), 'pass keeps actor as co-host');
assert(!passed.roles.coHostIds.includes('pastor-1'), 'pass removes new host from coHosts');

const selfAdd = applyHuddleModAction(claimed.roles, {
  action: 'add',
  actorId: 'mod-a',
  targetId: 'mod-a',
});
assert(selfAdd.ok === false, 'cannot add self');

assert(parseHuddleModAction('ADD') === 'add', 'parse add action');
assert(parseHuddleModAction('pass') === 'pass', 'parse pass action');
assert(parseHuddleModAction('claim') === 'claim', 'parse claim action');
assert(parseHuddleModAction('promote') === null, 'reject unknown action');

console.log('\nHuddle MOD smoke — featured layout helpers');

const roster = [
  { identity: 'a', name: 'A' },
  { identity: 'pastor-1', name: 'Pastor' },
  { identity: 'mod-a', name: 'Starter' },
];
const featId = pickFeaturedHuddleIdentity({
  roles: passed.roles,
  rosterIdentities: roster.map((r) => r.identity),
});
assert(featId === 'pastor-1', 'featured is current host when present');

const split = splitFeaturedHuddleRoster(roster, featId);
assert(split.featured?.identity === 'pastor-1', 'split featured row');
assert(split.others.length === 2 && !split.others.some((r) => r.identity === 'pastor-1'), 'others exclude featured');

const alone = pickFeaturedHuddleIdentity({
  roles: empty,
  rosterIdentities: ['only-me'],
});
assert(alone === 'only-me', 'fallback featured is first roster identity');

const metaMerged = mergeHuddleModParticipantMetadata(
  JSON.stringify({ handRaised: true, raisedAt: 9 }),
  true
);
const metaObj = JSON.parse(metaMerged);
assert(metaObj.handRaised === true && metaObj.raisedAt === 9, 'preserve hand-raise fields');
assert(metaObj.huddleMod === true, 'set huddleMod flag');
assert(parseHuddleModFromParticipantMetadata(metaMerged) === true, 'parse huddleMod true');
assert(parseHuddleModFromParticipantMetadata('{}') === false, 'parse huddleMod false');

console.log('\nHuddle MOD smoke — source / UI wiring');

assert(/parseHuddleRoomRoles|readHuddleRoomRoles|writeHuddleRoomRoles/.test(voiceHelper), 'LiveKit role I/O helpers');
assert(/resolveVoiceCanModerate|applyVoiceHuddleModAction/.test(voiceHelper), 'session canModerate + mod action');
assert(/Host already claimed/.test(voiceHelper), 'claim blocks non-mods when host seat taken');
assert(!/Only channel moderators can claim host/.test(voiceHelper), 'first joiner may claim empty host');
assert(/voice-huddle-mod/.test(core), 'API route voice-huddle-mod');
assert(/applyVoiceHuddleModAction/.test(core), 'core calls applyVoiceHuddleModAction');
assert(/channelCanModerate/.test(core), 'voice-token returns channelCanModerate');
assert(/!session\.roles\.hostId/.test(core), 'voice-token claims host for first joiner');
assert(/resolveVoiceCanModerate/.test(core), 'mute/end/hand-lower use session canModerate');
assert(/RoomEvent\.RoomMetadataChanged/.test(ui), 'UI listens for room metadata');
assert(/data-huddle-layout="mod-stage"/.test(ui), 'UI MOD stage layout marker');
assert(/data-huddle-mod-action="add"/.test(ui), 'UI Add Mod control');
assert(/data-huddle-mod-action="pass"/.test(ui), 'UI Pass Mod control');
assert(/showModBadge=\{p\.isModerator\}/.test(ui), 'Mod badge for any session mod');
assert(/showHostBadge/.test(ui), 'Host badge wiring');
assert(/pickFeaturedHuddleIdentity|splitFeaturedHuddleRoster/.test(ui), 'UI uses featured helpers');
assert(/voice-huddle-mod/.test(ui), 'UI calls voice-huddle-mod');
assert(/HUDDLE_ROOM_ROLES_VERSION|applyHuddleModAction/.test(modHelper), 'pure helper module present');

console.log('\nAll Huddle MOD smoke tests passed.');
