/**
 * resource=shepherd-notify   POST { token }   (no member session: the token is the proof)
 *
 * Shepherd Assist (the church's help center) sends short phone notices through PLCC ONE:
 *   kind 'resolved' → "Your problem is fixed" to the members who reported it (their PLCC ONE user ids)
 *   kind 'urgent'   → an alert to this church's Super Admins (many members affected, or an app is down)
 * The token is signed with SHEPHERD_SSO_SECRET (the same secret as the Shepherd sign-on pass), lives
 * 2 minutes and is used once. Delivery uses the normal inbox + phone alerts (notifyUser).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from './auth.js';
import { notifyUser } from './notify.js';

const AUD = 'plcc-one';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const seen = new Map<string, number>();

export type ShepherdNotice = { kind: 'resolved' | 'urgent'; users: string[]; title: string; body: string };

/** Verify a Shepherd Assist notice. Returns null when it is not valid, expired or already used. */
export function verifyShepherdNotice(token: unknown, rawSecret: string | undefined, now = Math.floor(Date.now() / 1000)): ShepherdNotice | null {
  const secret = String(rawSecret || '').trim();
  if (secret.length < 32 || typeof token !== 'string' || token.length > 20000) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const given = Buffer.from(parts[1], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let p: any;
  try { p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
  if (!p || p.v !== 1 || p.iss !== 'shepherd-assist' || p.aud !== AUD) return null;
  if (p.kind !== 'resolved' && p.kind !== 'urgent') return null;
  if (!Number.isInteger(p.iat) || !Number.isInteger(p.exp) || p.exp - p.iat > 300 || p.iat > now + 30 || now >= p.exp) return null;
  if (typeof p.jti !== 'string' || !UUID_RE.test(p.jti)) return null;
  const title = typeof p.title === 'string' ? p.title.trim().slice(0, 80) : '';
  const body = typeof p.body === 'string' ? p.body.trim().slice(0, 300) : '';
  if (!title) return null;
  const users = p.kind === 'resolved' && Array.isArray(p.users)
    ? [...new Set(p.users.filter((id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id)))].slice(0, 200) as string[]
    : [];
  // Single use (per server instance), remembered until it would have expired anyway.
  for (const [id, exp] of seen) if (exp <= now) seen.delete(id);
  if (seen.has(p.jti)) return null;
  seen.set(p.jti, p.exp);
  return { kind: p.kind, users, title, body };
}

export async function handleShepherdNotify(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const notice = verifyShepherdNotice(req.body?.token, process.env.SHEPHERD_SSO_SECRET);
  if (!notice) return res.status(401).json({ ok: false });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false });

  let userIds = notice.users;
  if (notice.kind === 'urgent') {
    const { data } = await supabase.from('users').select('id').eq('role', 'SUPER_ADMIN').limit(20);
    userIds = (data || []).map((u: any) => String(u.id)).filter((id: string) => UUID_RE.test(id));
  }
  for (const userId of userIds) {
    await notifyUser(supabase, userId, { type: 'announcement', title: notice.title, body: notice.body, link: '/notifications' });
  }
  console.log(`[shepherd-notify] ${notice.kind} sent=${userIds.length}`);
  return res.status(200).json({ ok: true, sent: userIds.length });
}
