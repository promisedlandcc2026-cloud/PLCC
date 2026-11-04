/**
 * Live Huddle keep-alive — token timing, join errors, auto-rejoin rules.
 * Pure helpers (no LiveKit / Supabase). Sunday services outlast a 1-hour JWT.
 */

/** Refresh the huddle token this far before it expires. */
export const HUDDLE_TOKEN_REFRESH_LEAD_MS = 15 * 60 * 1000;

/** Refresh the Vault login on this cadence while a huddle is connected. */
export const HUDDLE_SESSION_KEEPALIVE_MS = 20 * 60 * 1000;

/** Delay before an unexpected drop tries one silent rejoin. */
export const HUDDLE_AUTO_REJOIN_DELAY_MS = 1_200;

export const HUDDLE_SESSION_EXPIRED_MESSAGE =
  'Your sign-in expired. Sign in again, then rejoin the huddle. Chat and Members use the same session.';

export const HUDDLE_CHANNEL_FORBIDDEN_MESSAGE =
  'You do not have access to this channel huddle.';

/** Decode JWT exp without verifying — timing only, never for auth. */
export function readJwtExpMs(token: string): number | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
    const json = JSON.parse(
      typeof atob === 'function'
        ? atob(pad)
        : Buffer.from(pad, 'base64').toString('utf8')
    );
    const exp = Number(json?.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function jwtNeedsRefresh(
  token: string,
  nowMs: number = Date.now(),
  leadMs: number = 10 * 60 * 1000
): boolean {
  const expMs = readJwtExpMs(token);
  if (!expMs) return false;
  return expMs - nowMs <= leadMs;
}

/**
 * Wait this long after mint before reminting.
 * Short tokens refresh at 50% TTL; never sooner than 30s.
 */
export function huddleTokenRefreshDelayMs(
  expiresInSec: number,
  leadMs: number = HUDDLE_TOKEN_REFRESH_LEAD_MS
): number {
  const ttlMs = Math.max(0, Number(expiresInSec) || 0) * 1000;
  if (ttlMs <= 0) return 30_000;
  const wait = ttlMs - leadMs;
  if (wait <= 0) return Math.max(30_000, Math.floor(ttlMs * 0.5));
  return wait;
}

export function huddleJoinErrorMessage(
  status: number,
  serverError?: string,
  serverCode?: string
): string {
  if (status === 401) return HUDDLE_SESSION_EXPIRED_MESSAGE;
  // Not started yet (member can join once a leader/moderator starts it) — show Vault's wording.
  if (serverCode === 'huddle_start_forbidden' && String(serverError || '').trim()) {
    return String(serverError).trim();
  }
  if (status === 403) return HUDDLE_CHANNEL_FORBIDDEN_MESSAGE;
  const msg = String(serverError || '').trim();
  return msg || 'Could not start huddle';
}

export function shouldAutoRejoinHuddle(opts: {
  stayInHuddle: boolean;
  endedForEveryone: boolean;
  userInitiatedLeave: boolean;
}): boolean {
  return Boolean(opts.stayInHuddle) && !opts.endedForEveryone && !opts.userInitiatedLeave;
}
