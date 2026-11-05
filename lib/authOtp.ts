import { supabase as supabaseAuth } from './supabase';

/**
 * URL embedded in auth emails — must be listed under Authentication → URL Configuration → Redirect URLs.
 * Defaults to origin + trailing slash (no hash): numeric OTP is verified in-app; a plain URL avoids rare
 * mailer issues with encoded `#` in redirect_to. Set VITE_AUTH_REDIRECT_URL (e.g. https://app/#/login) if
 * magic-link clicks must open the login route.
 */
function getOtpEmailRedirectUrl(): string | undefined {
  const explicit = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  if (explicit) return explicit;
  if (typeof window === 'undefined') return undefined;
  const { origin, pathname } = window.location;
  const basePath = pathname.replace(/\/+$/, '');
  const base = basePath && basePath !== '/' ? `${origin}${basePath}` : origin;
  return base.endsWith('/') ? base : `${base}/`;
}

/** Strip zero-width / BOM / NBSP that Safari & password managers sometimes inject. */
export function sanitizeAuthIdentifier(raw: string): string {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();
}

/**
 * Normalize + validate email before calling Supabase.
 * Catches WebKit autofill typos like `user@+2@gmail.com` (meant `user+2@gmail.com`).
 */
export function normalizeAuthEmail(raw: string): string {
  const cleaned = sanitizeAuthIdentifier(raw).toLowerCase();
  if (!cleaned) throw new Error('Enter a valid email address.');

  // Common autofill / typo: local@+tag@domain → local+tag@domain
  const doubleAtPlus = cleaned.match(/^([^@]+)@\+([^@]+)@(.+)$/);
  if (doubleAtPlus) {
    return `${doubleAtPlus[1]}+${doubleAtPlus[2]}@${doubleAtPlus[3]}`;
  }

  const atCount = (cleaned.match(/@/g) || []).length;
  if (atCount !== 1) {
    throw new Error(
      'That email looks mistyped (check for an extra @). Gmail aliases use a plus: name+tag@gmail.com'
    );
  }

  // Basic shape: local@domain.tld (allows + and . in local part)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new Error('Enter a valid email address (example: name@email.com).');
  }

  return cleaned;
}

const AUTH_REQUEST_TIMEOUT_MS = 28_000;

