/**
 * Phase 2.7D.7 — Household bulk check-in pure helpers (no I/O).
 */

import { createHash } from 'node:crypto';
import { CARD_TOKEN_RE } from './cardResolverLogic.js';
import { ATTENDANCE_CHECKIN_ROLES } from './attendanceCheckinLogic.js';

export const HOUSEHOLD_CHECKIN_ROLES = ATTENDANCE_CHECKIN_ROLES;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HouseholdCheckinErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'method_not_allowed'
  | 'invalid_request'
  | 'invalid_uuid'
  | 'invalid_card_format'
  | 'invalid_token_hash'
  | 'spoof_rejected'
  | 'session_not_found'
  | 'session_not_open'
  | 'session_closed'
  | 'session_type_not_allowed'
  | 'member_not_found'
  | 'card_not_found'
  | 'card_not_valid'
  | 'adult_card_required'
  | 'card_resolution_conflict'
  | 'member_link_required'
  | 'member_link_conflict'
  | 'household_not_found'
  | 'household_member_not_allowed'
  | 'actor_not_found'
  | 'rate_limited'
  | 'household_unavailable'
  | 'household_error';

export function isHouseholdCheckinRole(role: unknown): boolean {
  if (role == null) return false;
  return HOUSEHOLD_CHECKIN_ROLES.has(String(role).toUpperCase());
}

export function asUuid(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

export function isValidCardToken(token: unknown): token is string {
  return typeof token === 'string' && CARD_TOKEN_RE.test(token);
}

export function hashCardToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function parseHouseholdPreviewBody(
  body: unknown
):
  | { ok: true; sessionId: string; token: string }
  | { ok: false; code: HouseholdCheckinErrorCode; error: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_request', error: 'Request body is required.' };
  }
  const b = body as Record<string, unknown>;
  if ('memberId' in b || 'member_id' in b || 'checkedInAt' in b) {
    return { ok: false, code: 'spoof_rejected', error: 'Client must not supply server-owned fields.' };
  }
  const sessionId = asUuid(b.sessionId);
  if (!sessionId) {
    return { ok: false, code: 'invalid_uuid', error: 'sessionId must be a valid UUID.' };
  }
  if (!isValidCardToken(b.token)) {
    return { ok: false, code: 'invalid_card_format', error: 'token must be a valid AWC1 card token.' };
  }
  return { ok: true, sessionId, token: b.token as string };
}

export function parseHouseholdCheckinBody(
  body: unknown
):
  | { ok: true; sessionId: string; anchorMemberId: string; memberIds: string[] }
  | { ok: false; code: HouseholdCheckinErrorCode; error: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_request', error: 'Request body is required.' };
  }
  const b = body as Record<string, unknown>;
  if ('checkedInAt' in b || 'source' in b || 'token' in b) {
    return { ok: false, code: 'spoof_rejected', error: 'Client must not supply server-owned fields.' };
  }
  const sessionId = asUuid(b.sessionId);
  const anchorMemberId = asUuid(b.anchorMemberId);
  if (!sessionId || !anchorMemberId) {
    return {
      ok: false,
      code: 'invalid_uuid',
      error: 'sessionId and anchorMemberId must be valid UUIDs.',
    };
  }
  const rawIds = Array.isArray(b.memberIds) ? b.memberIds : null;
  if (!rawIds || rawIds.length === 0) {
    return { ok: false, code: 'invalid_request', error: 'Select at least one household member.' };
  }
  if (rawIds.length > 40) {
    return { ok: false, code: 'invalid_request', error: 'Too many members selected.' };
  }
  const memberIds: string[] = [];
  for (const id of rawIds) {
    const u = asUuid(id);
    if (!u) {
      return { ok: false, code: 'invalid_uuid', error: 'Each memberId must be a valid UUID.' };
    }
    if (!memberIds.includes(u)) memberIds.push(u);
  }
  return { ok: true, sessionId, anchorMemberId, memberIds };
}

export function mapHouseholdRpcError(msg: string): HouseholdCheckinErrorCode | null {
  const m = String(msg || '');
  const codes: HouseholdCheckinErrorCode[] = [
    'invalid_request',
    'invalid_token_hash',
    'session_not_found',
    'session_not_open',
    'session_closed',
    'session_type_not_allowed',
    'member_not_found',
    'card_not_found',
    'card_not_valid',
    'adult_card_required',
    'card_resolution_conflict',
    'member_link_required',
    'member_link_conflict',
    'household_not_found',
    'household_member_not_allowed',
    'actor_not_found',
  ];
  for (const c of codes) {
    if (m.includes(c)) return c;
  }
  return null;
}

export function httpStatusForHouseholdCode(code: HouseholdCheckinErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'method_not_allowed':
      return 405;
    case 'rate_limited':
      return 429;
    case 'session_not_found':
    case 'member_not_found':
    case 'card_not_found':
    case 'household_not_found':
      return 404;
    case 'session_not_open':
    case 'session_closed':
    case 'session_type_not_allowed':
    case 'adult_card_required':
    case 'card_not_valid':
    case 'card_resolution_conflict':
    case 'member_link_required':
    case 'member_link_conflict':
    case 'household_member_not_allowed':
      return 409;
    case 'household_unavailable':
      return 503;
    default:
      return 400;
  }
}

export function humanMessageForHouseholdCode(code: HouseholdCheckinErrorCode): string {
  switch (code) {
    case 'session_type_not_allowed':
      return 'Household check-in is not available for kids sessions.';
    case 'adult_card_required':
      return 'Household check-in needs an adult membership card.';
    case 'household_not_found':
      return 'No structured household found for this member.';
    case 'household_member_not_allowed':
      return 'One or more selected people are not in that household.';
    case 'member_link_required':
      return 'This card is not linked to a verified member record.';
    case 'rate_limited':
      return 'Too many attempts. Wait a moment and try again.';
    default:
      return 'Household check-in request failed.';
  }
}

export type HouseholdPreviewMember = {
  memberId: string;
  displayName: string;
  relationshipType: string | null;
  alreadyCheckedIn: boolean;
  isAnchor: boolean;
};

export type HouseholdPreviewDto = {
  anchorMemberId: string;
  sessionId: string;
  householdId: string | null;
  members: HouseholdPreviewMember[];
};

export function sanitizeHouseholdPreview(raw: unknown): HouseholdPreviewDto | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const anchorMemberId = asUuid(r.anchorMemberId);
  const sessionId = asUuid(r.sessionId);
  if (!anchorMemberId || !sessionId) return null;
  const householdId = r.householdId == null ? null : asUuid(r.householdId);
  const membersRaw = Array.isArray(r.members) ? r.members : [];
  const members: HouseholdPreviewMember[] = [];
  for (const m of membersRaw) {
    if (!m || typeof m !== 'object') continue;
    const row = m as Record<string, unknown>;
    const memberId = asUuid(row.memberId);
    if (!memberId) continue;
    members.push({
      memberId,
      displayName: String(row.displayName || 'PLCC Member').slice(0, 120),
      relationshipType: row.relationshipType == null ? null : String(row.relationshipType).slice(0, 40),
      alreadyCheckedIn: Boolean(row.alreadyCheckedIn),
      isAnchor: Boolean(row.isAnchor),
    });
  }
  return { anchorMemberId, sessionId, householdId, members };
}
