/**
 * Vault Family Admin HTTP handler.
 * Mounted at GET|PATCH /api/vault?resource=people&subResource=family-identity
 *
 * Live Phase 2.6C.1 schema is authoritative:
 * - user_member_links: user_id, member_id, status, link_method, linked_by, linked_at,
 *   created_at, updated_at ONLY. No verified_by/verified_at/revoked_at/notes.
 *   Current row = current state + last link decision actor/time; history lives in audit_logs.
 * - guardian_relationships: verified_by/verified_at exist; NO created_by/revoked_at.
 *   Ordinary permission patches leave verified_* unchanged; reactivation refreshes them.
 */

import { getSupabaseAdmin, requireAuth } from './auth.js';
import { resolveAdultHouseholdForUser } from './familyHuddleAccess.js';
import {
  asUuid,
  displayNameFromMember,
  displayNameFromUser,
  FAMILY_ADMIN_ROLES,
  guardianPermissionDiff,
  httpStatusForFamilyCode,
  isFamilyAdminRole,
  isSameUuidCandidate,
  parseFamilyMutation,
  sanitizeFamilyAdminDto,
  type FamilyAdminDto,
  type FamilyAdminErrorCode,
} from './familyAdminLogic.js';

async function getAudit() {
  const { getAudit: loadAudit } = await import('./deps.js');
  return loadAudit();
}

function fail(res: any, code: FamilyAdminErrorCode, error: string) {
  return res.status(httpStatusForFamilyCode(code)).json({ ok: false, error, code });
}

function isUniqueViolation(err: any): boolean {
  const msg = String(err?.message || err?.details || '').toLowerCase();
  return err?.code === '23505' || msg.includes('duplicate') || msg.includes('unique');
}

export async function handleFamilyAdmin(req: any, res: any) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return fail(res, 'family_admin_unavailable', 'Supabase Admin not initialized.');
    }
    const auth = await requireAuth(req, res, supabase);
    if (!auth) return;

    if (!isFamilyAdminRole(auth.role)) {
      return fail(res, 'forbidden', 'Family admin requires elevated staff role.');
    }

    const method = String(req.method || '').toUpperCase();
    if (method === 'GET') {
      return await handleGet(req, res, supabase, auth);
    }
    if (method === 'PATCH') {
      return await handlePatch(req, res, supabase, auth);
    }
    return fail(res, 'method_not_allowed', 'Method not allowed.');
  } catch (err: any) {
    console.error('[family-admin]', err?.message || err);
    const msg = String(err?.message || '');
    if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
      return fail(res, 'family_admin_unavailable', 'Family identity tables are not available.');
    }
    return res.status(500).json({
      ok: false,
      error: 'Family admin request failed.',
      code: 'family_admin_error',
    });
  }
}

async function handleGet(req: any, res: any, supabase: any, auth: { user: { id: string } }) {
  const memberId = asUuid(req.query?.memberId ?? req.query?.id);
  if (!memberId) {
    return fail(res, 'invalid_uuid', 'memberId query parameter is required.');
  }

  const dto = await assembleFamilyAdminDto(supabase, memberId);
  if (!dto) {
    return fail(res, 'member_not_found', 'Member not found.');
  }

  let viewerCanHuddle = false;
  const viewer = await resolveAdultHouseholdForUser(supabase, auth.user.id);
  if (viewer.ok && dto.household.id && viewer.ctx.householdId === dto.household.id) {
    viewerCanHuddle = true;
  }

  return res.status(200).json({
    ok: true,
    family: sanitizeFamilyAdminDto(dto),
    viewerCanHuddle,
    rolesAllowed: Array.from(FAMILY_ADMIN_ROLES),
  });
}

