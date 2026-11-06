/**
 * Live Huddle start policy smoke (no LiveKit / Supabase required).
 * Run: npx tsx scripts/huddle-start-policy-smoke.ts
 *
 * Mirrors the PLCC Chat Live Huddle plan acceptance tests that are decidable
 * without a live database: who may start, who may only join, outage pass.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  HUDDLE_START_FORBIDDEN_CODE,
  combineHuddleOccupancy,
  decideHuddleEntry,
  decideHuddleStart,
} from '../api/_utils/huddleStartPolicy.js';
import { signHuddleFallbackPass, verifyHuddleFallbackPass } from '../api/_utils/huddleFallbackPass.js';
import { huddleJoinErrorMessage } from '../api/_utils/huddleKeepAlive.js';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const base = {
  visibility: 'ministry',
  role: 'MEMBER',
  isChannelModerator: false,
  isChannelCreator: false,
  isMinistryLeaderInScope: false,
};

console.log('Huddle start policy');

check("Men's Ministry leader starts Men's Huddle → allowed", () => {
  const d = decideHuddleStart({ ...base, role: 'MINISTRY_LEADER', isMinistryLeaderInScope: true });
  assert.equal(d.canStart, true);
  assert.equal(d.reason, 'ministry_leader');
});

check("Men's Ministry leader starts Children's Huddle without authorization → denied", () => {
  const d = decideHuddleStart({ ...base, role: 'MINISTRY_LEADER', isMinistryLeaderInScope: false });
  assert.equal(d.canStart, false);
  const entry = decideHuddleEntry({ isLive: false, canStart: d.canStart });
  assert.equal(entry.ok, false);
  if (!entry.ok) {
    assert.equal(entry.status, 403);
    assert.equal(entry.code, HUDDLE_START_FORBIDDEN_CODE);
  }
});

check('Ministry leader title does not grant start in open/private rooms', () => {
  for (const visibility of ['open', 'private']) {
    const d = decideHuddleStart({ ...base, visibility, role: 'MINISTRY_LEADER', isMinistryLeaderInScope: true });
    assert.equal(d.canStart, false, visibility);
  }
});

check('Regular member starts group Huddle → denied', () => {
  for (const visibility of ['open', 'private', 'ministry']) {
    const d = decideHuddleStart({ ...base, visibility });
    assert.equal(d.canStart, false, visibility);
  }
});

check('Regular member who moderates the room (e.g. overnight prayer lead) → allowed', () => {
  const d = decideHuddleStart({ ...base, visibility: 'open', isChannelModerator: true });
  assert.equal(d.canStart, true);
  assert.equal(d.reason, 'room_moderator');
});

check('Room creator → allowed', () => {
  assert.equal(decideHuddleStart({ ...base, isChannelCreator: true }).canStart, true);
});

check('Super Admin / Admin / Pastor (and other church-wide leaders) → allowed anywhere', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'FIRST_LADY', 'SECRETARY', 'ASST_SECRETARY', 'ADMIN_STAFF']) {
    assert.equal(decideHuddleStart({ ...base, visibility: 'open', role }).canStart, true, role);
  }
});

check('Youth / volunteer / other roles without moderation → denied', () => {
  for (const role of ['YOUTH', 'VOLUNTEER', 'STAFF', 'FINANCE', 'MEDIA_TEAM', 'GUEST', 'PARENT']) {
    assert.equal(decideHuddleStart({ ...base, visibility: 'open', role }).canStart, false, role);
  }
});

check('Direct (DM) calls → either person may start', () => {
  assert.equal(decideHuddleStart({ ...base, visibility: 'dm' }).canStart, true);
});

check('Authorized member joins active Huddle → allowed', () => {
  const entry = decideHuddleEntry({ isLive: true, canStart: false });
  assert.deepEqual(entry, { ok: true, mode: 'join' });
});

check('Leader opening empty room → start', () => {
  assert.deepEqual(decideHuddleEntry({ isLive: false, canStart: true }), { ok: true, mode: 'start' });
});

check('Liveness unknown → members told to retry, never allowed to start', () => {
  const entry = decideHuddleEntry({ isLive: null, canStart: false });
  assert.equal(entry.ok, false);
  if (!entry.ok) assert.equal(entry.status, 503);
  assert.deepEqual(decideHuddleEntry({ isLive: null, canStart: true }), { ok: true, mode: 'start' });
});

check('Occupancy: live if anyone on LiveKit or Daily; unknown only if no line answered', () => {
  assert.equal(combineHuddleOccupancy([0, 0]), false);
  assert.equal(combineHuddleOccupancy([0, 2]), true);
  assert.equal(combineHuddleOccupancy([null, 1]), true);
  assert.equal(combineHuddleOccupancy([null, 0]), false);
  assert.equal(combineHuddleOccupancy([null, null]), null);
  assert.equal(combineHuddleOccupancy([]), null);
});

console.log('Outage fallback pass');
const secret = 'test-secret-not-real-0123456789';

check('Pass carries canStart for leaders', () => {
  const pass = signHuddleFallbackPass(
    { userId: 'u1', channelId: 'c1', displayName: 'Leader', canModerate: true, channelCanModerate: true, canStart: true },
    secret
  );
  assert.equal(verifyHuddleFallbackPass(pass!, secret)?.canStart, true);
});

check('Member pass is join-only (cannot open empty room during outage)', () => {
  const pass = signHuddleFallbackPass(
    { userId: 'u2', channelId: 'c1', displayName: 'Member', canModerate: false, channelCanModerate: false },
    secret
  );
  const claims = verifyHuddleFallbackPass(pass!, secret)!;
  assert.equal(claims.canStart, false);
  assert.equal(decideHuddleEntry({ isLive: false, canStart: claims.canStart }).ok, false);
  assert.equal(decideHuddleEntry({ isLive: true, canStart: claims.canStart }).ok, true);
});

check('Older passes without canStart read as join-only', () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ userId: 'u3', channelId: 'c1', displayName: 'Old', canModerate: true, channelCanModerate: true, exp: now + 600 })
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const sig = createHmac('sha256', secret)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const claims = verifyHuddleFallbackPass(`${payload}.${sig}`, secret);
  assert.ok(claims);
  assert.equal(claims!.canStart, false);
});

check('Tampered pass claiming canStart is rejected', () => {
  const pass = signHuddleFallbackPass(
    { userId: 'u2', channelId: 'c1', displayName: 'Member', canModerate: false, channelCanModerate: false },
    secret
  )!;
  const [payload, sig] = pass.split('.');
  const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  json.canStart = true;
  const forged = Buffer.from(JSON.stringify(json)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  assert.equal(verifyHuddleFallbackPass(`${forged}.${sig}`, secret), null);
});

console.log('Messages');
check('Canaan shows the "not started yet" wording, not "no access"', () => {
  const msg = huddleJoinErrorMessage(403, "This huddle hasn't started yet.", HUDDLE_START_FORBIDDEN_CODE);
  assert.match(msg, /hasn't started yet/);
  assert.doesNotMatch(huddleJoinErrorMessage(403, 'x'), /hasn't started yet/);
});

console.log(`\n${passed} checks passed`);
