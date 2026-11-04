/**
 * Family Huddle access — resolve verified adult household membership server-side.
 * Never trust client householdId. Children/dependents are not LiveKit participants.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHILD_RELS = new Set(['child', 'dependent']);

export const FAMILY_INVITE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
export const FAMILY_INVITE_MAX_USES = 10;
export const FAMILY_GUEST_NAME_MAX = 40;

export type AdultHouseholdContext = {
  householdId: string;
  householdName: string | null;
  displayName: string;
  memberId: string;
  userId: string;
};

export type AdultHouseholdResult =
  | { ok: true; ctx: AdultHouseholdContext }
  | {
      ok: false;
      status: number;
      code: 'unlinked' | 'conflict' | 'not_adult' | 'empty' | 'unavailable';
      error: string;
    };

/**
 * Resolve the caller's single active household + adult membership.
 * Mirrors get_my_family_summary adult rules (excludes child/dependent labels).
 */
export async function resolveAdultHouseholdForUser(
  supabase: SupabaseClient,
  authUserId: string
): Promise<AdultHouseholdResult> {
  const userId = String(authUserId || '').trim();
  if (!userId || !UUID_RE.test(userId)) {
    return {
      ok: false,
      status: 401,
      code: 'unlinked',
      error: 'Please sign in again.',
    };
  }

  const { data: link, error: linkErr } = await supabase
    .from('user_member_links')
    .select('member_id, status')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .maybeSingle();

  if (linkErr) {
    console.warn('[family-huddle] user_member_links', linkErr.message);
    return {
      ok: false,
      status: 503,
      code: 'unavailable',
      error: 'Family is temporarily unavailable.',
    };
  }
  if (!link?.member_id) {
    return {
      ok: false,
      status: 403,
      code: 'unlinked',
      error: 'Link your member profile before starting a Family Huddle.',
    };
  }

  const memberId = String(link.member_id);

  const { data: memberships, error: hmErr } = await supabase
    .from('household_members')
    .select('household_id, relationship_type, status')
    .eq('member_id', memberId)
    .eq('status', 'active');

  if (hmErr) {
    console.warn('[family-huddle] household_members', hmErr.message);
    return {
      ok: false,
      status: 503,
      code: 'unavailable',
      error: 'Family is temporarily unavailable.',
    };
  }

  const rows = memberships || [];
  if (rows.length === 0) {
    return {
      ok: false,
      status: 403,
      code: 'empty',
      error: 'No household is on file for Family Huddle yet.',
    };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      status: 403,
      code: 'conflict',
      error: 'Multiple households are linked. Contact the church office to fix this before using Family Huddle.',
    };
  }

  const row = rows[0];
  const rel = String(row.relationship_type || 'other').toLowerCase();
  if (CHILD_RELS.has(rel)) {
    return {
      ok: false,
      status: 403,
      code: 'not_adult',
      error: 'Family Huddle is for household adults only in this version.',
    };
  }

  const householdId = String(row.household_id || '');
  if (!householdId || !UUID_RE.test(householdId)) {
    return {
      ok: false,
      status: 503,
      code: 'unavailable',
      error: 'Family is temporarily unavailable.',
    };
  }

  const { data: household } = await supabase
    .from('households')
    .select('id, name')
    .eq('id', householdId)
    .maybeSingle();

  const { data: userRow } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId)
    .maybeSingle();

  const { data: memberRow } = await supabase
    .from('members')
    .select('first_name, last_name, preferred_name')
    .eq('id', memberId)
    .maybeSingle();

  const displayName =
    String(userRow?.name || '').trim() ||
    [memberRow?.preferred_name || memberRow?.first_name, memberRow?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'Family member';

  return {
    ok: true,
    ctx: {
      householdId,
      householdName: household?.name ? String(household.name) : null,
      displayName,
      memberId,
      userId,
    },
  };
}

export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(String(rawToken || ''), 'utf8').digest('hex');
}

export function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export function sanitizeGuestDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t || t.length > FAMILY_GUEST_NAME_MAX) return null;
  if (/[\u0000-\u001f\u007f]/.test(t)) return null;
  return t;
}

export function buildGuestIdentity(inviteId: string): string {
  const id = String(inviteId || '').trim();
  const suffix = randomBytes(4).toString('hex');
  return `guest:${id}:${suffix}`;
}

/** Vault hash-router guest join. Never include householdId. */
export function vaultFamilyHuddleJoinPath(rawToken: string): string {
  return `/#/family/huddle/join?code=${encodeURIComponent(String(rawToken || '').trim())}`;
}