async function assembleFamilyAdminDto(supabase: any, memberId: string): Promise<FamilyAdminDto | null> {
  const { data: member, error: mErr } = await supabase
    .from('members')
    .select('id, first_name, last_name, avatar_url, status, household_id, household_name, children')
    .eq('id', memberId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!member?.id) return null;

  const legacyChildren = Array.isArray(member.children) ? member.children : [];

  const { data: link } = await supabase
    .from('user_member_links')
    .select('user_id, status, link_method, linked_at, linked_by')
    .eq('member_id', memberId)
    .maybeSingle();

  let linkUser: { name?: string; email?: string } | null = null;
  if (link?.user_id) {
    const { data: u } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', link.user_id)
      .maybeSingle();
    linkUser = u || null;
  }

  const { data: membership } = await supabase
    .from('household_members')
    .select('id, household_id, relationship_type, status')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .maybeSingle();

  let householdName: string | null = null;
  let householdMembers: FamilyAdminDto['household']['members'] = [];

  if (membership?.household_id) {
    const { data: hh } = await supabase
      .from('households')
      .select('id, name')
      .eq('id', membership.household_id)
      .maybeSingle();
    householdName = hh?.name ? String(hh.name) : null;

    const { data: hmRows } = await supabase
      .from('household_members')
      .select('id, member_id, relationship_type, status')
      .eq('household_id', membership.household_id)
      .order('created_at', { ascending: true });

    const memberIds = (hmRows || []).map((r: any) => r.member_id).filter(Boolean);
    let memberMap = new Map<string, any>();
    if (memberIds.length) {
      const { data: memRows } = await supabase
        .from('members')
        .select('id, first_name, last_name, avatar_url')
        .in('id', memberIds);
      (memRows || []).forEach((m: any) => memberMap.set(m.id, m));
    }

    householdMembers = (hmRows || []).map((r: any) => {
      const m = memberMap.get(r.member_id) || {};
      return {
        membershipId: String(r.id),
        memberId: String(r.member_id),
        displayName: displayNameFromMember(m),
        avatarUrl: m.avatar_url ? String(m.avatar_url) : null,
        relationshipType: r.relationship_type ? String(r.relationship_type) : null,
        status: String(r.status || 'active'),
      };
    });
  }

  const { data: asChild } = await supabase
    .from('guardian_relationships')
    .select(
      'id, guardian_user_id, relationship_type, can_view_card, can_check_in, can_check_out, status, verified_at'
    )
    .eq('child_member_id', memberId)
    .order('created_at', { ascending: false });

  const guardianUserIds = (asChild || []).map((r: any) => r.guardian_user_id).filter(Boolean);
  let guardianUserMap = new Map<string, any>();
  if (guardianUserIds.length) {
    const { data: gu } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', guardianUserIds);
    (gu || []).forEach((u: any) => guardianUserMap.set(u.id, u));
  }

  const guardianRelationships = (asChild || []).map((r: any) => {
    const u = guardianUserMap.get(r.guardian_user_id) || {};
    return {
      id: String(r.id),
      guardianUserId: String(r.guardian_user_id),
      guardianDisplayName: displayNameFromUser(u),
      relationshipType: String(r.relationship_type),
      canViewCard: Boolean(r.can_view_card),
      canCheckIn: Boolean(r.can_check_in),
      canCheckOut: Boolean(r.can_check_out),
      status: String(r.status),
      verifiedAt: r.verified_at ? String(r.verified_at) : null,
    };
  });

  let childRelationships: FamilyAdminDto['childRelationships'] = [];
  if (link?.status === 'verified' && link.user_id) {
    const { data: asGuardian } = await supabase
      .from('guardian_relationships')
      .select(
        'id, child_member_id, relationship_type, can_view_card, can_check_in, can_check_out, status, verified_at'
      )
      .eq('guardian_user_id', link.user_id)
      .order('created_at', { ascending: false });

    const childIds = (asGuardian || []).map((r: any) => r.child_member_id).filter(Boolean);
    let childMap = new Map<string, any>();
    if (childIds.length) {
      const { data: children } = await supabase
        .from('members')
        .select('id, first_name, last_name')
        .in('id', childIds);
      (children || []).forEach((c: any) => childMap.set(c.id, c));
    }

    childRelationships = (asGuardian || []).map((r: any) => {
      const c = childMap.get(r.child_member_id) || {};
      return {
        id: String(r.id),
        childMemberId: String(r.child_member_id),
        childDisplayName: displayNameFromMember(c),
        relationshipType: String(r.relationship_type),
        canViewCard: Boolean(r.can_view_card),
        canCheckIn: Boolean(r.can_check_in),
        canCheckOut: Boolean(r.can_check_out),
        status: String(r.status),
        verifiedAt: r.verified_at ? String(r.verified_at) : null,
      };
    });
  }

  const linkStatus = link?.status
    ? (String(link.status) as 'proposed' | 'verified' | 'revoked')
    : 'none';

  return {
    member: {
      id: String(member.id),
      displayName: displayNameFromMember(member),
      avatarUrl: member.avatar_url ? String(member.avatar_url) : null,
      status: member.status != null ? String(member.status) : null,
      legacyHouseholdName: member.household_name ? String(member.household_name) : null,
      legacyHouseholdId: member.household_id ? String(member.household_id) : null,
      legacyChildrenCount: legacyChildren.length,
    },
    userLink: {
      status: linkStatus,
      userId: link?.user_id ? String(link.user_id) : null,
      displayName: linkUser ? displayNameFromUser(linkUser) : null,
      email: linkUser?.email ? String(linkUser.email) : null,
      linkMethod: link?.link_method ? String(link.link_method) : null,
      linkedAt: link?.linked_at ? String(link.linked_at) : null,
      sameUuidCandidate: isSameUuidCandidate(memberId, link?.user_id),
    },
    household: {
      id: membership?.household_id ? String(membership.household_id) : null,
      name: householdName,
      membershipId: membership?.id ? String(membership.id) : null,
      membershipStatus: membership?.status ? String(membership.status) : null,
      relationshipType: membership?.relationship_type ? String(membership.relationship_type) : null,
      members: householdMembers,
    },
    guardianRelationships,
    childRelationships,
  };
}

