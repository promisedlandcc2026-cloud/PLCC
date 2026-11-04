/**
 * PLCC Community Phase 3D — Live Huddle screen-share smoke (no live media required).
 * Run: npx tsx scripts/community-phase-3d-screen-share-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyRemoteScreenSharePublished,
  applyRemoteScreenShareUnpublished,
  buildScreenShareCaptureOptions,
  createRemoteShareDiscoveryState,
  decideEnterPresentationFocus,
  formatScreenShareError,
  formatScreenShareLabel,
  HUDDLE_SCREEN_SHARE_CAPTURE,
  HUDDLE_SCREEN_SHARE_DEFAULT_ON,
  huddleCountIgnoresScreenShare,
  huddleLocalScreenShareUsesPlaceholder,
  huddlePresentationBoardClass,
  huddlePresentationFocusBoardClass,
  huddlePresentationFocusRailClass,
  huddlePresentationRailClass,
  huddlePresentationStageWrapClass,
  huddlePresentationTileClass,
  shouldShowHuddlePresentationRail,
  isActiveScreenSharePublication,
  isFullscreenApiAvailable,
  isLikelySafari,
  isPresentationFocusActive,
  isScreenShareSupported,
  nextFocusAfterFullscreenChange,
  nextFocusAfterShareStop,
  participantHasScreenShare,
  pickPrimaryScreenShare,
  presentationFocusButtonLabel,
  SCREEN_SHARE_UNSUPPORTED_HINT,
  screenShareUnsupportedHint,
  syncScreenShareFirstSeen,
  tokenPlanAllowsScreenSharePublish,
} from '../api/_utils/huddleScreenShare.js';
import { huddleVideoGridClass } from '../api/_utils/huddleVideo.js';
import { planVoiceAccessToken, decideVoiceHuddleAccess } from '../api/_utils/livekitVoice.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('Phase 3D screen-share smoke — room / token / defaults (A–C, R)');

const plan = planVoiceAccessToken({
  userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  displayName: 'Tester',
  channelId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  canModerate: false,
});
assert(plan.roomName.includes('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'A: same LiveKit room from channel id');
assert(plan.identity === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'B: same authenticated participant identity');
assert(tokenPlanAllowsScreenSharePublish(plan.grant), 'publish grants cover screen share via canPublish');
assert(plan.grant.roomAdmin === false, 'R: roomAdmin unchanged for non-moderator');
assert(HUDDLE_SCREEN_SHARE_DEFAULT_ON === false, 'C: screen share defaults OFF');
assert(HUDDLE_SCREEN_SHARE_CAPTURE.resolution.frameRate <= 15, 'performance: screen share ≤15fps preference');
assert(HUDDLE_SCREEN_SHARE_CAPTURE.contentHint === 'detail', 'performance: detail content hint');
assert(HUDDLE_SCREEN_SHARE_CAPTURE.audio === false, 'no forced system/tab audio share');

console.log('\nPhase 3D screen-share smoke — UX contracts (D–N)');

const ui = read('components/Community/VoiceHuddle.tsx');
assert(/setScreenShareEnabled\(\s*true/.test(ui), 'E: can start screen share');
assert(/setScreenShareEnabled\(\s*false/.test(ui), 'F: can stop screen share');
assert(/Share Screen|Stop Sharing/.test(ui), 'D/E/F: share control labels present');
assert(/HUDDLE_SCREEN_SHARE_DEFAULT_ON/.test(ui), 'C/D: join path uses default-off constant');
assert(
  !/setScreenShareEnabled\(\s*true/.test(ui.split('joinHuddle')[1]?.split('toggleScreenShare')[0] || ''),
  'D: join does not auto-enable share'
);
assert(/track\.on\(\s*['"]ended['"]/.test(ui), 'G: native browser stop (track ended) wired');
assert(/LocalTrackUnpublished/.test(ui), 'G: unpublish clears local sharing UI');
assert(/ScreenShareStage|Screen share/.test(ui), 'H/I: local/remote presentation stage');
assert(/formatScreenShareLabel|is sharing/.test(ui), 'I: sharer identification label');
assert(
  huddleLocalScreenShareUsesPlaceholder(true) === true,
  'local presenter uses placeholder (no self-preview loop)'
);
assert(
  huddleLocalScreenShareUsesPlaceholder(false) === false,
  'remote share still uses live video stage'
);
assert(
  /data-huddle-local-share-placeholder/.test(ui) &&
    /huddleLocalScreenShareUsesPlaceholder/.test(ui),
  'UI renders local share placeholder instead of attaching own capture'
);
assert(
  !/localParticipant\.getTrackPublication\(\s*Track\.Source\.ScreenShare/.test(ui),
  'local ScreenShare track is not attached to the stage video'
);
assert(/huddlePresentationBoardClass|data-huddle-presentation/.test(ui), 'layout: presentation board wired');
assert(
  huddlePresentationBoardClass(true).includes('md:grid') &&
    huddlePresentationBoardClass(true).includes('minmax(0,1fr)'),
  'A: desktop with rail uses stage + rail grid'
);
assert(
  huddlePresentationBoardClass(true).includes('flex-col'),
  'E: mobile stacks stage above thumbnails'
);
assert(
  huddlePresentationBoardClass(true).includes('24%') ||
    huddlePresentationBoardClass(true).includes('minmax(10rem'),
  'A: desktop rail ~22–28% column'
);
assert(
  huddlePresentationBoardClass(false).includes('flex-col') &&
    !huddlePresentationBoardClass(false).includes('md:grid'),
  'C: empty rail collapses to single-column stage'
);
assert(
  shouldShowHuddlePresentationRail(2) === true,
  'A/B: participants present → show rail'
);
assert(
  shouldShowHuddlePresentationRail(0) === false,
  'C: zero participants → collapse rail'
);
assert(
  huddlePresentationRailClass().includes('md:flex-col') &&
    huddlePresentationRailClass().includes('overflow-x-auto'),
  'E: mobile horizontal strip + desktop vertical rail'
);
assert(
  huddlePresentationTileClass().includes('md:w-full') &&
    huddlePresentationTileClass().includes('w-[9.5rem]'),
  'B: compact tiles strip/rail sizing (camera-off still tiled)'
);
assert(/data-huddle-rail|Huddle participants/.test(ui), 'B: participant rail renders when shown');
assert(
  huddlePresentationBoardClass(true).includes('bg-[#0b1410]') &&
    !/divide-x|border-r border-l|vertical.?divider/i.test(huddlePresentationBoardClass(true)),
  'D: no stray vertical divider wrapper; dark board avoids white gap lines'
);
assert(
  /huddleGalleryGridClass|huddleVideoGridClass|data-huddle-gallery/.test(ui),
  'F: normal video grid helper retained'
);
assert(huddleVideoGridClass(4) === 'grid-cols-2', 'F: stop share → normal 3–4 grid unaffected');
assert(/object-contain/.test(ui), 'layout: screen share object-contain');
assert(!/ScreenShareStage[\s\S]{0,500}scale-x-\[-1\]/.test(ui), 'layout: screen share not mirrored');
assert(/shrink-0/.test(ui) && /Raise Hand|Leave/.test(ui), 'layout: controls stay below presentation');
assert(/RoomEvent\.TrackPublished/.test(ui) && /autoSubscribe:\s*true/.test(ui), 'H: screen-share transport handlers untouched');
assert(huddleCountIgnoresScreenShare(2, 1) === 2, 'G: participant count unchanged by presentation UI');
assert(/Track\.Source\.Camera/.test(ui) && /Track\.Source\.ScreenShare/.test(ui), 'J: camera and screen are separate sources');
assert(/RoomEvent\.TrackPublished/.test(ui), 'remote: TrackPublished handler wired');
assert(/RoomEvent\.TrackUnpublished/.test(ui), 'remote: TrackUnpublished handler wired');
assert(/RoomEvent\.TrackSubscribed/.test(ui), 'remote: TrackSubscribed handler wired');
assert(/RoomEvent\.TrackUnsubscribed/.test(ui), 'remote: TrackUnsubscribed handler wired');
assert(/autoSubscribe:\s*true/.test(ui), 'remote: autoSubscribe enabled on connect');
assert(
  participantHasScreenShare({
    isScreenShareEnabled: true,
    screenSharePublication: { source: 'screen_share', isMuted: false, track: null },
  }) === true,
  'remote: discovery does not require pub.track yet'
);
assert(
  isActiveScreenSharePublication({ source: 'screen_share', isMuted: false, track: null }) === true,
  'remote: source screen_share detected without track'
);
assert(
  isActiveScreenSharePublication({ source: 'camera', isMuted: false, track: {} }) === false,
  'remote: camera source is not treated as screen share'
);
assert(/setMicrophoneEnabled/.test(ui), 'K: microphone path retained');
assert(huddleCountIgnoresScreenShare(3, 2) === 3, 'L: participant count ignores screen share');
assert(huddleCountIgnoresScreenShare(1, 0) === 1, 'L: zero shares still counts room size');
assert(
  formatScreenShareError({ name: 'AbortError', message: 'cancelled' }).includes('cancelled'),
  'M: cancel message'
);
assert(
  formatScreenShareError({ message: 'publish failed' }).includes('still connected to the huddle'),
  'M: failure stays in huddle'
);
assert(isScreenShareSupported({ getDisplayMedia: () => undefined }) === true, 'N: supported when getDisplayMedia exists');
assert(isScreenShareSupported({}) === false, 'N: unsupported without getDisplayMedia');
assert(isScreenShareSupported(null) === false, 'N: unsupported when mediaDevices missing');
assert(/isScreenShareSupported|SCREEN_SHARE_UNSUPPORTED_HINT|screenShareUnsupportedHint/.test(ui), 'N: UI feature-detects unsupported browsers');
assert(SCREEN_SHARE_UNSUPPORTED_HINT.includes('not available'), 'N: unsupported hint copy');
assert(
  /iPhone|computer/i.test(
    screenShareUnsupportedHint(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
    )
  ),
  'N: iPhone gets computer hint'
);

console.log('\nPhase 3D screen-share smoke — multi-share + ACL (O–Q)');

const seen = syncScreenShareFirstSeen(new Map(), ['b', 'a'], 1000);
const seen2 = syncScreenShareFirstSeen(seen, ['b', 'a', 'c'], 2000);
assert(seen2.get('a') === 1000 && seen2.get('b') === 1000, 'O: first-seen preserved');
assert(seen2.get('c') === 2000, 'O: new share gets later first-seen');
const primary = pickPrimaryScreenShare([
  { identity: 'c', name: 'C', isLocal: false, firstSeenAt: 2000 },
  { identity: 'a', name: 'A', isLocal: false, firstSeenAt: 1000 },
  { identity: 'b', name: 'B', isLocal: true, firstSeenAt: 1000 },
]);
assert(primary?.identity === 'a', 'O: earliest share is primary (deterministic)');
assert(formatScreenShareLabel('Pat', false) === 'Pat is sharing', 'O: remote label');
assert(formatScreenShareLabel('Pat', true) === 'You are sharing', 'H: local label');

assert(
  decideVoiceHuddleAccess({
    canAccessChannel: true,
    visibility: 'private',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === true,
  'P: private ACL unchanged when canAccessChannel'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: false,
    visibility: 'open',
    isChannelModerator: false,
    isChannelCreator: false,
    isBroadAdmin: false,
  }).ok === false,
  'P: ACL still requires channel access'
);
assert(
  decideVoiceHuddleAccess({
    canAccessChannel: true,
    visibility: 'dm',
    isChannelModerator: true,
    isChannelCreator: true,
    isBroadAdmin: true,
  }).ok === false,
  'Q: DM restriction unchanged'
);

const modPlan = planVoiceAccessToken({
  userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  displayName: 'Mod',
  channelId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  canModerate: true,
});
assert(modPlan.grant.roomAdmin === true, 'R: roomAdmin still only for server-derived moderators');

console.log('\nPhase 3D screen-share smoke — late remote publish (A–H)');

let discovery = createRemoteShareDiscoveryState(['chrome-user', 'safari-user']);
assert(discovery.connectedIdentities.length === 2, 'A: participant already connected');
assert(discovery.primary === null && discovery.presentationActive === false, 'A: no share before publish');
discovery = applyRemoteScreenSharePublished(
  discovery,
  { identity: 'chrome-user', name: 'Chrome' },
  5000
);
assert(discovery.shares.some((s) => s.identity === 'chrome-user'), 'B/C: later ScreenShare publish updates share state');
assert(discovery.primary?.identity === 'chrome-user', 'D: primaryShare becomes remote publisher');
assert(discovery.presentationActive === true, 'E: presentation layout activates');
assert(huddleCountIgnoresScreenShare(2, 1) === 2, 'count stays 2 after remote share');
discovery = applyRemoteScreenShareUnpublished(discovery, 'chrome-user');
assert(discovery.primary === null, 'F/G: remote unpublished clears primaryShare');
assert(discovery.presentationActive === false, 'H: normal grid restores (presentation inactive)');

console.log('\nPhase 3D screen-share smoke — fullscreen / focus mode (A–K)');

assert(presentationFocusButtonLabel(false) === 'Full Screen', 'A: enter label');
assert(presentationFocusButtonLabel(true) === 'Exit Full Screen', 'A: exit label');
assert(
  /data-huddle-fullscreen-control/.test(ui) && /presentationFocusButtonLabel|focusBtnLabel/.test(ui),
  'A: fullscreen control present in UI'
);
assert(
  /\{presenting \? \(/.test(ui) && /data-huddle-fullscreen-control/.test(ui),
  'A: fullscreen button gated on active share (presenting)'
);
assert(/Maximize2|Minimize2/.test(ui), 'A: accessible fullscreen icons');
assert(/togglePresentationFocus|enterPresentationFocus/.test(ui), 'B/C: local + remote can enter focus (local UI)');
assert(
  decideEnterPresentationFocus({
    shareActive: true,
    fullscreenAvailable: true,
    requestSucceeded: true,
  }) === 'native',
  'D: requestFullscreen success → native'
);
assert(
  decideEnterPresentationFocus({
    shareActive: true,
    fullscreenAvailable: true,
    requestSucceeded: false,
  }) === 'fallback',
  'E: requestFullscreen failure → focus fallback'
);
assert(
  decideEnterPresentationFocus({
    shareActive: true,
    fullscreenAvailable: false,
    requestSucceeded: false,
  }) === 'fallback',
  'E: Fullscreen API unavailable → focus fallback'
);
assert(
  decideEnterPresentationFocus({
    shareActive: false,
    fullscreenAvailable: true,
    requestSucceeded: true,
  }) === 'off',
  'A: no focus without active share'
);
assert(
  nextFocusAfterFullscreenChange({
    wasNative: true,
    elementStillFullscreen: false,
    current: 'native',
  }) === 'off',
  'F: Escape/fullscreenchange restores off'
);
assert(
  nextFocusAfterFullscreenChange({
    wasNative: true,
    elementStillFullscreen: true,
    current: 'native',
  }) === 'native',
  'F: still fullscreen keeps native'
);
assert(
  nextFocusAfterFullscreenChange({
    wasNative: false,
    elementStillFullscreen: false,
    current: 'fallback',
  }) === 'fallback',
  'F: fallback unaffected by unrelated fullscreenchange'
);
assert(nextFocusAfterShareStop('native') === 'off', 'G: share stop exits fullscreen');
assert(nextFocusAfterShareStop('fallback') === 'off', 'G: share stop exits focus fallback');
assert(/exitPresentationFocus|exitDocumentFullscreen/.test(ui), 'H: leave/unmount exits fullscreen helpers wired');
assert(
  /disconnectRoom[\s\S]{0,500}exitDocumentFullscreen|setPresentationFocus\('off'\)/.test(ui),
  'H: disconnect clears presentation focus'
);
assert(/fullscreenchange/.test(ui), 'F: listens for fullscreenchange');
assert(/requestElementFullscreen|requestFullscreen/.test(ui), 'D: Fullscreen API path used');
assert(/isFullscreenApiAvailable/.test(ui), 'E: feature-detect before assuming fullscreen');
assert(isPresentationFocusActive('native') && isPresentationFocusActive('fallback'), 'focus modes active');
assert(!isPresentationFocusActive('off'), 'off is inactive');
assert(
  huddlePresentationFocusBoardClass(true).includes('minmax(0,1fr)') &&
    huddlePresentationFocusBoardClass(true).includes('12rem'),
  'desktop focus: maximized stage + narrow rail'
);
assert(
  huddlePresentationFocusRailClass().includes('max-h-[22%]') &&
    huddlePresentationFocusRailClass().includes('md:flex-col'),
  'mobile/desktop focus: compact strip or rail'
);
assert(/object-contain/.test(ui), 'I: object-contain retained');
assert(huddleVideoGridClass(4) === 'grid-cols-2', 'I: normal video grid unaffected');
assert(huddleCountIgnoresScreenShare(2, 1) === 2, 'J: participant count unchanged');
assert(/RoomEvent\.TrackPublished/.test(ui) && /autoSubscribe:\s*true/.test(ui), 'K: LiveKit transport markers untouched');
assert(
  isFullscreenApiAvailable({
    fullscreenEnabled: true,
    documentElement: { requestFullscreen: () => undefined },
  }) === true,
  'Fullscreen API available when requestFullscreen exists'
);
assert(
  isFullscreenApiAvailable({
    fullscreenEnabled: false,
    documentElement: { requestFullscreen: () => undefined },
  }) === false,
  'Fullscreen API respects fullscreenEnabled=false'
);
assert(
  isFullscreenApiAvailable({
    documentElement: {},
  }) === false,
  'Fullscreen API unavailable without requestFullscreen'
);

console.log('\nPhase 3D screen-share smoke — hygiene / cleanup (S–U)');

const helper = read('api/_utils/huddleScreenShare.ts');
assert(!/recording|getDisplayMedia\s*\(|remote.?control|captions|transcription/i.test(helper), 'S/T: no recording/remote-control in helper');
assert(!/recording|getDisplayMedia\s*\(|remote.?control/.test(ui) || /setScreenShareEnabled/.test(ui), 'S: UI uses LiveKit screen share API');
assert(!/CREATE TABLE|ALTER TABLE/.test(helper + ui), 'no SQL schema');
assert(/setScreenShareEnabled\(false/.test(ui) && /disconnectRoom|leaveHuddle/.test(ui), 'U: cleanup disables share on leave/disconnect');
assert(/subscribeRemoteScreenShares/.test(helper), 'late-join screen subscribe helper present');
assert(/subscribeRemoteScreenShares/.test(ui), 'UI subscribes remote shares after join/reconnect');
assert(/RoomEvent\.Reconnected/.test(ui), 'UI re-attaches screen share after reconnect');
assert(/adaptiveStream:\s*true/.test(ui) && /dynacast:\s*true/.test(ui), 'adaptiveStream + dynacast retained');
assert(buildScreenShareCaptureOptions('Mozilla/5.0 Chrome/120').resolution?.frameRate === 15, 'chrome gets detail/15fps profile');
assert(
  buildScreenShareCaptureOptions('Mozilla/5.0 Chrome/120').selfBrowserSurface === 'exclude',
  'chrome excludes this huddle tab from the share picker'
);
assert(
  buildScreenShareCaptureOptions('Mozilla/5.0 Chrome/120').preferCurrentTab === false,
  'does not prefer capturing the huddle tab'
);
assert(isLikelySafari('Mozilla/5.0 Version/17 Safari/605') === true, 'safari detect');
assert(buildScreenShareCaptureOptions('Mozilla/5.0 Version/17 Safari/605').resolution === undefined, 'safari omits forced resolution');
assert(
  buildScreenShareCaptureOptions('Mozilla/5.0 Version/17 Safari/605').selfBrowserSurface === 'exclude',
  'safari still asks to exclude this tab when the picker supports it'
);
assert(/Raise Hand|Lower Hand|End Huddle for Everyone/.test(ui), 'voice/video controls retained');
assert(!/userIdMigration|awc_migrate_user_id/.test(ui), 'no identity/RPC migration in huddle UI');
assert(/VoiceHuddle/.test(read('pages/community/Chat.tsx')), 'Chat still uses VoiceHuddle');
assert(!/LiveHuddle/.test(read('pages/community/Chat.tsx').replace(/VoiceHuddle/g, '')), 'Chat still not importing AI LiveHuddle');

console.log('\nAll Phase 3D screen-share smoke tests passed.');
