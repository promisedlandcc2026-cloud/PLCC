/**
 * Parent self-serve dependents — resource=family&subResource=dependents
 * Creates Child members with no Auth/email/phone. Scoped to the caller's household.
 */
import { requireAuth, getSupabaseAdmin } from './auth.js';
import { getAudit } from './deps.js';
import { buildSanitizedFamilySummary, insertHouseholdPerson, personDisplayName, resolveAdultHouseholdForUser } from './familyHuddleAccess.js';
import { buildKidsView, normalizeKidsTheme, readKidsThemes } from './kidsViewData.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] || '').trim();
  return String(v || '').trim();
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    firstName: parts[0] || 'Child',
    lastName: parts.slice(1).join(' ') || '',
  };
}

/**
 * Household names are unique (members.household_name references them), so a second
 * "Smith Family" fails. Try "Smith Family", then "Smith Family (John)", then numbered.
 */
async function insertHouseholdWithFreeName(
  supabase: any,
  userId: string,
  baseName: string,
  firstName: string
): Promise<{ id: string; name: string } | null> {
  const names = [baseName];
  if (firstName) names.push(`${baseName} (${firstName})`);
  for (let i = 2; i <= 5; i++) names.push(`${baseName} ${i}`);
  for (const name of names) {
    const { data: hh, error } = await supabase
      .from('households')
      .insert({ name, user_id: userId })
      .select('id, name')
      .single();
    if (hh?.id) return { id: String(hh.id), name: String(hh.name || name) };
    if (error?.code !== '23505') {
      console.warn('[parent-dependents] create household', error?.message);
      return null;
    }
  }
  console.warn('[parent-dependents] create household: no free name for', baseName);
  return null;
}

type ParentCtx = {
  userId: string;
  memberId: string;
  householdId: string;
  householdName: string | null;
  displayName: string;
  parentFirst: string;
  parentLast: string;
};

async function ensureParentContext(supabase: any, userId: string): Promise<
  | { ok: true; ctx: ParentCtx }
  | { ok: false; status: number; code: string; error: string }
