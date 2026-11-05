/**
 * PLCC Canaan — live Supabase session is the single auth truth.
 * App-only awc_* keys may mirror a live token/profile; they must never keep
 * the UI signed in after the Supabase session is gone.
 */

export const APP_AUTH_STORAGE_KEYS = [
  'awc_auth_token',
  'awc_user_id',
  'awc_user_role',
  'awc_user_birthday',
  'awc_user_name',
  'awc_user_email',
  'awc_user_title',
  'awc_user_avatar',
] as const;

const RETURN_TO_KEY = 'awc_auth_return_to';
const SESSION_EXPIRED_NOTICE_KEY = 'awc_session_expired_notice';

export const SESSION_EXPIRED_MESSAGE = 'Your session expired — please sign in again';

export type SessionLike = {
  access_token?: string | null;
  user?: { id?: string | null; email?: string | null; user_metadata?: Record<string, unknown> | null } | null;
} | null | undefined;

export function isJwtAccessToken(token: unknown): boolean {
  const t = String(token || '');
  return Boolean(t) && t !== 'active' && t !== 'undefined' && t.split('.').length === 3;
}

/** Clear app-only auth/profile keys. Does not call Supabase signOut. */
export function clearAppAuthStorage(
  storage: { removeItem: (key: string) => void } = typeof localStorage !== 'undefined'
    ? localStorage
    : { removeItem() {} }
): void {
  for (const key of APP_AUTH_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function mirrorAccessToken(
  token: string,
  storage: { setItem: (key: string, value: string) => void } = typeof localStorage !== 'undefined'
    ? localStorage
    : { setItem() {} }
): void {
  if (!isJwtAccessToken(token)) return;
  try {
    storage.setItem('awc_auth_token', token);
  } catch {
    /* ignore */
  }
}

/**
 * Internal hash-router paths only. Rejects protocol-relative / absolute URLs.
 */
export function sanitizeReturnTo(raw: unknown): string | null {
  if (raw == null) return null;
  let path = String(raw).trim();
  if (!path) return null;
  // Strip accidental hash prefix
  if (path.startsWith('#/')) path = path.slice(1);
  if (path.startsWith('#')) path = path.slice(1);
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return null;
  if (path.includes('://')) return null;
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/farewell')) return null;
  // Basic character allowlist for path + query
  if (!/^\/[A-Za-z0-9\-._~/?&=%]*$/.test(path)) return null;
  return path;
}

/**
 * Build a sanitized internal returnTo from a React Router location-like object.
 * Preserves pathname + search (e.g. /community/chat?channel=<uuid>).
 * Never includes origin/hash protocol fragments.
 */
export function returnToFromRouterLocation(from: {
  pathname?: string | null;
  search?: string | null;
} | null | undefined): string | null {
  if (!from) return null;
  const pathname = String(from.pathname || '').trim();
  if (!pathname) return null;
  const rawSearch = String(from.search || '').trim();
  const search = !rawSearch
    ? ''
    : rawSearch.startsWith('?')
      ? rawSearch
      : `?${rawSearch}`;
  return sanitizeReturnTo(`${pathname}${search}`);
}

export function rememberReturnTo(path: string | null): void {
  const safe = sanitizeReturnTo(path);
  try {
    if (safe) sessionStorage.setItem(RETURN_TO_KEY, safe);
    else sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    /* ignore */
  }
}

export function peekReturnTo(): string | null {
  try {
    return sanitizeReturnTo(sessionStorage.getItem(RETURN_TO_KEY));
  } catch {
    return null;
  }
}

export function consumeReturnTo(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return sanitizeReturnTo(raw);
  } catch {
    return null;
  }
}

/** One-shot login banner after an unrecoverable session (not shown after intentional logout). */
export function setSessionExpiredNotice(): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function peekSessionExpiredNotice(): string | null {
  try {
    return sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY) === '1' ? SESSION_EXPIRED_MESSAGE : null;
  } catch {
    return null;
  }
}

export function consumeSessionExpiredNotice(): string | null {
  try {
    const flagged = sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY) === '1';
    sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
    return flagged ? SESSION_EXPIRED_MESSAGE : null;
  } catch {
    return null;
  }
}

