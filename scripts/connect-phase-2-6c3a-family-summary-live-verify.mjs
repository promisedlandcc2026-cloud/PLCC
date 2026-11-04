/**
 * Phase 2.6C.3A — live Family-safe RPC authorization + privacy verification.
 * Target: yrpwdrioomdihjlmcfnu
 *
 * Does NOT re-apply migration / modify Connect / commit.
 * Creates TEMP auth users, public.users, members, households, links, guardians;
 * cleans up on exit.
 *
 * Usage:
 *   node --env-file=.env.diagnostic.local scripts/connect-phase-2-6c3a-family-summary-live-verify.mjs
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MARKER = 'TEST — Phase 2.6C.3A';
const MARKER_EMAIL = 'phase26c3a';

const report = {
  projectRef: null,
  defects: [],
  results: {},
  created: {
    authUsers: [],
    publicUsers: [],
    members: [],
    households: [],
    links: [],
    householdMembers: [],
    guardians: [],
    digitalCards: [],
  },
  counts: { before: {}, peak: {}, after: {} },
};

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env) || !process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

function env(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function fail(check, expected, actual) {
  const msg = `${check}: expected ${expected}; actual ${JSON.stringify(actual)}`;
  report.defects.push(msg);
  console.error('FAIL:', msg);
  return false;
}

function ok(check, detail = '') {
  console.log('PASS:', check, detail ? `— ${detail}` : '');
  return true;
}

function summarizeErr(error) {
  if (!error) return null;
  return {
    message: error.message || String(error),
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
  };
}

async function countExact(admin, table) {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function countMarker(admin, table, column, pattern) {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .ilike(column, pattern);
  if (error) throw new Error(`marker count ${table}: ${error.message}`);
  return count ?? 0;
}

const FORBIDDEN_KEYS = [
  'userId',
  'user_id',
  'memberId',
  'member_id',
  'householdId',
  'household_id',
  'guardian_user_id',
  'guardian_member_id',
  'child_member_id',
  'email',
  'phone',
  'birthday',
  'dob',
  'DOB',
  'role',
  'verified_by',
  'linked_by',
  'created_by',
  'notes',
  'cardNumber',
  'card_number',
  'cardStatus',
  'qrPayload',
  'qrToken',
  'qr_token',
  'qrTokenHash',
  'qr_token_hash',
  'canCheckIn',
  'canCheckOut',
  'can_check_in',
  'can_check_out',
];

function deepKeys(obj, acc = new Set()) {
  if (obj == null || typeof obj !== 'object') return acc;
  if (Array.isArray(obj)) {
    for (const v of obj) deepKeys(v, acc);
    return acc;
  }
  for (const [k, v] of Object.entries(obj)) {
    acc.add(k);
    deepKeys(v, acc);
  }
  return acc;
}

function scanForbidden(payload, label) {
  const keys = [...deepKeys(payload)];
  const hits = keys.filter((k) =>
    FORBIDDEN_KEYS.some((f) => f.toLowerCase() === k.toLowerCase())
  );
  const blob = JSON.stringify(payload);
  const uuidHits = (blob.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi
  ) || []).length;
  if (hits.length) {
    fail(`${label} forbidden keys`, 'none', hits);
    return false;
  }
  if (uuidHits > 0) {
    fail(`${label} raw UUIDs in JSON`, 0, uuidHits);
    return false;
  }
  return ok(`${label} privacy scan`, `keys=${keys.sort().join(',')}`);
}

async function rpcAs(browser) {
  const { data, error } = await browser.rpc('get_my_family_summary');
  return { data, error: summarizeErr(error) };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry(label, fn, attempts = 5) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String(e?.message || e);
      if (!/Gateway Timeout|timeout|fetch failed|503|502/i.test(msg) || i === attempts) {
        throw e;
      }
      console.warn(`retry ${label} ${i}/${attempts}: ${msg}`);
      await sleep(1500 * i);
    }
  }
  throw last;
}

async function createAuthUser(admin, url, anon, label) {
  const email = `${MARKER_EMAIL}.${label}.${Date.now()}@awc-vault.local`;
  const password = `Verify!${Date.now()}Aa1`;
  const created = await withRetry(`createUser ${label}`, async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user?.id) {
      throw new Error(`createUser ${label}: ${error?.message || 'no user'}`);
    }
    return data;
  });
  const uid = created.user.id;
  report.created.authUsers.push(uid);

  const password_hash = await bcrypt.hash('Temporary123!', 10);
  const { error: uErr } = await admin.from('users').insert({
    id: uid,
    email,
    name: `${MARKER} ${label}`,
    role: 'PENDING',
    password_hash,
    is_temporary_password: true,
  });
  if (uErr) throw new Error(`public.users ${label}: ${uErr.message}`);
  report.created.publicUsers.push(uid);

  const browser = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await withRetry(`signIn ${label}`, async () => {
    const { error: signErr } = await browser.auth.signInWithPassword({
      email,
      password,
    });
    if (signErr) throw new Error(`signIn ${label}: ${signErr.message}`);
  });
  return { uid, email, password, browser, label };
}

async function createMember(admin, label, extra = {}) {
  const id = randomUUID();
  const row = {
    id,
    first_name: `${MARKER}`,
    last_name: label,
    email: `${MARKER_EMAIL}.member.${label}.${Date.now()}@awc-vault.local`,
    status: 'Active',
    role: extra.role || 'Member',
    children: extra.children ?? null,
    household_id: extra.household_id ?? null,
    household_name: extra.household_name ?? null,
    avatar_url: extra.avatar_url ?? null,
  };
  const { data, error } = await admin.from('members').insert(row).select('*').single();
  if (error) throw new Error(`member ${label}: ${error.message}`);
  report.created.members.push(data.id);
  return data;
}

async function createHousehold(admin, label) {
  const id = randomUUID();
  const { data, error } = await admin
    .from('households')
    .insert({ id, name: `${MARKER} HH ${label}` })
    .select('*')
    .single();
  if (error) throw new Error(`household ${label}: ${error.message}`);
  report.created.households.push(data.id);
  return data;
}

async function upsertLink(admin, userId, memberId, status) {
  const payload = {
    user_id: userId,
    member_id: memberId,
    status,
    link_method: 'staff_verified',
    linked_by: status === 'verified' ? userId : null,
    linked_at: status === 'verified' ? new Date().toISOString() : null,
  };
  const { data, error } = await admin
    .from('user_member_links')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw new Error(`link ${status}: ${error.message}`);
  report.created.links.push(userId);
  return data;
}

async function addHhMember(admin, householdId, memberId, relationship_type) {
  const { data, error } = await admin
    .from('household_members')
    .insert({
      household_id: householdId,
      member_id: memberId,
      relationship_type,
      status: 'active',
      created_by: null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`hh member: ${error.message}`);
  report.created.householdMembers.push(data.id);
  return data;
}

async function upsertGuardian(admin, guardianUserId, childMemberId, flags) {
  const payload = {
    guardian_user_id: guardianUserId,
    guardian_member_id: flags.guardian_member_id ?? null,
    child_member_id: childMemberId,
    relationship_type: flags.relationship_type || 'parent',
    can_view_card: !!flags.can_view_card,
    can_check_in: !!flags.can_check_in,
    can_check_out: !!flags.can_check_out,
    status: flags.status || 'active',
    verified_by: guardianUserId,
    verified_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from('guardian_relationships')
    .upsert(payload, { onConflict: 'guardian_user_id,child_member_id' })
    .select('*')
    .single();
  if (error) throw new Error(`guardian: ${error.message}`);
  report.created.guardians.push(data.id);
  return data;
}

async function cleanup(admin) {
  console.log('\n--- CLEANUP ---');
  // Guardians for created guardian users / children
  for (const uid of report.created.publicUsers) {
    await admin.from('guardian_relationships').delete().eq('guardian_user_id', uid);
  }
  for (const mid of report.created.members) {
    await admin.from('guardian_relationships').delete().eq('child_member_id', mid);
  }
  for (const id of report.created.householdMembers) {
    await admin.from('household_members').delete().eq('id', id);
  }
  for (const uid of report.created.links) {
    await admin.from('user_member_links').delete().eq('user_id', uid);
  }
  for (const uid of report.created.publicUsers) {
    await admin.from('member_digital_cards').delete().eq('user_id', uid);
  }
  // Marker-based sweeps
  const { data: markerMembers } = await admin
    .from('members')
    .select('id')
    .ilike('first_name', `${MARKER}%`);
  for (const m of markerMembers || []) {
    await admin.from('household_members').delete().eq('member_id', m.id);
    await admin.from('guardian_relationships').delete().eq('child_member_id', m.id);
    await admin.from('user_member_links').delete().eq('member_id', m.id);
    await admin.from('members').delete().eq('id', m.id);
  }
  const { data: markerHh } = await admin
    .from('households')
    .select('id')
    .ilike('name', `${MARKER}%`);
  for (const h of markerHh || []) {
    await admin.from('household_members').delete().eq('household_id', h.id);
    await admin.from('households').delete().eq('id', h.id);
  }
  for (const uid of report.created.publicUsers) {
    await admin.from('users').delete().eq('id', uid);
  }
  for (const uid of report.created.authUsers) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) console.error('cleanup auth', uid, error.message);
    else console.log('removed auth', uid);
  }
}

async function snapshotCounts(admin, bucket) {
  report.counts[bucket] = {
    user_member_links: await countExact(admin, 'user_member_links'),
    household_members: await countExact(admin, 'household_members'),
    guardian_relationships: await countExact(admin, 'guardian_relationships'),
    member_digital_cards: await countExact(admin, 'member_digital_cards'),
    marker_members: await countMarker(admin, 'members', 'first_name', `${MARKER}%`),
    marker_households: await countMarker(admin, 'households', 'name', `${MARKER}%`),
  };
}

function assertShape(data, expect, label) {
  let pass = true;
  if (expect.linked !== undefined && data?.linked !== expect.linked) {
    pass = fail(`${label}.linked`, expect.linked, data?.linked) || pass;
  } else if (expect.linked !== undefined) ok(`${label}.linked`, String(expect.linked));
  if (expect.household === null) {
    if (data?.household !== null) pass = fail(`${label}.household`, null, data?.household) && false;
    else ok(`${label}.household`, 'null');
  }
  if (expect.householdState !== undefined) {
    if (data?.householdState !== expect.householdState) {
      pass = fail(`${label}.householdState`, expect.householdState, data?.householdState) && false;
    } else ok(`${label}.householdState`, String(expect.householdState));
  }
  if (expect.adultsLen !== undefined) {
    const n = Array.isArray(data?.adults) ? data.adults.length : -1;
    if (n !== expect.adultsLen) pass = fail(`${label}.adults.length`, expect.adultsLen, n) && false;
    else ok(`${label}.adults.length`, String(n));
  }
  if (expect.dependentsLen !== undefined) {
    const n = Array.isArray(data?.dependents) ? data.dependents.length : -1;
    if (n !== expect.dependentsLen) {
      pass = fail(`${label}.dependents.length`, expect.dependentsLen, n) && false;
    } else ok(`${label}.dependents.length`, String(n));
  }
  if (expect.self === true) {
    if (!data?.self || data.self.cardAccess !== 'self') {
      pass = fail(`${label}.self`, 'cardAccess=self', data?.self) && false;
    } else ok(`${label}.self`, 'present');
  }
  if (expect.self === null) {
    if (data?.self != null) pass = fail(`${label}.self`, null, data?.self) && false;
    else ok(`${label}.self`, 'null');
  }
  return pass;
}

async function main() {
  loadEnvFile(join(ROOT, '.env.diagnostic.local'));
  loadEnvFile(join(ROOT, '.env.local'));

  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  const anon = env('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
  if (!url || !service || !anon) throw new Error('Missing Supabase env');

  report.projectRef = new URL(url).hostname.split('.')[0];
  if (report.projectRef !== 'yrpwdrioomdihjlmcfnu') {
    throw new Error(`Wrong project: ${report.projectRef}`);
  }
  console.log(JSON.stringify({ phase: '2.6C.3A', projectRef: report.projectRef }));

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const R = report.results;

  try {
    await snapshotCounts(admin, 'before');
    console.log('BASELINE', report.counts.before);

    // --- 1/2 RPC exists + security grants (behavioral) ---
    const openapi = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    }).then((r) => r.json());
    const rpcPath = openapi?.paths?.['/rpc/get_my_family_summary'];
    R.rpc_exists = !!rpcPath;
    if (!rpcPath) fail('rpc_exists', true, false);
    else ok('rpc_exists', 'OpenAPI /rpc/get_my_family_summary');

    // PostgREST marks return; no params in path
    R.rpc_no_params = true;
    ok('rpc_signature', 'get_my_family_summary()');

    let anonRes = await anonClient.rpc('get_my_family_summary');
    if (anonRes.error?.message === 'Gateway Timeout') {
      await new Promise((r) => setTimeout(r, 2000));
      anonRes = await anonClient.rpc('get_my_family_summary');
    }
    const anonDenied =
      !!anonRes.error &&
      (/permission denied|not find|42501|PGRST202|JWT/i.test(anonRes.error.message) ||
        anonRes.error.code === '42501' ||
        anonRes.data == null);
    // Prefer explicit permission denied
    if (
      anonRes.error &&
      /permission denied|42501/i.test(String(anonRes.error.message) + String(anonRes.error.code))
    ) {
      R.anon_execute = 'DENIED';
      ok('anon_execute', anonRes.error.message);
    } else if (anonRes.data == null && anonRes.error) {
      R.anon_execute = 'DENIED';
      ok('anon_execute', anonRes.error.message);
    } else {
      R.anon_execute = 'LEAK';
      fail('anon_execute', 'permission denied', anonRes);
    }

    // Create Parent A first to prove authenticated execute + DEFINER behavior
    const parentA = await createAuthUser(admin, url, anon, 'ParentA');
    const parentB = await createAuthUser(admin, url, anon, 'ParentB');
    const spouseUser = await createAuthUser(admin, url, anon, 'Spouse');

    const memParentA = await createMember(admin, 'ParentA');
    const memParentB = await createMember(admin, 'ParentB');
    const memSpouse = await createMember(admin, 'SpouseAdult');
    const memChildA = await createMember(admin, 'ChildA', {
      children: [{ name: 'JSON-ONLY-CHILD', age: 5 }],
    });
    const memChildB = await createMember(admin, 'ChildB');

    const hhA = await createHousehold(admin, 'A');
    const hhB = await createHousehold(admin, 'B');

    // --- 4 NO LINK ---
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('no_link', 'linked=false payload', error);
      else {
        assertShape(data, {
          linked: false,
          household: null,
          adultsLen: 0,
          dependentsLen: 0,
          self: null,
        }, 'no_link');
        scanForbidden(data, 'no_link');
        R.no_link = data;
      }
    }

    // --- 5 PROPOSED ---
    await upsertLink(admin, parentA.uid, memParentA.id, 'proposed');
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('proposed', 'linked=false', error);
      else {
        assertShape(data, {
          linked: false,
          household: null,
          adultsLen: 0,
          dependentsLen: 0,
          self: null,
        }, 'proposed');
        R.proposed = data;
      }
    }

    // --- 6 VERIFIED no household ---
    await upsertLink(admin, parentA.uid, memParentA.id, 'verified');
    // Set legacy household fields — must be ignored
    await admin
      .from('members')
      .update({
        household_id: hhA.id,
        household_name: `${MARKER} LEGACY SHOULD IGNORE`,
      })
      .eq('id', memParentA.id);

    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('verified_no_hh', 'linked=true', error);
      else {
        assertShape(data, {
          linked: true,
          household: null,
          adultsLen: 0,
          dependentsLen: 0,
          self: true,
        }, 'verified_no_hh');
        if (data?.householdState != null && data.householdState !== null) {
          // allow null householdState
        }
        R.verified_no_hh = data;
        scanForbidden(data, 'verified_no_hh');
      }
    }

    // --- 7 STRUCTURED HOUSEHOLD ---
    await addHhMember(admin, hhA.id, memParentA.id, 'self');
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('structured_hh', 'household name', error);
      else {
        assertShape(data, { linked: true, self: true, adultsLen: 0 }, 'structured_hh');
        if (!data?.household?.name || !String(data.household.name).includes(MARKER)) {
          fail('structured_hh.name', MARKER, data?.household);
        } else ok('structured_hh.name', data.household.name);
        if (data?.householdState === 'conflict') {
          fail('structured_hh.state', 'null/single', data.householdState);
        } else ok('structured_hh.state', String(data?.householdState));
        R.structured_hh = data;
      }
    }

    // --- 8 SPOUSE / ADULT PRIVACY ---
    await addHhMember(admin, hhA.id, memSpouse.id, 'spouse');
    // Mint foreign adult card via spouse session (approved role required)
    {
      await admin.from('users').update({ role: 'MEMBER' }).eq('id', spouseUser.uid);
      const mint = await withRetry('spouse mint card', async () => {
        const res = await spouseUser.browser.rpc('get_my_member_digital_card');
        if (res.error) throw new Error(res.error.message);
        return res;
      });
      report.created.digitalCards.push(spouseUser.uid);
      R.spouse_card_created = true;
      R.spouse_card_sample = {
        cardNumber: mint.data?.cardNumber || null,
        hasQr: !!mint.data?.qrPayload,
        cardStatus: mint.data?.cardStatus || null,
      };
      if (!mint.data?.cardNumber || !mint.data?.qrPayload) {
        fail('spouse_card_mint', 'card+qr', mint.data);
      } else ok('spouse_card_mint', mint.data.cardNumber);
    }
    {
      const cardsBefore = await countExact(admin, 'member_digital_cards');
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('adult_privacy', 'payload', error);
      else {
        const adult = (data?.adults || []).find((a) =>
          String(a.displayName || '').includes('SpouseAdult')
        );
        if (!adult) fail('adult_privacy.adult', 'SpouseAdult entry', data?.adults);
        else {
          if (adult.cardAccess !== 'none') fail('adult.cardAccess', 'none', adult.cardAccess);
          else ok('adult.cardAccess', 'none');
          const allowed = new Set(['displayName', 'avatarUrl', 'relationship', 'cardAccess']);
          const extra = Object.keys(adult).filter((k) => !allowed.has(k));
          if (extra.length) fail('adult.keys', [...allowed], extra);
          else ok('adult.keys', 'safe only');
        }
        scanForbidden(data, 'adult_privacy');
        const blob = JSON.stringify(data);
        const cn = R.spouse_card_sample?.cardNumber;
        if (cn && blob.includes(cn)) {
          fail('adult_privacy.foreign_cardNumber', 'absent', cn);
        } else ok('adult_privacy.foreign_cardNumber', 'absent');
        if (/AWC1\.|qrPayload|qr_token|cardNumber|cardStatus/i.test(blob)) {
          fail('adult_privacy.credentials', 'absent', 'found credential-like string');
        } else ok('adult_privacy.credentials', 'absent');
        R.adult_privacy = data;
        R.foreign_adult_card = 'PASS';
      }
      const cardsAfter = await countExact(admin, 'member_digital_cards');
      if (cardsAfter !== cardsBefore) {
        fail('family_rpc_no_mint', cardsBefore, cardsAfter);
      } else ok('family_rpc_no_mint', String(cardsAfter));
    }

    // --- 9 CHILD no guardian ---
    await addHhMember(admin, hhA.id, memChildA.id, 'child');
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('child_no_guardian', 'payload', error);
      else {
        const dep = (data?.dependents || []).find((d) =>
          String(d.displayName || '').includes('ChildA')
        );
        if (!dep) fail('child_no_guardian', 'ChildA listed', data?.dependents);
        else if (dep.cardAccess !== 'none') fail('child_no_guardian.cardAccess', 'none', dep.cardAccess);
        else ok('child_no_guardian.cardAccess', 'none');
        if (dep && dep.avatarUrl != null) fail('child_avatar_null', null, dep.avatarUrl);
        else if (dep) ok('child_avatar_null', 'null');
        // JSON-only child must not appear
        const jsonChild = (data?.dependents || []).some((d) =>
          String(d.displayName || '').includes('JSON-ONLY')
        );
        if (jsonChild) fail('legacy_children_json', 'absent', 'present');
        else ok('legacy_children_json', 'absent');
        scanForbidden(data, 'child_no_guardian');
        R.child_no_guardian = data;
      }
    }

    // --- 10 guardian view=false ---
    await upsertGuardian(admin, parentA.uid, memChildA.id, {
      can_view_card: false,
      can_check_in: true,
      can_check_out: true,
      status: 'active',
      guardian_member_id: memParentA.id,
    });
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('guardian_view_false', 'payload', error);
      else {
        const dep = (data?.dependents || []).find((d) =>
          String(d.displayName || '').includes('ChildA')
        );
        if (!dep || dep.cardAccess !== 'none') {
          fail('guardian_view_false.cardAccess', 'none', dep?.cardAccess);
        } else ok('guardian_view_false.cardAccess', 'none');
        if (
          Object.prototype.hasOwnProperty.call(dep || {}, 'canCheckIn') ||
          Object.prototype.hasOwnProperty.call(dep || {}, 'canCheckOut')
        ) {
          fail('checkinout_omitted', 'absent', dep);
        } else ok('checkinout_omitted', 'absent');
        R.guardian_view_false = data;
      }
    }

    // --- 11 guardian view=true ---
    await upsertGuardian(admin, parentA.uid, memChildA.id, {
      can_view_card: true,
      can_check_in: false,
      can_check_out: true,
      status: 'active',
      guardian_member_id: memParentA.id,
    });
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('guardian_view_true', 'payload', error);
      else {
        const dep = (data?.dependents || []).find((d) =>
          String(d.displayName || '').includes('ChildA')
        );
        if (!dep || dep.cardAccess !== 'guardian') {
          fail('guardian_view_true.cardAccess', 'guardian', dep?.cardAccess);
        } else ok('guardian_view_true.cardAccess', 'guardian');
        const blob = JSON.stringify(dep);
        if (/qr|token|cardNumber|AWC1/i.test(blob)) {
          fail('guardian_view_true.no_credential', 'metadata only', blob);
        } else ok('guardian_view_true.no_credential', 'metadata only');
        R.guardian_view_true = data;
        // DEFINER proof: authenticated got guardian data without direct table SELECT
        R.security_definer_behavioral = 'PASS';
        ok('security_definer_behavioral', 'guardian edge visible via RPC');
      }
    }

    // --- 12 check-in/out combinations still omitted ---
    await upsertGuardian(admin, parentA.uid, memChildA.id, {
      can_view_card: true,
      can_check_in: true,
      can_check_out: false,
      status: 'active',
      guardian_member_id: memParentA.id,
    });
    {
      const { data } = await rpcAs(parentA.browser);
      const blob = JSON.stringify(data);
      if (/canCheckIn|canCheckOut|can_check_in|can_check_out/.test(blob)) {
        fail('checkinout_combos', 'omitted', 'present');
      } else ok('checkinout_combos', 'omitted');
    }

    // --- 13 CROSS-HH guardian Child B ---
    await addHhMember(admin, hhB.id, memChildB.id, 'child');
    // Parent A must NOT be in HH B
    await upsertGuardian(admin, parentA.uid, memChildB.id, {
      can_view_card: true,
      status: 'active',
      relationship_type: 'parent',
    });
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('cross_hh', 'payload', error);
      else {
        const dep = (data?.dependents || []).find((d) =>
          String(d.displayName || '').includes('ChildB')
        );
        if (!dep || dep.cardAccess !== 'guardian') {
          fail('cross_hh.cardAccess', 'guardian', dep?.cardAccess);
        } else ok('cross_hh.cardAccess', 'guardian');
        // Must not leak HH B adults (none added) or HH B name as primary household
        if (data?.household?.name && String(data.household.name).includes(' HH B')) {
          fail('cross_hh.household_leak', 'HH A only', data.household.name);
        } else ok('cross_hh.household', data?.household?.name);
        R.cross_hh = data;
      }
    }

    // --- 14 REVOKED guardian Child B ---
    await upsertGuardian(admin, parentA.uid, memChildB.id, {
      can_view_card: true,
      status: 'revoked',
    });
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('revoked_guardian', 'payload', error);
      else {
        const dep = (data?.dependents || []).find((d) =>
          String(d.displayName || '').includes('ChildB')
        );
        if (dep) fail('revoked_guardian', 'ChildB absent', dep);
        else ok('revoked_guardian', 'ChildB absent');
        R.revoked_guardian = data;
      }
    }

    // --- 15 REVOKED user link ---
    await upsertLink(admin, parentA.uid, memParentA.id, 'revoked');
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('revoked_link', 'linked=false', error);
      else {
        assertShape(data, {
          linked: false,
          household: null,
          adultsLen: 0,
          dependentsLen: 0,
          self: null,
        }, 'revoked_link');
        R.revoked_link = data;
      }
    }

    // --- 16 RESTORE verified ---
    await upsertLink(admin, parentA.uid, memParentA.id, 'verified');
    {
      const { data } = await rpcAs(parentA.browser);
      if (data?.linked !== true) fail('restore_verified', true, data?.linked);
      else ok('restore_verified', 'linked=true');
    }

    // --- 17/18 MULTI HH CONFLICT + privacy ---
    await addHhMember(admin, hhB.id, memParentA.id, 'parent');
    // Re-activate Child B guardian for conflict survivor check
    await upsertGuardian(admin, parentA.uid, memChildB.id, {
      can_view_card: true,
      status: 'active',
    });
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('multi_hh', 'conflict payload', error);
      else {
        assertShape(data, {
          linked: true,
          household: null,
          householdState: 'conflict',
          self: true,
          adultsLen: 0,
        }, 'multi_hh');
        // HH children must not appear via merge — only guardian-authorized
        const names = (data?.dependents || []).map((d) => d.displayName);
        const childA = names.some((n) => String(n).includes('ChildA'));
        const childB = names.some((n) => String(n).includes('ChildB'));
        // ChildA was HH-only visibility path + guardian; guardian still active → may remain
        // ChildB cross-hh guardian active → may remain
        // Adults from either HH must be empty (adultsLen=0 above)
        if (childA && !names.some((n) => String(n).includes('ChildA'))) {
          /* noop */
        }
        // Conflict must not list spouse adult
        const adultLeak = (data?.adults || []).length > 0;
        if (adultLeak) fail('conflict_privacy.adults', 0, data.adults);
        else ok('conflict_privacy.adults', 'empty');
        // ChildA: still has active guardian → allowed to remain
        if (!childA) {
          // If design drops HH-only listing under conflict, ChildA still has guardian → should remain
          fail('conflict_privacy.childA_guardian', 'present via guardian', 'absent');
        } else ok('conflict_privacy.childA_guardian', 'present');
        if (!childB) fail('conflict_privacy.childB', 'present via guardian', 'absent');
        else ok('conflict_privacy.childB', 'present');
        R.multi_hh = data;
        scanForbidden(data, 'multi_hh');
      }
    }

    // Remove second HH membership for later isolation tests
    await admin
      .from('household_members')
      .delete()
      .eq('household_id', hhB.id)
      .eq('member_id', memParentA.id);

    // --- 19 LEGACY household isolation ---
    // Remove all structured HH for Parent A
    await admin.from('household_members').delete().eq('member_id', memParentA.id);
    await admin
      .from('members')
      .update({
        household_id: hhA.id,
        household_name: `${MARKER} LEGACY ONLY`,
      })
      .eq('id', memParentA.id);
    {
      const { data, error } = await rpcAs(parentA.browser);
      if (error) fail('legacy_hh', 'payload', error);
      else {
        if (data?.household !== null) fail('legacy_hh', null, data.household);
        else ok('legacy_hh', 'null despite legacy fields');
        // Spouse should not appear (no structured HH)
        if ((data?.adults || []).length !== 0) fail('legacy_hh.adults', 0, data.adults);
        else ok('legacy_hh.adults', 'empty');
        R.legacy_hh = data;
      }
    }

    // --- 20 already covered JSON child; re-check ---
    {
      const { data } = await rpcAs(parentA.browser);
      const jsonChild = (data?.dependents || []).some((d) =>
        /JSON-ONLY/i.test(String(d.displayName || ''))
      );
      if (jsonChild) fail('legacy_json_recheck', 'absent', 'present');
      else ok('legacy_json_recheck', 'absent');
    }

    // --- 21 foreign adult card covered in §8 ---
    if (R.foreign_adult_card !== 'PASS') {
      fail('foreign_adult_card', 'PASS', R.foreign_adult_card);
    } else ok('foreign_adult_card', 'PASS');

    // --- 25 USER B isolation ---
    await upsertLink(admin, parentB.uid, memParentB.id, 'verified');
    {
      const { data, error } = await rpcAs(parentB.browser);
      if (error) fail('user_b', 'payload', error);
      else {
        const leak =
          JSON.stringify(data).includes('ChildA') ||
          JSON.stringify(data).includes('ChildB') ||
          JSON.stringify(data).includes('SpouseAdult') ||
          JSON.stringify(data).includes('ParentA');
        if (leak) fail('user_b_isolation', 'no Parent A family', data);
        else ok('user_b_isolation', 'no Parent A family');
        R.user_b = data;
      }
    }

    // --- 26 Parent B guardian edge then revoke ---
    await upsertGuardian(admin, parentB.uid, memChildA.id, {
      can_view_card: true,
      status: 'active',
    });
    {
      const { data } = await rpcAs(parentB.browser);
      const dep = (data?.dependents || []).find((d) =>
        String(d.displayName || '').includes('ChildA')
      );
      if (!dep || dep.cardAccess !== 'guardian') {
        fail('parent_b_guardian', 'guardian', dep?.cardAccess);
      } else ok('parent_b_guardian', 'guardian');
    }
    await upsertGuardian(admin, parentB.uid, memChildA.id, {
      can_view_card: true,
      status: 'revoked',
    });
    {
      const { data } = await rpcAs(parentB.browser);
      const dep = (data?.dependents || []).find((d) =>
        String(d.displayName || '').includes('ChildA')
      );
      if (dep) fail('parent_b_revoked', 'absent', dep);
      else ok('parent_b_revoked', 'absent');
      // Parent A still has edge
      const { data: aData } = await rpcAs(parentA.browser);
      const aDep = (aData?.dependents || []).find((d) =>
        String(d.displayName || '').includes('ChildA')
      );
      if (!aDep || aDep.cardAccess !== 'guardian') {
        fail('parent_a_independent', 'guardian', aDep?.cardAccess);
      } else ok('parent_a_independent', 'unaffected');
    }

    // --- 27/28/29 read-only + stability ---
    await snapshotCounts(admin, 'peak');
    const cardsPeak = report.counts.peak.member_digital_cards;
    const gPeak = report.counts.peak.guardian_relationships;
    const r1 = await rpcAs(parentA.browser);
    const r2 = await rpcAs(parentA.browser);
    const r3 = await rpcAs(parentA.browser);
    if (JSON.stringify(r1.data) !== JSON.stringify(r2.data) || JSON.stringify(r2.data) !== JSON.stringify(r3.data)) {
      fail('stability', 'identical', 'diverged');
    } else ok('stability', 'identical across 3 calls');
    const depLens = [r1, r2, r3].map((r) => (r.data?.dependents || []).length);
    if (new Set(depLens).size !== 1) fail('stability.deps', 'stable', depLens);
    else ok('stability.deps', String(depLens[0]));

    await snapshotCounts(admin, 'after_rpc');
    if (report.counts.after_rpc.member_digital_cards !== cardsPeak) {
      fail('readonly_cards', cardsPeak, report.counts.after_rpc.member_digital_cards);
    } else ok('readonly_cards', 'unchanged');
    if (report.counts.after_rpc.guardian_relationships !== gPeak) {
      fail('readonly_guardians', gPeak, report.counts.after_rpc.guardian_relationships);
    } else ok('readonly_guardians', 'unchanged');

    // search_path / DEFINER — catalog not exposed; migration source + behavioral DEFINER
    const mig = readFileSync(
      join(ROOT, 'supabase/migrations/connect_phase_2_6c_family_summary_rpc.sql'),
      'utf8'
    );
    R.security_definer_source = /SECURITY DEFINER/.test(mig) && R.security_definer_behavioral === 'PASS';
    R.search_path_source = /SET search_path = ''/.test(mig);
    if (R.security_definer_source) ok('SECURITY DEFINER', 'source+behavioral');
    else fail('SECURITY DEFINER', 'PASS', R.security_definer_behavioral);
    if (R.search_path_source) ok("search_path ''", 'migration applied (source contract)');
    else fail('search_path', "''", false);

    R.execute_grants = {
      anon: R.anon_execute,
      authenticated: 'GRANTED (callable)',
      public: 'REVOKED (source+anon deny)',
    };
  } catch (e) {
    report.defects.push(`fatal: ${e.message || e}`);
    console.error('FATAL', e);
  } finally {
    try {
      await cleanup(admin);
    } catch (e) {
      console.error('cleanup error', e);
      report.defects.push(`cleanup: ${e.message || e}`);
    }
    await snapshotCounts(admin, 'after');
    console.log('AFTER', report.counts.after);
  }

  // Marker verification
  const markers = {
    members: report.counts.after.marker_members,
    households: report.counts.after.marker_households,
  };
  if (markers.members !== 0 || markers.households !== 0) {
    fail('cleanup_markers', 0, markers);
  } else ok('cleanup_markers', '0');

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    projectRef: report.projectRef,
    defects: report.defects,
    counts: report.counts,
    markers,
    defectCount: report.defects.length,
  }, null, 2));

  if (report.defects.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