> {
  // Prefer existing adult household resolution
  const existing = await resolveAdultHouseholdForUser(supabase, userId);
  if (existing.ok) {
    const { data: parent } = await supabase
      .from('members')
      .select('id, first_name, last_name, children')
      .eq('id', existing.ctx.memberId)
      .maybeSingle();
    return {
      ok: true,
      ctx: {
        userId: existing.ctx.userId,
        memberId: existing.ctx.memberId,
        householdId: existing.ctx.householdId,
        householdName: existing.ctx.householdName,
        displayName: existing.ctx.displayName,
        parentFirst: String(parent?.first_name || ''),
        parentLast: String(parent?.last_name || ''),
      },
    };
  }

  // Bootstrap: verified link + create household when missing
  let memberId: string | null = null;

  const { data: link } = await supabase
    .from('user_member_links')
    .select('member_id, status')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .maybeSingle();

  if (link?.member_id) {
    memberId = String(link.member_id);
  } else {
    // Same-UUID directory row (common after signup/onboarding) → verified self-link
    const { data: selfMember } = await supabase
      .from('members')
      .select('id, first_name, last_name, status, role')
      .eq('id', userId)
      .maybeSingle();
    if (!selfMember?.id) {
      return {
        ok: false,
        status: 403,
        code: 'unlinked',
        error:
          'Link your member profile before adding children. Finish onboarding or ask staff to verify your identity.',
      };
    }
    const now = new Date().toISOString();
    const { error: linkErr } = await supabase.from('user_member_links').upsert(
      {
        user_id: userId,
        member_id: selfMember.id,
        status: 'verified',
        link_method: 'same_uuid',
        linked_by: userId,
        linked_at: now,
      },
      { onConflict: 'member_id' }
    );
    if (linkErr) {
      console.warn('[parent-dependents] self-link', linkErr.message);
      return {
        ok: false,
        status: 503,
        code: 'unavailable',
        error: 'Could not verify your member profile. Please try again or ask staff.',
      };
    }
    memberId = String(selfMember.id);
  }

  const { data: parent } = await supabase
    .from('members')
    .select('id, first_name, last_name, children, household_id, household_name')
    .eq('id', memberId)
    .maybeSingle();

  if (!parent?.id) {
    return {
      ok: false,
      status: 403,
      code: 'unlinked',
      error: 'Member profile not found. Finish onboarding or ask staff for help.',
    };
  }

  const { data: memberships } = await supabase
    .from('household_members')
    .select('household_id, relationship_type, status')
    .eq('member_id', memberId)
    .eq('status', 'active');

  const rows = memberships || [];
  if (rows.length > 1) {
    return {
      ok: false,
      status: 403,
      code: 'conflict',
      error: 'Multiple households are linked. Contact the church office before adding children.',
    };
  }

  let householdId = rows[0]?.household_id ? String(rows[0].household_id) : '';
  let householdName: string | null = null;

  // The directory row already points at a household (set by staff or an earlier
  // import) but this member was never added to it: join that one, don't make a second.
  let joiningExisting = false;
  if (!householdId && parent.household_id) {
    const { data: known } = await supabase
      .from('households')
      .select('id, name')
      .eq('id', parent.household_id)
      .maybeSingle();
    if (known?.id) {
      householdId = String(known.id);
      householdName = known.name || parent.household_name || null;
      joiningExisting = true;
    }
  }

  if (!householdId || joiningExisting) {
    if (!joiningExisting) {
      const last = String(parent.last_name || '').trim();
      const hhName = last ? `${last} Family` : 'My Family';
      const hh = await insertHouseholdWithFreeName(supabase, userId, hhName, String(parent.first_name || '').trim());
      if (!hh) {
        return {
          ok: false,
          status: 500,
          code: 'unavailable',
          error: 'Could not create your household. Please try again.',
        };
      }
      householdId = String(hh.id);
      householdName = hh.name || hhName;
    }

    const { error: hmErr } = await supabase.from('household_members').upsert(
      {
        household_id: householdId,
        member_id: memberId,
        relationship_type: 'self',
        status: 'active',
        created_by: userId,
      },
      { onConflict: 'household_id,member_id' }
    );
    if (hmErr) {
      console.warn('[parent-dependents] add self to household', hmErr.message);
      return {
        ok: false,
        status: 500,
        code: 'unavailable',
        error: 'Could not attach you to a household. Please try again.',
      };
    }

    // Keep directory columns in sync for legacy kids check-in
    await supabase
      .from('members')
      .update({ household_id: householdId, household_name: householdName })
      .eq('id', memberId);
  } else {
    const { data: hh } = await supabase
      .from('households')
      .select('id, name')
      .eq('id', householdId)
      .maybeSingle();
    householdName = hh?.name || parent.household_name || null;
  }

  const displayName =
    `${parent.first_name || ''} ${parent.last_name || ''}`.trim() || 'Member';

  return {
    ok: true,
    ctx: {
      userId,
      memberId: String(parent.id),
      householdId,
      householdName,
      displayName,
      parentFirst: String(parent.first_name || ''),
      parentLast: String(parent.last_name || ''),
    },
  };
}

async function mirrorParentChildrenJson(
  supabase: any,
  parentMemberId: string,
  parentUserId: string,
  entry: { id: string; name: string; age?: string | null; notes?: string | null },
  mode: 'upsert' | 'remove'
) {
  const { data: parent } = await supabase
    .from('members')
    .select('children')
    .eq('id', parentMemberId)
    .maybeSingle();
  const kids = Array.isArray(parent?.children) ? [...parent.children] : [];
  let next: any[];
  if (mode === 'remove') {
    next = kids.filter((c: any) => String(c?.id || '') !== entry.id);
  } else {
    const idx = kids.findIndex(
      (c: any) =>
        String(c?.id || '') === entry.id ||
        (!c?.id &&
          String(c?.name || '')
            .trim()
            .toLowerCase() === entry.name.trim().toLowerCase())
    );
    const row = {
      id: entry.id,
      name: entry.name,
      age: entry.age != null && entry.age !== '' ? String(entry.age) : kids[idx]?.age || '',
      ...(entry.notes != null && entry.notes !== ''
        ? { notes: entry.notes }
        : kids[idx]?.notes
          ? { notes: kids[idx].notes }
          : {}),
    };
    if (idx >= 0) next = kids.map((c: any, i: number) => (i === idx ? { ...c, ...row } : c));
    else next = [...kids, row];
  }

  await supabase.from('members').update({ children: next }).eq('id', parentMemberId);
  await supabase.from('users').update({ children: next }).eq('id', parentUserId);
  return next;
}

