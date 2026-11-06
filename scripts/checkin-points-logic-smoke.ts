/**
 * Check-in points pure helpers smoke.
 * Run: npx tsx scripts/checkin-points-logic-smoke.ts
 */
import {
  QR_WINDOW_MS,
  canSelfCheckin,
  extractQrToken,
  isMembershipCardCode,
  leaderboardName,
  mapSelfCheckinRpcError,
  pointsSeasonKey,
  resolveQrSecret,
  seasonLabel,
  signQrToken,
  toAwardLines,
  verifyQrToken,
} from '../api/_utils/checkinPointsLogic.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

console.log('\nCheck-in points logic smoke');

const secret = 'test-secret-0123456789abcdef';
const sessionId = '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
const t0 = Date.UTC(2026, 9, 15, 23, 0, 0);

const signed = signQrToken(secret, sessionId, t0);
assert(signed.token.startsWith('AWCQ1.'), 'token prefix');
assert(signed.expiresAtMs > t0 && signed.expiresAtMs - t0 <= QR_WINDOW_MS, 'expires within one window');

const ok = verifyQrToken(secret, signed.token, t0);
assert(ok.ok === true && ok.ok && ok.sessionId === sessionId, 'fresh token verifies');
assert(verifyQrToken(secret, signed.token, t0 + QR_WINDOW_MS).ok === true, 'one window of grace');
const stale = verifyQrToken(secret, signed.token, t0 + 3 * QR_WINDOW_MS);
assert(!stale.ok && (stale as { code: string }).code === 'code_expired', 'old token expires');
const forged = verifyQrToken('another-secret-xxxxxxxxxxxx', signed.token, t0);
assert(!forged.ok && (forged as { code: string }).code === 'invalid_code', 'wrong key rejected');
const otherSession = signed.token.replace(sessionId, '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e50');
assert(!verifyQrToken(secret, otherSession, t0).ok, 'session swap rejected');
assert(!verifyQrToken(secret, 'AWC1.deadbeef', t0).ok, 'membership card token rejected');

const url = `https://plcc-opal.vercel.app/#/scan-in?c=${encodeURIComponent(signed.token)}`;
assert(extractQrToken(url) === signed.token, 'token pulled from Canaan link');
assert(extractQrToken(signed.token) === signed.token, 'bare token accepted');
assert(extractQrToken('https://example.com/?c=hello') === null, 'foreign link rejected');
assert(extractQrToken(42) === null, 'non-string rejected');
assert(isMembershipCardCode('AWC1.abc123') && !isMembershipCardCode(signed.token), 'membership card recognized');

assert(resolveQrSecret({ CHECKIN_QR_SECRET: 'x'.repeat(20) }) === 'x'.repeat(20), 'dedicated secret wins');
const derived = resolveQrSecret({ SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
assert(typeof derived === 'string' && derived !== 'service-key' && derived.length === 64, 'derived secret is not the raw key');
assert(resolveQrSecret({}) === null, 'no secret without keys');

// Seasons — same boundaries as public.points_season_key
assert(pointsSeasonKey(new Date('2026-10-15T16:00:00Z')) === '2026-fall', 'October is fall');
assert(pointsSeasonKey(new Date('2026-12-05T16:00:00Z')) === '2026-winter', 'December starts winter');
assert(pointsSeasonKey(new Date('2027-02-10T16:00:00Z')) === '2026-winter', 'February keyed to December year');
assert(pointsSeasonKey(new Date('2026-09-01T03:30:00Z')) === '2026-summer', 'NY time, not UTC, at the edge');
assert(pointsSeasonKey(new Date('2026-03-01T17:00:00Z')) === '2026-spring', 'March is spring');
assert(seasonLabel('2026-fall') === 'Fall 2026', 'fall label');
assert(seasonLabel('2026-winter') === 'Winter 2026–27', 'winter label spans years');

assert(leaderboardName({ first_name: 'Anaya', last_name: 'Diaz' }) === 'Anaya D.', 'first name + initial');
assert(leaderboardName({ preferred_name: 'Nay', first_name: 'Anaya', last_name: 'Diaz' }) === 'Nay D.', 'preferred name used');
assert(leaderboardName({}) === 'Member', 'blank falls back');

assert(canSelfCheckin('MEMBER') && !canSelfCheckin('PENDING') && !canSelfCheckin('KIOSK') && !canSelfCheckin(null), 'role gate');
assert(mapSelfCheckinRpcError('ERROR: session_closed') === 'session_closed', 'rpc code mapped');
assert(mapSelfCheckinRpcError('boom') === 'checkin_error', 'unknown rpc error');

const lines = toAwardLines([
  { reason: 'checkin', points: 10 },
  { reason: 'on_time', points: 5 },
  { reason: 'streak', points: 10, note: '3 in a row' },
]);
assert(lines.length === 3 && lines.reduce((s, l) => s + l.points, 0) === 25, 'award lines total');

console.log('\nAll check-in points logic checks passed.\n');