async function handlePatch(req: any, res: any, supabase: any, auth: any) {
  const actorId = auth.user?.id as string;
  const parsed = parseFamilyMutation(req.body || {}, actorId);
  if (parsed.ok === false) {
    return fail(res, parsed.code, parsed.error);
  }

  switch (parsed.action) {
    case 'search-users':
      return await searchUsers(res, supabase, parsed.query);
    case 'search-members':
      return await searchMembers(res, supabase, parsed.query);
    case 'search-households':
      return await searchHouseholds(res, supabase, parsed.query);
    case 'link-propose':
      return await linkPropose(req, res, supabase, actorId, parsed);
    case 'link-verify':
      return await linkVerify(req, res, supabase, actorId, parsed.memberId);
    case 'link-revoke':
      return await linkRevoke(req, res, supabase, actorId, parsed.memberId);
    case 'household-add':
      return await householdAdd(req, res, supabase, actorId, parsed);
    case 'household-update':
      return await householdUpdate(req, res, supabase, actorId, parsed);
    case 'household-inactivate':
      return await householdInactivate(req, res, supabase, actorId, parsed.membershipId);
    case 'suggest-directory-household-members':
      return await suggestDirectoryHouseholdMembers(res, supabase, parsed.memberId);
    case 'guardian-create':
      return await guardianCreate(req, res, supabase, actorId, parsed);
    case 'guardian-update':
      return await guardianUpdate(req, res, supabase, actorId, parsed);
    case 'guardian-revoke':
      return await guardianRevoke(req, res, supabase, actorId, parsed.guardianId);
    case 'guardian-reactivate':
      return await guardianReactivate(req, res, supabase, actorId, parsed.guardianId);
    case 'enable-household-child-cards':
      return await enableHouseholdChildCards(req, res, supabase, actorId, parsed.memberId);
    default:
      return fail(res, 'invalid_action', 'Unknown family admin action.');
  }
}

async function searchUsers(res: any, supabase: any, query: string) {
  const q = `%${query}%`;
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role')
    .or(`name.ilike.${q},email.ilike.${q}`)
    .limit(20);
  if (error) throw error;

  const ids = (data || []).map((u: any) => u.id);
  let linked = new Set<string>();
  if (ids.length) {
    const { data: links } = await supabase
      .from('user_member_links')
      .select('user_id, status')
      .in('user_id', ids)
      .in('status', ['proposed', 'verified']);
    (links || []).forEach((l: any) => linked.add(l.user_id));
  }

  return res.status(200).json({
    ok: true,
    action: 'search-users',
    results: (data || []).map((u: any) => ({
      id: u.id,
      displayName: displayNameFromUser(u),
      email: u.email || null,
      role: u.role || null,
      alreadyLinked: linked.has(u.id),
    })),
  });
}