/** Children this account is an active guardian of (set by staff in the Vault), in any household. */
async function guardianChildIds(supabase: any, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('guardian_relationships')
    .select('child_member_id')
    .eq('guardian_user_id', userId)
    .eq('status', 'active');
  if (error) return [];
  return (data || []).map((r: any) => (r?.child_member_id ? String(r.child_member_id) : '')).filter(Boolean);
}

async function listDependents(supabase: any, ctx: ParentCtx) {
  const { data: hm } = await supabase
    .from('household_members')
    .select('member_id, relationship_type, status')
    .eq('household_id', ctx.householdId)
    .eq('status', 'active')
    .in('relationship_type', ['child', 'dependent']);

  const householdIds = new Set<string>((hm || []).map((r: any) => String(r.member_id || '')).filter(Boolean));
  // Children linked to this account by the church office but not in this household
  // (e.g. a household under the other parent's name) still belong on My children.
  const guardianOnly = new Set<string>();
  for (const id of await guardianChildIds(supabase, ctx.userId)) {
    if (!householdIds.has(id) && id !== ctx.memberId) guardianOnly.add(id);
  }
  const ids = [...householdIds, ...guardianOnly];
  let members: any[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, preferred_name, birthday, children, status, role')
      .in('id', ids);
    members = data || [];
  }

  const { data: parent } = await supabase
    .from('members')
    .select('children')
    .eq('id', ctx.memberId)
    .maybeSingle();
  const legacy = Array.isArray(parent?.children) ? parent.children : [];
  const themes = await readKidsThemes(supabase, ids);
  // PLCC Bucks balances (table may not exist yet → no balances shown)
  const bucks = new Map<string, number>();
  if (ids.length) {
    const { data: rows, error: bucksErr } = await supabase
      .from('awc_bucks_ledger')
      .select('child_member_id, amount')
      .in('child_member_id', ids);
    if (!bucksErr) {
      for (const r of rows || []) {
        const k = String(r.child_member_id);
        bucks.set(k, (bucks.get(k) || 0) + Number(r.amount || 0));
      }
    }
  }
  const bucksReady = ids.length === 0 || bucks.size > 0 || !(await supabase.from('awc_bucks_ledger').select('id').limit(1)).error;

  const structured = members.map((m) => {
    const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Child';
    const legacyMatch = legacy.find((c: any) => String(c?.id || '') === m.id);
    return {
      id: m.id,
      firstName: m.first_name || '',
      lastName: m.last_name || '',
      name,
      age: legacyMatch?.age != null ? String(legacyMatch.age) : null,
      birthday: m.birthday ? String(m.birthday).slice(0, 10) : null,
      notes: legacyMatch?.notes || null,
      displayName: personDisplayName(m),
      kidsTheme: themes.get(String(m.id)) || 'soft_garden',
      bucksBalance: bucksReady ? bucks.get(String(m.id)) || 0 : null,
      structured: true,
      needsPromote: false,
      /** Linked by the church office; only the office can remove or rename. */
      guardianOnly: guardianOnly.has(String(m.id)),
    };
  });

  const structuredIds = new Set(structured.map((s) => s.id));
  const legacyOnly = legacy
    .map((c: any, index: number) => {
      const id = c?.id && UUID_RE.test(String(c.id)) ? String(c.id) : null;
      if (id && structuredIds.has(id)) return null;
      return {
        id: id || `legacy-${index}`,
        legacyIndex: index,
        firstName: splitName(String(c?.name || '')).firstName,
        lastName: splitName(String(c?.name || '')).lastName,
        name: String(c?.name || 'Child').trim() || 'Child',
        age: c?.age != null ? String(c.age) : null,
        birthday: null,
        notes: c?.notes || null,
        structured: Boolean(id),
        needsPromote: !id,
      };
    })
    .filter(Boolean);

  return { structured, legacyOnly, childrenJson: legacy };
}

