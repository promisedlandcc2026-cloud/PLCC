/**
 * Signed-in household for the church profile.
 * GET  /api/vault?resource=people&subResource=member-household
 * PATCH name and address
 * POST  add a family member
 * PATCH ?memberId= update a family member's name, role, and age
 * Never returns email, phone, or access codes.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';

function ageFromBirthday(value: string | null | undefined): number | undefined {
  const iso = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  // 1904 = birthday saved without a year (adults enter month & day only) — age unknown.
  if (iso.startsWith('1904-')) return undefined;
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return undefined;
  const asOf = new Date();
  let age = asOf.getFullYear() - born.getFullYear();
  const month = asOf.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && asOf.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 120) return undefined;
  return age;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHILD_RELS = new Set(['child', 'dependent']);

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
}

function roleFromRelationship(rel: string): string {
  switch (rel) {
    case 'spouse':
    case 'partner':
      return 'Spouse';
    case 'child':
      return 'Child';
    case 'dependent':
      return 'Youth';
    case 'relative':
    case 'other':
      return 'Independent Member';
    default:
      return 'Head of Household';
  }
}

function relationshipFromRole(role: string): string {
  switch (role) {
    case 'Spouse':
      return 'spouse';
    case 'Child':
      return 'child';
    case 'Youth':
      return 'dependent';
    case 'Independent Member':
      return 'relative';
    default:
      return 'parent';
  }
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function displayName(row: { preferred_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  const preferred = String(row.preferred_name || '').trim();
  const legal = [row.first_name, row.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  return preferred || legal || 'Member';
}

async function linkedMemberId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_member_links')
    .select('member_id')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .maybeSingle();
  return data?.member_id ? String(data.member_id) : null;
}

async function householdForMember(supabase: any, memberId: string): Promise<{ id: string; relationship: string } | null> {
  const { data: rows } = await supabase
    .from('household_members')
    .select('household_id, relationship_type, status')
    .eq('member_id', memberId)
    .eq('status', 'active');
  const row = (rows || [])[0];
  if (row?.household_id) {
    return { id: String(row.household_id), relationship: String(row.relationship_type || 'other') };
  }
  const { data: member } = await supabase
    .from('members')
    .select('household_id')
    .eq('id', memberId)
    .maybeSingle();
  if (!member?.household_id) return null;
  return { id: String(member.household_id), relationship: 'parent' };
}

async function loadHousehold(supabase: any, householdId: string) {
  let query = await supabase.from('households').select('id, name, address').eq('id', householdId).maybeSingle();
  if (query.error && /address/i.test(String(query.error.message || ''))) {
    query = await supabase.from('households').select('id, name').eq('id', householdId).maybeSingle();
  }
  return query.data || null;
}

async function loadFamily(supabase: any, householdId: string, selfId: string) {
  const { data: links } = await supabase
    .from('household_members')
    .select('member_id, relationship_type, status')
    .eq('household_id', householdId)
    .eq('status', 'active');
  const relationshipById = new Map<string, string>();
  for (const link of links || []) {
    if (link?.member_id) relationshipById.set(String(link.member_id), String(link.relationship_type || 'other'));
  }
  if (!relationshipById.has(selfId)) relationshipById.set(selfId, 'parent');

  let membersQuery = await supabase
    .from('members')
    .select('id, first_name, last_name, preferred_name, birthday, avatar_url, household_id')
    .eq('household_id', householdId);
  if (membersQuery.error && /preferred_name/i.test(String(membersQuery.error.message || ''))) {
    membersQuery = await supabase
      .from('members')
      .select('id, first_name, last_name, birthday, avatar_url, household_id')
      .eq('household_id', householdId);
  }
  const seen = new Set<string>();
  const family = [];
  for (const row of membersQuery.data || []) {
    const id = String(row.id);
    seen.add(id);
    const birthday = String(row.birthday || '').slice(0, 10);
    family.push({
      id,
      displayName: displayName(row),
      firstName: String(row.first_name || '').trim(),
      lastName: String(row.last_name || '').trim(),
      householdRole: roleFromRelationship(relationshipById.get(id) || 'other'),
      age: ageFromBirthday(birthday),
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null,
      avatarUrl: String(row.avatar_url || '').trim() || null,
      isSelf: id === selfId,
    });
  }
  for (const [id, rel] of relationshipById) {
    if (seen.has(id)) continue;
    const { data: row } = await supabase
      .from('members')
      .select('id, first_name, last_name, preferred_name, birthday, avatar_url')
      .eq('id', id)
      .maybeSingle();
    if (!row) continue;
    const birthday = String(row.birthday || '').slice(0, 10);
    family.push({
      id,
      displayName: displayName(row),
      firstName: String(row.first_name || '').trim(),
      lastName: String(row.last_name || '').trim(),
      householdRole: roleFromRelationship(rel),
      age: ageFromBirthday(birthday),
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null,
      avatarUrl: String(row.avatar_url || '').trim() || null,
      isSelf: id === selfId,
    });
  }
  family.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return family;
}

function birthdayFromAge(age: number | undefined): string | null {
  if (age === undefined || !Number.isFinite(age) || age < 0 || age > 120) return null;
  const year = new Date().getUTCFullYear() - Math.floor(age);
  return `${year}-01-01`;
}

export async function handleMemberHousehold(req: any, res: any) {
  setNoStore(res);
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });
  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;

  const selfId = await linkedMemberId(supabase, auth.user.id);
  if (!selfId) {
    return res.status(200).json({ ok: true, linked: false, household: null, family: [] });
  }
  const place = await householdForMember(supabase, selfId);
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    if (!place) return res.status(200).json({ ok: true, linked: true, household: null, family: [] });
    const household = await loadHousehold(supabase, place.id);
    const family = await loadFamily(supabase, place.id, selfId);
    return res.status(200).json({
      ok: true,
      linked: true,
      household: household
        ? { id: String(household.id), name: String(household.name || ''), address: String(household.address || '') }
        : { id: place.id, name: '', address: '' },
      family,
    });
  }

  let householdPlace = place;
  if (!householdPlace && (method === 'PATCH' || method === 'POST')) {
    const { data: selfRow } = await supabase
      .from('members')
      .select('first_name, last_name, household_name')
      .eq('id', selfId)
      .maybeSingle();
    const createdName =
      String(req.body?.name || selfRow?.household_name || '').trim() ||
      `${displayName(selfRow || {})} Household`;
    let created = await supabase
      .from('households')
      .insert({ name: createdName.slice(0, 120), address: String(req.body?.address || '').trim() || null, user_id: auth.user.id })
      .select('id')
      .single();
    if (created.error && /address/i.test(String(created.error.message || ''))) {
      created = await supabase
        .from('households')
        .insert({ name: createdName.slice(0, 120), user_id: auth.user.id })
        .select('id')
        .single();
    }
    if (created.error || !created.data?.id) {
      console.error('[member-household] create:', created.error?.message);
      return res.status(502).json({ ok: false, error: 'Could not save the household.' });
    }
    const newId = String(created.data.id);
    await supabase.from('household_members').insert({
      household_id: newId,
      member_id: selfId,
      relationship_type: 'parent',
      status: 'active',
      created_by: auth.user.id,
    });
    await supabase.from('members').update({ household_id: newId, household_name: createdName.slice(0, 120) }).eq('id', selfId);
    householdPlace = { id: newId, relationship: 'parent' };
  }
  if (!householdPlace) {
    return res.status(404).json({ ok: false, error: 'No household is on file for this member yet.' });
  }
  if (CHILD_RELS.has(householdPlace.relationship)) {
    return res.status(403).json({ ok: false, error: 'A parent or guardian updates this household.' });
  }
  const placeId = householdPlace.id;

  if (method === 'PATCH' && !req.query?.memberId) {
    const name = req.body?.name !== undefined ? String(req.body.name || '').trim().slice(0, 120) : undefined;
    const address = req.body?.address !== undefined ? String(req.body.address || '').trim().slice(0, 180) : undefined;
    const patch: Record<string, string> = {};
    if (name) patch.name = name;
    if (address !== undefined) patch.address = address;
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'Nothing to update.' });
    let { error } = await supabase.from('households').update(patch).eq('id', placeId);
    if (error && patch.address !== undefined && /address/i.test(String(error.message || ''))) {
      delete patch.address;
      ({ error } = await supabase.from('households').update(patch).eq('id', placeId));
    }
    if (error) {
      console.error('[member-household] update:', error.message);
      return res.status(502).json({ ok: false, error: 'Could not save the household.' });
    }
    if (patch.name) {
      await supabase.from('members').update({ household_name: patch.name }).eq('household_id', placeId);
    }
    const household = await loadHousehold(supabase, placeId);
    return res.status(200).json({
      ok: true,
      household: {
        id: placeId,
        name: String(household?.name || patch.name || ''),
        address: String(household?.address || patch.address || ''),
      },
    });
  }

  if (method === 'POST' && UUID_RE.test(String(req.body?.existingMemberId || ''))) {
    const existingMemberId = String(req.body.existingMemberId);
    if (existingMemberId === selfId) {
      return res.status(400).json({ ok: false, error: 'You are already in this household.' });
    }
    const householdRole = String(req.body?.householdRole || 'Independent Member');
    const household = await loadHousehold(supabase, placeId);
    const householdName = String(household?.name || '').trim() || null;
    const { data: existingMember, error: existingErr } = await supabase
      .from('members')
      .select('id')
      .eq('id', existingMemberId)
      .maybeSingle();
    if (existingErr || !existingMember) {
      return res.status(404).json({ ok: false, error: 'That member could not be found.' });
    }
    const { error: moveErr } = await supabase
      .from('members')
      .update({ household_id: placeId, household_name: householdName })
      .eq('id', existingMemberId);
    if (moveErr && /household_id/i.test(String(moveErr.message || ''))) {
      await supabase.from('members').update({ household_name: householdName }).eq('id', existingMemberId);
    } else if (moveErr) {
      console.error('[member-household] attach:', moveErr.message);
      return res.status(502).json({ ok: false, error: 'Could not add that member to your household.' });
    }
    await supabase
      .from('household_members')
      .update({ status: 'inactive' })
      .eq('member_id', existingMemberId)
      .eq('status', 'active')
      .neq('household_id', placeId);
    const { data: link } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', placeId)
      .eq('member_id', existingMemberId)
      .maybeSingle();
    if (link?.id) {
      await supabase
        .from('household_members')
        .update({ relationship_type: relationshipFromRole(householdRole), status: 'active' })
        .eq('id', link.id);
    } else {
      await supabase.from('household_members').insert({
        household_id: placeId,
        member_id: existingMemberId,
        relationship_type: relationshipFromRole(householdRole),
        status: 'active',
        created_by: auth.user.id,
      });
    }
    return res.status(200).json({
      ok: true,
      memberId: existingMemberId,
      selfId,
      householdRole,
      household: {
        id: placeId,
        name: householdName || '',
        address: String(household?.address || ''),
      },
    });
  }

  if (method === 'POST') {
    const names = splitName(String(req.body?.fullName || ''));
    if (!names.firstName) return res.status(400).json({ ok: false, error: 'A name is required.' });
    const householdRole = String(req.body?.householdRole || 'Child');
    const age = req.body?.age === undefined || req.body?.age === '' ? undefined : Number(req.body.age);
    const household = await loadHousehold(supabase, placeId);
    const memberData: Record<string, unknown> = {
      first_name: names.firstName,
      last_name: names.lastName,
      preferred_name: String(req.body?.preferredName || '').trim() || null,
      status: 'Active',
      role: householdRole === 'Child' || householdRole === 'Youth' ? 'Child' : 'Member',
      household_id: placeId,
      household_name: household?.name || null,
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.birthday || '').slice(0, 10))
        ? String(req.body.birthday).slice(0, 10)
        : birthdayFromAge(Number.isFinite(age) ? age : undefined),
      email: null,
      phone: null,
    };
    let inserted = await supabase.from('members').insert(memberData).select('id').single();
    if (inserted.error && /preferred_name/i.test(String(inserted.error.message || ''))) {
      delete memberData.preferred_name;
      inserted = await supabase.from('members').insert(memberData).select('id').single();
    }
    if (inserted.error && /household_id/i.test(String(inserted.error.message || ''))) {
      delete memberData.household_id;
      inserted = await supabase.from('members').insert(memberData).select('id').single();
    }
    if (inserted.error || !inserted.data?.id) {
      console.error('[member-household] add:', inserted.error?.message);
      return res.status(502).json({ ok: false, error: 'Could not add that family member.' });
    }
    const memberId = String(inserted.data.id);
    await supabase.from('household_members').insert({
      household_id: placeId,
      member_id: memberId,
      relationship_type: relationshipFromRole(householdRole),
      status: 'active',
      created_by: auth.user.id,
    });
    return res.status(201).json({ ok: true, memberId });
  }

  if (method === 'PATCH') {
    const memberId = String(req.query?.memberId || '').trim();
    if (!UUID_RE.test(memberId)) return res.status(400).json({ ok: false, error: 'Member id is not valid.' });
    const family = await loadFamily(supabase, placeId, selfId);
    if (!family.some((person) => person.id === memberId)) {
      return res.status(403).json({ ok: false, error: 'That person is not in this household.' });
    }
    const names = req.body?.fullName ? splitName(String(req.body.fullName)) : null;
    const memberPatch: Record<string, unknown> = {};
    if (names?.firstName) {
      memberPatch.first_name = names.firstName;
      memberPatch.last_name = names.lastName;
    }
    if (req.body?.preferredName !== undefined) {
      memberPatch.preferred_name = String(req.body.preferredName || '').trim() || null;
    }
    const birthdayIso = String(req.body?.birthday || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(birthdayIso)) {
      memberPatch.birthday = birthdayIso;
    } else if (req.body?.age !== undefined && req.body?.age !== '') {
      const age = Number(req.body.age);
      if (Number.isFinite(age)) memberPatch.birthday = birthdayFromAge(age);
    }
    if (Object.keys(memberPatch).length) {
      let { error } = await supabase.from('members').update(memberPatch).eq('id', memberId);
      if (error && memberPatch.preferred_name !== undefined && /preferred_name/i.test(String(error.message || ''))) {
        delete memberPatch.preferred_name;
        ({ error } = await supabase.from('members').update(memberPatch).eq('id', memberId));
      }
      if (error) {
        console.error('[member-household] member:', error.message);
        return res.status(502).json({ ok: false, error: 'Could not update that family member.' });
      }
    }
    if (req.body?.householdRole) {
      await supabase
        .from('household_members')
        .update({ relationship_type: relationshipFromRole(String(req.body.householdRole)) })
        .eq('household_id', placeId)
        .eq('member_id', memberId);
    }
    return res.status(200).json({ ok: true, memberId });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