async function searchMembers(res: any, supabase: any, query: string) {
  const q = `%${query}%`;
  const { data, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, avatar_url, status')
    .or(`first_name.ilike.${q},last_name.ilike.${q}`)
    .limit(20);
  if (error) throw error;

  return res.status(200).json({
    ok: true,
    action: 'search-members',
    results: (data || []).map((m: any) => ({
      id: m.id,
      displayName: displayNameFromMember(m),
      avatarUrl: m.avatar_url || null,
      status: m.status || null,
    })),
  });
}

async function searchHouseholds(res: any, supabase: any, query: string) {
  const q = `%${query}%`;
  const { data, error } = await supabase
    .from('households')
    .select('id, name')
    .ilike('name', q)
    .limit(20);
  if (error) throw error;

  return res.status(200).json({
    ok: true,
    action: 'search-households',
    results: (data || []).map((h: any) => ({
      id: h.id,
      name: h.name || 'Household',
    })),
  });
}

async function reloadFamily(res: any, supabase: any, memberId: string, extra: Record<string, unknown> = {}) {
  const family = await assembleFamilyAdminDto(supabase, memberId);
  return res.status(200).json({
    ok: true,
    ...extra,
    family: family ? sanitizeFamilyAdminDto(family) : null,
  });
}

async function linkPropose(
  req: any,
  res: any,
  supabase: any,
  actorId: string,
  parsed: { memberId: string; userId: string; linkMethod: 'same_uuid' | 'staff_verified' }
) {
  const { data: member } = await supabase.from('members').select('id').eq('id', parsed.memberId).maybeSingle();
  if (!member?.id) return fail(res, 'member_not_found', 'Member not found.');

  const { data: user } = await supabase.from('users').select('id').eq('id', parsed.userId).maybeSingle();
  if (!user?.id) return fail(res, 'user_not_found', 'Sign-in account not found.');

  const { data: existingUserLink } = await supabase
    .from('user_member_links')
    .select('member_id, status')
    .eq('user_id', parsed.userId)
    .in('status', ['proposed', 'verified'])
    .maybeSingle();
  if (existingUserLink && existingUserLink.member_id !== parsed.memberId) {
    return fail(res, 'user_already_linked', 'This sign-in account is already linked to another member.');
  }

  const { data: existingMemberLink } = await supabase
    .from('user_member_links')
    .select('user_id, status')
    .eq('member_id', parsed.memberId)
    .in('status', ['proposed', 'verified'])
    .maybeSingle();
  if (existingMemberLink && existingMemberLink.user_id !== parsed.userId) {
    return fail(res, 'member_already_linked', 'This member is already linked to another sign-in account.');
  }

  // linked_at = last link decision timestamp (propose/verify/revoke). History via audit_logs.
  const now = new Date().toISOString();
  const row = {
    user_id: parsed.userId,
    member_id: parsed.memberId,
    status: 'proposed',
    link_method: parsed.linkMethod,
    linked_by: actorId,
    linked_at: now,
  };

  const { error } = await supabase.from('user_member_links').upsert(row, {
    onConflict: 'member_id',
  });
  if (error) {
    if (isUniqueViolation(error)) {
      return fail(res, 'user_already_linked', 'This sign-in account is already linked to another member.');
    }
    throw error;
  }

  // Also enforce unique on user_id — upsert by member_id may leave a stale user_id conflict
  const { data: checkUser } = await supabase
    .from('user_member_links')
    .select('member_id')
    .eq('user_id', parsed.userId)
    .neq('member_id', parsed.memberId)
    .in('status', ['proposed', 'verified'])
    .maybeSingle();
  if (checkUser) {
    await supabase.from('user_member_links').delete().eq('member_id', parsed.memberId);
    return fail(res, 'user_already_linked', 'This sign-in account is already linked to another member.');
  }

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Identity Link Proposed',
    details: {
      memberId: parsed.memberId,
      userId: parsed.userId,
      linkMethod: parsed.linkMethod,
      status: 'proposed',
    },
    resourceType: 'user_member_links',
    resourceId: parsed.memberId,
    severity: 'info',
    req,
  });

  return reloadFamily(res, supabase, parsed.memberId, { action: 'link-propose' });
}

async function linkVerify(req: any, res: any, supabase: any, actorId: string, memberId: string) {
  const { data: link } = await supabase
    .from('user_member_links')
    .select('user_id, status, link_method')
    .eq('member_id', memberId)
    .maybeSingle();
  if (!link) return fail(res, 'link_not_found', 'No identity link found for this member.');

  // MVP: verification is status=verified + linked_by/linked_at (no verified_* columns on UML).
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('user_member_links')
    .update({
      status: 'verified',
      linked_by: actorId,
      linked_at: now,
    })
    .eq('member_id', memberId);
  if (error) {
    if (isUniqueViolation(error)) {
      return fail(res, 'user_already_linked', 'This sign-in account is already linked to another member.');
    }
    throw error;
  }

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Identity Link Verified',
    details: {
      memberId,
      userId: link.user_id,
      priorStatus: link.status,
      newStatus: 'verified',
      linkMethod: link.link_method,
    },
    resourceType: 'user_member_links',
    resourceId: memberId,
    severity: 'info',
    req,
  });

  return reloadFamily(res, supabase, memberId, { action: 'link-verify' });
}