async function createDependent(
  req: any,
  res: any,
  supabase: any,
  ctx: ParentCtx,
  body: any
) {
  const rawName = first(body.firstName || body.first_name || body.name);
  if (!rawName) {
    return res.status(400).json({ ok: false, error: 'Child first name is required.' });
  }
  const fromFull = splitName(first(body.name) || rawName);
  const safeFirst = first(body.firstName || body.first_name) || fromFull.firstName;
  const lastName =
    first(body.lastName || body.last_name) ||
    (first(body.name) ? fromFull.lastName : '') ||
    ctx.parentLast ||
    '';
  if (!safeFirst) {
    return res.status(400).json({ ok: false, error: 'Child first name is required.' });
  }

  const age = body.age != null && body.age !== '' ? String(body.age).trim().slice(0, 10) : '';
  const ageNumber = Number(age);
  if (age && Number.isFinite(ageNumber) && ageNumber >= 18) {
    return res.status(400).json({
      ok: false,
      error: 'Age 18 or older is added as an adult on the household.',
    });
  }
  const notes = body.notes != null ? String(body.notes).trim().slice(0, 500) : '';
  const birthday =
    body.birthday && /^\d{4}-\d{2}-\d{2}/.test(String(body.birthday))
      ? String(body.birthday).slice(0, 10)
      : null;

  // Never create Auth users, email, or phone for children.
  const created = await insertHouseholdPerson(supabase, {
    firstName: safeFirst.slice(0, 80),
    lastName: lastName.slice(0, 80),
    role: 'Child',
    householdId: ctx.householdId,
    householdName: ctx.householdName,
    birthday,
  });
  if (!created.ok) {
    return res.status(500).json({ ok: false, error: 'Could not create child record.' });
  }
  const child = {
    id: created.id,
    first_name: created.firstName,
    last_name: created.lastName,
  };

  const { error: hmErr } = await supabase.from('household_members').upsert(
    {
      household_id: ctx.householdId,
      member_id: child.id,
      relationship_type: 'child',
      status: 'active',
      created_by: ctx.userId,
    },
    { onConflict: 'household_id,member_id' }
  );
  if (hmErr) {
    console.error('[parent-dependents] household edge', hmErr.message);
    return res.status(500).json({ ok: false, error: 'Child created but household link failed.' });
  }

  const now = new Date().toISOString();
  const guardianRow = {
    guardian_user_id: ctx.userId,
    child_member_id: child.id,
    relationship_type: 'parent',
    can_view_card: true,
    can_check_in: false,
    can_check_out: false,
    status: 'active',
    verified_by: ctx.userId,
    verified_at: now,
  };

  const { data: existingGuard } = await supabase
    .from('guardian_relationships')
    .select('id, status')
    .eq('guardian_user_id', ctx.userId)
    .eq('child_member_id', child.id)
    .maybeSingle();

  if (existingGuard?.id) {
    await supabase.from('guardian_relationships').update(guardianRow).eq('id', existingGuard.id);
  } else {
    const { error: gErr } = await supabase.from('guardian_relationships').insert(guardianRow);
    if (gErr) console.warn('[parent-dependents] guardian', gErr.message);
  }

  const displayName = `${child.first_name || ''} ${child.last_name || ''}`.trim();
  const childrenJson = await mirrorParentChildrenJson(
    supabase,
    ctx.memberId,
    ctx.userId,
    { id: child.id, name: displayName, age: age || null, notes: notes || null },
    'upsert'
  );

  // Optional: drop promoted legacy index
  if (typeof body.legacyIndex === 'number' && body.legacyIndex >= 0) {
    /* already upserted by name/id match in mirror */
  }

  try {
    const logAudit = await getAudit();
    await logAudit({
      userId: ctx.userId,
      action: 'Parent Dependent Created',
      details: {
        childMemberId: child.id,
        householdId: ctx.householdId,
        parentMemberId: ctx.memberId,
      },
      resourceType: 'members',
      resourceId: child.id,
      severity: 'info',
      req,
    });
  } catch {
    /* audit optional */
  }

  let summary = null;
  try {
    const adult = await resolveAdultHouseholdForUser(supabase, ctx.userId);
    if (adult.ok) summary = await buildSanitizedFamilySummary(supabase, adult.ctx);
  } catch {
    /* ignore */
  }

  return res.status(200).json({
    ok: true,
    action: 'create',
    child: {
      id: child.id,
      firstName: child.first_name,
      lastName: child.last_name,
      name: displayName,
      age: age || null,
      birthday,
      notes: notes || null,
      structured: true,
      needsPromote: false,
    },
    childrenJson,
    summary,
  });
}

