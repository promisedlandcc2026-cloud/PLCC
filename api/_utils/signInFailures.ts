/**
 * Sign-in problems log (Phase 4 — Nov 2026, #17): who is failing to get in, and why.
 *
 * Written by:
 *   - the phone sign-in endpoint (wrong password, no account, bad number, too many tries…)
 *   - PLCC apps (Ka Link) for what the server can't see (email codes, unreachable
 *     server, signed in but not approved / no member profile)
 * Read by: Canaan → More → Sign-in Problems (Pastor / Admin / Super Admin).
 *
 * Never stores passwords or codes. Phone numbers and emails are stored masked,
 * plus a hash so repeat attempts from the same person group together.
 */
// Namespace import: this file can end up in the browser bundle graph (via authPhone),
// where a named node:crypto import breaks the build. It only runs on the server.
import * as nodeCrypto from 'node:crypto';
import { getSupabaseAdmin, verifyAuth } from './auth.js';
import { toE164Intl } from './ugPhone.js';

export type SignInFailureReason =
  | 'invalid_phone'
  | 'short_password'
  | 'rate_limited'
  | 'no_account'
  | 'wrong_password'
  | 'account_exists'
  | 'signup_failed'
  | 'server_error'
  | 'server_unreachable'
  | 'email_code_not_sent'
  | 'email_code_wrong'
  | 'member_pending'
  | 'member_not_found'
  | 'member_check_failed';

/** What apps may report themselves (the rest come from the server). */
export const CLIENT_REPORTABLE_REASONS = new Set<SignInFailureReason>([
  'invalid_phone',
  'server_unreachable',
  'email_code_not_sent',
  'email_code_wrong',
  'member_pending',
  'member_not_found',
  'member_check_failed',
]);

export const SIGN_IN_FAILURE_LABELS: Record<SignInFailureReason, { label: string; fix: string }> = {
  invalid_phone: { label: 'Number typed wrong', fix: 'Ask them to pick their country and type the number like 0772 123456.' },
  short_password: { label: 'Password too short', fix: 'Passwords need at least 6 characters.' },
  rate_limited: { label: 'Too many tries', fix: 'They are locked out for 15 minutes. Then try again carefully.' },
  no_account: { label: 'No account for this number', fix: 'They need to tap “Create an account”, or their number is saved differently on their profile.' },
  wrong_password: { label: 'Wrong password', fix: 'Reset their password in Staff & Roles, or they can use “Text me a code”.' },
  account_exists: { label: 'Tried to join, already has an account', fix: 'Tell them to sign in instead of creating an account.' },
  signup_failed: { label: 'Could not create account', fix: 'Check the detail below; contact the developer if it repeats.' },
  server_error: { label: 'Server error', fix: 'Contact the developer if it repeats.' },
  server_unreachable: { label: 'Could not reach the church server', fix: 'Usually weak internet. Ask them to try again on better data or Wi-Fi.' },
  email_code_not_sent: { label: 'Email code not sent', fix: 'Check the email address; suggest signing in with their mobile number.' },
  email_code_wrong: { label: 'Wrong or expired email code', fix: 'Codes expire quickly. Ask them to request a new one, or use their mobile number.' },
  member_pending: { label: 'Waiting for approval', fix: 'Approve them in People so they can use Ka Link.' },
  member_not_found: { label: 'No member profile', fix: 'Their sign-in is not linked to a member. Use Canaan Repair to link it.' },
  member_check_failed: { label: 'Member check failed', fix: 'The server could not confirm their membership. Usually temporary.' },
};

export function isSignInFailureReason(v: unknown): v is SignInFailureReason {
  return typeof v === 'string' && v in SIGN_IN_FAILURE_LABELS;
}

