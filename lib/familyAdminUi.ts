/**
 * Vault Family & Access staff UI helpers (People → Members).
 * Same narrow role set as Serve eligibility. Never auto-link by email/name/phone.
 */

export const FAMILY_ADMIN_UI_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
] as const;

const MANAGE_ROLES = new Set<string>(FAMILY_ADMIN_UI_ROLES);

export type LinkStatus = 'none' | 'proposed' | 'verified' | 'revoked';

export type FamilyAdminDto = {
  member: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    status: string | null;
    legacyHouseholdName: string | null;
    legacyHouseholdId: string | null;
    legacyChildrenCount: number;
  };
  userLink: {
    status: LinkStatus;
    userId: string | null;
    displayName: string | null;
    email: string | null;
    linkMethod: string | null;
    linkedAt: string | null;
    sameUuidCandidate: boolean;
  };
  household: {
    id: string | null;
    name: string | null;
    membershipId: string | null;
    membershipStatus: string | null;
    relationshipType: string | null;
    members: Array<{
      membershipId: string;
      memberId: string;
      displayName: string;
      avatarUrl: string | null;
      relationshipType: string | null;
      status: string;
    }>;
  };
  guardianRelationships: Array<{
    id: string;
    guardianUserId: string;
    guardianDisplayName: string | null;
    relationshipType: string;
    canViewCard: boolean;
    canCheckIn: boolean;
    canCheckOut: boolean;
    status: string;
    verifiedAt: string | null;
  }>;
  childRelationships: Array<{
    id: string;
    childMemberId: string;
    childDisplayName: string;
    relationshipType: string;
    canViewCard: boolean;
    canCheckIn: boolean;
    canCheckOut: boolean;
    status: string;
    verifiedAt: string | null;
  }>;
};

export const HOUSEHOLD_RELATIONSHIP_OPTIONS = [
  { value: 'self', label: 'Self' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'partner', label: 'Partner' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'dependent', label: 'Dependent' },
  { value: 'relative', label: 'Relative' },
  { value: 'guardian', label: 'Guardian (directory)' },
  { value: 'other', label: 'Other' },
] as const;

export const GUARDIAN_RELATIONSHIP_OPTIONS = [
  { value: 'parent', label: 'Parent' },
  { value: 'legal_guardian', label: 'Legal Guardian' },
  { value: 'authorized_guardian', label: 'Authorized Guardian' },
] as const;

export function canManageFamilyAdmin(role: unknown): boolean {
  if (role == null || role === '') return false;
  return MANAGE_ROLES.has(String(role).toUpperCase());
}

export function linkStatusLabel(status: LinkStatus | string | null | undefined): string {
  switch (String(status || 'none')) {
    case 'proposed':
      return 'Proposed';
    case 'verified':
      return 'Verified';
    case 'revoked':
      return 'Revoked';
    default:
      return 'Not linked';
  }
}

export function linkBadgeClasses(status: LinkStatus | string | null | undefined): string {
  switch (String(status || 'none')) {
    case 'proposed':
      return 'bg-amber-50 text-amber-950 border-amber-200';
    case 'verified':
      return 'bg-emerald-50 text-emerald-900 border-emerald-200';
    case 'revoked':
      return 'bg-rose-50 text-rose-900 border-rose-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function guardianTypeLabel(type: string): string {
  const found = GUARDIAN_RELATIONSHIP_OPTIONS.find((o) => o.value === type);
  return found?.label || type;
}

export function householdRelationshipLabel(type: string | null | undefined): string {
  if (!type) return '—';
  const found = HOUSEHOLD_RELATIONSHIP_OPTIONS.find((o) => o.value === type);
  return found?.label || type;
}

export function normalizeFamilyAdminDto(raw: unknown): FamilyAdminDto | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as any;
  if (!o.member?.id) return null;
  return {
    member: {
      id: String(o.member.id),
      displayName: String(o.member.displayName || 'Member'),
      avatarUrl: o.member.avatarUrl ?? null,
      status: o.member.status ?? null,
      legacyHouseholdName: o.member.legacyHouseholdName ?? null,
      legacyHouseholdId: o.member.legacyHouseholdId ?? null,
      legacyChildrenCount: Number(o.member.legacyChildrenCount || 0),
    },
    userLink: {
      status: (['none', 'proposed', 'verified', 'revoked'].includes(String(o.userLink?.status))
        ? String(o.userLink.status)
        : 'none') as LinkStatus,
      userId: o.userLink?.userId ?? null,
      displayName: o.userLink?.displayName ?? null,
      email: o.userLink?.email ?? null,
      linkMethod: o.userLink?.linkMethod ?? null,
      linkedAt: o.userLink?.linkedAt ?? null,
      sameUuidCandidate: Boolean(o.userLink?.sameUuidCandidate),
    },
    household: {
      id: o.household?.id ?? null,
      name: o.household?.name ?? null,
      membershipId: o.household?.membershipId ?? null,
      membershipStatus: o.household?.membershipStatus ?? null,
      relationshipType: o.household?.relationshipType ?? null,
      members: Array.isArray(o.household?.members)
        ? o.household.members.map((m: any) => ({
            membershipId: String(m.membershipId),
            memberId: String(m.memberId),
            displayName: String(m.displayName || 'Member'),
            avatarUrl: m.avatarUrl ?? null,
            relationshipType: m.relationshipType ?? null,
            status: String(m.status || 'active'),
          }))
        : [],
    },
    guardianRelationships: Array.isArray(o.guardianRelationships)
      ? o.guardianRelationships.map((g: any) => ({
          id: String(g.id),
          guardianUserId: String(g.guardianUserId),
          guardianDisplayName: g.guardianDisplayName ?? null,
          relationshipType: String(g.relationshipType),
          canViewCard: Boolean(g.canViewCard),
          canCheckIn: Boolean(g.canCheckIn),
          canCheckOut: Boolean(g.canCheckOut),
          status: String(g.status),
          verifiedAt: g.verifiedAt ?? null,
        }))
      : [],
    childRelationships: Array.isArray(o.childRelationships)
      ? o.childRelationships.map((c: any) => ({
          id: String(c.id),
          childMemberId: String(c.childMemberId),
          childDisplayName: String(c.childDisplayName || 'Child'),
          relationshipType: String(c.relationshipType),
          canViewCard: Boolean(c.canViewCard),
          canCheckIn: Boolean(c.canCheckIn),
          canCheckOut: Boolean(c.canCheckOut),
          status: String(c.status),
          verifiedAt: c.verifiedAt ?? null,
        }))
      : [],
  };
}