async function updateDependent(
  req: any,
  res: any,
  supabase: any,
  ctx: ParentCtx,
  body: any
) {
  const childId = first(body.childId || body.id);
  if (!childId || !UUID_RE.test(childId)) {
    return res.status(400).json({ ok: false, error: 'Valid childId required.' });
  }

  const { data: edge } = await supabase
    .from('household_members')
    .select('id, status, relationship_type')
    .eq('household_id', ctx.householdId)
    .eq('member_id', childId)
    .maybeSingle();

  const inHousehold = Boolean(edge) && ['child', 'dependent'].includes(String(edge.relationship_type || '').toLowerCase());
  if (!inHousehold) {
    const guarded = (await guardianChildIds(supabase, ctx.userId)).includes(childId);
    if (!guarded) {
      return res.status(403).json({ ok: false, error: 'That child is not in your household.' });
    }
    // Office-linked child: a parent may pick the Kids View theme; other changes go through the office.
    const onlyTheme = body.kidsTheme !== undefined &&
      Object.keys(body).every((k) => ['childId', 'id', 'kidsTheme', 'action'].includes(k)) &&
      body.action !== 'remove' && body.remove !== true;
    if (!onlyTheme) {
      return res.status(403).json({
        ok: false,
        code: 'office_linked',
        error: 'The church office linked this child to you. Ask the office to change or remove them.',
      });
    }
    const kidsTheme = normalizeKidsTheme(body.kidsTheme);
    if (!kidsTheme) return res.status(400).json({ ok: false, error: 'Unknown Kids View theme.' });
    const { error } = await supabase.from('members').update({ kids_theme: kidsTheme }).eq('id', childId);
    if (error) {
      return res.status(503).json({
        ok: false,
        code: 'theme_unavailable',
        error: 'Kids View themes are not set up yet. Ask an admin to run the kids_view_theme migration.',
      });
    }
    return res.status(200).json({ ok: true, action: 'update', child: { id: childId, kidsTheme, structured: true, needsPromote: false } });
  }

  const remove = body.remove === true || body.action === 'remove';
  if (remove) {
    await supabase
      .from('household_members')
      .update({ status: 'inactive' })
      .eq('household_id', ctx.householdId)
      .eq('member_id', childId);

    await supabase
      .from('guardian_relationships')
      .update({ status: 'revoked' })
      .eq('guardian_user_id', ctx.userId)
      .eq('child_member_id', childId)
      .eq('status', 'active');

    const { data: child } = await supabase
      .from('members')
      .select('first_name, last_name')
      .eq('id', childId)
      .maybeSingle();
    const name = `${child?.first_name || ''} ${child?.last_name || ''}`.trim() || 'Child';
    const childrenJson = await mirrorParentChildrenJson(
      supabase,
      ctx.memberId,
      ctx.userId,
      { id: childId, name },
      'remove'
    );

    try {
      const logAudit = await getAudit();
      await logAudit({
        userId: ctx.userId,
        action: 'Parent Dependent Removed',
        details: { childMemberId: childId, householdId: ctx.householdId },
        resourceType: 'members',
        resourceId: childId,
        severity: 'info',
        req,
      });
    } catch {
      /* ignore */
    }

    return res.status(200).json({ ok: true, action: 'remove', childId, childrenJson });
  }

  const updates: Record<string, any> = {};
  if (body.firstName != null || body.first_name != null) {
    updates.first_name = first(body.firstName || body.first_name).slice(0, 80) || 'Child';
  }
  if (body.lastName != null || body.last_name != null) {
    updates.last_name = first(body.lastName || body.last_name).slice(0, 80);
  }
  if (body.name && !body.firstName && !body.first_name) {
    const sp = splitName(String(body.name));
    updates.first_name = sp.firstName;
    updates.last_name = sp.lastName;
  }
  if (body.birthday !== undefined) {
    updates.birthday =
      body.birthday && /^\d{4}-\d{2}-\d{2}/.test(String(body.birthday))
        ? String(body.birthday).slice(0, 10)
        : null;
  }

  if (Object.keys(updates).length) {
    const { error } = await supabase.from('members').update(updates).eq('id', childId);
    if (error) {
      return res.status(500).json({ ok: false, error: 'Could not update child.' });
    }
  }

  let kidsTheme: string | null = null;
  if (body.kidsTheme !== undefined) {
    kidsTheme = normalizeKidsTheme(body.kidsTheme);
    if (!kidsTheme) {
      return res.status(400).json({ ok: false, error: 'Unknown Kids View theme.' });
    }
    const { error } = await supabase.from('members').update({ kids_theme: kidsTheme }).eq('id', childId);
    if (error) {
      return res.status(503).json({
        ok: false,
        code: 'theme_unavailable',
        error: 'Kids View themes are not set up yet. Ask an admin to run the kids_view_theme migration.',
      });
    }
  }

  const { data: child } = await supabase
    .from('members')
    .select('id, first_name, last_name, birthday')
    .eq('id', childId)
    .maybeSingle();

  const displayName = `${child?.first_name || ''} ${child?.last_name || ''}`.trim() || 'Child';
  const age = body.age != null ? String(body.age).trim().slice(0, 10) : undefined;
  const notes = body.notes != null ? String(body.notes).trim().slice(0, 500) : undefined;

  const childrenJson = await mirrorParentChildrenJson(
    supabase,
    ctx.memberId,
    ctx.userId,
    {
      id: childId,
      name: displayName,
      age: age ?? null,
      notes: notes ?? null,
    },
    'upsert'
  );

  return res.status(200).json({
    ok: true,
    action: 'update',
    child: {
      id: childId,
      firstName: child?.first_name,
      lastName: child?.last_name,
      name: displayName,
      age: age ?? null,
      birthday: child?.birthday ? String(child.birthday).slice(0, 10) : null,
      notes: notes ?? null,
      kidsTheme,
      structured: true,
      needsPromote: false,
    },
    childrenJson,
  });
}

