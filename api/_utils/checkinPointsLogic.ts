/**
 * Check-in points — pure helpers (no I/O).
 * Rotating QR tokens, season keys, labels, and safe display names.
 * Tested by scripts/checkin-points-logic-smoke.ts
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Each QR is valid for one 30-second window (plus one window of grace either side). */
export const QR_WINDOW_MS = 30_000;
export const QR_TOKEN_PREFIX = 'AWCQ1';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * Signing key. Prefer a dedicated CHECKIN_QR_SECRET; otherwise derive one from
 * the service role key so check-in works without new Vercel config.
 */
export function resolveQrSecret(env: Record<string, string | undefined> = process.env): string | null {
  const dedicated = String(env.CHECKIN_QR_SECRET || '').trim();
  if (dedicated.length >= 16) return dedicated;
  const service = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!service) return null;
  return createHmac('sha256', service).update('awc-checkin-qr-v1').digest('hex');
}

export function qrWindowFor(nowMs: number): number {
  return Math.floor(nowMs / QR_WINDOW_MS);
}

function signature(secret: string, sessionId: string, window: number): string {
  return createHmac('sha256', secret)
    .update(`checkin:v1:${sessionId.toLowerCase()}:${window}`)
    .digest('base64url')
    .slice(0, 22);
}

export function signQrToken(secret: string, sessionId: string, nowMs: number) {
  const window = qrWindowFor(nowMs);
  const token = `${QR_TOKEN_PREFIX}.${sessionId.toLowerCase()}.${window}.${signature(secret, sessionId, window)}`;
  const expiresAtMs = (window + 1) * QR_WINDOW_MS;
  return { token, window, expiresAtMs };
}

/** Pull a token out of whatever the camera read: a bare token or a Vault link with ?c= */
/** True when the camera read a member's own AWC1 membership card, not a check-in code. */
export function isMembershipCardCode(raw: unknown): boolean {
  return typeof raw === 'string' && /^AWC1\./.test(raw.trim());
}

export function extractQrToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > 600) return null;
  if (text.startsWith(`${QR_TOKEN_PREFIX}.`)) return text;
  const match = /[?&]c=([^&#\s]+)/.exec(text);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return decoded.startsWith(`${QR_TOKEN_PREFIX}.`) ? decoded : null;
}

export type QrVerifyResult =
  | { ok: true; sessionId: string }
  | { ok: false; code: 'invalid_code' | 'code_expired' };

export function verifyQrToken(secret: string, token: string, nowMs: number): QrVerifyResult {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== QR_TOKEN_PREFIX) return { ok: false, code: 'invalid_code' };
  const [, sessionId, windowRaw, sig] = parts;
  if (!isUuid(sessionId) || !/^\d{1,12}$/.test(windowRaw) || !/^[A-Za-z0-9_-]{22}$/.test(sig)) {
    return { ok: false, code: 'invalid_code' };
  }
  const window = Number(windowRaw);
  const expected = signature(secret, sessionId, window);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: 'invalid_code' };
  const current = qrWindowFor(nowMs);
  if (window < current - 1 || window > current + 1) return { ok: false, code: 'code_expired' };
  return { ok: true, sessionId: sessionId.toLowerCase() };
}

// ---------------------------------------------------------------------------
// Seasons — must match public.points_season_key() and lib/seasons/season.ts
// ---------------------------------------------------------------------------

export type SeasonName = 'fall' | 'winter' | 'spring' | 'summer';

function nyYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: read('year'), month: read('month') };
}

export function pointsSeasonKey(date: Date): string {
  const { year, month } = nyYearMonth(date);
  if (month >= 9 && month <= 11) return `${year}-fall`;
  if (month >= 6 && month <= 8) return `${year}-summer`;
  if (month >= 3 && month <= 5) return `${year}-spring`;
  if (month === 12) return `${year}-winter`;
  return `${year - 1}-winter`;
}

export function parseSeasonKey(key: unknown): { year: number; season: SeasonName } | null {
  const match = /^(\d{4})-(fall|winter|spring|summer)$/.exec(String(key || ''));
  if (!match) return null;
  return { year: Number(match[1]), season: match[2] as SeasonName };
}

const SEASON_TITLE: Record<SeasonName, string> = {
  fall: 'Fall',
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
};

const SEASON_EMOJI: Record<SeasonName, string> = {
  fall: '🍂',
  winter: '❄️',
  spring: '🌸',
  summer: '☀️',
};

export function seasonLabel(key: string): string {
  const parsed = parseSeasonKey(key);
  if (!parsed) return 'This season';
  if (parsed.season === 'winter') {
    return `Winter ${parsed.year}–${String((parsed.year + 1) % 100).padStart(2, '0')}`;
  }
  return `${SEASON_TITLE[parsed.season]} ${parsed.year}`;
}

export function seasonEmoji(key: string): string {
  const parsed = parseSeasonKey(key);
  return parsed ? SEASON_EMOJI[parsed.season] : '⭐';
}

// ---------------------------------------------------------------------------
// Display + ledger shaping
// ---------------------------------------------------------------------------

/** First name (or preferred name) + last initial. Never the full last name. */
export function leaderboardName(member: {
  preferred_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const first = String(member.preferred_name || member.first_name || '').trim().split(/\s+/)[0] || 'Member';
  const initial = String(member.last_name || '').trim().charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

export const REASON_LABEL: Record<string, string> = {
  checkin: 'Checked in',
  on_time: 'On time',
  first_visit: 'First visit',
  streak: 'Streak bonus',
  referral: 'Brought a friend',
  manual: 'Bonus from a leader',
};

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] || 'Points';
}

