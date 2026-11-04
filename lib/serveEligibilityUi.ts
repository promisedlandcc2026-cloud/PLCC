/**
 * Staff Serve Eligibility UI helpers (People → Members).
 * Canonical identity: public.users.id — UI only treats members.id as linked
 * when the eligibility API confirms that users row exists (same-UUID).
 * Never email-match for eligibility.
 */

export const SERVE_ELIGIBILITY_UI_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
] as const;

const MANAGE_ROLES = new Set<string>(SERVE_ELIGIBILITY_UI_ROLES);

export type ServeEligibilityStatus =
  | 'not_verified'
  | 'eligible'
  | 'ineligible'
  | 'suspended';

export type ServeEligibilityDto = {
  userId: string;
  status: ServeEligibilityStatus;
  reasonCode: string | null;
  verifiedAt: string | null;
};

export type EligibilityFetchState =
  | { kind: 'loading' }
  | { kind: 'not_linked' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; eligibility: ServeEligibilityDto };

export function canManageServeEligibility(role: unknown): boolean {
  if (role == null || role === '') return false;
  return MANAGE_ROLES.has(String(role).toUpperCase());
}

export const STATUS_LABELS: Record<ServeEligibilityStatus, string> = {
  not_verified: 'Not Verified',
  eligible: 'Eligible',
  ineligible: 'Ineligible',
  suspended: 'Suspended',
};

export const STATUS_DESCRIPTIONS: Record<ServeEligibilityStatus, string> = {
  not_verified: 'Serve eligibility has not been reviewed yet.',
  eligible: 'This member has been verified for Serve self-signup.',
  ineligible: 'This member is currently not eligible for Serve self-signup.',
  suspended: 'Serve self-signup is temporarily suspended for this member.',
};

/** Friendly reason labels → exact server reason codes (no free text). */
export const REASON_OPTIONS = {
  eligible: [{ label: 'Adult eligibility verified', code: 'adult_verified' }],
  ineligible: [
    { label: 'Under 18', code: 'under_18' },
    { label: 'Not eligible under current policy', code: 'policy_ineligible' },
  ],
  suspended: [
    { label: 'Temporarily suspended', code: 'temporarily_suspended' },
  ],
} as const;

export const REASON_LABELS: Record<string, string> = {
  adult_verified: 'Adult eligibility verified',
  under_18: 'Under 18',
  policy_ineligible: 'Not eligible under current policy',
  temporarily_suspended: 'Temporarily suspended',
  not_verified: 'Not verified',
};

export const FUTURE_SIGNUP_CONFIRM_NOTE =
  'Changing eligibility affects FUTURE Serve self-signups only. Existing Serve signups are not automatically cancelled.';

export function normalizeEligibilityDto(raw: unknown, fallbackUserId: string): ServeEligibilityDto | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const statusRaw = String(o.status || '').toLowerCase();
  const status: ServeEligibilityStatus =
    statusRaw === 'eligible' ||
    statusRaw === 'ineligible' ||
    statusRaw === 'suspended' ||
    statusRaw === 'not_verified'
      ? statusRaw
      : 'not_verified';
  const userId =
    typeof o.userId === 'string' && o.userId
      ? o.userId
      : typeof o.user_id === 'string' && o.user_id
        ? o.user_id
        : fallbackUserId;
  return {
    userId,
    status,
    reasonCode:
      o.reasonCode == null || o.reasonCode === ''
        ? o.reason_code == null || o.reason_code === ''
          ? null
          : String(o.reason_code)
        : String(o.reasonCode),
    verifiedAt:
      o.verifiedAt == null || o.verifiedAt === ''
        ? o.verified_at == null || o.verified_at === ''
          ? null
          : String(o.verified_at)
        : String(o.verifiedAt),
  };
}

/** Build PATCH body for set mutations — never includes verified_by / verified_at. */
export function buildSetEligibilityBody(
  userId: string,
  status: 'eligible' | 'ineligible' | 'suspended',
  reasonCode: string
): { userId: string; status: string; reasonCode: string } {
  return { userId, status, reasonCode };
}

export function buildResetEligibilityBody(userId: string): {
  userId: string;
  action: 'reset';
} {
  return { userId, action: 'reset' };
}

export function actionsForStatus(status: ServeEligibilityStatus): Array<
  | { key: 'verify'; label: string; status: 'eligible'; reasonCode: 'adult_verified' }
  | { key: 'ineligible'; label: string; needsReason: true }
  | { key: 'suspend'; label: string; status: 'suspended'; reasonCode: 'temporarily_suspended' }
  | { key: 'reset'; label: string; action: 'reset' }
> {
  const verify = {
    key: 'verify' as const,
    label: 'Verify Eligible',
    status: 'eligible' as const,
    reasonCode: 'adult_verified' as const,
  };
  const ineligible = {
    key: 'ineligible' as const,
    label: 'Mark Ineligible',
    needsReason: true as const,
  };
  const suspend = {
    key: 'suspend' as const,
    label: 'Suspend',
    status: 'suspended' as const,
    reasonCode: 'temporarily_suspended' as const,
  };
  const reset = {
    key: 'reset' as const,
    label: 'Reset Verification',
    action: 'reset' as const,
  };

  switch (status) {
    case 'not_verified':
      return [verify, ineligible];
    case 'eligible':
      return [suspend, ineligible, reset];
    case 'ineligible':
      return [verify, suspend, reset];
    case 'suspended':
      return [verify, ineligible, reset];
    default:
      return [verify, ineligible];
  }
}

export function confirmMessageForAction(
  kind: 'verify' | 'ineligible' | 'suspend' | 'reset'
): string {
  const lead =
    kind === 'verify'
      ? 'Verify this member as eligible for Serve self-signup?'
      : kind === 'ineligible'
        ? 'Mark this member as ineligible for Serve self-signup?'
        : kind === 'suspend'
          ? 'Temporarily suspend Serve self-signup for this member?'
          : 'Reset Serve eligibility verification? This returns the member to Not Verified.';
  return `${lead}\n\n${FUTURE_SIGNUP_CONFIRM_NOTE}`;
}

export function formatVerifiedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString();
}

export function badgeClasses(status: ServeEligibilityStatus): string {
  switch (status) {
    case 'eligible':
      return 'bg-emerald-50 text-emerald-900 border-emerald-200';
    case 'ineligible':
      return 'bg-rose-50 text-rose-900 border-rose-200';
    case 'suspended':
      return 'bg-amber-50 text-amber-950 border-amber-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

/** Safe staff-facing error from API JSON (no raw Postgres). */
export function eligibilityErrorMessage(payload: unknown, fallback = 'Serve eligibility request failed'): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const code = String((payload as any).code || '');
  const map: Record<string, string> = {
    serve_eligibility_admin_forbidden: 'You do not have permission to manage Serve eligibility.',
    invalid_user_id: 'Invalid member account id.',
    invalid_eligibility_status: 'Invalid eligibility status.',
    invalid_reason_code: 'Invalid eligibility reason.',
    reason_code_status_mismatch: 'That reason does not match the selected status.',
    user_not_found: 'This member is not linked to a sign-in account.',
  };
  if (code && map[code]) return map[code];
  const err = (payload as any).error;
  if (typeof err === 'string' && err && !/postgres|sqlstate|permission denied for/i.test(err)) {
    return err;
  }
  return fallback;
}