async function linkRevoke(req: any, res: any, supabase: any, actorId: string, memberId: string) {
  const { data: link } = await supabase
    .from('user_member_links')
    .select('user_id, status')
    .eq('member_id', memberId)
    .maybeSingle();
  if (!link) return fail(res, 'link_not_found', 'No identity link found for this member.');

  // Soft revoke via status only; actor/time recorded on linked_* + audit_logs (no revoked_at).
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('user_member_links')
    .update({
      status: 'revoked',
      linked_by: actorId,
      linked_at: now,
    })
    .eq('member_id', memberId);
  if (error) throw error;

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Identity Link Revoked',
    details: {
      memberId,
      userId: link.user_id,
      priorStatus: link.status,
      newStatus: 'revoked',
    },
    resourceType: 'user_member_links',
    resourceId: memberId,
    severity: 'warning',
    req,
  });

  return reloadFamily(res, supabase, memberId, { action: 'link-revoke' });
}

async function householdAdd(
  req: any,
  res: any,
  supabase: any,
  actorId: string,
  parsed: {
    memberId: string;
    householdId: string;
    relationshipType: string;
    contextMemberId?: string;
  }
) {
  const { data: member } = await supabase.from('members').select('id').eq('id', parsed.memberId).maybeSingle();
  if (!member?.id) return fail(res, 'member_not_found', 'Member not found.');

  const { data: hh } = await supabase.from('households').select('id').eq('id', parsed.householdId).maybeSingle();
  if (!hh?.id) return fail(res, 'household_not_found', 'Household not found.');

  const { data: active } = await supabase
    .from('household_members')
    .select('id, household_id')
    .eq('member_id', parsed.memberId)
    .eq('status', 'active')
    .maybeSingle();
  if (active && active.household_id !== parsed.householdId) {
    return fail(
      res,
      'conflict',
      'Member already has an active household membership. Inactivate it before adding to another household.'
    );
  }

  const row = {
    household_id: parsed.householdId,
    member_id: parsed.memberId,
    relationship_type: parsed.relationshipType,
    status: 'active',
    created_by: actorId,
  };

  const { error } = await supabase.from('household_members').upsert(row, {
    onConflict: 'household_id,member_id',
  });
  if (error) {
    if (isUniqueViolation(error)) {
      return fail(res, 'conflict', 'Household membership conflict.');
    }
    throw error;
  }

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Household Membership Added',
    details: {
      memberId: parsed.memberId,
      householdId: parsed.householdId,
      relationshipType: parsed.relationshipType,
      contextMemberId: parsed.contextMemberId || null,
    },
    resourceType: 'household_members',
    resourceId: parsed.memberId,
    severity: 'info',
    req,
  });

  const reloadId = parsed.contextMemberId || parsed.memberId;
  return reloadFamily(res, supabase, reloadId, { action: 'household-add' });
}

/**
 * Staff-only suggestions from legacy directory household (household_id / household_name).
 * Never auto-inserts. JSON children are not returned — only real members rows.
 */
async function suggestDirectoryHouseholdMembers(res: any, supabase: any, memberId: string) {
  const { data: member, error: mErr } = await supabase
    .from('members')
    .select('id, household_id, household_name, status')
    .eq('id', memberId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!member?.id) return fail(res, 'member_not_found', 'Member not found.');

  const legacyId = typeof member.household_id === 'string' ? member.household_id.trim() : '';
  const legacyName = typeof member.household_name === 'string' ? member.household_name.trim() : '';
  if (!legacyId && !legacyName) {
    return res.status(200).json({
      ok: true,
      action: 'suggest-directory-household-members',
      results: [],
      note: 'no_legacy_directory_household',
    });
  }

  let peersQuery = supabase
    .from('members')
    .select('id, first_name, last_name, status, email, avatar_url')
    .neq('id', memberId)
    .limit(40);
  if (legacyId && asUuid(legacyId)) {
    peersQuery = peersQuery.eq('household_id', legacyId);
  } else if (legacyName) {
    peersQuery = peersQuery.eq('household_name', legacyName);
  } else {
    return res.status(200).json({
      ok: true,
      action: 'suggest-directory-household-members',
      results: [],
      note: 'no_legacy_directory_household',
    });
  }
  const { data: peers, error: pErr } = await peersQuery;
  if (pErr) throw pErr;

  const { data: structured } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .maybeSingle();

  let structuredMemberIds = new Set<string>();
  if (structured?.household_id) {
    const { data: roster } = await supabase
      .from('household_members')
      .select('member_id')
      .eq('household_id', structured.household_id)
      .eq('status', 'active');
    structuredMemberIds = new Set((roster || []).map((r: any) => String(r.member_id)));
  }

  const results = (peers || []).map((m: any) => ({
    id: m.id,
    displayName: displayNameFromMember(m),
    status: m.status || null,
    alreadyInStructuredHousehold: structuredMemberIds.has(String(m.id)),
  }));

  return res.status(200).json({
    ok: true,
    action: 'suggest-directory-household-members',
    results,
    legacyHouseholdName: legacyName || null,
  });
}