export function currentHashPath(): string {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash || '';
  const path = hash.startsWith('#') ? hash.slice(1) : hash;
  const normalized = path.split('?')[0] || '/';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

/**
 * Public auth screens that must not be stolen by post-401 login redirects.
 * Chrome often completes in-flight 401 recovery during signOut; Safari cancels those fetches.
 */
export function isAuthLandingHash(hash: string = typeof window !== 'undefined' ? window.location.hash : ''): boolean {
  const h = String(hash || '');
  return (
    h.startsWith('#/login') ||
    h.startsWith('#/farewell') ||
    h.startsWith('#/help/')
  );
}

/** Pure: should a protected API status trigger session recovery? */
export function shouldAttemptAuthRecovery(status: number): boolean {
  return status === 401;
}

/** Pure: 403 / 5xx / network must not force logout. */
export function shouldForceLogoutOnStatus(status: number): boolean {
  return status === 401;
}

export function hasRecoverableSession(session: SessionLike): boolean {
  return isJwtAccessToken(session?.access_token);
}

// ─── Poller halt ─────────────────────────────────────────────────────────────

let pollingHalted = false;
const pollingListeners = new Set<(halted: boolean) => void>();

function notifyPollingListeners(): void {
  for (const fn of Array.from(pollingListeners)) {
    try {
      fn(pollingHalted);
    } catch {
      /* ignore */
    }
  }
}

export function isAuthPollingHalted(): boolean {
  return pollingHalted;
}

/** Stop every useVaultPoll poller (auth failure / sign-out). */
export function haltAuthPolling(): void {
  if (pollingHalted) return;
  pollingHalted = true;
  notifyPollingListeners();
}

/** Allow polling again once a live session is hydrated (new login in the same tab). */
export function resumeAuthPolling(): void {
  if (!pollingHalted) return;
  pollingHalted = false;
  notifyPollingListeners();
}

export function onAuthPollingChange(fn: (halted: boolean) => void): () => void {
  pollingListeners.add(fn);
  return () => {
    pollingListeners.delete(fn);
  };
}

// ─── Sign-out ────────────────────────────────────────────────────────────────

function removeSupabaseSessionStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token/.test(k)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/**
 * Sign out of this browser only. Vault, Connect, and Chat share one Supabase
 * project, so a global sign-out would revoke the user's other app sessions.
 * Never throws; local session state is always cleared.
 */
export async function signOutLocal(): Promise<void> {
  let failed = false;
  try {
    const { supabase } = await import('./supabase');
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) failed = true;
    }
  } catch {
    failed = true;
  }
  if (failed) removeSupabaseSessionStorage();
  clearAppAuthStorage();
}

// ─── Single-flight refresh ───────────────────────────────────────────────────

export type RefreshOutcome = {
  ok: boolean;
  token?: string;
  reason?: 'invalid' | 'network';
};

/** Pure: refresh errors caused by connectivity must not end the session. */
export function isNetworkAuthError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!err || typeof err !== 'object') return false;
  const name = String((err as any).name || '');
  const status = (err as any).status;
  if (name === 'AuthRetryableFetchError') return true;
  if (name === 'TypeError' && /fetch|network|load failed/i.test(String((err as any).message || ''))) return true;
  if (status === 0) return true;
  return typeof status === 'number' && status >= 500;
}

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * Refresh the Supabase session once; parallel callers share one promise.
 * `failedToken` is the JWT the server rejected — if storage already holds a
 * different token (another request or tab refreshed), use that instead.
 * A 400 / invalid refresh token is terminal; the rejected JWT is never reused.
 */
