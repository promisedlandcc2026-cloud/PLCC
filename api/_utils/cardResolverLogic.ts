/**
 * Vault staff card resolver — pure helpers (no I/O).
 * Phase 2.6E.1: read-only identity resolve from AWC1 token.
 * Card scan ≠ check-in ≠ child pickup authorization.
 */

import { createHash } from 'node:crypto';

export const CARD_RESOLVER_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
]);

export const CARD_RESOLVER_DENIED_ROLES = new Set([
  'FINANCE',
  'MINISTRY_LEADER',
  'WORSHIP_TEAM',
  'MEMBER',
  'PENDING',
  'YOUTH',
]);

/** Matches public.member_digital_card_is_approved_role (adult effective status). */
export const ADULT_APPROVED_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'MINISTRY_LEADER',
  'FINANCE',
  'MEDIA_TEAM',
  'ADMIN_STAFF',
  'STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
  'WORSHIP_TEAM',
  'SUNDAY_SCHOOL_TEACHER',
  'VOLUNTEER',
  'GUEST',
  'MEMBER',
  'PARENT',
  'TEACHER',
  'YOUTH',
  'ADMIN',
  'USER',
]);

export const CARD_TOKEN_RE = /^AWC1\.[0-9a-f]{64}$/;

export const CARD_STATUSES = new Set(['active', 'inactive', 'revoked'] as const);

export type CardStatus = 'active' | 'inactive' | 'revoked';
export type SubjectType = 'adult' | 'dependent';

export type CardResolverErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'method_not_allowed'
  | 'invalid_card_format'
  | 'card_not_found'
  | 'resolver_conflict'
  | 'scanner_rate_limited'
  | 'scanner_unavailable'
  | 'invalid_request';

export const FORBIDDEN_CLIENT_CONTROL_KEYS = new Set([
  'userId',
  'user_id',
  'memberId',
  'member_id',
  'role',
  'subjectType',
  'status',
  'valid',
  'cardNumber',
  'card_number',
  'hash',
  'qr_token',
  'qrToken',
  'qr_token_hash',
  'qrTokenHash',
  'token_hash',
  'tokenHash',
  'card_ref',
  'cardRef',
  'can_check_in',
  'can_check_out',
  'canCheckIn',
  'canCheckOut',
]);

export type AdultResolverDto = {
  found: true;
  subjectType: 'adult';
  displayName: string;
  avatarUrl: string | null;
  cardNumber: string;
  cardStatus: CardStatus;
  effectiveStatus: CardStatus;
  valid: boolean;
  label: 'PLCC Member';
  notice: 'Membership identification only.';
};

export type DependentResolverDto = {
  found: true;
  subjectType: 'dependent';
  displayName: string;
  avatarUrl: null;
  cardNumber: string;
  cardStatus: CardStatus;
  effectiveStatus: CardStatus;
  valid: boolean;
  label: 'PLCC Child Member';
  notice: 'Membership identification only. Not child pickup/check-out authorization.';
};

export type NotFoundResolverDto = {
  found: false;
  code: 'card_not_found';
};

export type ResolverResultDto = AdultResolverDto | DependentResolverDto | NotFoundResolverDto;

export function isCardResolverRole(role: unknown): boolean {
  if (role == null) return false;
  return CARD_RESOLVER_ROLES.has(String(role).toUpperCase());
}

export function isValidCardToken(token: unknown): token is string {
  return typeof token === 'string' && CARD_TOKEN_RE.test(token);
}

export function hashCardToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function normalizeCardStatus(value: unknown): CardStatus | null {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  if (s === 'active' || s === 'inactive' || s === 'revoked') return s;
  return null;
}

export function isAdultApprovedRole(role: unknown): boolean {
  if (role == null) return false;
  return ADULT_APPROVED_ROLES.has(String(role).toUpperCase().trim());
}

/** Mirrors public.member_digital_card_effective_status(stored, role). */
export function effectiveAdultCardStatus(
  stored: unknown,
  userRole: unknown
): CardStatus {
  const cardStatus = normalizeCardStatus(stored) || 'inactive';
  if (cardStatus === 'revoked') return 'revoked';
  if (!isAdultApprovedRole(userRole)) return 'inactive';
  if (cardStatus === 'inactive') return 'inactive';
  return 'active';
}

export function effectiveDependentCardStatus(stored: unknown): CardStatus {
  return normalizeCardStatus(stored) || 'inactive';
}

export function adultValid(effectiveStatus: CardStatus): boolean {
  return effectiveStatus === 'active';
}

export function dependentValid(cardStatus: CardStatus): boolean {
  return cardStatus === 'active';
}