export async function withAuthTimeout<T>(
  promise: Promise<T>,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
  timeoutMessage =
    'Sign-in timed out. On Safari or DuckDuckGo, turn off tracker blocking for this site (or allow supabase.co), then try again — or use Chrome.'
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

function toAuthRequestError(error: { message: string; status?: number; code?: string }): Error {
  const raw = error.message || 'Request failed';
  const code = error.code || '';
  if (error.status === 500 || /error sending|internal server error/i.test(raw)) {
    // Keep admin SMTP detail in the console; show members a plain message.
    console.error('[auth email send]', raw, code, error.status || '');
    return new Error(
      'We could not send your sign-in code right now. Please try again in a few minutes, or use Sign in with passkey.'
    );
  }
  if (/rate.?limit|over_email_send_rate_limit|email_send_rate_limit/i.test(raw + code)) {
    return new Error('Too many sign-in codes requested. Wait a minute, then try again.');
  }
  if (/validation_failed|invalid format|unable to validate email/i.test(raw + code)) {
    return new Error(
      'That email address is not valid. Check for typos — Gmail aliases use a plus (name+2@gmail.com), not an extra @.'
    );
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return new Error(
      'Could not reach the sign-in service. On Safari or DuckDuckGo, allow network / disable tracker blocking for this site, then retry.'
    );
  }
  return new Error(raw + (code ? ` [${code}]` : ''));
}

async function proxyAuthOtp(body: Record<string, unknown>): Promise<any> {
  let res: Response;
  try {
    res = await withAuthTimeout(
      fetch('/api/vault?resource=auth-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (/failed to fetch|networkerror|load failed|ECONNREFUSED|timed out/i.test(msg)) {
      const isLocal = typeof window !== 'undefined' && /localhost|127\.0\.0\.1/i.test(window.location.hostname);
      throw new Error(
        isLocal
          ? 'Local API is not running. In a second terminal run: npm run dev:api  (or use npm run dev:all)'
          : 'Sending your code is taking longer than usual. Check your email (and spam) in a minute; if nothing arrives, tap Send code again.'
      );
    }
    throw err;
  }
  let json: any = null;
  let rawText = '';
  try {
    rawText = await res.text();
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const proxyDown =
      res.status === 500 ||
      res.status === 502 ||
      res.status === 503 ||
      /ECONNREFUSED|proxy error|socket hang up|not configured/i.test(
        `${json?.error || ''} ${rawText}`
      );
    if (proxyDown && !json?.code && typeof window !== 'undefined' && /localhost|127\.0\.0\.1/i.test(window.location.hostname)) {
      throw new Error(
        'Local API is not running. In a second terminal run: npm run dev:api  (or use npm run dev:all)'
      );
    }
    throw toAuthRequestError({
      message: json?.error || `Request failed (${res.status})`,
      status: res.status,
      code: json?.code || '',
    });
  }
  return json;
}

async function applySessionFromTokens(opts: {
  access_token: string;
  refresh_token?: string;
  user?: any;
}): Promise<any> {
  const access_token = opts.access_token;
  const refresh_token = opts.refresh_token || '';
  if (!access_token) {
    throw new Error('That code is invalid or expired. Request a new code and try again.');
  }

  // Prefer setSession so supabase-js storage stays in sync (may briefly hit network).
  if (supabaseAuth && refresh_token) {
    try {
      const { data, error } = await withAuthTimeout(
        supabaseAuth.auth.setSession({ access_token, refresh_token }),
        10_000,
        'Session save timed out'
      );
      if (!error && data?.session) return data.session;
    } catch (e) {
      console.warn('[auth] setSession fallback', e);
    }
  }

  // WebKit / tracker-blocked path: persist token for our app and return a session-shaped object.
  try {
    localStorage.setItem('awc_auth_token', access_token);
  } catch {
    /* ignore */
  }
  return {
    access_token,
    refresh_token,
    user: opts.user || null,
  };
}

// ─── Email OTP ───────────────────────────────────────────────────────────────

/** Send a 6-digit OTP to the user's email (same-origin proxy → GoTrue). */
export async function sendEmailOtp(email: string): Promise<void> {
  const cleanEmail = normalizeAuthEmail(email);
  // Prefer same-origin proxy (Safari / DuckDuckGo often block *.supabase.co).
  try {
    await proxyAuthOtp({ action: 'send', email: cleanEmail });
    return;
  } catch (proxyErr: any) {
    // Fall back to direct client only when proxy is unavailable (local / misconfig).
    if (!supabaseAuth) throw proxyErr;
    const status = proxyErr?.message || '';
    if (!/not configured|404|503|Auth proxy/i.test(status) && !/failed to fetch/i.test(status)) {
      throw proxyErr;
    }
    console.warn('[auth] OTP proxy unavailable, trying direct client', proxyErr);
  }

  const { error } = await withAuthTimeout(
    supabaseAuth.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
      },
    })
  );
  if (error) throw toAuthRequestError(error);
}

/** Verify the emailed 6-digit code. Returns the full session. */
export async function verifyEmailOtp(email: string, token: string) {
  const cleanEmail = normalizeAuthEmail(email);
  const cleanToken = String(token || '').replace(/\D/g, '').trim();
  if (cleanToken.length !== 6) {
    throw new Error('Enter the 6-digit code from your email.');
  }

  try {
    const json = await proxyAuthOtp({
      action: 'verify',
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });
    return await applySessionFromTokens({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      user: json.user,
    });
  } catch (proxyErr: any) {
    if (!supabaseAuth) throw proxyErr;
    const status = proxyErr?.message || '';
    // Only fall back for proxy infra errors — keep real OTP errors.
    if (!/not configured|404|503|Auth proxy|timed out|failed to fetch/i.test(status)) {
      throw proxyErr;
    }
    console.warn('[auth] OTP verify proxy unavailable, trying direct client', proxyErr);
  }

  const redirectTo = getOtpEmailRedirectUrl();
  const verifyOpts = redirectTo ? { options: { redirectTo } } : {};

  const first = await withAuthTimeout(
    supabaseAuth.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
      ...verifyOpts,
    })
  );

  if (first.error) {
    const msg = (first.error.message || '').toLowerCase();
    const code = (first.error as { code?: string }).code || '';
    const typeMismatch =
      /token|otp|type|invalid|expired|magic/i.test(msg) ||
      /otp_expired|invalid_credentials|token_not_found/i.test(code);
    if (typeMismatch) {
      const second = await withAuthTimeout(
        supabaseAuth.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: 'magiclink',
          ...verifyOpts,
        })
      );
      if (!second.error && second.data?.session) return second.data.session;
      if (second.error) throw toAuthRequestError(second.error);
    } else {
      throw toAuthRequestError(first.error);
    }
  }

  if (!first.data?.session) {
    throw new Error('That code is invalid or expired. Request a new code and try again.');
  }
  return first.data.session;
}

