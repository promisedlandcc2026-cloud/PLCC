import { getSupabaseAdmin } from './auth.js';
import { ensureMemberForUser } from './ensureMemberForUser.js';
import { getBcrypt } from './deps.js';

import { formatPhoneForDisplay, isUgandanE164, toE164Intl } from './ugPhone.js';
/** Reserved IETF TLD — never receives mail. Internal Auth email for phone-only accounts. */
export const PHONE_EMAIL_DOMAIN = 'phone.awcvault.invalid';
const GENERIC_LOGIN_ERROR = 'That phone number or password is incorrect.';
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8;

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: any, phone: string): string {
  const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  return `${ip}:${phone}`;
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || now > row.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  row.count += 1;
  return row.count > RATE_MAX;
}

export function toE164Phone(raw: string): string {
  // Ugandan numbers first (0772 557842 → +256772557842); US numbers still work.
  const e164 = toE164Intl(raw);
  if (!e164) throw new Error('Enter a valid mobile number, e.g. 0772 123456.');
  return e164;
}

export function phoneEmailFor(e164: string): string {
  return `${e164.replace(/\D/g, '')}@${PHONE_EMAIL_DOMAIN}`;
}

export function isPhonePlaceholderEmail(email: string | null | undefined): boolean {
  const e = String(email || '').trim().toLowerCase();
  return e.endsWith(`@${PHONE_EMAIL_DOMAIN}`);
}

export function formatPhoneDigitsForDisplay(raw: string): string {
  const s = String(raw || '').trim();
  const d = s.replace(/\D/g, '');
  // Bare digits from a placeholder email already include the country code.
  if (/^\d+$/.test(s) && d.length >= 11) return formatPhoneForDisplay(`+${d}`);
  return formatPhoneForDisplay(s);
}

/**
 * Human-facing contact for lists. Phone-only Auth emails stay in the database
 * so login still works; UI must never show the `.invalid` placeholder.
 */
export function formatAccountContact(
  email: string | null | undefined,
  phone?: string | null
): string {
  const e = String(email || '').trim();
  if (isPhonePlaceholderEmail(e)) {
    const digits = e.split('@')[0] || '';
    const fromEmail = formatPhoneDigitsForDisplay(digits);
    const fromPhone = formatPhoneDigitsForDisplay(String(phone || ''));
    return fromPhone || fromEmail;
  }
  if (e) return e;
  const p = String(phone || '').trim();
  return p ? formatPhoneDigitsForDisplay(p) : '';
}

export function phoneLookupValues(e164: string): string[] {
  const digits = e164.replace(/\D/g, '');
  if (isUgandanE164(e164)) {
    const n = digits.slice(3); // 772557842
    return [
      ...new Set([
        e164,
        digits,
        `0${n}`,
        n,
        `+256 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`,
        `0${n.slice(0, 3)} ${n.slice(3)}`,
        `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`,
      ]),
    ];
  }
  const last10 = digits.slice(-10);
  const unique = new Set<string>([
    e164,
    `+${digits}`,
    last10,
    `1${last10}`,
    `+1${last10}`,
    `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`,
    `${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`,
    `${last10.slice(0, 3)}${last10.slice(3, 6)}${last10.slice(6)}`,
  ]);
  return [...unique].filter(Boolean);
}

export function samePhone(stored: string | null | undefined, e164: string): boolean {
  if (!stored) return false;
  try {
    return toE164Phone(stored) === e164;
  } catch {
    return false;
  }
}

async function goTruePasswordGrant(email: string, password: string) {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
  ).trim();
  if (!supabaseUrl || !anonKey) {
    throw new Error('Auth service is not configured');
  }

  const upstream = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const json = await upstream.json().catch(() => null);
  if (!upstream.ok || !json?.access_token) {
    const code = String(json?.error_code || json?.code || '');
    if (/invalid_grant|invalid_credentials/i.test(code + String(json?.error || ''))) {
      throw new Error(GENERIC_LOGIN_ERROR);
    }
    throw new Error(json?.error_description || json?.msg || json?.error || GENERIC_LOGIN_ERROR);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || '',
    user: json.user || null,
    expires_in: json.expires_in,
  };
}

/**
 * Every Auth email that could own this phone, most likely first.
 * A number can sit on more than one member record (e.g. a test or second
 * account), so sign-in tries each candidate instead of trusting row order.
 */