export function refreshSessionOnce(failedToken?: string | null): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async (): Promise<RefreshOutcome> => {
    try {
      const { supabase } = await import('./supabase');
      if (!supabase) return { ok: false, reason: 'invalid' };
      const current = await supabase.auth.getSession();
      const currentToken = current.data.session?.access_token;
      if (failedToken && isJwtAccessToken(currentToken) && currentToken !== failedToken) {
        mirrorAccessToken(String(currentToken));
        return { ok: true, token: String(currentToken) };
      }
      if (!current.data.session) return { ok: false, reason: 'invalid' };
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return { ok: false, reason: isNetworkAuthError(error) ? 'network' : 'invalid' };
      const token = data.session?.access_token;
      if (!isJwtAccessToken(token)) return { ok: false, reason: 'invalid' };
      mirrorAccessToken(String(token));
      return { ok: true, token: String(token) };
    } catch (err) {
      return { ok: false, reason: isNetworkAuthError(err) ? 'network' : 'invalid' };
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Refresh the live Supabase session when the access JWT is missing or near expiry.
 * Used during huddles so Chat / Members / rejoin do not die after ~1 hour.
 *
 * Lead time is ~90s (matches supabase-js), not 10 minutes — a long lead caused
 * tab-return focus/refetch storms that raced refresh and kicked users to login.
 */
let ensureFreshInFlight: Promise<'fresh' | 'refreshed' | 'missing'> | null = null;

/** ~90s — align with GoTrue auto-refresh margin; avoid premature refresh storms. */
export const AUTH_SESSION_REFRESH_LEAD_MS = 90_000;

export async function ensureFreshAuthSession(): Promise<'fresh' | 'refreshed' | 'missing'> {
  if (ensureFreshInFlight) return ensureFreshInFlight;
  ensureFreshInFlight = (async () => {
    try {
      const { jwtNeedsRefresh } = await import('../api/_utils/huddleKeepAlive.js');
      const { supabase } = await import('./supabase');
      if (!supabase) return 'missing';
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!isJwtAccessToken(token)) return 'missing';
      if (!jwtNeedsRefresh(String(token), Date.now(), AUTH_SESSION_REFRESH_LEAD_MS)) {
        mirrorAccessToken(String(token));
        return 'fresh';
      }
      const outcome = await refreshSessionOnce();
      if (outcome.ok) return 'refreshed';
      if (outcome.reason === 'invalid') {
        if (!pollingHalted) await expireSession();
        return 'missing';
      }
      // Offline: the current JWT may still have a few seconds left.
      return 'fresh';
    } catch {
      return 'missing';
    } finally {
      ensureFreshInFlight = null;
    }
  })();
  return ensureFreshInFlight;
}

export type BootAuthDecision =
  | { authenticated: true; accessToken: string; userId: string }
  | { authenticated: false };

export function decideBootAuthFromSession(session: SessionLike): BootAuthDecision {
  const token = session?.access_token;
  const userId = String(session?.user?.id || '').trim();
  if (hasRecoverableSession(session) && userId) {
    return { authenticated: true, accessToken: String(token), userId };
  }
  return { authenticated: false };
}

type UnrecoverableHandler = () => void;

let unrecoverableHandler: UnrecoverableHandler | null = null;
let redirectDebouncedUntil = 0;

export function registerUnrecoverableAuthHandler(handler: UnrecoverableHandler | null): void {
  unrecoverableHandler = handler;
}

/**
 * Session cannot be recovered: stop pollers, clear app state, send the user to
 * login with the expired-session banner, and sign out locally (errors ignored).
 */
export async function expireSession(): Promise<void> {
  haltAuthPolling();
  rememberReturnTo(sanitizeReturnTo(currentHashPath()));
  clearAppAuthStorage();
  try {
    unrecoverableHandler?.();
  } catch {
    /* ignore */
  }

  const now = Date.now();
  if (typeof window !== 'undefined' && now >= redirectDebouncedUntil) {
    redirectDebouncedUntil = now + 1500;
    // Do not yank users off farewell (or login/help) after intentional sign-out.
    if (!isAuthLandingHash(window.location.hash)) {
      setSessionExpiredNotice();
      window.location.hash = '#/login';
    }
  }

  await signOutLocal();
}

/**
 * After a protected API 401: refresh once (shared across parallel callers).
 * 'recovered' → caller retries once. 'cleared' → session ended.
 * 'network' → refresh could not reach Supabase; keep the session.
 */
export async function handleProtectedApiUnauthorized(opts?: {
  getSession?: () => Promise<SessionLike>;
  failedToken?: string | null;
}): Promise<'recovered' | 'cleared' | 'network'> {
  if (opts?.getSession) {
    const session = await opts.getSession();
    if (hasRecoverableSession(session)) {
      mirrorAccessToken(String(session!.access_token));
      return 'recovered';
    }
    await expireSession();
    return 'cleared';
  }

  // Already signed out / expired — never start another refresh.
  if (pollingHalted) return 'cleared';

  const outcome = await refreshSessionOnce(opts?.failedToken);
  if (outcome.ok) return 'recovered';
  if (outcome.reason === 'network') return 'network';

  // No JWT was sent: a signed-out visitor, not an expired session.
  // Parallel 401s share one refresh; only the first one expires the session.
  if (!opts?.failedToken || pollingHalted) return 'cleared';

  await expireSession();
  return 'cleared';
}

/** Preview testing note (docs only — no cross-origin sync). */
export const PREVIEW_AUTH_TESTING_RULE =
  'Use the stable Vercel branch alias for Preview auth tests. Unique deployment hostnames are separate browser origins and do not share localStorage/Supabase sessions.';
