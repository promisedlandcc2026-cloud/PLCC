/**
 * Sign in or sign up with a texted code — POST /api/vault?resource=auth-phone-code
 * Used by the Vault login page and (through its /api/auth-phone bridge) PLCC Connect.
 *
 * Actions
 *   request  { phone, purpose: 'signin' | 'signup' }
 *     signin: texts a code only when an account owns this number; same answer either way.
 *     signup: texts a code when no account uses this number yet (409 if one does).
 *   verify   { phone, code, purpose, first_name?, last_name?, email? }
 *     Twilio approves the code → signs in to the account that owns the number, or
 *     (signup) creates a Pending account like phone sign-up does → Supabase session.
 *
 *   link-request { phone }        — SIGNED IN: text a code to turn on text sign-in
 *   link-verify  { phone, code }  — SIGNED IN: code approved → this number signs in to
 *                                   this account from now on (users.verified_phone)
 *   link-status / unlink          — SIGNED IN: which number is on, or turn it off
 *
 * Members who joined with email/password have no proven number, so "Text me a code"
 * can't find them until they turn it on once while signed in (link-*).
 *
 * Which account a number "owns" (members can edit the phone on their profile, so
 * that field is never trusted for code sign-in):
 *   1. users.verified_phone — set only after a code to that number was approved;
 *   2. an account that signed up with this phone (internal @phone.awcvault.invalid email).
 *
 * Cost guard: Ugandan (+256 7…) and US mobiles only, per-number hourly limit and a church-wide daily
 * cap (table auth_sms_sends). If that table is missing, codes are refused rather
 * than sent unmetered.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from './auth.js';
import { ensureMemberForUser } from './ensureMemberForUser.js';
import { getBcrypt } from './deps.js';
import { phoneEmailFor, phoneLookupValues, samePhone } from './authPhone.js';
import { checkVerifyCode, normalizeUsPhone, phoneCodesEnabled, sendVerifyCode } from './twilioVerify.js';

const UNIFORM_SIGNIN = {
  ok: true,
  message:
    'If an account uses this number for text sign-in, a 6-digit code is on its way. ' +
    'No text in a minute? Sign in with your email once, then turn on "Sign in by text" ' +
    '(PLCC Connect: Account · Canaan: your profile).',
};
const BAD_CODE = 'That code did not work. Check it, or request a new code.';
const HOUR = 60 * 60 * 1000;

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export function phoneHash(e164: string): string {
  return createHash('sha256').update(`awc-sms:${e164}`).digest('hex');
}

type Account = { id: string };

export type PhoneCodeDeps = {
  admin: any;
  sendCode: (e164: string) => Promise<void>;
  checkCode: (e164: string, code: unknown) => Promise<boolean>;
  /** Login email from Supabase Auth itself (never the editable users.email). */
  authEmail: (userId: string) => Promise<string | null>;
  mintSession: (email: string) => Promise<Record<string, unknown>>;
  now: () => number;
  /** The signed-in account making this request, or null (only used by link-* actions). */
  currentUserId: (req: any) => Promise<string | null>;
};

/**
 * The account that owns this number for code sign-in, or null. Both paths are
 * re-checked against Supabase Auth (users.email is editable by members).
 */
export async function findAccountForPhone(
  admin: any,
  e164: string,
  authEmail: (userId: string) => Promise<string | null>
): Promise<Account | null> {
  const verified = await admin.from('users').select('id').eq('verified_phone', e164).limit(1);
  if (verified.error) {
    console.warn('[phone-code] verified_phone lookup failed:', verified.error.message);
  } else if (verified.data?.[0]?.id && (await authEmail(verified.data[0].id))) {
    return { id: verified.data[0].id };
  }
  // Phone sign-up: Auth login email is this number's internal address.
  const placeholder = phoneEmailFor(e164);
  const own = await admin.from('users').select('id').eq('email', placeholder).limit(1);
  const id = !own.error ? own.data?.[0]?.id : null;
  if (id && (await authEmail(id)) === placeholder) return { id };
  return null;
}

async function authEmailFor(userId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  return String(data?.user?.email || '').toLowerCase() || null;
}

/** Any account already using this number (verified or not) — blocks duplicate sign-ups. */
async function numberInUse(admin: any, e164: string, authEmail: PhoneCodeDeps['authEmail']): Promise<boolean> {
  if (await findAccountForPhone(admin, e164, authEmail)) return true;
  const { data } = await admin.from('users').select('id, phone').in('phone', phoneLookupValues(e164));
  return (data || []).some((u: any) => samePhone(u.phone, e164));
}