async function findEmailsForPhone(e164: string): Promise<string[]> {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return [];
  const keys = phoneLookupValues(e164);
  const out: string[] = [];
  const add = (e: unknown) => {
    const v = String(e || '').trim().toLowerCase();
    if (v && v.includes('@') && !out.includes(v)) out.push(v);
  };

  const { data: members, error } = await supabaseAdmin
    .from('members')
    .select('email, phone, created_at')
    .in('phone', keys)
    .order('created_at', { ascending: true });
  if (error) console.warn('[auth-phone] member lookup failed:', error.message);
  for (const m of members || []) {
    if (samePhone((m as any).phone, e164)) add((m as any).email);
  }

  // Login accounts carrying this number (incl. phone-only accounts whose internal
  // address was made from an older format of the number).
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('email, phone')
    .in('phone', keys);
  for (const u of users || []) {
    if (samePhone((u as any).phone, e164)) add((u as any).email);
  }

  // Phone-only accounts (signed up without an email) use the internal address.
  add(phoneEmailFor(e164));
  return out.slice(0, 5);
}

export const handleAuthPhone = async (req: any, res: any) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return res.status(503).json({ error: 'Auth service is not configured' });

  const body = req.body || {};
  const action = String(body.action || '').toLowerCase();
  const password = String(body.password || '');
  let e164 = '';
  try {
    e164 = toE164Phone(body.phone || '');
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Enter a valid mobile number.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const limitKey = clientKey(req, e164);
  if (rateLimited(limitKey)) {
    return res.status(429).json({ error: 'Too many tries. Wait a few minutes, then try again.' });
  }

  try {
    if (action === 'signin') {
      const emails = await findEmailsForPhone(e164);
      if (!emails.length) return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      let lastErr: any = null;
      for (const email of emails) {
        try {
          const session = await goTruePasswordGrant(email, password);
          return res.status(200).json({ ok: true, ...session });
        } catch (err: any) {
          lastErr = err;
          // Wrong password for this candidate — try the next account on this number.
          if (err?.message !== GENERIC_LOGIN_ERROR) break;
        }
      }
      throw lastErr || new Error(GENERIC_LOGIN_ERROR);
    }

    if (action === 'signup') {
      const firstName = String(body.first_name || '').trim();
      const lastName = String(body.last_name || '').trim();
      if (!firstName || !lastName) {
        return res.status(400).json({ error: 'Enter your first and last name.' });
      }

      const providedEmail = String(body.email || '').trim().toLowerCase();
      const email = providedEmail && providedEmail.includes('@') ? providedEmail : phoneEmailFor(e164);
      const fullName = `${firstName} ${lastName}`.trim();

      const { data: existingPhone } = await supabaseAdmin
        .from('users')
        .select('id, phone')
        .in('phone', phoneLookupValues(e164));
      if ((existingPhone || []).some((u: any) => samePhone(u.phone, e164))) {
        return res.status(409).json({ error: 'An account already uses that phone number. Sign in instead.' });
      }

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          phone: e164,
          role: 'PENDING',
        },
      });
      if (createError || !created?.user) {
        const msg = createError?.message || 'Could not create your account.';
        if (/already|registered|exists/i.test(msg)) {
          return res.status(409).json({ error: 'An account already uses that email or phone. Sign in instead.' });
        }
        return res.status(400).json({ error: msg });
      }

      const bcrypt = await getBcrypt();
      const password_hash = bcrypt ? await bcrypt.hash(password, 10) : 'TEMP_HASH';
      const stub = {
        id: created.user.id,
        email,
        name: fullName,
        role: 'PENDING',
        phone: e164,
        password_hash,
        is_temporary_password: false,
      };
      const inserted = await supabaseAdmin.from('users').insert(stub).select('id').maybeSingle();
      if (inserted.error?.message?.includes('phone')) {
        const { phone: _p, ...withoutPhone } = stub;
        await supabaseAdmin.from('users').insert(withoutPhone);
      }
      await ensureMemberForUser(supabaseAdmin, stub).catch(() => null);

      const session = await goTruePasswordGrant(email, password);
      return res.status(200).json({ ok: true, ...session });
    }

    return res.status(400).json({ error: 'Unknown auth action' });
  } catch (err: any) {
    console.error('[auth-phone]', err);
    return res.status(401).json({ error: err?.message || GENERIC_LOGIN_ERROR });
  }
};