/** Opaque child card selector used by PLCC Connect (never members.id). */
const CARD_REF_RE = /^AWCD\.[0-9a-f]{64}$/;

async function childIdForCardRef(supabase: any, cardRef: string): Promise<string | null> {
  if (!CARD_REF_RE.test(cardRef)) return null;
  const { data } = await supabase
    .from('dependent_digital_cards')
    .select('member_id, status')
    .eq('card_ref', cardRef)
    .maybeSingle();
  if (!data?.member_id || String(data.status) === 'revoked') return null;
  return String(data.member_id);
}

async function isHouseholdChild(supabase: any, householdId: string, childId: string): Promise<boolean> {
  const { data: edge } = await supabase
    .from('household_members')
    .select('relationship_type, status')
    .eq('household_id', householdId)
    .eq('member_id', childId)
    .eq('status', 'active')
    .maybeSingle();
  return Boolean(edge) && ['child', 'dependent'].includes(String(edge.relationship_type || '').toLowerCase());
}

async function legacyChildAge(supabase: any, parentMemberId: string | null, childId: string): Promise<string | null> {
  if (!parentMemberId) return null;
  const { data: parent } = await supabase
    .from('members')
    .select('children')
    .eq('id', parentMemberId)
    .maybeSingle();
  const legacy = Array.isArray(parent?.children) ? parent.children : [];
  const age = legacy.find((c: any) => String(c?.id || '') === childId)?.age ?? null;
  return age != null ? String(age) : null;
}

/**
 * Who may open a child by cardRef: an active guardian of that child (same rule
 * as the Connect child card) or an adult in the child's active household.
 * Read-only — never bootstraps a household.
 */