async function householdUpdate(
  req: any,
  res: any,
  supabase: any,
  actorId: string,
  parsed: { membershipId: string; relationshipType?: string; status?: 'active' | 'inactive' }
) {
  const { data: existing } = await supabase
    .from('household_members')
    .select('id, member_id, household_id, relationship_type, status')
    .eq('id', parsed.membershipId)
    .maybeSingle();
  if (!existing) return fail(res, 'household_not_found', 'Household membership not found.');

  const patch: Record<string, unknown> = {};
  if (parsed.relationshipType != null) patch.relationship_type = parsed.relationshipType;
  if (parsed.status != null) patch.status = parsed.status;

  const { error } = await supabase.from('household_members').update(patch).eq('id', parsed.membershipId);
  if (error) throw error;

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Household Membership Updated',
    details: {
      membershipId: parsed.membershipId,
      memberId: existing.member_id,
      householdId: existing.household_id,
      patch,
    },
    resourceType: 'household_members',
    resourceId: existing.member_id,
    severity: 'info',
    req,
  });

  return reloadFamily(res, supabase, existing.member_id, { action: 'household-update' });
}

async function householdInactivate(req: any, res: any, supabase: any, actorId: string, membershipId: string) {
  const { data: existing } = await supabase
    .from('household_members')
    .select('id, member_id, household_id, status')
    .eq('id', membershipId)
    .maybeSingle();
  if (!existing) return fail(res, 'household_not_found', 'Household membership not found.');

  // Soft-warn: active guardian edges for this member are independent — return warning flag
  const { data: activeGuardians } = await supabase
    .from('guardian_relationships')
    .select('id')
    .eq('child_member_id', existing.member_id)
    .eq('status', 'active')
    .limit(1);

  const { error } = await supabase
    .from('household_members')
    .update({ status: 'inactive' })
    .eq('id', membershipId);
  if (error) throw error;

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Household Membership Inactivated',
    details: {
      membershipId,
      memberId: existing.member_id,
      householdId: existing.household_id,
      hadActiveGuardian: Boolean(activeGuardians?.length),
    },
    resourceType: 'household_members',
    resourceId: existing.member_id,
    severity: 'warning',
    req,
  });

  return reloadFamily(res, supabase, existing.member_id, {
    action: 'household-inactivate',
    warningActiveGuardian: Boolean(activeGuardians?.length),
  });
}

async function guardianCreate(
  req: any,
  res: any,
  supabase: any,
  actorId: string,
  parsed: {
    guardianUserId: string;
    childMemberId: string;
    relationshipType: string;
    canViewCard: boolean;
    canCheckIn: boolean;
    canCheckOut: boolean;
  }
) {
  const { data: child } = await supabase.from('members').select('id').eq('id', parsed.childMemberId).maybeSingle();
  if (!child?.id) return fail(res, 'member_not_found', 'Child member not found.');

  const { data: guardianUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', parsed.guardianUserId)
    .maybeSingle();
  if (!guardianUser?.id) return fail(res, 'user_not_found', 'Guardian sign-in account not found.');

  const { data: guardianLink } = await supabase
    .from('user_member_links')
    .select('status')
    .eq('user_id', parsed.guardianUserId)
    .eq('status', 'verified')
    .maybeSingle();
  if (!guardianLink) {
    return fail(
      res,
      'link_not_verified',
      'Guardian must have a verified identity link before creating guardian access.'
    );
  }
  const { data: guardianMemberLink } = await supabase
    .from('user_member_links')
    .select('member_id')
    .eq('user_id', parsed.guardianUserId)
    .eq('status', 'verified')
    .maybeSingle();
  if (guardianMemberLink?.member_id && String(guardianMemberLink.member_id) === String(parsed.childMemberId)) {
    return fail(
      res,
      'invalid_action',
      'Cannot grant a child Family Pass to the same person as the guardian. Open each child member record instead.'
    );
  }


  const { data: existing } = await supabase
    .from('guardian_relationships')
    .select('id, status')
    .eq('guardian_user_id', parsed.guardianUserId)
    .eq('child_member_id', parsed.childMemberId)
    .maybeSingle();
  if (existing && existing.status === 'active') {
    return fail(res, 'guardian_already_exists', 'An active guardian relationship already exists.');
  }

  const now = new Date().toISOString();
  // Live schema: verified_by/verified_at only — no created_by/revoked_at on guardian_relationships.
  const row = {
    guardian_user_id: parsed.guardianUserId,
    child_member_id: parsed.childMemberId,
    relationship_type: parsed.relationshipType,
    can_view_card: parsed.canViewCard,
    can_check_in: parsed.canCheckIn,
    can_check_out: parsed.canCheckOut,
    status: 'active',
    verified_by: actorId,
    verified_at: now,
  };

  let resultId: string | null = existing?.id || null;
  if (existing) {
    const { data, error } = await supabase
      .from('guardian_relationships')
      .update(row)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw error;
    resultId = data.id;
  } else {
    const { data, error } = await supabase.from('guardian_relationships').insert(row).select('id').single();
    if (error) {
      if (isUniqueViolation(error)) {
        return fail(res, 'guardian_already_exists', 'An active guardian relationship already exists.');
      }
      throw error;
    }
    resultId = data.id;
  }

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Guardian Relationship Created',
    details: {
      guardianId: resultId,
      guardianUserId: parsed.guardianUserId,
      childMemberId: parsed.childMemberId,
      relationshipType: parsed.relationshipType,
      canViewCard: parsed.canViewCard,
      canCheckIn: parsed.canCheckIn,
      canCheckOut: parsed.canCheckOut,
    },
    resourceType: 'guardian_relationships',
    resourceId: parsed.childMemberId,
    severity: 'info',
    req,
  });

  return reloadFamily(res, supabase, parsed.childMemberId, { action: 'guardian-create' });
}

