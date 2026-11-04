/**
 * Vault Serve Eligibility Admin — pure helpers (no I/O).
 * Person-level staff verification; narrower than SERVE_ADMIN_ROLES.
 */

export const SERVE_ELIGIBILITY_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
]);

export const SERVE_ELIGIBILITY_DENIED_ROLES = new Set([
  'FINANCE',
  'MINISTRY_LEADER',
  'WORSHIP_TEAM',
  'MEMBER',
  'PENDING',
  'YOUTH',
]);

/** Stored statuses only — absence of row = not_verified (never stored). */
export const SERVE_ELIGIBILITY_STATUSES = new Set([
  'eligible',
  'ineligible',
  'suspended',
]);

export const SERVE_ELIGIBILITY_REASON_CODES = new Set([
  'adult_verified',
  'under_18',
  'policy_ineligible',
  'temporarily_suspended',
]);

/** Valid reason_code values per status. */
export const SERVE_ELIGIBILITY_REASONS_BY_STATUS: Record<string, Set<string>> = {
  eligible: new Set(['adult_verified']),
  ineligible: new Set(['under_18', 'policy_ineligible']),
  suspended: new Set(['temporarily_suspended']),
};

export const SERVE_ELIGIBILITY_DEFAULT_REASON: Record<string, string> = {
  eligible: 'adult_verified',
  ineligible: 'policy_ineligible',
  suspended: 'temporarily_suspended',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isServeEligibilityAdminRole(role: unknown): boolean {
  if (role == null) return false;
  return SERVE_ELIGIBILITY_ADMIN_ROLES.has(String(role).toUpperCase());
}

export function asUuid(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

export type EligibilityAdminDto = {
  userId: string;
  status: 'not_verified' | 'eligible' | 'ineligible' | 'suspended';
  reasonCode: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
};

/** Map DB row or absence → admin DTO. */
export function toEligibilityAdminDto(
  userId: string,
  row: {
    status?: unknown;
    reason_code?: unknown;
    verified_at?: unknown;
    verified_by?: unknown;
  } | null
): EligibilityAdminDto {
  if (!row) {
    return {
      userId,
      status: 'not_verified',
      reasonCode: 'not_verified',
      verifiedAt: null,
      verifiedBy: null,
    };
  }
  const status = String(row.status || '').toLowerCase();
  const safeStatus =
    status === 'eligible' || status === 'ineligible' || status === 'suspended'
      ? status
      : 'not_verified';
  if (safeStatus === 'not_verified') {
    return {
      userId,
      status: 'not_verified',
      reasonCode: 'not_verified',
      verifiedAt: null,
      verifiedBy: null,
    };
  }
  return {
    userId,
    status: safeStatus,
    reasonCode:
      row.reason_code == null || row.reason_code === ''
        ? null
        : String(row.reason_code),
    verifiedAt:
      row.verified_at == null || row.verified_at === ''
        ? null
        : String(row.verified_at),
    verifiedBy: asUuid(row.verified_by),
  };
}

export type MutateOk = {
  ok: true;
  action: 'set' | 'reset';
  userId: string;
  status: 'eligible' | 'ineligible' | 'suspended' | 'not_verified';
  reasonCode: string | null;
  row:
    | {
        user_id: string;
        status: string;
        reason_code: string | null;
        verified_at: string;
        verified_by: string;
        updated_at: string;
      }
    | null;
};

export type MutateErr = { ok: false; code: string; error: string };

/**
 * Validate mutation body. Ignores client verified_by / verified_at / timestamps.
 * action=reset → delete row (not_verified).
 */
export function parseEligibilityMutation(
  body: Record<string, unknown> | null | undefined,
  actorUserId: string
): MutateOk | MutateErr {
  const raw = body && typeof body === 'object' ? body : {};
  const userId = asUuid(raw.userId ?? raw.user_id);
  if (!userId) {
    return { ok: false, code: 'invalid_user_id', error: 'userId must be a valid UUID' };
  }

  const action =
    typeof raw.action === 'string' ? raw.action.trim().toLowerCase() : null;

  if (action === 'reset' || action === 'unverify') {
    return {
      ok: true,
      action: 'reset',
      userId,
      status: 'not_verified',
      reasonCode: null,
      row: null,
    };
  }

  const statusRaw =
    typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : '';
  if (!SERVE_ELIGIBILITY_STATUSES.has(statusRaw)) {
    return {
      ok: false,
      code: 'invalid_eligibility_status',
      error: 'status must be eligible, ineligible, or suspended',
    };
  }
  const status = statusRaw as 'eligible' | 'ineligible' | 'suspended';

  let reasonCode: string | null = null;
  if (raw.reasonCode != null && raw.reasonCode !== '') {
    if (typeof raw.reasonCode !== 'string') {
      return {
        ok: false,
        code: 'invalid_reason_code',
        error: 'reasonCode must be a string',
      };
    }
    reasonCode = raw.reasonCode.trim().toLowerCase();
  } else if (raw.reason_code != null && raw.reason_code !== '') {
    if (typeof raw.reason_code !== 'string') {
      return {
        ok: false,
        code: 'invalid_reason_code',
        error: 'reasonCode must be a string',
      };
    }
    reasonCode = raw.reason_code.trim().toLowerCase();
  } else {
    reasonCode = SERVE_ELIGIBILITY_DEFAULT_REASON[status];
  }

  if (!reasonCode || !SERVE_ELIGIBILITY_REASON_CODES.has(reasonCode)) {
    return {
      ok: false,
      code: 'invalid_reason_code',
      error: 'reasonCode is not in the allowlist',
    };
  }
  const allowed = SERVE_ELIGIBILITY_REASONS_BY_STATUS[status];
  if (!allowed?.has(reasonCode)) {
    return {
      ok: false,
      code: 'reason_code_status_mismatch',
      error: `reasonCode ${reasonCode} is not valid for status ${status}`,
    };
  }

  const actor = asUuid(actorUserId);
  if (!actor) {
    return {
      ok: false,
      code: 'unauthorized',
      error: 'Authenticated admin identity required',
    };
  }

  const now = new Date().toISOString();
  return {
    ok: true,
    action: 'set',
    userId,
    status,
    reasonCode,
    row: {
      user_id: userId,
      status,
      reason_code: reasonCode,
      verified_at: now,
      verified_by: actor,
      updated_at: now,
    },
  };
}
