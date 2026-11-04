/**
 * Vault Family Admin — pure helpers (no I/O).
 * Staff management of user_member_links, household_members, guardian_relationships.
 * Never email/name/phone auto-link. Never spouse QR. Never child cards.
 */

export const FAMILY_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
]);

export const FAMILY_ADMIN_DENIED_ROLES = new Set([
  'FINANCE',
  'MINISTRY_LEADER',
  'WORSHIP_TEAM',
  'MEMBER',
  'PENDING',
  'YOUTH',
]);

export const LINK_STATUSES = new Set(['proposed', 'verified', 'revoked']);
export const LINK_METHODS = new Set(['same_uuid', 'staff_verified', 'migration']);

export const HOUSEHOLD_RELATIONSHIP_TYPES = new Set([
  'self',
  'spouse',
  'partner',
  'parent',
  'child',
  'dependent',
  'relative',
  'guardian',
  'other',
]);

export const HOUSEHOLD_MEMBERSHIP_STATUSES = new Set(['active', 'inactive']);

export const GUARDIAN_RELATIONSHIP_TYPES = new Set([
  'parent',
  'legal_guardian',
  'authorized_guardian',
]);

export const GUARDIAN_STATUSES = new Set(['active', 'revoked']);

export const FAMILY_ADMIN_ACTIONS = new Set([
  'link-propose',
  'link-verify',
  'link-revoke',
  'household-add',
  'household-update',
  'household-inactivate',
  'guardian-create',
  'guardian-update',
  'guardian-revoke',
  'guardian-reactivate',
  'enable-household-child-cards',
  'search-users',
  'search-members',
  'search-households',
  'suggest-directory-household-members',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFamilyAdminRole(role: unknown): boolean {
  if (role == null) return false;
  return FAMILY_ADMIN_ROLES.has(String(role).toUpperCase());
}

export function asUuid(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

export function asTrimmedString(value: unknown, max = 200): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

export function displayNameFromMember(row: {
  first_name?: unknown;
  last_name?: unknown;
}): string {
  const first = String(row.first_name || '').trim();
  const last = String(row.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || 'PLCC Member';
}

export function displayNameFromUser(row: { name?: unknown; email?: unknown }): string {
  const name = String(row.name || '').trim();
  if (name) return name;
  const email = String(row.email || '').trim();
  return email || 'Sign-in account';
}

export function linkMethodForPair(memberId: string, userId: string): 'same_uuid' | 'staff_verified' {
  return memberId === userId ? 'same_uuid' : 'staff_verified';
}

export function isSameUuidCandidate(memberId: string, userId: string | null | undefined): boolean {
  return Boolean(userId && memberId === userId);
}

export type FamilyAdminErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_uuid'
  | 'invalid_action'
  | 'user_not_found'
  | 'member_not_found'
  | 'household_not_found'
  | 'user_already_linked'
  | 'member_already_linked'
  | 'link_not_found'
  | 'link_not_verified'
  | 'guardian_not_found'
  | 'guardian_already_exists'
  | 'invalid_relationship'
  | 'invalid_permission'
  | 'conflict'
  | 'family_admin_unavailable'
  | 'method_not_allowed'
  | 'query_required';

export type ParseFail = { ok: false; code: FamilyAdminErrorCode; error: string };

export type LinkProposeInput = {
  ok: true;
  action: 'link-propose';
  memberId: string;
  userId: string;
  linkMethod: 'same_uuid' | 'staff_verified';
};

export type LinkStatusInput = {
  ok: true;
  action: 'link-verify' | 'link-revoke';
  memberId: string;
};

export type HouseholdAddInput = {
  ok: true;
  action: 'household-add';
  memberId: string;
  householdId: string;
  relationshipType: string;
  /** When adding someone else, reload this member's Family & Access page. */
  contextMemberId?: string;
};

export type SuggestDirectoryHouseholdInput = {
  ok: true;
  action: 'suggest-directory-household-members';
  memberId: string;
};

export type HouseholdUpdateInput = {
  ok: true;
  action: 'household-update';
  membershipId: string;
  relationshipType?: string;
  status?: 'active' | 'inactive';
};

export type HouseholdInactivateInput = {
  ok: true;
  action: 'household-inactivate';
  membershipId: string;
};

export type GuardianCreateInput = {
  ok: true;
  action: 'guardian-create';
  guardianUserId: string;
  childMemberId: string;
  relationshipType: string;
  canViewCard: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
};

export type GuardianUpdateInput = {
  ok: true;
  action: 'guardian-update';
  guardianId: string;
  relationshipType?: string;
  canViewCard?: boolean;
  canCheckIn?: boolean;
  canCheckOut?: boolean;
};

export type GuardianStatusInput = {
  ok: true;
  action: 'guardian-revoke' | 'guardian-reactivate';
  guardianId: string;
};

export type EnableHouseholdChildCardsInput = {
  ok: true;
  action: 'enable-household-child-cards';
  memberId: string;
};

export type SearchInput = {
  ok: true;
  action: 'search-users' | 'search-members' | 'search-households';
  query: string;
};

export type ParsedFamilyMutation =
  | LinkProposeInput
  | LinkStatusInput
  | HouseholdAddInput
  | HouseholdUpdateInput
  | HouseholdInactivateInput
  | GuardianCreateInput
  | GuardianUpdateInput
  | GuardianStatusInput
  | EnableHouseholdChildCardsInput
  | SearchInput
  | SuggestDirectoryHouseholdInput
  | ParseFail;

export function parseFamilyMutation(body: unknown, actorId: string | null | undefined): ParsedFamilyMutation {
  if (!actorId || !asUuid(actorId)) {
    return { ok: false, code: 'unauthorized', error: 'Authenticated staff actor required.' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_action', error: 'Invalid request body.' };
  }
  const b = body as Record<string, unknown>;
  // Reject client-supplied authority fields
  if ('verified_by' in b || 'verifiedBy' in b || 'linked_by' in b || 'linkedBy' in b || 'created_by' in b || 'createdBy' in b) {
    return {
      ok: false,
      code: 'forbidden',
      error: 'Client cannot supply verification or link actor fields.',
    };
  }
  if ('role' in b && (b.role !== undefined)) {
    // Ignore accidental role — never trust
  }

  const action = String(b.action || '').trim();
  if (!FAMILY_ADMIN_ACTIONS.has(action)) {
    return { ok: false, code: 'invalid_action', error: 'Unknown family admin action.' };
  }

  if (action === 'link-propose') {
    const memberId = asUuid(b.memberId ?? b.member_id);
    const userId = asUuid(b.userId ?? b.user_id);
    if (!memberId || !userId) {
      return { ok: false, code: 'invalid_uuid', error: 'memberId and userId must be valid UUIDs.' };
    }
    return {
      ok: true,
      action: 'link-propose',
      memberId,
      userId,
      linkMethod: linkMethodForPair(memberId, userId),
    };
  }

  if (action === 'link-verify' || action === 'link-revoke') {
    const memberId = asUuid(b.memberId ?? b.member_id);
    if (!memberId) {
      return { ok: false, code: 'invalid_uuid', error: 'memberId must be a valid UUID.' };
    }
    return { ok: true, action, memberId };
  }

  if (action === 'household-add') {
    const memberId = asUuid(b.memberId ?? b.member_id);
    const householdId = asUuid(b.householdId ?? b.household_id);
    const relationshipType = String(b.relationshipType ?? b.relationship_type ?? 'other').trim().toLowerCase();
    const contextMemberId = asUuid(b.contextMemberId ?? b.context_member_id) || undefined;
    if (!memberId || !householdId) {
      return { ok: false, code: 'invalid_uuid', error: 'memberId and householdId must be valid UUIDs.' };
    }
    if (!HOUSEHOLD_RELATIONSHIP_TYPES.has(relationshipType)) {
      return { ok: false, code: 'invalid_relationship', error: 'Invalid household relationship type.' };
    }
    return {
      ok: true,
      action: 'household-add',
      memberId,
      householdId,
      relationshipType,
      ...(contextMemberId ? { contextMemberId } : {}),
    };
  }

  if (action === 'suggest-directory-household-members') {
    const memberId = asUuid(b.memberId ?? b.member_id);
    if (!memberId) {
      return { ok: false, code: 'invalid_uuid', error: 'memberId must be a valid UUID.' };
    }
    return { ok: true, action: 'suggest-directory-household-members', memberId };
  }

  if (action === 'household-update') {
    const membershipId = asUuid(b.membershipId ?? b.membership_id ?? b.id);
    if (!membershipId) {
      return { ok: false, code: 'invalid_uuid', error: 'membershipId must be a valid UUID.' };
    }
    const out: HouseholdUpdateInput = { ok: true, action: 'household-update', membershipId };
    if (b.relationshipType != null || b.relationship_type != null) {
      const relationshipType = String(b.relationshipType ?? b.relationship_type).trim().toLowerCase();
      if (!HOUSEHOLD_RELATIONSHIP_TYPES.has(relationshipType)) {
        return { ok: false, code: 'invalid_relationship', error: 'Invalid household relationship type.' };
      }
      out.relationshipType = relationshipType;
    }
    if (b.status != null) {
      const status = String(b.status).trim().toLowerCase();
      if (!HOUSEHOLD_MEMBERSHIP_STATUSES.has(status)) {
        return { ok: false, code: 'invalid_permission', error: 'Invalid household membership status.' };
      }
      out.status = status as 'active' | 'inactive';
    }
    if (out.relationshipType == null && out.status == null) {
      return { ok: false, code: 'invalid_action', error: 'Provide relationshipType and/or status to update.' };
    }
    return out;
  }

  if (action === 'household-inactivate') {
    const membershipId = asUuid(b.membershipId ?? b.membership_id ?? b.id);
    if (!membershipId) {
      return { ok: false, code: 'invalid_uuid', error: 'membershipId must be a valid UUID.' };
    }
    return { ok: true, action: 'household-inactivate', membershipId };
  }

  if (action === 'guardian-create') {
    const guardianUserId = asUuid(b.guardianUserId ?? b.guardian_user_id);
    const childMemberId = asUuid(b.childMemberId ?? b.child_member_id);
    const relationshipType = String(b.relationshipType ?? b.relationship_type ?? '').trim().toLowerCase();
    if (!guardianUserId || !childMemberId) {
      return {
        ok: false,
        code: 'invalid_uuid',
        error: 'guardianUserId and childMemberId must be valid UUIDs.',
      };
    }
    if (!GUARDIAN_RELATIONSHIP_TYPES.has(relationshipType)) {
      return { ok: false, code: 'invalid_relationship', error: 'Invalid guardian relationship type.' };
    }
    return {
      ok: true,
      action: 'guardian-create',
      guardianUserId,
      childMemberId,
      relationshipType,
      canViewCard: asBoolean(
        b.canViewCard ?? b.can_view_card,
        relationshipType === 'parent' || relationshipType === 'legal_guardian'
      ),
      canCheckIn: asBoolean(b.canCheckIn ?? b.can_check_in, false),
      canCheckOut: asBoolean(b.canCheckOut ?? b.can_check_out, false),
    };
  }

  if (action === 'enable-household-child-cards') {
    const memberId = asUuid(b.memberId ?? b.member_id);
    if (!memberId) {
      return { ok: false, code: 'invalid_uuid', error: 'memberId must be a valid UUID.' };
    }
    return { ok: true, action: 'enable-household-child-cards', memberId };
  }

  if (action === 'guardian-update') {
    const guardianId = asUuid(b.guardianId ?? b.guardian_id ?? b.id);
    if (!guardianId) {
      return { ok: false, code: 'invalid_uuid', error: 'guardianId must be a valid UUID.' };
    }
    const out: GuardianUpdateInput = { ok: true, action: 'guardian-update', guardianId };
    if (b.relationshipType != null || b.relationship_type != null) {
      const relationshipType = String(b.relationshipType ?? b.relationship_type).trim().toLowerCase();
      if (!GUARDIAN_RELATIONSHIP_TYPES.has(relationshipType)) {
        return { ok: false, code: 'invalid_relationship', error: 'Invalid guardian relationship type.' };
      }
      out.relationshipType = relationshipType;
    }
    if ('canViewCard' in b || 'can_view_card' in b) {
      out.canViewCard = asBoolean(b.canViewCard ?? b.can_view_card, false);
    }
    if ('canCheckIn' in b || 'can_check_in' in b) {
      out.canCheckIn = asBoolean(b.canCheckIn ?? b.can_check_in, false);
    }
    if ('canCheckOut' in b || 'can_check_out' in b) {
      out.canCheckOut = asBoolean(b.canCheckOut ?? b.can_check_out, false);
    }
    if (
      out.relationshipType == null &&
      out.canViewCard == null &&
      out.canCheckIn == null &&
      out.canCheckOut == null
    ) {
      return { ok: false, code: 'invalid_action', error: 'Provide at least one guardian field to update.' };
    }
    return out;
  }

  if (action === 'guardian-revoke' || action === 'guardian-reactivate') {
    const guardianId = asUuid(b.guardianId ?? b.guardian_id ?? b.id);
    if (!guardianId) {
      return { ok: false, code: 'invalid_uuid', error: 'guardianId must be a valid UUID.' };
    }
    return { ok: true, action, guardianId };
  }

  if (action === 'search-users' || action === 'search-members' || action === 'search-households') {
    const query = asTrimmedString(b.query ?? b.q, 80);
    if (!query || query.length < 2) {
      return { ok: false, code: 'query_required', error: 'Search query must be at least 2 characters.' };
    }
    return { ok: true, action, query };
  }

  return { ok: false, code: 'invalid_action', error: 'Unknown family admin action.' };
}

export type GuardianPermissionSnapshot = {
  canViewCard: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
};

export function guardianPermissionDiff(
  prior: GuardianPermissionSnapshot,
  next: GuardianPermissionSnapshot
): Record<string, { from: boolean; to: boolean }> {
  const diff: Record<string, { from: boolean; to: boolean }> = {};
  (['canViewCard', 'canCheckIn', 'canCheckOut'] as const).forEach((k) => {
    if (prior[k] !== next[k]) diff[k] = { from: prior[k], to: next[k] };
  });
  return diff;
}

/** Staff-safe DTO shape (no DOB/phone required; email only for link candidate context). */
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
    status: 'none' | 'proposed' | 'verified' | 'revoked';
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

export function sanitizeFamilyAdminDto(raw: FamilyAdminDto): FamilyAdminDto {
  // Structural pass-through after handler builds only safe fields.
  return raw;
}

export function httpStatusForFamilyCode(code: FamilyAdminErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'user_not_found':
    case 'member_not_found':
    case 'household_not_found':
    case 'link_not_found':
    case 'guardian_not_found':
      return 404;
    case 'user_already_linked':
    case 'member_already_linked':
    case 'guardian_already_exists':
    case 'conflict':
      return 409;
    case 'method_not_allowed':
      return 405;
    case 'family_admin_unavailable':
      return 503;
    default:
      return 400;
  }
}