export function familyAdminErrorMessage(payload: unknown, fallback = 'Family admin request failed'): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const code = String((payload as any).code || '');
  const map: Record<string, string> = {
    forbidden: 'You do not have permission to manage Family & Access.',
    unauthorized: 'Sign in again to manage Family & Access.',
    invalid_uuid: 'Invalid id provided.',
    invalid_action: 'That action is not supported.',
    user_not_found: 'Sign-in account not found.',
    member_not_found: 'Member not found.',
    household_not_found: 'Household not found.',
    user_already_linked: 'That sign-in account is already linked to another member.',
    member_already_linked: 'This member is already linked to another sign-in account.',
    link_not_found: 'No identity link found for this member.',
    link_not_verified: 'Guardian must have a verified identity link first.',
    guardian_not_found: 'Guardian relationship not found.',
    guardian_already_exists: 'An active guardian relationship already exists.',
    invalid_relationship: 'Invalid relationship type.',
    conflict: 'That change conflicts with an existing record.',
    family_admin_unavailable: 'Family identity tables are not available yet.',
    query_required: 'Enter at least 2 characters to search.',
  };
  if (code && map[code]) return map[code];
  const err = (payload as any).error;
  if (typeof err === 'string' && err && !/postgres|sqlstate|permission denied for/i.test(err)) {
    return err;
  }
  return fallback;
}

export const CONFIRM_LINK_PROPOSE =
  'Propose this identity link?\n\nThis does NOT verify access yet. Family features stay blocked until you explicitly verify.';

export const CONFIRM_LINK_VERIFY =
  'Verify this identity link?\n\nOnly verified links authorize future Family Pass access for this member.';

export const CONFIRM_LINK_REVOKE =
  'Revoke this identity link?\n\nFuture Family authorization for this account will stop. Existing guardian edges are not deleted.';

export const CONFIRM_HOUSEHOLD_INACTIVATE =
  'Inactivate this household membership?\n\nGuardian permissions are separate and will not be removed automatically.';

export const CONFIRM_GUARDIAN_REVOKE =
  'Revoke this guardian relationship?\n\nThis soft-revokes access. You can reactivate later after reviewing flags.';

export const CONFIRM_GUARDIAN_REACTIVATE =
  'Reactivate this guardian relationship?\n\nReview View Child Card / Check In / Check Out flags carefully before confirming.';

export const CHECKIN_HELPER =
  'When enabled, this guardian may be confirmed at Kids Kiosk for drop-off (Family Pass child card). The child QR alone never checks anyone in — staff must select this guardian.';

export const CHECKOUT_HELPER =
  'When enabled, this guardian may be confirmed at Kids Kiosk for pickup (Family Pass). The child QR alone never releases a child — staff must select this guardian at checkout.';

export const LEGACY_CHILDREN_WARNING =
  'Legacy directory children entries are not member records and cannot receive guardian access or child cards.';

/** Shown when Profile CHILDREN JSON exists but structured dependents do not. */
export const LEGACY_CHILDREN_CONNECT_GAP =
  'Profile CHILDREN JSON is not counted on Connect My Family. Create each child as a Members record (if missing), then search-add them below as child/dependent.';

