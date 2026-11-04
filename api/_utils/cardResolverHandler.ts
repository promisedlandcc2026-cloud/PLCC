/**
 * Vault staff card resolver HTTP handler.
 * Mounted at POST /api/vault?resource=people&subResource=card-resolver
 *
 * Read-only identity resolve. No attendance / check-in / pickup side effects.
 *
 * Rate limiting: best-effort in-process sliding window keyed by actor (+ IP).
 * Vercel serverless instances do NOT share memory — this is not globally
 * authoritative. Prefer a durable store (Upstash/Redis/Vercel KV) later.
 */

import { getSupabaseAdmin, verifyAuth } from './auth.js';
import {
  buildAdultResolverDto,
  buildDependentResolverDto,
  buildNotFoundDto,
  CARD_RESOLVER_RATE_LIMITS,
  effectiveAdultCardStatus,
  evaluateRateLimit,
  hashCardToken,
  httpStatusForResolverCode,
  isCardResolverRole,
  normalizeCardStatus,
  parseCardResolverBody,
  type CardResolverErrorCode,
  type CardStatus,
  displayNameFromMemberSafe,
  displayNameFromUserSafe,
} from './cardResolverLogic.js';

async function getAudit() {
  const { getAudit: loadAudit } = await import('./deps.js');
  return loadAudit();
}

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

function fail(res: any, code: CardResolverErrorCode, error: string) {
  setNoStore(res);
  return res.status(httpStatusForResolverCode(code)).json({ ok: false, error, code });
}

function clientIp(req: any): string {
  const xf = req?.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim().slice(0, 64);
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0].trim().slice(0, 64);
  return String(req?.socket?.remoteAddress || 'unknown').slice(0, 64);
}

/**
 * Best-effort per-instance rate limiter.
 * NOT globally authoritative across serverless isolates.
 */
const rateBuckets = new Map<string, number[]>();

function bucketSnapshot(key: string, now: number): number[] {
  const windowMs = Math.max(...CARD_RESOLVER_RATE_LIMITS.map((l) => l.windowMs));
  const prev = rateBuckets.get(key) || [];
  return prev.filter((t) => t > now - windowMs);
}

function wouldAllow(key: string, now: number): boolean {
  const kept = bucketSnapshot(key, now);
  return evaluateRateLimit(kept, now, [...CARD_RESOLVER_RATE_LIMITS]).allowed;
}

function recordHit(key: string, now: number) {
  const kept = bucketSnapshot(key, now);
  kept.push(now);
  rateBuckets.set(key, kept);
  if (rateBuckets.size > 5000) {
    const oldest = rateBuckets.keys().next().value;
    if (oldest) rateBuckets.delete(oldest);
  }
}

function allowScan(actorId: string, ip: string): boolean {
  const now = Date.now();
  const actorKey = `actor:${actorId}`;
  const ipKey = `ip:${ip}`;
  // Check both before recording so a deny does not consume a slot.
  if (!wouldAllow(actorKey, now) || !wouldAllow(ipKey, now)) return false;
  recordHit(actorKey, now);
  recordHit(ipKey, now);
  return true;
}

async function safeAudit(payload: {
  userId?: string | null;
  action: string;
  details?: Record<string, unknown>;
  resourceType?: string;
  resourceId?: string;
  severity?: 'info' | 'warning' | 'critical';
  req?: any;
}) {
  try {
    const logAudit = await getAudit();
    await logAudit(payload);
  } catch (err) {
    console.error('[card-resolver] audit failed', err);
  }
}