export type CheckinAwardLine = { reason: string; label: string; points: number; note: string | null };

export function toAwardLines(rows: Array<{ reason?: string; points?: number; note?: string | null }>): CheckinAwardLine[] {
  return (rows || [])
    .filter((r) => typeof r?.points === 'number' && r.points !== 0)
    .map((r) => ({
      reason: String(r.reason || ''),
      label: reasonLabel(String(r.reason || '')),
      points: Number(r.points),
      note: r.note ? String(r.note).slice(0, 200) : null,
    }));
}

export const SELF_CHECKIN_DENIED_ROLES = new Set(['PENDING', 'GUEST', 'KIOSK', '']);

export function canSelfCheckin(role: unknown): boolean {
  if (role == null) return false;
  return !SELF_CHECKIN_DENIED_ROLES.has(String(role).toUpperCase());
}

/** Friendly copy for RPC error codes on the member side. */
export function selfCheckinMessage(code: string): string {
  switch (code) {
    case 'invalid_code':
      return 'That code isn’t a Vault check-in code. Scan the code on the check-in screen.';
    case 'membership_card':
      return 'That’s a membership card. On this page, scan the check-in code on the leader’s screen (Self check-in QR). Membership cards are scanned by a leader.';
    case 'code_expired':
      return 'That code just changed. Scan the screen again.';
    case 'session_not_open':
      return 'Check-in isn’t open yet.';
    case 'session_closed':
      return 'Check-in for this gathering has closed.';
    case 'session_not_found':
      return 'We couldn’t find this gathering.';
    case 'session_type_not_allowed':
      return 'Kids check in at the kids desk.';
    case 'member_link_required':
      return 'Your login isn’t linked to your church record yet. Ask a leader to check you in this time.';
    case 'member_link_conflict':
      return 'Your login is linked to more than one church record. Ask a leader to fix it.';
    case 'member_not_found':
      return 'We couldn’t find your church record. Ask a leader to check you in.';
    case 'rate_limited':
      return 'Too many tries. Wait a moment and scan again.';
    default:
      return 'Check-in didn’t go through. Ask a leader to check you in.';
  }
}

const RPC_CODES = [
  'session_not_found',
  'session_not_open',
  'session_closed',
  'session_type_not_allowed',
  'member_link_required',
  'member_link_conflict',
  'member_not_found',
  'actor_not_found',
  'attendance_unavailable',
];

export function mapSelfCheckinRpcError(message: string): string {
  const msg = String(message || '');
  return RPC_CODES.find((code) => msg.includes(code)) || 'checkin_error';
}

// ---------------------------------------------------------------------------
// Kids check-in by the parent's phone
// ---------------------------------------------------------------------------

/**
 * After a parent scans the kids room's rotating QR, they get a short pass so they
 * have time to tick their children (the room code changes every 30 seconds).
 * The pass is tied to that session and that parent's login.
 */
export const KIDS_PASS_PREFIX = 'AWCK1';
export const KIDS_PASS_TTL_MS = 10 * 60_000;

function kidsPassSignature(secret: string, sessionId: string, userId: string, expMs: number): string {
  return createHmac('sha256', secret)
    .update(`kids-pass:v1:${sessionId.toLowerCase()}:${userId.toLowerCase()}:${expMs}`)
    .digest('base64url')
    .slice(0, 22);
}

export function signKidsPass(secret: string, sessionId: string, userId: string, nowMs: number): string {
  const exp = nowMs + KIDS_PASS_TTL_MS;
  return `${KIDS_PASS_PREFIX}.${sessionId.toLowerCase()}.${exp}.${kidsPassSignature(secret, sessionId, userId, exp)}`;
}

export function verifyKidsPass(
  secret: string,
  pass: unknown,
  userId: string,
  nowMs: number
): { ok: true; sessionId: string } | { ok: false; code: 'invalid_code' | 'code_expired' } {
  const parts = String(pass || '').split('.');
  if (parts.length !== 4 || parts[0] !== KIDS_PASS_PREFIX) return { ok: false, code: 'invalid_code' };
  const [, sessionId, expRaw, sig] = parts;
  if (!isUuid(sessionId) || !/^\d{1,15}$/.test(expRaw) || !/^[A-Za-z0-9_-]{22}$/.test(sig)) {
    return { ok: false, code: 'invalid_code' };
  }
  const exp = Number(expRaw);
  const a = Buffer.from(kidsPassSignature(secret, sessionId, userId, exp));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: 'invalid_code' };
  if (nowMs > exp) return { ok: false, code: 'code_expired' };
  return { ok: true, sessionId: sessionId.toLowerCase() };
}

/** Friendly copy for the parent's phone. */
export function kidsCheckinMessage(code: string): string {
  switch (code) {
    case 'code_expired':
      return 'That took a little long. Scan the code at the door again.';
    case 'guardian_not_authorized':
      return 'This child isn’t linked to your account. A teacher can check them in at the door.';
    case 'session_not_open':
    case 'session_closed':
      return 'Kids check-in isn’t open right now.';
    case 'no_children':
      return 'Pick at least one child.';
    default:
      return 'Check-in didn’t go through. A teacher can check your child in at the door.';
  }
}