export function displayNameFromUserSafe(row: { name?: unknown }): string {
  const name = String(row?.name || '').trim();
  return name || 'PLCC Member';
}

export function displayNameFromMemberSafe(row: {
  first_name?: unknown;
  last_name?: unknown;
}): string {
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || 'PLCC Child Member';
}

export function sanitizeAvatarUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const t = url.trim();
  if (!t || t.length > 2048) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return t;
  } catch {
    return null;
  }
}

export function parseCardResolverBody(body: unknown):
  | { ok: true; token: string }
  | { ok: false; code: 'invalid_request' | 'invalid_card_format'; error: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_request', error: 'Request body must be a JSON object.' };
  }
  const obj = body as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_CLIENT_CONTROL_KEYS.has(key)) {
      return {
        ok: false,
        code: 'invalid_request',
        error: 'Client control fields are not allowed.',
      };
    }
  }
  if (!('token' in obj)) {
    return { ok: false, code: 'invalid_card_format', error: 'token is required.' };
  }
  if (typeof obj.token !== 'string') {
    return { ok: false, code: 'invalid_card_format', error: 'token must be a string.' };
  }
  // Exact contract: no trim — whitespace fails format.
  if (!isValidCardToken(obj.token)) {
    return { ok: false, code: 'invalid_card_format', error: 'Invalid card token format.' };
  }
  return { ok: true, token: obj.token };
}

export type MatchSide = 'adult' | 'dependent' | null;

export function resolveCollision(
  adultHit: boolean,
  dependentHit: boolean
): 'none' | 'adult' | 'dependent' | 'conflict' {
  if (adultHit && dependentHit) return 'conflict';
  if (adultHit) return 'adult';
  if (dependentHit) return 'dependent';
  return 'none';
}

export function buildAdultResolverDto(input: {
  displayName: string;
  avatarUrl: unknown;
  cardNumber: string;
  cardStatus: CardStatus;
  effectiveStatus: CardStatus;
}): AdultResolverDto {
  return {
    found: true,
    subjectType: 'adult',
    displayName: input.displayName,
    avatarUrl: sanitizeAvatarUrl(input.avatarUrl),
    cardNumber: input.cardNumber,
    cardStatus: input.cardStatus,
    effectiveStatus: input.effectiveStatus,
    valid: adultValid(input.effectiveStatus),
    label: 'PLCC Member',
    notice: 'Membership identification only.',
  };
}

export function buildDependentResolverDto(input: {
  displayName: string;
  cardNumber: string;
  cardStatus: CardStatus;
}): DependentResolverDto {
  const effectiveStatus = effectiveDependentCardStatus(input.cardStatus);
  return {
    found: true,
    subjectType: 'dependent',
    displayName: input.displayName,
    avatarUrl: null,
    cardNumber: input.cardNumber,
    cardStatus: input.cardStatus,
    effectiveStatus,
    valid: dependentValid(input.cardStatus),
    label: 'PLCC Child Member',
    notice:
      'Membership identification only. Not child pickup/check-out authorization.',
  };
}

export function buildNotFoundDto(): NotFoundResolverDto {
  return { found: false, code: 'card_not_found' };
}

export function httpStatusForResolverCode(code: CardResolverErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'invalid_card_format':
    case 'invalid_request':
      return 400;
    case 'method_not_allowed':
      return 405;
    case 'resolver_conflict':
      return 409;
    case 'scanner_rate_limited':
      return 429;
    case 'scanner_unavailable':
      return 502;
    case 'card_not_found':
      return 200;
    default:
      return 500;
  }
}

/**
 * Sliding-window rate limit decision (pure).
 * Callers supply timestamps for the window; this only decides allow/deny.
 */
export function evaluateRateLimit(
  timestampsMs: number[],
  nowMs: number,
  limits: { windowMs: number; max: number }[]
): { allowed: boolean; reason?: 'burst' | 'sustained' } {
  for (const limit of limits) {
    const cutoff = nowMs - limit.windowMs;
    const count = timestampsMs.filter((t) => t > cutoff).length;
    if (count >= limit.max) {
      return {
        allowed: false,
        reason: limit.windowMs <= 10_000 ? 'burst' : 'sustained',
      };
    }
  }
  return { allowed: true };
}

/** Default scanner policy: 10 / 10s burst, 60 / 60s sustained. */
export const CARD_RESOLVER_RATE_LIMITS = [
  { windowMs: 10_000, max: 10 },
  { windowMs: 60_000, max: 60 },
] as const;

export function stripSensitiveResolverDto(dto: ResolverResultDto): ResolverResultDto {
  // Structural guarantee: builders never include token/hash/UUIDs/PII extras.
  return dto;
}