async function guardianUpdate(
  req: any,
  res: any,
  supabase: any,
  actorId: string,
  parsed: {
    guardianId: string;
    relationshipType?: string;
    canViewCard?: boolean;
    canCheckIn?: boolean;
    canCheckOut?: boolean;
  }
) {
  const { data: existing } = await supabase
    .from('guardian_relationships')
    .select(
      'id, guardian_user_id, child_member_id, relationship_type, can_view_card, can_check_in, can_check_out, status'
    )
    .eq('id', parsed.guardianId)
    .maybeSingle();
  if (!existing) return fail(res, 'guardian_not_found', 'Guardian relationship not found.');

  const prior = {
    canViewCard: Boolean(existing.can_view_card),
    canCheckIn: Boolean(existing.can_check_in),
    canCheckOut: Boolean(existing.can_check_out),
  };
  const next = {
    canViewCard: parsed.canViewCard != null ? parsed.canViewCard : prior.canViewCard,
    canCheckIn: parsed.canCheckIn != null ? parsed.canCheckIn : prior.canCheckIn,
    canCheckOut: parsed.canCheckOut != null ? parsed.canCheckOut : prior.canCheckOut,
  };

  // Permission/relationship edits do NOT refresh verified_by/verified_at; actor is audit_logs only.
  const patch: Record<string, unknown> = {};
  if (parsed.relationshipType != null) patch.relationship_type = parsed.relationshipType;
  if (parsed.canViewCard != null) patch.can_view_card = parsed.canViewCard;
  if (parsed.canCheckIn != null) patch.can_check_in = parsed.canCheckIn;
  if (parsed.canCheckOut != null) patch.can_check_out = parsed.canCheckOut;

  const { error } = await supabase.from('guardian_relationships').update(patch).eq('id', parsed.guardianId);
  if (error) throw error;

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Guardian Relationship Updated',
    details: {
      guardianId: parsed.guardianId,
      childMemberId: existing.child_member_id,
      guardianUserId: existing.guardian_user_id,
      permissionDiff: guardianPermissionDiff(prior, next),
      relationshipType: parsed.relationshipType ?? existing.relationship_type,
    },
    resourceType: 'guardian_relationships',
    resourceId: existing.child_member_id,
    severity: 'info',
    req,
  });

  return reloadFamily(res, supabase, existing.child_member_id, { action: 'guardian-update' });
}