export async function handleCardResolver(req: any, res: any) {
  setNoStore(res);

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return fail(res, 'scanner_unavailable', 'Supabase Admin not initialized.');
    }

    const auth = await verifyAuth(req, supabase);
    if (!auth.user) {
      return fail(res, 'unauthorized', 'Unauthorized: valid Bearer token required.');
    }

    if (!isCardResolverRole(auth.role)) {
      await safeAudit({
        userId: auth.user.id,
        action: 'card_resolver.scan',
        details: { resultCode: 'forbidden', role: auth.role },
        resourceType: 'card_resolver',
        severity: 'warning',
        req,
      });
      return fail(res, 'forbidden', 'Card resolver requires elevated staff role.');
    }

    const method = String(req.method || '').toUpperCase();
    if (method !== 'POST') {
      return fail(res, 'method_not_allowed', 'Method not allowed. Use POST.');
    }

    const actorId = String(auth.user.id);
    const ip = clientIp(req);
    if (!allowScan(actorId, ip)) {
      await safeAudit({
        userId: actorId,
        action: 'card_resolver.scan',
        details: { resultCode: 'scanner_rate_limited' },
        resourceType: 'card_resolver',
        severity: 'warning',
        req,
      });
      return fail(res, 'scanner_rate_limited', 'Scanner rate limit exceeded. Try again shortly.');
    }

    const parsed = parseCardResolverBody(req.body);
    if (!parsed.ok) {
      await safeAudit({
        userId: actorId,
        action: 'card_resolver.scan',
        details: { resultCode: parsed.code },
        resourceType: 'card_resolver',
        severity: 'info',
        req,
      });
      return fail(res, parsed.code, parsed.error);
    }

    const tokenHash = hashCardToken(parsed.token);
    // Raw token discarded after hash (local binding ends here).

    const [adultRes, dependentRes] = await Promise.all([
      supabase
        .from('member_digital_cards')
        .select('user_id, member_id, card_number, status')
        .eq('qr_token_hash', tokenHash)
        .maybeSingle(),
      supabase
        .from('dependent_digital_cards')
        .select('member_id, card_number, status')
        .eq('qr_token_hash', tokenHash)
        .maybeSingle(),
    ]);

    if (adultRes.error || dependentRes.error) {
      console.error('[card-resolver] lookup error', adultRes.error || dependentRes.error);
      return fail(res, 'scanner_unavailable', 'Card lookup failed.');
    }

    const adultRow = adultRes.data;
    const dependentRow = dependentRes.data;
    const adultHit = Boolean(adultRow?.card_number);
    const dependentHit = Boolean(dependentRow?.card_number);

    if (adultHit && dependentHit) {
      await safeAudit({
        userId: actorId,
        action: 'card_resolver.scan',
        details: {
          resultCode: 'resolver_conflict',
          adultCardNumber: adultRow.card_number,
          dependentCardNumber: dependentRow.card_number,
        },
        resourceType: 'card_resolver',
        severity: 'critical',
        req,
      });
      return fail(res, 'resolver_conflict', 'Card resolver conflict.');
    }

    if (!adultHit && !dependentHit) {
      await safeAudit({
        userId: actorId,
        action: 'card_resolver.scan',
        details: { resultCode: 'card_not_found' },
        resourceType: 'card_resolver',
        severity: 'info',
        req,
      });
      setNoStore(res);
      return res.status(200).json({ ok: true, result: buildNotFoundDto() });
    }

    if (adultHit) {
      const cardStatus = normalizeCardStatus(adultRow.status);
      if (!cardStatus) {
        return fail(res, 'scanner_unavailable', 'Card status unavailable.');
      }

      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('name, avatar_url, role')
        .eq('id', adultRow.user_id)
        .maybeSingle();
      if (userErr) {
        console.error('[card-resolver] user lookup', userErr);
        return fail(res, 'scanner_unavailable', 'Subject lookup failed.');
      }

      const effectiveStatus = effectiveAdultCardStatus(cardStatus, userRow?.role);
      const dto = buildAdultResolverDto({
        displayName: displayNameFromUserSafe(userRow || {}),
        avatarUrl: userRow?.avatar_url,
        cardNumber: String(adultRow.card_number),
        cardStatus,
        effectiveStatus,
      });

      await safeAudit({
        userId: actorId,
        action: 'card_resolver.scan',
        details: {
          resultCode: 'found',
          subjectType: 'adult',
          cardNumber: dto.cardNumber,
          cardStatus: dto.cardStatus,
          effectiveStatus: dto.effectiveStatus,
          valid: dto.valid,
        },
        resourceType: 'card_resolver',
        resourceId: dto.cardNumber,
        severity: 'info',
        req,
      });

      setNoStore(res);
      return res.status(200).json({ ok: true, result: dto });
    }

    // Dependent hit
    const depStatus = normalizeCardStatus(dependentRow.status) as CardStatus | null;
    if (!depStatus) {
      return fail(res, 'scanner_unavailable', 'Card status unavailable.');
    }

    const { data: memberRow, error: memberErr } = await supabase
      .from('members')
      .select('first_name, last_name')
      .eq('id', dependentRow.member_id)
      .maybeSingle();
    if (memberErr) {
      console.error('[card-resolver] member lookup', memberErr);
      return fail(res, 'scanner_unavailable', 'Subject lookup failed.');
    }

    const dto = buildDependentResolverDto({
      displayName: displayNameFromMemberSafe(memberRow || {}),
      cardNumber: String(dependentRow.card_number),
      cardStatus: depStatus,
    });

    await safeAudit({
      userId: actorId,
      action: 'card_resolver.scan',
      details: {
        resultCode: 'found',
        subjectType: 'dependent',
        cardNumber: dto.cardNumber,
        cardStatus: dto.cardStatus,
        effectiveStatus: dto.effectiveStatus,
        valid: dto.valid,
      },
      resourceType: 'card_resolver',
      resourceId: dto.cardNumber,
      severity: 'info',
      req,
    });

    setNoStore(res);
    return res.status(200).json({ ok: true, result: dto });
  } catch (err: any) {
    console.error('[card-resolver]', err?.message || err);
    return fail(res, 'scanner_unavailable', 'Card resolver unavailable.');
  }
}

/** Test hook: clear in-memory rate buckets (process-local only). */
export function __resetCardResolverRateLimitForTests() {
  rateBuckets.clear();
}