/** +256772557842 → +256 772 ***842 ; jane.doe@gmail.com → ja***@gmail.com */
export function maskIdentifier(raw: string): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  // Phone-only accounts use digits@phone.awcvault.invalid as their internal email.
  const placeholder = v.match(/^(\d{8,15})@phone\.awcvault\.invalid$/i);
  if (placeholder) return maskIdentifier(`+${placeholder[1]}`);
  if (v.includes('@')) {
    const [user, domain] = v.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  const digits = v.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  const cc = digits.startsWith('256') ? '256' : digits.length > 10 ? digits.slice(0, digits.length - 9) : '';
  const rest = digits.slice(cc.length);
  return `${cc ? `+${cc} ` : ''}${rest.slice(0, 3)} ***${rest.slice(-3)}`;
}

/** Same person → same hash, whichever way the number was typed. */
export function identifierHash(raw: string): string {
  let v = String(raw || '').trim().toLowerCase();
  const placeholder = v.match(/^(\d{8,15})@phone\.awcvault\.invalid$/);
  if (placeholder) v = `+${placeholder[1]}`;
  if (!v.includes('@')) v = toE164Intl(v) || v.replace(/\D/g, '');
  return nodeCrypto.createHash('sha256').update(`plcc-signin:${v}`).digest('hex').slice(0, 32);
}

function clean(v: unknown, max: number): string | null {
  const s = String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** Best-effort insert. Never throws — logging must not block a sign-in. */
export async function recordSignInFailure(opts: {
  app?: string | null;
  method: 'phone' | 'email' | 'code' | 'session';
  identifier: string;
  reason: SignInFailureReason;
  detail?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  source: 'server' | 'app';
}): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    await admin.from('sign_in_failures').insert({
      app: clean(opts.app, 40) || 'canaan',
      method: opts.method,
      identifier_masked: maskIdentifier(opts.identifier) || null,
      identifier_hash: opts.identifier ? identifierHash(opts.identifier) : null,
      user_id: opts.userId || null,
      reason: opts.reason,
      detail: clean(opts.detail, 200),
      user_agent: clean(opts.userAgent, 160),
      source: opts.source,
    });
  } catch {
    /* table missing or DB busy — skip */
  }
}

/** Find the account (if any) for a phone/email so the log can show a name. */
async function lookupUserId(admin: any, identifier: string): Promise<string | null> {
  const v = String(identifier || '').trim();
  if (!v) return null;
  try {
    if (v.includes('@')) {
      const { data } = await admin.from('users').select('id').eq('email', v.toLowerCase()).limit(1);
      return (data && data[0]?.id) || null;
    }
    const e164 = toE164Intl(v);
    if (!e164) return null;
    const { data } = await admin.from('users').select('id').eq('phone', e164).limit(1);
    return (data && data[0]?.id) || null;
  } catch {
    return null;
  }
}

/* Simple per-IP limit for app reports (the endpoint is public). */
const reportHits = new Map<string, { count: number; resetAt: number }>();
function reportLimited(req: any): boolean {
  const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const row = reportHits.get(ip);
  if (!row || now > row.resetAt) {
    reportHits.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  row.count += 1;
  return row.count > 60;
}

const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'ADMIN']);

export type SignInProblemGroup = {
  key: string;
  name: string | null;
  identifier: string | null;
  app: string;
  method: string;
  reasons: Array<{ reason: SignInFailureReason; label: string; fix: string; count: number }>;
  attempts: number;
  lastAt: string;
  lastDetail: string | null;
  lastDevice: string | null;
};

