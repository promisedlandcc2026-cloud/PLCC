/**
 * Live Huddle keep-alive — token timing + join error + auto-rejoin rules.
 * Run: npx tsx scripts/community-phase-huddle-keepalive-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HUDDLE_SESSION_EXPIRED_MESSAGE,
  huddleJoinErrorMessage,
  huddleTokenRefreshDelayMs,
  jwtNeedsRefresh,
  readJwtExpMs,
  shouldAutoRejoinHuddle,
} from '../api/_utils/huddleKeepAlive.js';
import { planVoiceAccessToken, VOICE_TOKEN_TTL_SECONDS } from '../api/_utils/livekitVoice.js';
import { subscribeRemoteScreenShares } from '../api/_utils/huddleScreenShare.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function fakeJwt(expUnix: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expUnix })).toString('base64url');
  return `${header}.${payload}.sig`;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('Huddle keep-alive smoke — token TTL');

assert(VOICE_TOKEN_TTL_SECONDS === 6 * 60 * 60, 'default LiveKit token is 6 hours');
const plan = planVoiceAccessToken({
  userId: 'cc16b787-203c-49ed-af94-f77bdaef0c23',
  displayName: 'Jerless',
  channelId: '91942994-7fcc-4348-b139-1ef931c3e407',
  canModerate: true,
});
assert(plan.ttlSeconds === 6 * 60 * 60, 'minted plan uses 6-hour TTL');
assert(
  huddleTokenRefreshDelayMs(6 * 60 * 60) === 6 * 60 * 60 * 1000 - 15 * 60 * 1000,
  'refresh 15 minutes before a 6-hour token ends'
);
assert(huddleTokenRefreshDelayMs(60) >= 30_000, 'tiny TTL still waits at least 30s');
assert(huddleTokenRefreshDelayMs(0) === 30_000, 'missing TTL falls back to 30s');

console.log('\nHuddle keep-alive smoke — JWT timing + join errors');

const soon = fakeJwt(Math.floor(Date.now() / 1000) + 60);
const later = fakeJwt(Math.floor(Date.now() / 1000) + 40 * 60);
assert(readJwtExpMs(soon) !== null, 'reads JWT exp');
assert(jwtNeedsRefresh(soon) === true, 'JWT within 10 minutes needs refresh');
assert(jwtNeedsRefresh(later) === false, 'JWT 40 minutes out is still fresh');
assert(huddleJoinErrorMessage(401).includes('Sign in again'), '401 is session expired, not ACL');
assert(huddleJoinErrorMessage(401) === HUDDLE_SESSION_EXPIRED_MESSAGE, '401 copy is stable');
assert(huddleJoinErrorMessage(403).includes('do not have access'), '403 stays channel ACL');
assert(huddleJoinErrorMessage(500, 'boom') === 'boom', 'other errors keep server text');

console.log('\nHuddle keep-alive smoke — auto-rejoin + screen subscribe');

assert(
  shouldAutoRejoinHuddle({
    stayInHuddle: true,
    endedForEveryone: false,
    userInitiatedLeave: false,
  }) === true,
  'unexpected drop while staying in huddle rejoins'
);
assert(
  shouldAutoRejoinHuddle({
    stayInHuddle: true,
    endedForEveryone: false,
    userInitiatedLeave: true,
  }) === false,
  'Leave does not auto-rejoin'
);
assert(
  shouldAutoRejoinHuddle({
    stayInHuddle: true,
    endedForEveryone: true,
    userInitiatedLeave: false,
  }) === false,
  'End for everyone does not auto-rejoin'
);

let subscribed = 0;
const pubs = [
  {
    source: 'screen_share',
    isSubscribed: false,
    setSubscribed: (v: boolean) => {
      if (v) subscribed += 1;
    },
  },
  { source: 'camera', isSubscribed: false, setSubscribed: () => {} },
  { source: 'screen_share', isSubscribed: true, setSubscribed: () => {} },
];
assert(subscribeRemoteScreenShares(pubs) === 1, 'subscribes only unsubscribed screen shares');
assert(subscribed === 1, 'setSubscribed(true) called once');

console.log('\nHuddle keep-alive smoke — source contracts');

const ui = read('components/Community/VoiceHuddle.tsx');
const voice = read('api/_utils/livekitVoice.ts');
const api = read('lib/api.ts');
const auth = read('lib/authSession.ts');
assert(/VOICE_TOKEN_TTL_SECONDS = 6 \* 60 \* 60/.test(voice), 'TTL constant is 6 hours');
assert(/requestVoiceToken/.test(ui), 'UI remints huddle tokens');
assert(/startHuddleKeepAlive/.test(ui), 'UI schedules huddle token refresh');
assert(/ensureFreshAuthSession/.test(ui), 'UI refreshes login during huddle');
assert(/shouldAutoRejoinHuddle/.test(ui), 'UI auto-rejoins unexpected drops');
assert(/RoomEvent\.Reconnected/.test(ui), 'UI re-subscribes screen share after reconnect');
assert(/subscribeRemoteScreenShares/.test(ui), 'UI uses late-join screen subscribe helper');
assert(/refreshSession/.test(auth), '401 recovery calls refreshSession');
assert(!/ensureFreshAuthSession\(/.test(api), 'getAuthHeaders does not race a proactive refresh');
assert(/outcome !== 'recovered'/.test(api), 'vaultFetch retries once after recovered 401');
assert(/refreshSessionOnce/.test(auth), 'huddle keep-alive shares the single-flight refresh');

console.log('\nAll huddle keep-alive smoke tests passed.');