async function cardRefAccess(
  supabase: any,
  userId: string,
  childId: string
): Promise<{ ok: true; parentMemberId: string | null } | { ok: false }> {
  const [guardRes, household] = await Promise.all([
    supabase
      .from('guardian_relationships')
      .select('id')
      .eq('guardian_user_id', userId)
      .eq('child_member_id', childId)
      .eq('status', 'active')
      .limit(1),
    resolveAdultHouseholdForUser(supabase, userId),
  ]);
  const parentMemberId = household.ok ? household.ctx.memberId : null;
  if (Array.isArray(guardRes.data) && guardRes.data.length > 0) return { ok: true, parentMemberId };
  if (household.ok && (await isHouseholdChild(supabase, household.ctx.householdId, childId))) {
    return { ok: true, parentMemberId };
  }
  return { ok: false };
}

/** Kids View by childId (Vault, household parents). */
async function kidsView(res: any, supabase: any, ctx: ParentCtx, childId: string) {
  if (!childId || !UUID_RE.test(childId)) {
    return res.status(400).json({ ok: false, error: 'Valid childId required.' });
  }
  if (!(await isHouseholdChild(supabase, ctx.householdId, childId))) {
    return res.status(403).json({ ok: false, error: 'That child is not in your household.' });
  }
  const legacyAge = await legacyChildAge(supabase, ctx.memberId, childId);
  const view = await buildKidsView(supabase, childId, ctx.userId, legacyAge);
  if (!view) return res.status(404).json({ ok: false, error: 'Child not found.' });
  return res.status(200).json({ ok: true, ...view });
}

/**
 * Connect routes keyed by cardRef: GET kids-view and PATCH kids-theme (theme only).
 * Never echoes the child's members.id.
 */
async function kidsByCardRef(req: any, res: any, supabase: any, userId: string, action: string, cardRef: string) {
  const childId = await childIdForCardRef(supabase, cardRef);
  if (!childId) return res.status(404).json({ ok: false, code: 'not_found', error: 'That child card was not found.' });
  const access = await cardRefAccess(supabase, userId, childId);
  if (!access.ok) {
    return res.status(403).json({ ok: false, code: 'forbidden', error: 'Kids View is only for this child’s guardians and household.' });
  }

  if (action === 'kids-theme') return kidsThemeForChild(res, supabase, childId, req.body || {});

  const legacyAge = await legacyChildAge(supabase, access.parentMemberId, childId);
  const view = await buildKidsView(supabase, childId, userId, legacyAge);
  if (!view) return res.status(404).json({ ok: false, code: 'not_found', error: 'Child not found.' });
  const { id: _omit, ...child } = view.child;
  return res.status(200).json({ ok: true, ...view, child });
}

/** Theme-only update. No rename, no remove. */
async function kidsThemeForChild(res: any, supabase: any, childId: string, body: any) {
  const theme = normalizeKidsTheme(body?.kidsTheme);
  if (!theme) return res.status(400).json({ ok: false, code: 'invalid_theme', error: 'Unknown Kids View theme.' });
  const { error } = await supabase.from('members').update({ kids_theme: theme }).eq('id', childId);
  if (error) {
    return res.status(503).json({
      ok: false,
      code: 'theme_unavailable',
      error: 'Kids View themes are not set up yet. Ask an admin to run the kids_view_theme migration.',
    });
  }
  return res.status(200).json({ ok: true, theme });
}