export type FamilySummaryPerson = {
  membershipId: string;
  displayName: string;
  relationship: string | null;
  /** Extra row for the signed-in person, or a repeated name. Safe to remove. */
  duplicate: boolean;
};

export type FamilyHuddleSummary = {
  householdName: string | null;
  self: { displayName: string };
  adults: FamilySummaryPerson[];
  dependents: FamilySummaryPerson[];
};

export function personDisplayName(row: {
  preferred_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return (
    [row.preferred_name || row.first_name, row.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Family member'
  );
}

function namesMatch(leftRaw: string, rightRaw: string): boolean {
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const left = norm(leftRaw);
  const right = norm(rightRaw);
  if (!left || !right || left === 'family member') return false;
  if (left === right) return true;
  const leftFirst = left.split(' ')[0];
  const rightFirst = right.split(' ')[0];
  return left === rightFirst || right === leftFirst;
}

/**
 * Roster for My Family. Household id stays on the server.
 * membershipId lets the signed-in adult remove someone from this household only.
 */
export async function buildSanitizedFamilySummary(
  supabase: SupabaseClient,
  ctx: AdultHouseholdContext
): Promise<FamilyHuddleSummary> {
  const { data: rows } = await supabase
    .from('household_members')
    .select('id, member_id, relationship_type, status')
    .eq('household_id', ctx.householdId)
    .eq('status', 'active');

  const active = (rows || []).filter((row) => {
    const memberId = String(row.member_id || '');
    return memberId && memberId !== ctx.memberId && row.id;
  });
  const memberIds = Array.from(new Set(active.map((row) => String(row.member_id))));
  const { data: memberRows } = memberIds.length
    ? await supabase
        .from('members')
        .select('id, first_name, last_name, preferred_name')
        .in('id', memberIds)
    : { data: [] };
  const byMember = new Map((memberRows || []).map((member) => [String(member.id), member]));

  const adults: FamilySummaryPerson[] = [];
  const dependents: FamilySummaryPerson[] = [];
  const seenMembers = new Set<string>();
  const seenNames = new Set<string>();

  for (const row of active) {
    const memberId = String(row.member_id);
    if (seenMembers.has(memberId)) continue;
    seenMembers.add(memberId);
    const member = byMember.get(memberId);
    const displayName = member ? personDisplayName(member) : 'Family member';
    const relationship = row.relationship_type ? String(row.relationship_type) : null;
    const rel = String(relationship || 'other').toLowerCase();
    const nameKey = displayName.trim().toLowerCase();
    const duplicate =
      rel === 'self' || namesMatch(displayName, ctx.displayName) || seenNames.has(nameKey);
    seenNames.add(nameKey);
    const person: FamilySummaryPerson = {
      membershipId: String(row.id),
      displayName,
      relationship,
      duplicate,
    };
    if (CHILD_RELS.has(rel)) dependents.push(person);
    else adults.push(person);
  }

  return {
    householdName: ctx.householdName,
    self: { displayName: ctx.displayName },
    adults,
    dependents,
  };
}

const ADDABLE_ADULT_RELS = new Set(['spouse', 'partner', 'parent', 'relative', 'guardian', 'other']);

const OPTIONAL_PERSON_COLUMNS = [
  'household_id',
  'household_name',
  'access_code',
  'role',
  'children',
  'email',
  'phone',
  'birthday',
] as const;

/** Desk codes on members.access_code are 4 digits (varchar(4)). */
function freshAccessCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** Household person with no login. Drops a column the live members table rejects and tries again. */
export async function insertHouseholdPerson(
  supabase: SupabaseClient,
  input: {
    firstName: string;
    lastName: string;
    role: string;
    householdId?: string | null;
    householdName?: string | null;
    birthday?: string | null;
  }
): Promise<
  { ok: true; id: string; firstName: string; lastName: string } | { ok: false; error: string }
> {
  const row: Record<string, unknown> = {
    first_name: String(input.firstName || '').trim().slice(0, 80),
    last_name: String(input.lastName || '').trim().slice(0, 80),
    status: 'Active',
    children: [],
    email: null,
    phone: null,
    role: input.role || 'Member',
    access_code: freshAccessCode(),
  };
  if (input.householdId) row.household_id = input.householdId;
  if (input.householdName) row.household_name = input.householdName;
  if (input.birthday) row.birthday = input.birthday;
  if (!row.first_name) return { ok: false, error: 'Enter a first and last name.' };

  let lastMessage = '';
  for (let attempt = 0; attempt < OPTIONAL_PERSON_COLUMNS.length + 1; attempt += 1) {
    const { data, error } = await supabase
      .from('members')
      .insert(row)
      .select('id, first_name, last_name')
      .single();
    if (!error && data?.id) {
      return {
        ok: true,
        id: String(data.id),
        firstName: String(data.first_name || row.first_name || ''),
        lastName: String(data.last_name || row.last_name || ''),
      };
    }
    lastMessage = String(error?.message || '');
    const codeTooLong =
      typeof row.access_code === 'string' &&
      row.access_code.length > 4 &&
      /character varying\(4\)|value too long/i.test(lastMessage);
    if (codeTooLong || (/access_code/i.test(lastMessage) && /duplicate|unique/i.test(lastMessage))) {
      row.access_code = freshAccessCode();
      continue;
    }
    const dropped = OPTIONAL_PERSON_COLUMNS.find(
      (column) => column in row && new RegExp(column, 'i').test(lastMessage)
    );
    if (!dropped) break;
    delete row[dropped];
  }
  console.error('[family] insert household person', lastMessage);
  return { ok: false, error: 'Could not add that family member.' };
}

export async function addHouseholdAdult(
  supabase: SupabaseClient,
  ctx: AdultHouseholdContext,
  input: { fullName: string; relationship: string }
): Promise<{ ok: true; summary: FamilyHuddleSummary } | { ok: false; status: number; error: string }> {
  const relationship = String(input.relationship || 'other').trim().toLowerCase();
  if (!ADDABLE_ADULT_RELS.has(relationship)) {
    return { ok: false, status: 400, error: 'Choose spouse or another adult relationship.' };
  }
  const parts = String(input.fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = (parts[0] || '').slice(0, 80);
  const lastName = parts.slice(1).join(' ').slice(0, 80);
  if (!firstName) return { ok: false, status: 400, error: 'Enter a first and last name.' };

  const created = await insertHouseholdPerson(supabase, {
    firstName,
    lastName,
    role: 'Member',
    householdId: ctx.householdId,
    householdName: ctx.householdName,
  });
  if (!created.ok) {
    return { ok: false, status: 500, error: created.error };
  }

  const { error: edgeErr } = await supabase.from('household_members').upsert(
    {
      household_id: ctx.householdId,
      member_id: created.id,
      relationship_type: relationship,
      status: 'active',
      created_by: ctx.userId,
    },
    { onConflict: 'household_id,member_id' }
  );
  if (edgeErr) {
    console.error('[family] add adult edge', edgeErr.message);
    return { ok: false, status: 500, error: 'That person was created, but the household link failed.' };
  }

  return { ok: true, summary: await buildSanitizedFamilySummary(supabase, ctx) };
}

export async function removeHouseholdMember(
  supabase: SupabaseClient,
  ctx: AdultHouseholdContext,
  membershipId: string
): Promise<{ ok: true; summary: FamilyHuddleSummary } | { ok: false; status: number; error: string }> {
  const id = String(membershipId || '').trim();
  if (!UUID_RE.test(id)) return { ok: false, status: 400, error: 'Choose a family member to remove.' };

  const { data: edge } = await supabase
    .from('household_members')
    .select('id, member_id, relationship_type, status')
    .eq('id', id)
    .eq('household_id', ctx.householdId)
    .maybeSingle();
  if (!edge || String(edge.status || '') !== 'active') {
    return { ok: false, status: 404, error: 'That person is not in your household.' };
  }
  if (String(edge.member_id) === ctx.memberId) {
    return { ok: false, status: 400, error: 'You stay on your own household.' };
  }

  const { error } = await supabase.from('household_members').update({ status: 'inactive' }).eq('id', id);
  if (error) {
    console.error('[family] remove member', error.message);
    return { ok: false, status: 500, error: 'Could not remove that family member.' };
  }

  const memberId = String(edge.member_id);
  const rel = String(edge.relationship_type || '').toLowerCase();
  if (CHILD_RELS.has(rel)) {
    await supabase
      .from('guardian_relationships')
      .update({ status: 'revoked' })
      .eq('guardian_user_id', ctx.userId)
      .eq('child_member_id', memberId)
      .eq('status', 'active');
  }

  const { data: login } = await supabase
    .from('user_member_links')
    .select('user_id')
    .eq('member_id', memberId)
    .eq('status', 'verified')
    .maybeSingle();
  if (!login?.user_id) {
    await supabase.from('members').update({ status: 'Inactive' }).eq('id', memberId);
  }

  return { ok: true, summary: await buildSanitizedFamilySummary(supabase, ctx) };
}