/** Pure grouping for the Canaan page (unit tested). */
export function groupSignInFailures(
  rows: Array<{
    created_at: string;
    app: string | null;
    method: string;
    identifier_masked: string | null;
    identifier_hash: string | null;
    user_id: string | null;
    reason: string;
    detail: string | null;
    user_agent: string | null;
  }>,
  names: Map<string, string>
): SignInProblemGroup[] {
  const groups = new Map<string, SignInProblemGroup & { counts: Map<string, number> }>();
  for (const r of rows) {
    if (!isSignInFailureReason(r.reason)) continue;
    const key = r.user_id || r.identifier_hash || `${r.method}:${r.identifier_masked || 'unknown'}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: (r.user_id && names.get(r.user_id)) || null,
        identifier: r.identifier_masked,
        app: r.app || 'canaan',
        method: r.method,
        reasons: [],
        attempts: 0,
        lastAt: r.created_at,
        lastDetail: r.detail,
        lastDevice: r.user_agent,
        counts: new Map(),
      };
      groups.set(key, g);
    }
    g.attempts += 1;
    g.counts.set(r.reason, (g.counts.get(r.reason) || 0) + 1);
    if (r.created_at > g.lastAt) {
      g.lastAt = r.created_at;
      g.lastDetail = r.detail;
      g.lastDevice = r.user_agent;
      g.method = r.method;
      if (r.identifier_masked) g.identifier = r.identifier_masked;
    }
    if (!g.name && r.user_id && names.get(r.user_id)) g.name = names.get(r.user_id) || null;
  }
  return Array.from(groups.values())
    .map(({ counts, ...g }) => ({
      ...g,
      reasons: Array.from(counts.entries())
        .map(([reason, count]) => ({ reason: reason as SignInFailureReason, ...SIGN_IN_FAILURE_LABELS[reason as SignInFailureReason], count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

/**
 * POST { action: 'report', … }  — public, from PLCC apps (validated, rate limited)
 * GET  ?days=7                  — Pastor / Admin / Super Admin: grouped problems
 */
export async function handleSignInFailures(req: any, res: any) {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ ok: false, error: 'Not configured' });

  if (req.method === 'POST') {
    const b = req.body || {};
    if (String(b.action || '') !== 'report') return res.status(400).json({ ok: false, error: 'Unknown action' });
    if (reportLimited(req)) return res.status(429).json({ ok: false });
    const reason = String(b.reason || '');
    const method = ['phone', 'email', 'session'].includes(String(b.method)) ? (String(b.method) as 'phone' | 'email' | 'session') : null;
    if (!isSignInFailureReason(reason) || !CLIENT_REPORTABLE_REASONS.has(reason) || !method) {
      return res.status(400).json({ ok: false, error: 'Invalid report' });
    }
    const identifier = String(b.identifier || '').slice(0, 120);
    await recordSignInFailure({
      app: clean(b.app, 40),
      method,
      identifier,
      reason,
      detail: clean(b.detail, 200),
      userAgent: clean(b.userAgent, 160),
      userId: await lookupUserId(admin, identifier),
      source: 'app',
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const { user, role } = await verifyAuth(req, admin);
    if (!user) return res.status(401).json({ ok: false, error: 'Please sign in.' });
    if (!MANAGER_ROLES.has(String(role || '').toUpperCase())) {
      return res.status(403).json({ ok: false, error: 'Only the Pastor, Admins and Super Admins can see sign-in problems.' });
    }
    const days = Math.min(Math.max(Number(req.query?.days) || 7, 1), 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from('sign_in_failures')
      .select('created_at, app, method, identifier_masked, identifier_hash, user_id, reason, detail, user_agent')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) {
      const missing = /sign_in_failures|42P01|does not exist/i.test(String(error.message || error.code));
      return res.status(missing ? 503 : 500).json({
        ok: false,
        setupNeeded: missing,
        error: missing
          ? 'Run supabase/migrations/sign_in_failures.sql in the Supabase SQL editor first.'
          : 'Could not load sign-in problems.',
      });
    }
    const rows = (data || []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: users } = await admin.from('users').select('id, name').in('id', ids.slice(0, 500));
      for (const u of (users || []) as any[]) names.set(String(u.id), String(u.name || 'Member'));
    }
    const groups = groupSignInFailures(rows, names);
    const byReason: Record<string, number> = {};
    for (const r of rows) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
    return res.status(200).json({ ok: true, days, total: rows.length, people: groups.length, byReason, groups: groups.slice(0, 300) });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