/** Records one text; false when this number or the whole church is over its limit. */
export async function allowSend(admin: any, e164: string, now: number): Promise<'ok' | 'limited' | 'unavailable'> {
  const hash = phoneHash(e164);
  const perPhone = intEnv('AUTH_SMS_PHONE_PER_HOUR', 3);
  const perDay = intEnv('AUTH_SMS_DAILY_CAP', 40);
  const hourAgo = new Date(now - HOUR).toISOString();
  const dayAgo = new Date(now - 24 * HOUR).toISOString();
  const [phoneCount, dayCount] = await Promise.all([
    admin.from('auth_sms_sends').select('id', { count: 'exact', head: true }).eq('phone_hash', hash).gte('created_at', hourAgo),
    admin.from('auth_sms_sends').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
  ]);
  if (phoneCount.error || dayCount.error) {
    console.error('[phone-code] auth_sms_sends unavailable — run supabase/migrations/auth_sms_codes.sql');
    return 'unavailable';
  }
  if ((phoneCount.count ?? 0) >= perPhone) return 'limited';
  if ((dayCount.count ?? 0) >= perDay) {
    console.warn('[phone-code] daily text cap reached (AUTH_SMS_DAILY_CAP)');
    return 'limited';
  }
  const ins = await admin.from('auth_sms_sends').insert({ phone_hash: hash, created_at: new Date(now).toISOString() });
  if (ins.error) return 'unavailable';
  return 'ok';
}

/** Supabase session for an existing account without its password (magic-link token, never emailed). */
async function mintSessionForEmail(email: string): Promise<Record<string, unknown>> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = (data as any)?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(error?.message || 'Could not start a session');
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  ).trim();
  const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) throw new Error('Could not start a session');
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || '',
    user: json.user || null,
    expires_in: json.expires_in,
  };
}

function defaultDeps(): PhoneCodeDeps {
  return {
    admin: getSupabaseAdmin(),
    sendCode: sendVerifyCode,
    checkCode: checkVerifyCode,
    authEmail: authEmailFor,
    mintSession: mintSessionForEmail,
    now: () => Date.now(),
    currentUserId: async (req: any) => {
      const { verifyAuth } = await import('./auth.js');
      const auth = await verifyAuth(req, getSupabaseAdmin());
      return auth.user?.id || null;
    },
  };
}

/** Last 4 digits only, for showing which number is on. */
function maskPhone(e164: string): string {
  return `(•••) •••-${e164.slice(-4)}`;
}

/**
 * Signed-in members turning text sign-in on (or off) for their own account.
 * Returns null when the action isn't a link action.
 */
async function handleLinkAction(req: any, res: any, deps: PhoneCodeDeps, action: string) {
  if (!['link-request', 'link-verify', 'link-status', 'unlink'].includes(action)) return null;
  const userId = await deps.currentUserId(req);
  if (!userId) return res.status(401).json({ error: 'Please sign in first.' });
  const { admin } = deps;
  const body = req.body || {};

  if (action === 'link-status' || action === 'unlink') {
    const { data, error } = await admin.from('users').select('id, verified_phone').eq('id', userId).limit(1);
    if (error) return res.status(503).json({ error: 'Text sign-in is not available right now.' });
    const current = data?.[0]?.verified_phone ? String(data[0].verified_phone) : null;
    if (action === 'unlink' && current) {
      const off = await admin.from('users').update({ verified_phone: null }).eq('id', userId);
      if (off?.error) return res.status(500).json({ error: 'Could not turn off text sign-in.' });
      return res.status(200).json({ ok: true, enabled: false, phone: null });
    }
    return res.status(200).json({ ok: true, enabled: Boolean(current), phone: current ? maskPhone(current) : null });
  }

  const e164 = normalizeUsPhone(body.phone);
  if (!e164) return res.status(400).json({ error: 'Enter a valid mobile number, e.g. 0772 123456.' });
  const owner = await findAccountForPhone(admin, e164, deps.authEmail);
  if (owner && owner.id !== userId) {
    return res.status(409).json({
      error: 'That number already signs in to another account. Each account needs its own mobile number.',
    });
  }

  if (action === 'link-request') {
    const allowed = await allowSend(admin, e164, deps.now());
    if (allowed === 'unavailable') return res.status(503).json({ error: 'Text sign-in is not available right now.' });
    if (allowed === 'limited') return res.status(429).json({ error: 'Too many codes requested. Wait an hour, then try again.' });
    await deps.sendCode(e164);
    return res.status(200).json({ ok: true, message: 'Code sent. Check your texts.' });
  }

  // link-verify
  if (!(await deps.checkCode(e164, body.code))) return res.status(401).json({ error: BAD_CODE });
  const saved = await admin.from('users').update({ verified_phone: e164 }).eq('id', userId);
  if (saved?.error) {
    const dup = /duplicate|unique/i.test(String(saved.error.message || ''));
    return res.status(dup ? 409 : 500).json({
      error: dup
        ? 'That number already signs in to another account. Each account needs its own mobile number.'
        : 'Could not turn on text sign-in. Please try again.',
    });
  }
  return res.status(200).json({
    ok: true,
    enabled: true,
    phone: maskPhone(e164),
    message: 'Text sign-in is on. Next time, tap "Text me a code" and use this number.',
  });
}

