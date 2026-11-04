/**
 * Vault staff card scanner — pure UI helpers (no I/O).
 * Card scan ≠ check-in ≠ child pickup authorization.
 */

export const CARD_SCANNER_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
] as const;

export const CARD_SCANNER_DENIED_ROLES = [
  'FINANCE',
  'MINISTRY_LEADER',
  'WORSHIP_TEAM',
  'MEMBER',
  'PENDING',
  'YOUTH',
] as const;

export const CARD_TOKEN_RE = /^AWC1\.[0-9a-f]{64}$/;

export const SCANNER_ROUTE = '/people/card-scanner';

export const RESULT_AUTO_CLEAR_MS = 45_000;

export type CardScannerSubjectType = 'adult' | 'dependent';

export type CardScannerResultDto = {
  found: true;
  subjectType: CardScannerSubjectType;
  displayName: string;
  avatarUrl: string | null;
  cardNumber: string;
  cardStatus: string;
  effectiveStatus: string;
  valid: boolean;
  label: string;
  notice: string;
};

export type CardScannerNotFoundDto = {
  found: false;
  code: 'card_not_found';
};

export type CardScannerApiSuccess = {
  ok: true;
  result: CardScannerResultDto | CardScannerNotFoundDto;
};

export type CardScannerApiError = {
  ok: false;
  code?: string;
  error?: string;
};

export type ScannerUiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'malformed' }
  | { kind: 'result'; result: CardScannerResultDto }
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export function isValidCardToken(token: unknown): token is string {
  return typeof token === 'string' && CARD_TOKEN_RE.test(token);
}

export function normalizeScannedText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Exact contract: do not trim for validation — but camera may include noise;
  // only strip BOM/newlines that scanners sometimes append, not spaces inside token.
  return raw.replace(/^\uFEFF/, '').replace(/[\r\n]+/g, '');
}

export function precheckScannedToken(raw: unknown):
  | { ok: true; token: string }
  | { ok: false; reason: 'malformed' } {
  const text = normalizeScannedText(raw);
  if (!isValidCardToken(text)) return { ok: false, reason: 'malformed' };
  return { ok: true, token: text };
}

export function initialsFromDisplayName(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'AW';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export function statusLabel(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'inactive') return 'Inactive';
  if (s === 'revoked') return 'Revoked';
  return status || 'Unknown';
}

export function adultInvalidReason(result: CardScannerResultDto): string {
  const eff = String(result.effectiveStatus || '').toLowerCase();
  const card = String(result.cardStatus || '').toLowerCase();
  if (eff === 'revoked' || card === 'revoked') return 'Revoked';
  if (eff === 'inactive' && card === 'active') return 'Not currently approved';
  if (eff === 'inactive' || card === 'inactive') return 'Inactive';
  return 'Not valid';
}

export function headlineForResult(result: CardScannerResultDto): {
  text: 'VALID PLCC MEMBER CARD' | 'VALID PLCC CHILD MEMBER CARD' | 'CARD NOT VALID';
  tone: 'valid' | 'invalid';
} {
  if (!result.valid) return { text: 'CARD NOT VALID', tone: 'invalid' };
  if (result.subjectType === 'dependent') {
    return { text: 'VALID PLCC CHILD MEMBER CARD', tone: 'valid' };
  }
  return { text: 'VALID PLCC MEMBER CARD', tone: 'valid' };
}

export function messageForUiState(state: ScannerUiState): string | null {
  switch (state.kind) {
    case 'malformed':
      return 'This is not a valid PLCC card.';
    case 'not_found':
      return 'This credential is not recognized as a current PLCC digital card.';
    case 'conflict':
      return 'Card could not be safely resolved. Please contact an administrator.';
    case 'rate_limited':
      return 'Too many scans were submitted. Please wait a moment and try again.';
    case 'unavailable':
      return 'We couldn’t verify this card right now. Please try again.';
    case 'error':
      return state.message;
    default:
      return null;
  }
}

export function mapResolverResponse(status: number, body: any): ScannerUiState {
  if (status === 429 || body?.code === 'scanner_rate_limited') {
    return { kind: 'rate_limited' };
  }
  if (status === 502 || body?.code === 'scanner_unavailable') {
    return { kind: 'unavailable' };
  }
  if (status === 409 || body?.code === 'resolver_conflict') {
    return { kind: 'conflict' };
  }
  if (status === 400 && body?.code === 'invalid_card_format') {
    return { kind: 'malformed' };
  }
  if (status === 401 || body?.code === 'unauthorized') {
    return { kind: 'error', message: 'Your session expired. Please sign in again.' };
  }
  if (status === 403 || body?.code === 'forbidden') {
    return { kind: 'error', message: 'You do not have permission to use the card scanner.' };
  }

  if (status >= 200 && status < 300 && body?.ok === true && body?.result) {
    const result = body.result;
    if (result.found === false && result.code === 'card_not_found') {
      return { kind: 'not_found' };
    }
    if (result.found === true && (result.subjectType === 'adult' || result.subjectType === 'dependent')) {
      return {
        kind: 'result',
        result: {
          found: true,
          subjectType: result.subjectType,
          displayName: String(result.displayName || 'PLCC Member'),
          avatarUrl: result.avatarUrl ?? null,
          cardNumber: String(result.cardNumber || ''),
          cardStatus: String(result.cardStatus || ''),
          effectiveStatus: String(result.effectiveStatus || ''),
          valid: !!result.valid,
          label: String(result.label || ''),
          notice: String(result.notice || ''),
        },
      };
    }
  }

  return {
    kind: 'unavailable',
  };
}

export function dependentPickupDisclaimer(notice?: string): string {
  if (notice && /pickup|check-out/i.test(notice)) return notice;
  return 'Membership identification only — not child pickup/check-out authorization.';
}

/** Forbidden strings that must never appear in scanner UI source for MVP. */
export const SCANNER_UI_FORBIDDEN_ACTIONS = [
  'Check In',
  'Mark Present',
  'Check Out',
  'Release Child',
  'Pickup',
  'Guardian Approved',
  'Volunteer Check-In',
] as const;