// ─── Phone OTP ───────────────────────────────────────────────────────────────

/** Send a 6-digit OTP via SMS (requires Phone provider in Supabase dashboard). */
/**
 * Text sign-in codes go through the Vault server (Twilio Verify), not Supabase's
 * phone provider: these accounts keep their number on the member record, and the
 * server only lets a code open an account whose number is proven.
 */
async function phoneCodeRequest(body: Record<string, unknown>): Promise<any> {
  let res: Response;
  try {
    res = await fetch('/api/vault?resource=auth-phone-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the Vault. Check your connection and try again.');
  }
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (json && typeof json.error === 'string' && json.error) || 'Text sign-in failed. Please try again.'
    );
  }
  return json || {};
}

/** Text a 6-digit code. Sign-in: sent only if an account owns the number (same answer either way). */
export async function sendPhoneOtp(phone: string, purpose: 'signin' | 'signup' = 'signin'): Promise<void> {
  await phoneCodeRequest({ action: 'request', purpose, phone });
}

/** Verify the texted code; signs in (or, with `signup`, creates the account). Returns the session. */
export async function verifyPhoneOtp(
  phone: string,
  token: string,
  signup?: { firstName: string; lastName: string; email?: string }
) {
  if (!supabaseAuth) throw new Error('Supabase client not initialized');
  const cleanToken = String(token || '').replace(/\D/g, '').trim();
  if (cleanToken.length !== 6) {
    throw new Error('Enter the 6-digit code from your text message.');
  }
  const json = await phoneCodeRequest({
    action: 'verify',
    purpose: signup ? 'signup' : 'signin',
    phone,
    code: cleanToken,
    ...(signup
      ? { first_name: signup.firstName, last_name: signup.lastName, email: signup.email || '' }
      : {}),
  });
  if (!json.access_token) {
    throw new Error('That code is invalid or expired. Request a new code and try again.');
  }
  const { data, error } = await withAuthTimeout(
    supabaseAuth.auth.setSession({ access_token: json.access_token, refresh_token: json.refresh_token || '' })
  );
  if (error) throw toAuthRequestError(error);
  if (!data?.session) {
    throw new Error('Could not start your session. Please try again.');
  }
  return data.session;
}

// ─── Password Auth ──────────────────────────────────────────────────────────

/** Create a new user with email, password, and metadata. */
export async function signUpWithPassword(email: string, pass: string, metadata: any) {
  if (!supabaseAuth) throw new Error('Supabase client not initialized');
  const { data, error } = await supabaseAuth.auth.signUp({
    email: normalizeAuthEmail(email),
    password: pass,
    options: {
      data: metadata,
    },
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Sign in with existing email and password. */
export async function signInWithPassword(email: string, pass: string) {
  if (!supabaseAuth) throw new Error('Supabase client not initialized');
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: normalizeAuthEmail(email),
    password: pass,
  });
  if (error) throw toAuthRequestError(error);
  return data.session;
}

async function proxyAuthPhone(body: Record<string, unknown>): Promise<any> {
  const res = await withAuthTimeout(
    fetch('/api/vault?resource=auth-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw toAuthRequestError({
      message: json?.error || `Request failed (${res.status})`,
      status: res.status,
      code: json?.code || '',
    });
  }
  return json;
}

/** Sign in with phone + password (no SMS). */
export async function signInWithPhonePassword(phone: string, password: string) {
  const json = await proxyAuthPhone({
    action: 'signin',
    phone: normalisePhone(phone),
    password,
  });
  return applySessionFromTokens({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    user: json.user,
  });
}

/** Create an account with phone + password. Email is optional. */
export async function signUpWithPhone(opts: {
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  email?: string;
}) {
  const json = await proxyAuthPhone({
    action: 'signup',
    phone: normalisePhone(opts.phone),
    password: opts.password,
    first_name: opts.firstName,
    last_name: opts.lastName,
    email: opts.email || '',
  });
  return applySessionFromTokens({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    user: json.user,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Loosely check if a string looks like a phone number (starts with + or digit). */
export function isPhoneNumber(value: string): boolean {
  const v = sanitizeAuthIdentifier(value);
  return /^[+\d]/.test(v) && v.replace(/\D/g, '').length >= 7;
}

/** Normalise phone to E.164. US 10-digit numbers become +1… */
export function normalisePhone(value: string): string {
  const trimmed = sanitizeAuthIdentifier(value);
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (trimmed.startsWith('+') && digits.length >= 10) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return trimmed.startsWith('+') ? `+${digits}` : `+1${digits}`;
}