export const SEARCH_DOES_NOT_VERIFY =
  'Searching and selecting a candidate does not verify the link. You must propose, then explicitly verify.';

/** Numbered staff workflow copy (Family & Access). */
export const STEP_SIGN_IN_TITLE = 'Step 1 — Sign-in account';
export const STEP_SIGN_IN_HELP =
  'Search this person’s Connect login, propose the link, then verify. Search does not verify.';

export const STEP_HOUSEHOLD_TITLE = 'Step 2 — Household';
export const STEP_HOUSEHOLD_HELP =
  'Create or join one structured household. Connect My Family reads this roster — not the legacy Households page.';

export const STEP_ADD_PEOPLE_TITLE = 'Step 3 — Add people';
export const STEP_ADD_PEOPLE_HELP =
  'Search and confirm spouse, then each child. They must already be Members records — one confirm per person.';

export const STEP_GUARDIAN_TITLE = 'Step 4 — Guardian access (optional)';
export const STEP_GUARDIAN_HELP =
  'Needed for child cards and Kids Kiosk Family Pass check-in/out. Household membership alone does not grant guardian access.';

export const ENABLE_HOUSEHOLD_CHILD_CARDS_TITLE = 'One-click Connect child cards';
export const ENABLE_HOUSEHOLD_CHILD_CARDS_HELP =
  'Turns on View Child Card (+ check-in/out) for every child/dependent in this household for this parent\'s Connect login. Use this instead of opening each child one by one.';
export const CONFIRM_ENABLE_HOUSEHOLD_CHILD_CARDS =
  'Enable Connect Family Pass cards for all household children for this parent?\n\nThis grants View Card, Check In, and Check Out on each child and removes any mistaken self child-card link.';

export const SUGGEST_DIRECTORY_TITLE = 'Quick add from directory household';
export const SUGGEST_DIRECTORY_HELP =
  'Other Members who share this legacy directory household. Confirm each add — JSON-only children are not listed.';

export const CONFIRM_ADD_SPOUSE =
  'Add this person as spouse to the structured household?\n\nThis updates Connect My Family adult counts after they are on the roster.';

export const CONFIRM_ADD_CHILD =
  'Add this person as a child/dependent to the structured household?\n\nThey must already exist as a Members record. Legacy JSON children alone are not enough.';

export const CONFIRM_ADD_DIRECTORY_SUGGEST =
  'Add this directory household candidate to the structured household with the selected relationship?\n\nNothing was auto-inserted — only this confirmed add.';

export const ADD_PEOPLE_NEEDS_HOUSEHOLD =
  'Finish Step 2 first: this member needs an active structured household before you can add a spouse or child.';

export const CONNECT_FAMILY_COUNTS_NOTE =
  'Works for every Members record. Connect My Family Adults = other household adults (not this person). Children = child/dependent on the structured roster (+ guardian edges for cards). Profile CHILDREN JSON and legacy Households are not used.';

/**
 * Match Connect My Family status counts for staff preview on any open member.
 * Adults exclude the subject member; children = HH child/dependent ∪ active childRelationships.
 *
 * Staff path (any family): verified link → structured household → search-add spouse
 * (Adults preview increases) → create/find each child as a Members row → add as child/dependent
 * (Children preview increases) → optional guardian for cards.
 */
export function connectStyleFamilyCounts(family: FamilyAdminDto, selfMemberId: string): {
  adults: number;
  children: number;
  otherAdults: FamilyAdminDto['household']['members'];
  dependents: Array<{ memberId: string; displayName: string; relationshipType: string | null; source: 'household' | 'guardian' }>;
} {
  const dependentRels = new Set(['child', 'dependent']);
  const active = family.household.members.filter((m) => String(m.status || 'active') === 'active');
  const otherAdults = active.filter(
    (m) => m.memberId !== selfMemberId && !dependentRels.has(String(m.relationshipType || ''))
  );
  const hhDependents = active.filter((m) => dependentRels.has(String(m.relationshipType || '')));
  const depIds = new Set(hhDependents.map((d) => d.memberId));
  const fromGuardian = family.childRelationships
    .filter((c) => String(c.status) === 'active')
    .filter((c) => !depIds.has(c.childMemberId))
    .map((c) => ({
      memberId: c.childMemberId,
      displayName: c.childDisplayName,
      relationshipType: c.relationshipType,
      source: 'guardian' as const,
    }));

  return {
    adults: otherAdults.length,
    children: hhDependents.length + fromGuardian.length,
    otherAdults,
    dependents: [
      ...hhDependents.map((d) => ({
        memberId: d.memberId,
        displayName: d.displayName,
        relationshipType: d.relationshipType,
        source: 'household' as const,
      })),
      ...fromGuardian,
    ],
  };
}

export function suggestedHouseholdName(displayName: string): string {
  const parts = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'Family';
  return `${last} Family`;
}