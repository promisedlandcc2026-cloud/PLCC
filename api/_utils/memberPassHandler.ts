/**
 * Membership pass for the profile QR and desk backup codes.
 * GET  /api/vault?resource=people&subResource=member-pass&memberId=
 * POST /api/vault?resource=people&subResource=member-pass&action=resolve
 * Returns the AWC1 token and access code. Never phone, email, or the token hash.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { isAttendanceCheckinRole } from './attendanceCheckinLogic.js';
import { CARD_TOKEN_RE } from './cardResolverLogic.js';
import { canViewPeopleRoster } from './peopleRosterLogic.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_RE = /^\d{4,8}$/;

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
}

function newCardToken() {
  const token = `AWC1.${randomBytes(32).toString('hex')}`;
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  return { token, tokenHash, tokenPrefix: token.slice(0, 12) };
}

async function linkedMemberForUser(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_member_links')
    .select('member_id')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .maybeSingle();
  return data?.member_id ? String(data.member_id) : null;
}

async function linkedUserForMember(supabase: any, memberId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_member_links')
    .select('user_id')
    .eq('member_id', memberId)
    .eq('status', 'verified')
    .maybeSingle();
  return data?.user_id ? String(data.user_id) : null;
}

async function ensureCard(supabase: any, userId: string, memberId: string | null): Promise<string> {
  const { data: existing } = await supabase
    .from('member_digital_cards')
    .select('qr_token, status, member_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing?.qr_token && existing.status !== 'revoked') {
    if (memberId && !existing.member_id) {
      await supabase.from('member_digital_cards').update({ member_id: memberId }).eq('user_id', userId);
    }
    return String(existing.qr_token);
  }

  const minted = newCardToken();
  const year = new Date().getUTCFullYear();
  const suffix = String(10_000 + Math.floor(Math.random() * 90_000));
  const cardNumber = `PLCC-${year}-${suffix}`;
  const { error } = await supabase.from('member_digital_cards').insert({
    user_id: userId,
    member_id: memberId,
    card_number: cardNumber,
    status: 'active',
    qr_token: minted.token,
    qr_token_hash: minted.tokenHash,
    qr_token_prefix: minted.tokenPrefix,
  });
  if (error) {
    const { data: again } = await supabase
      .from('member_digital_cards')
      .select('qr_token, status')
      .eq('user_id', userId)
      .maybeSingle();
    if (again?.qr_token && again.status !== 'revoked') return String(again.qr_token);
    throw error;
  }
  return minted.token;
}

async function accessCodeFor(supabase: any, memberId: string): Promise<string> {
  const { data } = await supabase.from('members').select('access_code').eq('id', memberId).maybeSingle();
  const stored = String(data?.access_code || '').trim();
  if (ACCESS_RE.test(stored)) return stored;
  const code = String(10_000_000 + Math.floor(Math.random() * 90_000_000));
  await supabase.from('members').update({ access_code: code }).eq('id', memberId);
  return code;
}

async function tokenForMember(supabase: any, memberId: string): Promise<string | null> {
  const userId = await linkedUserForMember(supabase, memberId);
  if (!userId) return null;
  return ensureCard(supabase, userId, memberId);
}

async function resolveToToken(supabase: any, raw: string): Promise<string | null> {
  const code = raw.trim();
  if (CARD_TOKEN_RE.test(code)) return code;
  if (UUID_RE.test(code)) return tokenForMember(supabase, code);
  if (!ACCESS_RE.test(code)) return null;
  const { data } = await supabase.from('members').select('id').eq('access_code', code).maybeSingle();
  if (!data?.id) return null;
  return tokenForMember(supabase, String(data.id));
}

export async function handleMemberPass(req: any, res: any) {
  setNoStore(res);
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });

  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;

  if (req.method === 'POST') {
    if (!isAttendanceCheckinRole(auth.role)) {
      return res.status(403).json({ ok: false, error: 'Desk check-in requires an authorized role.' });
    }
    const raw = String(req.body?.code || req.body?.token || '').trim();
    try {
      const token = await resolveToToken(supabase, raw);
      if (!token) {
        return res.status(404).json({ ok: false, error: 'No membership pass matches that code.' });
      }
      return res.status(200).json({ ok: true, token });
    } catch (err: any) {
      console.error('[member-pass] resolve:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Could not look up that pass.' });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requested = String(req.query?.memberId || '').trim();
  const ownMember = await linkedMemberForUser(supabase, auth.user.id);
  const memberId = requested || ownMember || '';
  if (!memberId) {
    return res.status(404).json({ ok: false, error: 'No church record is linked to this login.' });
  }
  const isOwn = Boolean(ownMember && memberId === ownMember);
  if (!isOwn && !canViewPeopleRoster(auth.role)) {
    return res.status(403).json({ ok: false, error: 'Only staff can open another member pass.' });
  }

  const userId = isOwn ? String(auth.user.id) : await linkedUserForMember(supabase, memberId);
  if (!userId) {
    return res.status(404).json({
      ok: false,
      error: 'This member does not have a linked login for a scannable pass yet.',
    });
  }

  try {
    const qrPayload = await ensureCard(supabase, userId, memberId);
    const accessCode = await accessCodeFor(supabase, memberId);
    return res.status(200).json({ ok: true, memberId, qrPayload, accessCode });
  } catch (err: any) {
    console.error('[member-pass] load:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Could not load this membership pass.' });
  }
}
