/**
 * Mahabir Family — structured household ops (read + optional apply).
 *
 * Connect My Family counts come from verified user_member_links + household_members
 * (+ guardian_relationships for dependent cards). Legacy directory households and
 * members.children JSON are NOT used.
 *
 * Usage (from Vault root):
 *   node --env-file=.env.diagnostic.local scripts/mahabir-family-structured-ops.mjs
 *   node --env-file=.env.diagnostic.local scripts/mahabir-family-structured-ops.mjs --apply
 *
 * --apply creates/joins a structured household named "Mahabir Family" and adds:
 *   Jerless = self, Sheevon = spouse, Bithiah Mahabir + Hadassah Mahabir = child
 * Guardians (optional): set APPLY_GUARDIANS=1 to create parent→child edges when
 * Jerless has a verified link. Does not delete legacy directory rows.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const APPLY_GUARDIANS = process.env.APPLY_GUARDIANS === '1' || process.argv.includes('--guardians');

function env(k) {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error('Need SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const NAMES = {
  // Prefer directory Jerless on legacy Mahabir Family (not the ALL-CAPS / lowercase duplicates).
  jerless: { first: 'Jerless', last: 'P. Mahabir' },
  sheevon: { first: 'Sheevon', last: 'Mahabir' },
  bithiah: { first: 'Bithiah', last: 'Mahabir' },
  hadassah: { first: 'Hadassah', last: 'Mahabir' },
};

async function findMember(first, last) {
  const { data, error } = await admin
    .from('members')
    .select('id, first_name, last_name, status, household_id, household_name, children')
    .ilike('first_name', first)
    .ilike('last_name', last)
    .limit(5);
  if (error) throw error;
  const exact = (data || []).filter(
    (m) =>
      String(m.first_name || '').trim().toLowerCase() === first.toLowerCase() &&
      String(m.last_name || '').trim().toLowerCase() === last.toLowerCase()
  );
  return exact[0] || data?.[0] || null;
}

async function structuredFor(memberId) {
  const { data, error } = await admin
    .from('household_members')
    .select('id, household_id, relationship_type, status, households(name)')
    .eq('member_id', memberId)
    .eq('status', 'active');
  if (error) throw error;
  return data || [];
}

async function linkFor(memberId) {
  const { data, error } = await admin
    .from('user_member_links')
    .select('user_id, status, link_method, linked_at')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function roster(householdId) {
  const { data, error } = await admin
    .from('household_members')
    .select('id, member_id, relationship_type, status, members(first_name, last_name)')
    .eq('household_id', householdId)
    .eq('status', 'active');
  if (error) throw error;
  return data || [];
}

async function ensureHouseholdNamed(name, preferredId) {
  if (preferredId) {
    const { data: byId } = await admin.from('households').select('id, name').eq('id', preferredId).maybeSingle();
    if (byId) return byId;
  }
  const { data: existing } = await admin.from('households').select('id, name').ilike('name', name).limit(5);
  const hit = (existing || []).find((h) => String(h.name).trim().toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  const { data, error } = await admin.from('households').insert({ name }).select('id, name').single();
  if (error) throw error;
  return data;
}

async function upsertMembership(householdId, memberId, relationshipType, actorId) {
  const { data: active } = await admin
    .from('household_members')
    .select('id, household_id')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .maybeSingle();
  if (active && active.household_id !== householdId) {
    throw new Error(
      `Member ${memberId} already active in household ${active.household_id}; inactivate first.`
    );
  }
  const row = {
    household_id: householdId,
    member_id: memberId,
    relationship_type: relationshipType,
    status: 'active',
    created_by: actorId || null,
  };
  const { error } = await admin.from('household_members').upsert(row, {
    onConflict: 'household_id,member_id',
  });
  if (error) throw error;
}

async function ensureGuardian(guardianUserId, childMemberId, actorId) {
  const { data: existing } = await admin
    .from('guardian_relationships')
    .select('id, status')
    .eq('guardian_user_id', guardianUserId)
    .eq('child_member_id', childMemberId)
    .maybeSingle();
  if (existing?.status === 'active') return { id: existing.id, created: false };
  const now = new Date().toISOString();
  if (existing) {
    const { error } = await admin
      .from('guardian_relationships')
      .update({
        status: 'active',
        relationship_type: 'parent',
        can_view_card: true,
        can_check_in: false,
        can_check_out: false,
        verified_by: actorId,
        verified_at: now,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, created: false, reactivated: true };
  }
  const { data, error } = await admin
    .from('guardian_relationships')
    .insert({
      guardian_user_id: guardianUserId,
      child_member_id: childMemberId,
      relationship_type: 'parent',
      can_view_card: true,
      can_check_in: false,
      can_check_out: false,
      status: 'active',
      verified_by: actorId,
      verified_at: now,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}

const report = { mode: APPLY ? 'apply' : 'inspect', at: new Date().toISOString(), members: {}, steps: [] };

const jerless = await findMember(NAMES.jerless.first, NAMES.jerless.last);
const sheevon = await findMember(NAMES.sheevon.first, NAMES.sheevon.last);
const bithiah = await findMember(NAMES.bithiah.first, NAMES.bithiah.last);
const hadassah = await findMember(NAMES.hadassah.first, NAMES.hadassah.last);

for (const [key, m] of Object.entries({ jerless, sheevon, bithiah, hadassah })) {
  if (!m) {
    report.members[key] = null;
    continue;
  }
  const structured = await structuredFor(m.id);
  const link = key === 'jerless' ? await linkFor(m.id) : null;
  report.members[key] = {
    id: m.id,
    name: `${m.first_name} ${m.last_name}`,
    status: m.status,
    legacyHouseholdName: m.household_name,
    legacyHouseholdId: m.household_id,
    legacyChildrenJsonCount: Array.isArray(m.children) ? m.children.length : 0,
    structured,
    link,
  };
}

if (!jerless) {
  console.error('Jerless Mahabir member not found');
  writeFileSync('/tmp/awc-mahabir-ops-report.json', JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log('Mahabir inspect:');
console.log(JSON.stringify(report.members, null, 2));

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to create structured household memberships.');
  console.log('Staff UI path (preferred after deploy): Vault → People → Jerless → Family & Access');
  console.log('  1) Verify Connect link');
  console.log('  2) Create/join structured household');
  console.log('  3) Add Sheevon spouse; Bithiah + Hadassah as child');
  console.log('  4) Optional guardian edges for dependent cards');
  writeFileSync('/tmp/awc-mahabir-ops-report.json', JSON.stringify(report, null, 2));
  process.exit(0);
}

const actorId = process.env.OPS_ACTOR_USER_ID || (await linkFor(jerless.id))?.user_id || null;
const preferredHh =
  (typeof jerless.household_id === 'string' && jerless.household_id) ||
  sheevon?.household_id ||
  bithiah?.household_id ||
  null;
const hh = await ensureHouseholdNamed('Mahabir Family', preferredHh);
report.steps.push({ ensureHousehold: hh });

await upsertMembership(hh.id, jerless.id, 'self', actorId);
report.steps.push({ add: 'Jerless', relationship: 'self' });

if (sheevon) {
  await upsertMembership(hh.id, sheevon.id, 'spouse', actorId);
  report.steps.push({ add: 'Sheevon', relationship: 'spouse' });
} else {
  report.steps.push({ warn: 'Sheevon not found — skip' });
}

if (bithiah) {
  await upsertMembership(hh.id, bithiah.id, 'child', actorId);
  report.steps.push({ add: 'Bithiah', relationship: 'child' });
} else {
  report.steps.push({ warn: 'Bithiah Mahabir not found — skip' });
}

if (hadassah) {
  await upsertMembership(hh.id, hadassah.id, 'child', actorId);
  report.steps.push({ add: 'Hadassah', relationship: 'child' });
} else {
  report.steps.push({ warn: 'Hadassah Mahabir not found — skip' });
}

const link = await linkFor(jerless.id);
if (APPLY_GUARDIANS && link?.status === 'verified' && link.user_id) {
  for (const child of [bithiah, hadassah].filter(Boolean)) {
    const g = await ensureGuardian(link.user_id, child.id, actorId || link.user_id);
    report.steps.push({ guardian: child.first_name + ' ' + child.last_name, ...g });
  }
} else if (APPLY_GUARDIANS) {
  report.steps.push({ warn: 'Guardians skipped — Jerless has no verified user_member_link' });
}

report.afterRoster = await roster(hh.id);
report.afterJerlessLink = await linkFor(jerless.id);

const adults = (report.afterRoster || []).filter(
  (r) => r.member_id !== jerless.id && !['child', 'dependent'].includes(String(r.relationship_type || ''))
);
const children = (report.afterRoster || []).filter((r) =>
  ['child', 'dependent'].includes(String(r.relationship_type || ''))
);
report.expectedConnectCountsIfJerlessVerified = {
  adults: adults.length,
  dependents: children.length,
  note: 'Connect adults/dependents exclude self; dependents also include guardian-backed children.',
};

writeFileSync('/tmp/awc-mahabir-ops-report.json', JSON.stringify(report, null, 2));
console.log('\nApplied. Report → /tmp/awc-mahabir-ops-report.json');
console.log(JSON.stringify(report.expectedConnectCountsIfJerlessVerified, null, 2));
console.log(JSON.stringify(report.steps, null, 2));
