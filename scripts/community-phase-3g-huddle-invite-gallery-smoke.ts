/**
 * PLCC Community Phase 3G / 3G.1 — Huddle invite deep-link + gallery smoke.
 * Run: npx tsx scripts/community-phase-3g-huddle-invite-gallery-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeReturnTo, returnToFromRouterLocation } from '../lib/authSession.js';
import {
  buildHuddleInvitePath,
  buildHuddleInviteUrl,
  buildHuddleSharePayload,
  canUseNavigatorShare,
  decideHuddleInviteDeepLink,
  huddleInviteAutoConnectsLiveKit,
  huddleInviteAutoEnablesCamera,
  huddleInviteAutoEnablesMic,
  huddleInviteAutoJoinsLiveKit,
  huddleInviteLooksSafe,
  HUDDLE_INVITE_ROUTE,
  parseHuddleInviteIntent,
  stripHuddleIntentFromSearch,
} from '../api/_utils/huddleInvite.js';
import {
  clampHuddleGalleryPage,
  huddleGalleryBreakpointFromWidth,
  huddleGalleryColumnCount,
  huddleGalleryOrderIgnoresActiveSpeaker,
  huddleGalleryPageCount,
  huddleGalleryPageSize,
  huddleGalleryParticipantCount,
  shouldUseHuddleGalleryPagination,
  sliceHuddleGalleryPage,
} from '../api/_utils/huddleGallery.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const ui = read('components/Community/VoiceHuddle.tsx');
const chatPage = read('pages/community/Chat.tsx');
const inviteHelper = read('api/_utils/huddleInvite.ts');
const galleryHelper = read('api/_utils/huddleGallery.ts');
const loginPortal = read('pages/auth/LoginPortal.tsx');

const CHANNEL = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORIGIN = 'https://awc-vault-git-feature-awc-commun-35f748-jerlessm-5552s-projects.vercel.app';
const inviteReturn = `/community/chat?channel=${CHANNEL}&huddle=1`;

console.log('\nPhase 3G.1 smoke — true Huddle invite A–T');

const path = buildHuddleInvitePath(CHANNEL)!;
const url = buildHuddleInviteUrl({ origin: ORIGIN, channelId: CHANNEL })!;

assert(path.includes(CHANNEL), 'A: invite contains channel UUID');
assert(/[?&]huddle=1(?:&|$)/.test(path), 'B: invite contains huddle=1');
assert(url.includes(`channel=${CHANNEL}`) && url.includes('huddle=1'), 'B: absolute URL has huddle=1');
assert(url.startsWith(`${ORIGIN}/#${HUDDLE_INVITE_ROUTE}?`), 'B: HashRouter form');

assert(huddleInviteLooksSafe(url), 'C: invite looks safe');
assert(!/eyJ|livekit|API_SECRET|Bearer|token=/i.test(url), 'C: invite contains no token/JWT/secret');
assert(
  !huddleInviteLooksSafe(`${url}&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb`),
  'C: rejects tokenized url'
);

assert(
  decideHuddleInviteDeepLink({
    huddleIntent: true,
    channelAccessible: true,
    huddleActive: true,
  }) === 'open_prejoin',
  'D: signed-in authorized invite selects channel / opens pre-join decision'
);
assert(/setActiveChannel\(deepChannel\)/.test(chatPage), 'D: Chat selects ACL channel from deep-link');
assert(
  /setIsVoiceHuddleOpen\(true\)/.test(chatPage) && /openedFromInvite|huddleOpenedFromInvite/.test(chatPage),
  'E: signed-in authorized invite opens Huddle pre-join'
);
assert(/openedFromInvite/.test(ui) && /data-huddle-prejoin-copy/.test(ui) && /'invite'/.test(ui), 'E: pre-join invite copy present');
assert(/A live church conversation is happening now/.test(ui), 'E: invite pre-join body copy');
assert(/data-huddle-join-cta/.test(ui) && /Join Huddle/.test(ui), 'E: JOIN HUDDLE control present');

assert(
  returnToFromRouterLocation({
    pathname: '/community/chat',
    search: `?channel=${CHANNEL}&huddle=1`,
  }) === inviteReturn,
  'F: signed-out returnTo preserves channel + huddle'
);
assert(sanitizeReturnTo(inviteReturn) === inviteReturn, 'F: sanitizer allows invite intent query');
assert(
  returnToFromRouterLocation({
    pathname: '/community/chat',
    search: `?channel=${CHANNEL}&huddle=1`,
  }) === `/community/chat?channel=${CHANNEL}&huddle=1`,
  'G: login returns to exact invite intent'
);
assert(/returnToFromRouterLocation/.test(loginPortal), 'G: LoginPortal preserves pathname+search');

assert(
  decideHuddleInviteDeepLink({
    huddleIntent: true,
    channelAccessible: false,
    huddleActive: true,
  }) === 'ignore',
  'H: unauthorized channel cannot open Huddle'
);
assert(
  /ACL-filtered|inaccessible ids simply do not select/i.test(chatPage),
  'H: Chat deep-link uses ACL-filtered list'
);
assert(!/forceJoin|autoJoin|mintLiveKitAccessToken/.test(chatPage), 'I: unauthorized path cannot mint/join room');
assert(
  !/joinHuddle\(\)/.test(
    chatPage.slice(chatPage.indexOf('deepChannelId'), chatPage.indexOf('deepChannelId') + 2500)
  ),
  'I: deep-link effect does not call joinHuddle'
);

assert(
  decideHuddleInviteDeepLink({
    huddleIntent: true,
    channelAccessible: true,
    huddleActive: false,
  }) === 'ended',
  'J: ended Huddle does not auto-start'
);
assert(/This Huddle has ended/.test(chatPage), 'K: ended Huddle produces ended/inactive behavior');
assert(/data-huddle-invite-ended/.test(chatPage), 'K: ended notice markup present');
assert(!/setIsVoiceHuddleOpen\(true\).*ended|Start Huddle for invite/i.test(inviteHelper), 'J: helpers do not start rooms');

assert(huddleInviteAutoJoinsLiveKit() === false, 'L: invite does NOT auto-connect LiveKit');
assert(huddleInviteAutoConnectsLiveKit() === false, 'L: auto-connect helper false');
assert(!/room\.connect|voice-token/.test(inviteHelper), 'L: invite helper has no LiveKit connect');
assert(huddleInviteAutoEnablesMic() === false, 'M: invite does NOT auto-enable mic');
assert(huddleInviteAutoEnablesCamera() === false, 'N: invite does NOT auto-enable camera');
assert(
  /Audio on; camera \+ screen share opt-in|Never auto-share/i.test(ui) ||
    /setCameraEnabled\(false\)|camera.*opt-in/i.test(ui),
  'M/N: join path remains opt-in for media'
);

assert(/huddleIntentConsumedRef/.test(chatPage), 'O: one-time consumed intent ref present');
assert(/stripHuddleIntentParam|HUDDLE_INVITE_INTENT_KEY/.test(chatPage), 'O: huddle intent stripped after consume');
assert(
  stripHuddleIntentFromSearch(`?channel=${CHANNEL}&huddle=1`) === `?channel=${CHANNEL}`,
  'O: closing/not-now does not reopen — intent removed, channel kept'
);
assert(/data-huddle-dismiss="not-now"|Not now/.test(ui), 'O: Not now dismiss control present');
assert(
  stripHuddleIntentFromSearch(`?channel=${CHANNEL}&huddle=1`) === `?channel=${CHANNEL}`,
  'P: consumed intent preserves channel selection'
);
assert(parseHuddleInviteIntent('1') === true, 'P: intent parser accepts 1');
assert(parseHuddleInviteIntent('0') === false, 'P: intent parser rejects other values');

assert(
  decideHuddleInviteDeepLink({
    huddleIntent: false,
    channelAccessible: true,
    huddleActive: true,
  }) === 'ignore',
  'Q: normal Community channel URL without huddle=1 behaves unchanged'
);
assert(/deepHuddleIntent/.test(chatPage), 'Q: Chat gates open on huddle intent flag');

const share = buildHuddleSharePayload({
  origin: ORIGIN,
  channelId: CHANNEL,
  channelName: 'Prayer',
})!;
assert(url.includes('huddle=1') && /Copy Huddle Link/.test(ui), 'R: Copy Link contains new intent');
assert(
  /\/api\/share-huddle\?channel=/.test(share.url) && huddleInviteLooksSafe(share.url),
  'S: Share uses OG /api/share-huddle landing (WhatsApp card)'
);
assert(canUseNavigatorShare({ share: undefined }) === false, 'S: share unsupported degrades');
assert(/canUseNavigatorShare|Copy Huddle Link/.test(ui), 'S: UI has copy fallback path');
assert(/buildHuddlePreviewShareUrl/.test(ui), 'S: Copy uses preview share URL for WhatsApp');

assert(huddleGalleryPageSize('desktop') === 9, 'T: gallery pagination remains unchanged (desktop=9)');
assert(huddleGalleryPageSize('medium') === 6, 'T: gallery medium=6');
assert(huddleGalleryPageSize('mobile') === 4, 'T: gallery mobile=4');
assert(huddleGalleryPageSize('narrow') === 2, 'T: gallery narrow=2');
assert(/shouldUseHuddleGalleryPagination/.test(ui), 'T: gallery helpers still wired in UI');

console.log('\nPhase 3G smoke — gallery regression');

assert(huddleGalleryPageCount(1, 9) === 1, 'gallery: 1 → 1 page');
assert(huddleGalleryPageCount(9, 9) === 1, 'gallery: 9 → 1');
assert(huddleGalleryPageCount(10, 9) === 2, 'gallery: 10 → 2');
assert(huddleGalleryPageCount(17, 9) === 2, 'gallery: 17 → 2');

const seventeen = Array.from({ length: 17 }, (_, i) => ({ id: `p${i + 1}` }));
const page1 = sliceHuddleGalleryPage(seventeen, 1, 9);
const page2 = sliceHuddleGalleryPage(seventeen, 2, 9);
assert(page1.length === 9 && page1[0].id === 'p1' && page1[8].id === 'p9', 'gallery: slice 1 = 1–9');
assert(page2.length === 8 && page2[0].id === 'p10', 'gallery: slice 2 = remaining');

assert(huddleGalleryColumnCount('medium') === 3, 'gallery: medium columns');
assert(huddleGalleryColumnCount('mobile') === 2, 'gallery: mobile columns');
assert(clampHuddleGalleryPage(5, 2) === 2, 'gallery: clamp after leave');
assert(huddleGalleryBreakpointFromWidth(500) === 'mobile', 'gallery: resize mobile');
assert(
  clampHuddleGalleryPage(3, huddleGalleryPageCount(5, huddleGalleryPageSize('mobile'))) === 2,
  'gallery: clamp after resize'
);
assert(huddleGalleryParticipantCount(17, 9) === 17, 'gallery: total roster count');
assert(huddleGalleryOrderIgnoresActiveSpeaker([{ id: 'a' }])[0].id === 'a', 'gallery: no active-speaker reorder');
assert(shouldUseHuddleGalleryPagination({ screenShareActive: true }) === false, 'gallery: share bypass');
assert(shouldUseHuddleGalleryPagination({ screenShareActive: false }) === true, 'gallery: share end restores');
assert(/data-huddle-gallery="paginated"/.test(ui), 'gallery markup present');
assert(/Previous gallery page|Next gallery page/.test(ui), 'gallery nav a11y');
assert(!/CREATE TABLE|ALTER TABLE/.test(inviteHelper + galleryHelper + ui + chatPage), 'no SQL');
assert(!/userIdMigration|awc_migrate_user_id/.test(ui + chatPage), 'no identity/RPC');
assert(!/LIVEKIT_API_SECRET|mintLiveKitAccessToken/.test(inviteHelper), 'no LiveKit secret in invite');
assert(!/voiceHandRaise/.test(inviteHelper + galleryHelper), 'no Raise Hand protocol in 3G helpers');
assert(!/HUDDLE_REACTION_TYPE|huddle_reaction/.test(galleryHelper), 'no reaction redesign in gallery');
assert(!/HUDDLE_CHAT_TYPE|huddle_chat/.test(galleryHelper), 'no chat redesign in gallery');

console.log('\nAll Phase 3G.1 true Huddle invite + gallery smoke tests passed.');
