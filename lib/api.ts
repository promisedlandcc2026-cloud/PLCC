import { supabase } from './supabase';
import {
  handleProtectedApiUnauthorized,
  isJwtAccessToken,
  mirrorAccessToken,
  shouldAttemptAuthRecovery,
} from './authSession';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Race a promise so Supabase/session calls cannot hang the UI forever. */
export async function withClientTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Request timed out'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** fetch with AbortController timeout (Safari/Chrome never spin forever). */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      // Chromium shows "signal is aborted without reason" if abort() has no arg.
      controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
    } catch {
      controller.abort();
    }
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isAbortOrTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = String((err as any).name || '');
  const msg = String((err as any).message || '');
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /abort|timed out|timeout/i.test(msg)
  );
}

/** Friendly copy when Vercel/Supabase returns plain text or HTML instead of JSON. */
export const API_BUSY_RETRY_MESSAGE =
  'Server/database busy — wait a moment and retry.';

/**
 * Parse an API Response as JSON without throwing SyntaxError on plain-text 500s
 * (e.g. "An error occurred…"). Throws Error with a clear retry message when
 * the body is not JSON.
 */
export async function parseApiJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text || !String(text).trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = String(text).trim().replace(/\s+/g, ' ').slice(0, 120);
    if (
      /an error occurred/i.test(snippet) ||
      /^<!DOCTYPE/i.test(snippet) ||
      /^<html/i.test(snippet) ||
      /internal server error/i.test(snippet)
    ) {
      throw new Error(API_BUSY_RETRY_MESSAGE);
    }
    throw new Error(snippet || API_BUSY_RETRY_MESSAGE);
  }
}

/**
 * Build auth headers from the live Supabase session (authoritative).
 * Mirrors a live access token into awc_auth_token for transitional callers.
 * Does not treat stale awc_auth_token as proof of authentication when session is gone.
 * X-User-ID is never used for server authentication.
 */
export async function getAuthHeaders(extra?: HeadersInit, userId?: string | null): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (extra) {
    const e = extra instanceof Headers ? Object.fromEntries(extra.entries()) : (extra as Record<string, string>);
    Object.assign(headers, e);
  }

  let token: string | null = null;

  // Live session only: a stale awc_auth_token must never be sent after the session is gone.
  // supabase-js auto-refreshes near expiry; a server 401 goes through vaultFetch's single refresh.
  try {
    if (supabase) {
      const { data } = await withClientTimeout(
        supabase.auth.getSession(),
        8_000,
        'Session check timed out'
      );
      if (isJwtAccessToken(data.session?.access_token)) {
        token = String(data.session!.access_token);
        mirrorAccessToken(token);
      }
    }
  } catch {
    /* no session / timed out — send without Authorization */
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const uid = userId ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('awc_user_id') : null);
  if (uid) headers['X-User-ID'] = uid;

  return headers;
}

/** Default vault API budget — under Vercel maxDuration (60s), above cold-start wakes (~40s). */
export const API_FETCH_TIMEOUT_MS = 55_000;

export type VaultFetchOptions = RequestInit & { userId?: string | null; timeoutMs?: number };

function bearerFrom(headers: HeadersInit): string | null {
  const h = headers as Record<string, string>;
  const raw = h.Authorization || h.authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : null;
}

/**
 * The one authenticated fetch for /api/vault:
 * - token read from supabase.auth.getSession() on every call,
 * - on 401, one shared refreshSession() across parallel callers, then one retry,
 * - if refresh fails, local sign-out + pollers stopped + login with expired notice.
 * Network errors reject; 403 / 5xx are returned untouched.
 */
export async function vaultFetch(path: string, options: VaultFetchOptions = {}): Promise<Response> {
  const { userId, headers: extraHeaders, timeoutMs, ...rest } = options;
  const send = (headers: HeadersInit) =>
    timeoutMs
      ? fetchWithTimeout(path, { ...rest, headers }, timeoutMs)
      : fetch(path, { ...rest, headers });

  const headers = await getAuthHeaders(extraHeaders, userId);
  const res = await send(headers);
  if (!shouldAttemptAuthRecovery(res.status)) return res;

  const outcome = await handleProtectedApiUnauthorized({ failedToken: bearerFrom(headers) });
  if (outcome !== 'recovered') return res;
  return send(await getAuthHeaders(extraHeaders, userId));
}

const VAULT_TIMEOUT_MESSAGE =
  'The Vault API timed out waiting for Supabase. Wait a moment and tap Refresh — the first request after idle can take up to a minute.';

export async function apiFetch<T = any>(
  path: string,
  options: VaultFetchOptions = {}
): Promise<T> {
  const { timeoutMs = API_FETCH_TIMEOUT_MS, ...rest } = options;

  let res: Response;
  try {
    res = await vaultFetch(path, { ...rest, timeoutMs });
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      throw new ApiError(VAULT_TIMEOUT_MESSAGE, 504, { ok: false, error: 'timeout' });
    }
    // Network failure — do not force logout
    throw err;
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const timeoutHint =
      res.status === 504
        ? 'Server timed out talking to the database. Tap Refresh and try again.'
        : null;
    throw new ApiError(
      timeoutHint || body?.error || res.statusText || 'Request failed',
      res.status,
      body
    );
  }

  return body as T;
}

/**
 * fetch() with live session headers + 401 recovery (does not logout on 403/5xx/network).
 */
export async function fetchAuthorized(
  path: string,
  options: VaultFetchOptions = {}
): Promise<Response> {
  return vaultFetch(path, options);
}