function cleanName(raw: unknown): string {
  return String(raw ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

async function createPhoneAccount(
  admin: any,
  e164: string,
  firstName: string,
  lastName: string,
  emailInput: string
): Promise<Account> {
  const email = emailInput && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput) ? emailInput : phoneEmailFor(e164);
  // No password is ever shown or needed; the member signs in by text (or sets one later).
  const password = randomBytes(24).toString('base64url');
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, phone: e164, role: 'PENDING' },
  });
  if (error || !created?.user) {
    const msg = error?.message || 'Could not create your account.';
    if (/already|registered|exists/i.test(msg)) {
      const err: any = new Error('An account already uses that email. Sign in instead.');
      err.status = 409;
      throw err;
    }
    throw new Error(msg);
  }
  const bcrypt = await getBcrypt();
  const stub: Record<string, unknown> = {
    id: created.user.id,
    email,
    name: `${firstName} ${lastName}`.trim(),
    role: 'PENDING',
    phone: e164,
    verified_phone: e164,
    password_hash: bcrypt ? await bcrypt.hash(password, 10) : 'TEMP_HASH',
    is_temporary_password: false,
  };
  const inserted = await admin.from('users').insert(stub);
  if (inserted.error) {
    // Older schema without verified_phone: the placeholder email still ties the number to the account.
    const { verified_phone: _v, ...rest } = stub;
    await admin.from('users').insert(rest);
  }
  await ensureMemberForUser(admin, stub as any).catch(() => null);
  return { id: created.user.id };
}

export async function handleAuthPhoneCode(req: any, res: any, deps: PhoneCodeDeps = defaultDeps()) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!phoneCodesEnabled() || !deps.admin) {
    return res.status(503).json({ error: 'Text sign-in is not available right now. Use your email or password.' });
  }

  const body = req.body || {};
  const action = String(body.action || '').toLowerCase();
  try {
    const linked = await handleLinkAction(req, res, deps, action);
    if (linked !== null) return linked;
  } catch (err: any) {
    console.error('[phone-code] link', err?.message || err);
    return res.status(500).json({ error: 'Something went wrong with text sign-in. Please try again.' });
  }
  const purpose = String(body.purpose || 'signin').toLowerCase() === 'signup' ? 'signup' : 'signin';
  const e164 = normalizeUsPhone(body.phone);
  if (!e164) return res.status(400).json({ error: 'Enter a valid mobile number, e.g. 0772 123456.' });
  const { admin } = deps;

  try {
    if (action === 'request') {
      if (purpose === 'signup') {
        if (await numberInUse(admin, e164, deps.authEmail)) {
          return res.status(409).json({ error: 'An account already uses that phone number. Sign in instead.' });
        }
      } else if (!(await findAccountForPhone(admin, e164, deps.authEmail))) {
        // Unknown number: nothing is texted (no cost), and the answer looks the same.
        return res.status(200).json(UNIFORM_SIGNIN);
      }
      const allowed = await allowSend(admin, e164, deps.now());
      if (allowed === 'unavailable') {
        return res.status(503).json({ error: 'Text sign-in is not available right now. Use your email or password.' });
      }
      if (allowed === 'limited') {
        if (purpose === 'signin') return res.status(200).json(UNIFORM_SIGNIN);
        return res.status(429).json({ error: 'Too many codes requested. Wait an hour, then try again.' });
      }
      await deps.sendCode(e164);
      return res.status(200).json(purpose === 'signin' ? UNIFORM_SIGNIN : { ok: true, message: 'Code sent. Check your texts.' });
    }

    if (action === 'verify') {
      if (!(await deps.checkCode(e164, body.code))) return res.status(401).json({ error: BAD_CODE });

      let account = await findAccountForPhone(admin, e164, deps.authEmail);
      if (!account && purpose === 'signup') {
        if (await numberInUse(admin, e164, deps.authEmail)) {
          return res.status(409).json({ error: 'An account already uses that phone number. Sign in with your password or email instead.' });
        }
        const firstName = cleanName(body.first_name);
        const lastName = cleanName(body.last_name);
        if (!firstName || !lastName) return res.status(400).json({ error: 'Enter your first and last name.' });
        account = await createPhoneAccount(admin, e164, firstName, lastName, String(body.email || '').trim().toLowerCase());
      }
      if (!account) return res.status(401).json({ error: BAD_CODE });

      // The number is now proven for this account.
      await admin.from('users').update({ verified_phone: e164 }).eq('id', account.id).then(
        (r: any) => r?.error && console.warn('[phone-code] verified_phone not saved:', r.error.message),
        () => null
      );
      const loginEmail = await deps.authEmail(account.id);
      if (!loginEmail) return res.status(401).json({ error: BAD_CODE });
      const session = await deps.mintSession(loginEmail);
      return res.status(200).json({ ok: true, ...session });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err: any) {
    console.error('[phone-code]', err?.message || err);
    return res.status(err?.status === 409 ? 409 : 500).json({
      error: err?.status === 409 ? err.message : 'Something went wrong with text sign-in. Please try again.',
    });
  }
}
