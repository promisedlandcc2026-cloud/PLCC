/**
 * PLCC ONE — one sign-on handoff.
 * resource=sso   POST { target: 'connect' | 'chat' | 'shepherd' }   (Bearer token required)
 *
 * target 'shepherd' returns a signed single-use pass for Shepherd Assist (its own Supabase
 * project); see shepherdPass.ts. Phone-only members are included; pending accounts are not.
 *
 * The PLCC ONE launcher (inside the Vault) asks for a single-use sign-in token for
 * another PLCC app on the same Supabase tenant. We mint a fresh magic-link token
 * with the admin API (no email is sent) and return only its hash. The target app
 * calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) and gets its
 * own independent session — the Vault's refresh token is never shared, so the two
 * apps can refresh on their own without signing each other out.
 *
 * Phone-only accounts (no email on the auth user) get { ok: false, code: 'no_email' };
 * the launcher then opens the app normally and the member signs in there.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { signShepherdPass } from './shepherdPass.js';

const TARGETS = new Set(['connect', 'chat', 'shepherd']);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const recent = new Map<string, number[]>();

function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return String(v ?? '').trim();
}

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const list = (recent.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  recent.set(userId, list);
  return list.length > MAX_PER_WINDOW;
}

export async function handleSsoHandoff(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, code: 'method', error: 'Use POST' });
  }
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: 'not_configured', error: 'Sign-on is not configured.' });
  }
  const auth = await requireAuth(req, res, supabaseAdmin);
  if (!auth) return;

  const target = first(req.body?.target || req.query?.target).toLowerCase();
  if (!TARGETS.has(target)) {
    return res.status(400).json({ ok: false, code: 'bad_target', error: 'Unknown PLCC app.' });
  }
  const userId = String(auth.user?.id || '');
  if (!userId) return res.status(401).json({ ok: false, code: 'unauthorized', error: 'Please sign in again.' });
  if (rateLimited(userId)) {
    return res.status(429).json({ ok: false, code: 'rate_limited', error: 'Too many app switches. Try again in a few minutes.' });
  }

  // Use the auth user's own email (never one from the request body or the users table).
  const { data: authUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = String(authUser?.user?.email || '').trim().toLowerCase();

  if (target === 'shepherd') {
    const secret = (process.env.SHEPHERD_SSO_SECRET || '').trim();
    if (secret.length < 32) {
      return res.status(200).json({ ok: false, code: 'not_configured', error: 'Shepherd Assist sign-on is not configured.' });
    }
    if (userErr || !auth.role || auth.role === 'PENDING') {
      return res.status(200).json({ ok: false, code: 'not_approved', error: 'Your PLCC account is waiting for approval.' });
    }
    const pass = signShepherdPass(secret, { id: userId, email, name: auth.user?.name });
    console.log(`[sso] shepherd pass user=${userId}`);
    return res.status(200).json({ ok: true, pass });
  }
  if (userErr || !email) {
    return res.status(200).json({ ok: false, code: 'no_email', error: 'This account signs in by phone.' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = String((data as any)?.properties?.hashed_token || '');
  if (error || !tokenHash) {
    console.error('[sso] generateLink failed', error?.message || 'no token');
    return res.status(200).json({ ok: false, code: 'unavailable', error: 'Could not open the app signed in.' });
  }

  console.log(`[sso] handoff user=${userId} target=${target}`);
  return res.status(200).json({ ok: true, tokenHash, type: 'magiclink' });
}