async function guardianRevoke(req: any, res: any, supabase: any, actorId: string, guardianId: string) {
  const { data: existing } = await supabase
    .from('guardian_relationships')
    .select('id, guardian_user_id, child_member_id, status')
    .eq('id', guardianId)
    .maybeSingle();
  if (!existing) return fail(res, 'guardian_not_found', 'Guardian relationship not found.');

  // Soft revoke via status only (no revoked_at column). Actor/time via audit_logs.
  const { error } = await supabase
    .from('guardian_relationships')
    .update({ status: 'revoked' })
    .eq('id', guardianId);
  if (error) throw error;

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Guardian Relationship Revoked',
    details: {
      guardianId,
      childMemberId: existing.child_member_id,
      guardianUserId: existing.guardian_user_id,
      priorStatus: existing.status,
    },
    resourceType: 'guardian_relationships',
    resourceId: existing.child_member_id,
    severity: 'warning',
    req,
  });

  return reloadFamily(res, supabase, existing.child_member_id, { action: 'guardian-revoke' });
}

async function guardianReactivate(req: any, res: any, supabase: any, actorId: string, guardianId: string) {
  const { data: existing } = await supabase
    .from('guardian_relationships')
    .select(
      'id, guardian_user_id, child_member_id, status, can_view_card, can_check_in, can_check_out, relationship_type'
    )
    .eq('id', guardianId)
    .maybeSingle();
  if (!existing) return fail(res, 'guardian_not_found', 'Guardian relationship not found.');

  // Reactivation is a fresh authorization decision — refresh verified_*; keep permission flags.
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('guardian_relationships')
    .update({
      status: 'active',
      verified_by: actorId,
      verified_at: now,
    })
    .eq('id', guardianId);
  if (error) throw error;

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Guardian Relationship Reactivated',
    details: {
      guardianId,
      childMemberId: existing.child_member_id,
      guardianUserId: existing.guardian_user_id,
      canViewCard: Boolean(existing.can_view_card),
      canCheckIn: Boolean(existing.can_check_in),
      canCheckOut: Boolean(existing.can_check_out),
      relationshipType: existing.relationship_type,
    },
    resourceType: 'guardian_relationships',
    resourceId: existing.child_member_id,
    severity: 'warning',
    req,
  });

  return reloadFamily(res, supabase, existing.child_member_id, { action: 'guardian-reactivate' });
}

async function enableHouseholdChildCards(
  req: any,
  res: any,
  supabase: any,
  actorId: string,
  memberId: string
) {
  const { data: link } = await supabase
    .from('user_member_links')
    .select('user_id, status')
    .eq('member_id', memberId)
    .eq('status', 'verified')
    .maybeSingle();
  if (!link?.user_id) {
    return fail(
      res,
      'link_not_verified',
      'This member needs a verified Connect sign-in link before Family cards can be enabled.'
    );
  }

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, status')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership?.household_id) {
    return fail(res, 'household_not_found', 'Add this person to a structured household first.');
  }

  const { data: kids, error: kidsErr } = await supabase
    .from('household_members')
    .select('member_id, relationship_type, status')
    .eq('household_id', membership.household_id)
    .eq('status', 'active')
    .in('relationship_type', ['child', 'dependent']);
  if (kidsErr) throw kidsErr;

  const childIds = (kids || [])
    .map((k: any) => String(k.member_id))
    .filter((id: string) => id && id !== String(memberId));

  if (!childIds.length) {
    return fail(
      res,
      'member_not_found',
      'No children/dependents on this household yet. Add each child in Step 3 first.'
    );
  }

  const now = new Date().toISOString();
  let enabled = 0;
  for (const childMemberId of childIds) {
    const row = {
      guardian_user_id: link.user_id,
      child_member_id: childMemberId,
      relationship_type: 'parent',
      can_view_card: true,
      can_check_in: true,
      can_check_out: true,
      status: 'active',
      verified_by: actorId,
      verified_at: now,
    };
    const { data: existing } = await supabase
      .from('guardian_relationships')
      .select('id, status')
      .eq('guardian_user_id', link.user_id)
      .eq('child_member_id', childMemberId)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from('guardian_relationships').update(row).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('guardian_relationships').insert(row);
      if (error) throw error;
    }
    enabled += 1;
  }

  // Soft-revoke mistaken self child-card edges for this login.
  await supabase
    .from('guardian_relationships')
    .update({ status: 'revoked' })
    .eq('guardian_user_id', link.user_id)
    .eq('child_member_id', memberId)
    .eq('status', 'active');

  const logAudit = await getAudit();
  await logAudit({
    userId: actorId,
    action: 'Family Household Child Cards Enabled',
    details: {
      parentMemberId: memberId,
      guardianUserId: link.user_id,
      childCount: enabled,
      childMemberIds: childIds,
    },
    resourceType: 'guardian_relationships',
    resourceId: memberId,
    severity: 'info',
    req,
  });

  return reloadFamily(res, supabase, memberId, {
    action: 'enable-household-child-cards',
    enabledCount: enabled,
  });
}