export async function handleParentDependents(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Service unavailable' });
  }

  const auth = await requireAuth(req, res, supabase);
  if (!auth) return;

  const role = String(auth.role || '').toUpperCase();
  if (role === 'PENDING') {
    return res.status(403).json({
      ok: false,
      code: 'pending',
      error: 'Finish onboarding before adding children.',
    });
  }

  const action = first(req.query?.action || req.body?.action || '').toLowerCase();

  const cardRef = first(req.query?.cardRef || req.body?.cardRef);
  if (cardRef && ((req.method === 'GET' && action === 'kids-view') || (req.method === 'PATCH' && action === 'kids-theme'))) {
    try {
      return await kidsByCardRef(req, res, supabase, auth.user.id, action, cardRef);
    } catch (err: any) {
      console.error('[parent-dependents] cardRef', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Could not load Kids View right now.' });
    }
  }

  const parent = await ensureParentContext(supabase, auth.user.id);
  if (!parent.ok) {
    return res.status(parent.status).json({
      ok: false,
      code: parent.code,
      error: parent.error,
    });
  }

  try {
    if (req.method === 'GET' && action === 'kids-view') {
      return await kidsView(res, supabase, parent.ctx, first(req.query?.childId));
    }

    if (req.method === 'GET' && action === 'bucks-prizes') {
      const { data, error } = await supabase.rpc('awc_bucks_prize_list', { p_include_inactive: false });
      if (error) {
        if (/does not exist|Could not find the function/i.test(String(error.message || ''))) {
          return res.status(503).json({ ok: false, code: 'bucks_unavailable', error: 'The prize store is not set up yet.' });
        }
        return res.status(500).json({ ok: false, error: 'Could not load prizes.' });
      }
      const prizes = (Array.isArray(data) ? data : []).map((p: any) => {
        const { unitCostCents: _omit, ...rest } = p || {};
        return rest;
      });
      return res.status(200).json({ ok: true, prizes });
    }

    if (req.method === 'POST' && action === 'bucks-request') {
      const body = req.body || {};
      let childId = first(body.childId);
      const cardRef = first(body.cardRef);
      if (cardRef) {
        const resolved = await childIdForCardRef(supabase, cardRef);
        if (!resolved) return res.status(404).json({ ok: false, code: 'not_found', error: 'That child card was not found.' });
        childId = resolved;
      }
      if (!UUID_RE.test(childId)) return res.status(400).json({ ok: false, error: 'Valid childId required.' });
      if (!(await isHouseholdChild(supabase, parent.ctx.householdId, childId))) {
        return res.status(403).json({ ok: false, code: 'forbidden', error: 'That child is not in your household.' });
      }
      const prizeId = first(body.prizeId);
      const idem = first(body.idempotencyKey);
      if (!/^[a-z0-9_]{2,40}$/.test(prizeId) || idem.length < 8) {
        return res.status(400).json({ ok: false, error: 'Pick a prize and try again.' });
      }
      const { data, error } = await supabase.rpc('awc_bucks_request_prize', {
        p_child: childId,
        p_prize: prizeId,
        p_requested_by: parent.ctx.userId,
        p_idempotency_key: idem,
      });
      if (error) {
        const msg = String(error.message || '');
        if (/not_authorized/.test(msg)) {
          return res.status(403).json({ ok: false, code: 'not_authorized', error: 'Only a linked parent can request a prize for this child.' });
        }
        return res.status(500).json({ ok: false, error: 'Could not request that prize.' });
      }
      if (data?.ok === false) {
        const code = String(data.code || 'request_failed');
        const errorText =
          code === 'not_enough' ? 'Not enough PLCC Bucks for that prize.'
          : code === 'out_of_stock' ? 'That prize is out of stock.'
          : code === 'already_requested' ? 'This child already has an open request for that prize.'
          : 'That prize request could not be completed.';
        return res.status(409).json({ ok: false, code, error: errorText });
      }
      return res.status(200).json({ ok: true, status: data?.status, duplicate: data?.duplicate === true });
    }

    if (req.method === 'GET' || action === 'list') {
      const listed = await listDependents(supabase, parent.ctx);
      return res.status(200).json({ ok: true, ...listed, householdId: parent.ctx.householdId });
    }

    if (req.method === 'POST' && (action === 'create' || action === 'add' || action === 'promote' || !action)) {
      return await createDependent(req, res, supabase, parent.ctx, req.body || {});
    }

    if (req.method === 'PATCH' || action === 'update' || action === 'remove') {
      return await updateDependent(req, res, supabase, parent.ctx, {
        ...(req.body || {}),
        action: action || req.body?.action,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[parent-dependents]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Could not manage children right now.' });
  }
}

/** For scripts/tests only. */
export const __test = { listDependents, updateDependent };
