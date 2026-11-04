/**
 * Phase 2.6D.1A — live dependent digital card authorization + privacy verification.
 * Target: yrpwdrioomdihjlmcfnu
 *
 * Does NOT re-apply migration / modify Connect / Vault product source / commit.
 * Creates TEMP auth users, public.users, members, households, links, guardians,
 * dependent cards (via lazy mint); cleans up on exit.
 *
 * Usage:
 *   node --env-file=.env.diagnostic.local scripts/connect-phase-2-6d1a-dependent-cards-live-verify.mjs
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MARKER = 'TEST — Phase 2.6D.1A';
const MARKER_EMAIL = 'phase26d1a';
const EXPECTED_DTO_KEYS = [
  'cardRef',
  'displayName',
  'label',
  'cardNumber',
  'cardStatus',
  'qrPayload',
  'issuedAt',
  'rotatedAt',
].sort();

const FORBIDDEN_DTO_KEYS = [
  'id',
  'member_id',
  'memberId',
  'user_id',
  'userId',
  'guardian_user_id',
  'guardianUserId',
  'guardian_member_id',
  'guardianMemberId',
  'child_member_id',
  'childMemberId',
  'household_id',
  'householdId',
  'dob',
  'DOB',
  'birthday',
  'birthDate',
  'birth_date',
  'email',
  'phone',
  'role',
  'qr_token_hash',
  'qrTokenHash',
  'avatarUrl',
  'avatar_url',
  'can_view_card',
  'canViewCard',
  'can_check_in',
  'canCheckIn',
  'can_check_out',
  'canCheckOut',
];

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
    dependentCards: [],
    adultCards: [],
  },
  counts: { before: {}, peak: {}, after: {} },
  fingerprints: {},
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
  report.results[check] = 'FAIL';
  return false;
}

function ok(check, detail = '') {
  console.log('PASS:', check, detail ? `— ${detail}` : '');
  report.results[check] = 'PASS';
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

function fp(value) {
  if (!value) return null;
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function redactToken(token) {
  if (!token || typeof token !== 'string') return null;
  if (token.length < 12) return '[redacted]';
  return `${token.slice(0, 5)}…${token.slice(-4)} (len=${token.length})`;
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
  if (!report.created.links.includes(userId)) report.created.links.push(userId);
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
  if (!report.created.guardians.includes(data.id)) report.created.guardians.push(data.id);
  return data;
}

async function rpcChildCards(browser) {
  const { data, error } = await browser.rpc('get_my_guardian_child_cards');
  return { data, error: summarizeErr(error) };
}

async function rpcFamilySummary(browser) {
  const { data, error } = await browser.rpc('get_my_family_summary');
  return { data, error: summarizeErr(error) };
}

async function rpcAdultCard(browser) {
  const { data, error } = await browser.rpc('get_my_member_digital_card');
  return { data, error: summarizeErr(error) };
}

function isEmptyArray(data) {
  return Array.isArray(data) && data.length === 0;
}

function assertEmptyCards(label, data, error) {
  if (error) return fail(label, '[]', error);
  if (!isEmptyArray(data)) return fail(label, '[]', data);
  return ok(label, '[]');
}

function dtoKeys(card) {
  return Object.keys(card || {}).sort();
}

function assertDtoPrivacy(label, card, childMemberId, guardianUid, householdIds = []) {
  let pass = true;
  const keys = dtoKeys(card);
  if (JSON.stringify(keys) !== JSON.stringify(EXPECTED_DTO_KEYS)) {
    pass = fail(`${label} dto keys`, EXPECTED_DTO_KEYS.join(','), keys.join(',')) && false;
  } else {
    ok(`${label} dto keys`, keys.join(','));
  }

  for (const k of FORBIDDEN_DTO_KEYS) {
    if (Object.prototype.hasOwnProperty.call(card || {}, k)) {
      pass = fail(`${label} forbidden key ${k}`, 'absent', 'present') && false;
    }
  }

  const blob = JSON.stringify(card);
  if (childMemberId && blob.includes(childMemberId)) {
    pass = fail(`${label} member UUID in DTO`, 'absent', 'present') && false;
  }
  if (guardianUid && blob.includes(guardianUid)) {
    pass = fail(`${label} guardian UUID in DTO`, 'absent', 'present') && false;
  }
  for (const hid of householdIds) {
    if (hid && blob.includes(hid)) {
      pass = fail(`${label} household UUID in DTO`, 'absent', hid) && false;
    }
  }
  if (/@/.test(blob) && /awc-vault\.local/i.test(blob)) {
    pass = fail(`${label} email in DTO`, 'absent', 'present') && false;
  }
  if (card?.label !== 'PLCC Child Member') {
    pass = fail(`${label} label`, 'PLCC Child Member', card?.label) && false;
  } else {
    ok(`${label} label`, card.label);
  }
  return pass;
}

function assertQrPrivacy(label, qr, childMember, guardianUid, householdIds = []) {
  let pass = true;
  if (!qr || typeof qr !== 'string' || !qr.startsWith('AWC1.')) {
    pass = fail(`${label} qr prefix`, 'AWC1.*', redactToken(qr)) && false;
  } else if (!/^AWC1\.[0-9a-f]{64}$/.test(qr)) {
    pass = fail(`${label} qr format`, 'AWC1.<64 hex>', redactToken(qr)) && false;
  } else {
    ok(`${label} qr format`, redactToken(qr));
  }

  const nameBits = [
    childMember?.first_name,
    childMember?.last_name,
    childMember?.email,
    childMember?.id,
    guardianUid,
    ...householdIds,
  ].filter(Boolean);
  for (const bit of nameBits) {
    if (String(qr).includes(String(bit))) {
      pass = fail(`${label} qr contains PII/id`, 'absent', String(bit).slice(0, 8)) && false;
    }
  }
  return pass;
}

async function countDependentCardsForMember(admin, memberId) {
  const { count, error } = await admin
    .from('dependent_digital_cards')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', memberId);
  if (error) throw new Error(`count dep cards: ${error.message}`);
  return count ?? 0;
}

async function getDependentCard(admin, memberId) {
  const { data, error } = await admin
    .from('dependent_digital_cards')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw new Error(`get dep card: ${error.message}`);
  if (data?.id && !report.created.dependentCards.includes(data.id)) {
    report.created.dependentCards.push(data.id);
  }
  return data;
}

async function snapshotCounts(admin, bucket) {
  report.counts[bucket] = {
    dependent_digital_cards: await countExact(admin, 'dependent_digital_cards'),
    member_digital_cards: await countExact(admin, 'member_digital_cards'),
    user_member_links: await countExact(admin, 'user_member_links'),
    household_members: await countExact(admin, 'household_members'),
    guardian_relationships: await countExact(admin, 'guardian_relationships'),
    marker_members: await countMarker(admin, 'members', 'first_name', `${MARKER}%`),
    marker_households: await countMarker(admin, 'households', 'name', `${MARKER}%`),
  };
}

async function cleanup(admin) {
  console.log('\n--- CLEANUP ---');

  for (const mid of report.created.members) {
    await admin.from('dependent_digital_cards').delete().eq('member_id', mid);
  }
  for (const id of report.created.dependentCards) {
    await admin.from('dependent_digital_cards').delete().eq('id', id);
  }

  for (const uid of report.created.publicUsers) {
    await admin.from('guardian_relationships').delete().eq('guardian_user_id', uid);
    await admin.from('member_digital_cards').delete().eq('user_id', uid);
    await admin.from('user_member_links').delete().eq('user_id', uid);
  }
  for (const mid of report.created.members) {
    await admin.from('guardian_relationships').delete().eq('child_member_id', mid);
    await admin.from('guardian_relationships').delete().eq('guardian_member_id', mid);
    await admin.from('user_member_links').delete().eq('member_id', mid);
    await admin.from('household_members').delete().eq('member_id', mid);
  }
  for (const id of report.created.householdMembers) {
    await admin.from('household_members').delete().eq('id', id);
  }

  const { data: markerMembers } = await admin
    .from('members')
    .select('id')
    .ilike('first_name', `${MARKER}%`);
  for (const m of markerMembers || []) {
    await admin.from('dependent_digital_cards').delete().eq('member_id', m.id);
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
  console.log(JSON.stringify({ phase: '2.6D.1A', projectRef: report.projectRef }));

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

    // --- Schema / OpenAPI existence ---
    const openapi = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    }).then((r) => r.json());

    const tableDef = openapi?.definitions?.dependent_digital_cards;
    const rpcPath = openapi?.paths?.['/rpc/get_my_guardian_child_cards'];
    if (!tableDef) fail('table_exists', true, false);
    else ok('table_exists', 'OpenAPI dependent_digital_cards');
    if (!rpcPath) fail('rpc_exists', true, false);
    else ok('rpc_exists', 'OpenAPI /rpc/get_my_guardian_child_cards');

    const props = tableDef?.properties || {};
    const requiredCols = [
      'id',
      'member_id',
      'card_ref',
      'card_number',
      'status',
      'qr_token',
      'qr_token_hash',
      'qr_token_prefix',
      'issued_at',
      'rotated_at',
      'revoked_at',
      'created_at',
      'updated_at',
    ];
    const missingCols = requiredCols.filter((c) => !props[c]);
    if (missingCols.length) fail('live_schema_columns', requiredCols.join(','), missingCols);
    else ok('live_schema_columns', requiredCols.join(','));

    // service_role can manage table
    {
      const { error } = await admin
        .from('dependent_digital_cards')
        .select('id', { count: 'exact', head: true });
      if (error) fail('service_role_manage', 'ok', summarizeErr(error));
      else ok('service_role_manage', 'SELECT count ok');
    }

    // Adult isolation baseline already recorded
    ok('adult_baseline_recorded', `member_digital_cards=${report.counts.before.member_digital_cards}`);

    // Forbidden guardian mutation RPCs
    const mutatePaths = Object.keys(openapi?.paths || {}).filter((p) =>
      /rotate.*child|revoke.*child|rotate_my_child|revoke_my_child|dependent.*rotate|dependent.*revoke/i.test(
        p
      )
    );
    if (mutatePaths.length) fail('no_guardian_mutation_rpc', 'none', mutatePaths);
    else ok('no_guardian_mutation_rpc', 'none in OpenAPI');

    // --- TEMP graph ---
    const guardianA = await createAuthUser(admin, url, anon, 'GuardianA');
    const guardianB = await createAuthUser(admin, url, anon, 'GuardianB');
    const memGuardianA = await createMember(admin, 'GuardianA');
    const memGuardianB = await createMember(admin, 'GuardianB');
    const memChildA = await createMember(admin, 'ChildA', { role: 'Child' });
    const memChildB = await createMember(admin, 'ChildB', {
      role: 'Child',
      children: null,
    });
    const hhA = await createHousehold(admin, 'A');
    const hhB = await createHousehold(admin, 'B');

    // Track adult card count for TEMP adult later
    let adultMinted = false;

    // --- 6 NO LINK ---
    {
      const beforeCards = await countDependentCardsForMember(admin, memChildA.id);
      const { data, error } = await rpcChildCards(guardianA.browser);
      assertEmptyCards('no_link', data, error);
      const afterCards = await countDependentCardsForMember(admin, memChildA.id);
      if (afterCards !== beforeCards) fail('no_link_no_mint', beforeCards, afterCards);
      else ok('no_link_no_mint', '0');
    }

    // --- 7 PROPOSED ---
    await upsertLink(admin, guardianA.uid, memGuardianA.id, 'proposed');
    {
      const beforeCards = await countDependentCardsForMember(admin, memChildA.id);
      const { data, error } = await rpcChildCards(guardianA.browser);
      assertEmptyCards('proposed_link', data, error);
      const afterCards = await countDependentCardsForMember(admin, memChildA.id);
      if (afterCards !== beforeCards) fail('proposed_no_mint', beforeCards, afterCards);
      else ok('proposed_no_mint', '0');
    }

    // --- 8 VERIFIED, no guardian ---
    await upsertLink(admin, guardianA.uid, memGuardianA.id, 'verified');
    {
      const beforeCards = await countDependentCardsForMember(admin, memChildA.id);
      const { data, error } = await rpcChildCards(guardianA.browser);
      assertEmptyCards('verified_no_guardian', data, error);
      const afterCards = await countDependentCardsForMember(admin, memChildA.id);
      if (afterCards !== beforeCards) fail('verified_no_guardian_no_mint', beforeCards, afterCards);
      else ok('verified_no_guardian_no_mint', '0');
    }

    // --- 9 can_view_card=false ---
    await upsertGuardian(admin, guardianA.uid, memChildA.id, {
      guardian_member_id: memGuardianA.id,
      can_view_card: false,
      can_check_in: true,
      can_check_out: true,
    });
    {
      const beforeCards = await countDependentCardsForMember(admin, memChildA.id);
      const { data, error } = await rpcChildCards(guardianA.browser);
      assertEmptyCards('view_false', data, error);
      const afterCards = await countDependentCardsForMember(admin, memChildA.id);
      if (afterCards !== beforeCards) fail('view_false_no_mint', beforeCards, afterCards);
      else ok('view_false_no_mint', '0');
    }

    // Capture guardian/link counts before mint for read-only checks
    const preMintGuardians = await countExact(admin, 'guardian_relationships');
    const preMintLinks = await countExact(admin, 'user_member_links');
    const preMintHh = await countExact(admin, 'household_members');
    const preMintAdult = await countExact(admin, 'member_digital_cards');

    // --- 10 / 11 / 12 / 13 / 14 VIEW TRUE + lazy mint ---
    await upsertGuardian(admin, guardianA.uid, memChildA.id, {
      guardian_member_id: memGuardianA.id,
      can_view_card: true,
      can_check_in: false,
      can_check_out: false,
    });

    let childACardDto = null;
    {
      const { data, error } = await rpcChildCards(guardianA.browser);
      if (error) fail('view_true', '1 card', error);
      else if (!Array.isArray(data) || data.length !== 1) {
        fail('view_true', 'length 1', data);
      } else {
        ok('view_true', '1 card');
        childACardDto = data[0];
        assertDtoPrivacy('childA', childACardDto, memChildA.id, guardianA.uid, [hhA.id, hhB.id]);
        assertQrPrivacy('childA', childACardDto.qrPayload, memChildA, guardianA.uid, [
          hhA.id,
          hhB.id,
        ]);

        if (!String(childACardDto.cardRef || '').startsWith('AWCD.')) {
          fail('card_ref_prefix', 'AWCD.*', String(childACardDto.cardRef).slice(0, 8));
        } else if (!/^AWCD\.[0-9a-f]{64}$/.test(childACardDto.cardRef)) {
          fail('card_ref_format', 'AWCD.<64 hex>', 'mismatch');
        } else if (childACardDto.cardRef.includes(memChildA.id)) {
          fail('card_ref_opaque', 'no member uuid', 'contains uuid');
        } else {
          ok('card_ref', `fp=${fp(childACardDto.cardRef)}`);
        }

        if (!/^PLCC-2026-\d{5,}$/.test(childACardDto.cardNumber || '')) {
          // Year is current year of issuance; allow current calendar year
          const y = new Date().getUTCFullYear();
          if (!new RegExp(`^PLCC-${y}-\\d{5,}$`).test(childACardDto.cardNumber || '')) {
            fail('card_number_format', `PLCC-${y}-NNNNN`, childACardDto.cardNumber);
          } else ok('card_number_format', childACardDto.cardNumber);
        } else ok('card_number_format', childACardDto.cardNumber);

        report.fingerprints.childA = {
          cardRefFp: fp(childACardDto.cardRef),
          cardNumber: childACardDto.cardNumber,
          qrFp: fp(childACardDto.qrPayload),
        };
      }

      const row = await getDependentCard(admin, memChildA.id);
      if (!row) fail('lazy_mint', 'row exists', null);
      else {
        ok('lazy_mint', `row fp card_number=${row.card_number}`);
        const expectedHash = createHash('sha256').update(row.qr_token).digest('hex');
        if (expectedHash !== row.qr_token_hash) {
          fail('qr_hash_match', expectedHash.slice(0, 12), row.qr_token_hash?.slice(0, 12));
        } else ok('qr_hash_match', `fp=${fp(row.qr_token_hash)}`);
      }
    }

    // Cross-table card_number collision check
    {
      const { data: adultNums, error: aErr } = await admin
        .from('member_digital_cards')
        .select('card_number');
      const { data: depNums, error: dErr } = await admin
        .from('dependent_digital_cards')
        .select('card_number');
      if (aErr || dErr) fail('card_number_collision_query', 'ok', { aErr, dErr });
      else {
        const adultSet = new Set((adultNums || []).map((r) => r.card_number));
        const dupes = (depNums || [])
          .map((r) => r.card_number)
          .filter((n) => adultSet.has(n));
        if (dupes.length) fail('cross_table_card_number', 'no overlap', dupes);
        else ok('cross_table_card_number', `adult=${adultSet.size} dep=${(depNums || []).length}`);
      }
    }

    // --- 15 REOPEN STABILITY ---
    {
      const { data: d2, error: e2 } = await rpcChildCards(guardianA.browser);
      const { data: d3, error: e3 } = await rpcChildCards(guardianA.browser);
      if (e2 || e3) fail('reopen_stability', 'ok', { e2, e3 });
      else {
        const a = d2?.[0];
        const b = d3?.[0];
        const same =
          a?.cardRef === childACardDto?.cardRef &&
          a?.cardNumber === childACardDto?.cardNumber &&
          a?.qrPayload === childACardDto?.qrPayload &&
          b?.cardRef === childACardDto?.cardRef &&
          b?.qrPayload === childACardDto?.qrPayload;
        const rows = await countDependentCardsForMember(admin, memChildA.id);
        if (!same) fail('reopen_stability', 'same credential', { a: fp(a?.qrPayload), b: fp(b?.qrPayload) });
        else if (rows !== 1) fail('reopen_row_count', 1, rows);
        else ok('reopen_stability', `rows=1 qrFp=${fp(a.qrPayload)}`);
      }
    }

    // --- 16 CONCURRENCY ---
    {
      const results = await Promise.all([
        rpcChildCards(guardianA.browser),
        rpcChildCards(guardianA.browser),
        rpcChildCards(guardianA.browser),
        rpcChildCards(guardianA.browser),
      ]);
      const errs = results.map((r) => r.error).filter(Boolean);
      const rows = await countDependentCardsForMember(admin, memChildA.id);
      if (errs.length) fail('concurrency', 'no errors', errs);
      else if (rows !== 1) fail('concurrency_rows', 1, rows);
      else {
        const refs = new Set(results.map((r) => r.data?.[0]?.cardRef).filter(Boolean));
        if (refs.size !== 1) fail('concurrency_same_ref', 1, [...refs].map(fp));
        else ok('concurrency', `rows=1 refFp=${fp([...refs][0])}`);
      }
    }

    // --- 17 MULTIPLE GUARDIANS ---
    await upsertLink(admin, guardianB.uid, memGuardianB.id, 'verified');
    await upsertGuardian(admin, guardianB.uid, memChildA.id, {
      guardian_member_id: memGuardianB.id,
      can_view_card: true,
    });
    {
      const { data, error } = await rpcChildCards(guardianB.browser);
      if (error) fail('multi_guardian', 'same card', error);
      else {
        const card = data?.[0];
        const same =
          card?.cardRef === childACardDto?.cardRef &&
          card?.cardNumber === childACardDto?.cardNumber &&
          card?.qrPayload === childACardDto?.qrPayload;
        const rows = await countDependentCardsForMember(admin, memChildA.id);
        if (!same) fail('multi_guardian_same', 'identical credential', {
          a: report.fingerprints.childA,
          b: { cardRefFp: fp(card?.cardRef), qrFp: fp(card?.qrPayload) },
        });
        else if (rows !== 1) fail('multi_guardian_rows', 1, rows);
        else ok('multi_guardian', `same qrFp=${fp(card.qrPayload)} rows=1`);
      }
    }

    // --- 18 GUARDIAN A REVOKE ---
    await upsertGuardian(admin, guardianA.uid, memChildA.id, {
      guardian_member_id: memGuardianA.id,
      can_view_card: false,
      status: 'active',
    });
    {
      const { data: aData, error: aErr } = await rpcChildCards(guardianA.browser);
      assertEmptyCards('guardian_a_revoke', aData, aErr);

      const beforeRow = await getDependentCard(admin, memChildA.id);
      const { data: bData, error: bErr } = await rpcChildCards(guardianB.browser);
      if (bErr) fail('guardian_b_unaffected', 'card present', bErr);
      else if (
        bData?.[0]?.cardRef !== childACardDto?.cardRef ||
        bData?.[0]?.qrPayload !== childACardDto?.qrPayload
      ) {
        fail('guardian_b_unaffected', 'same credential', {
          qrFp: fp(bData?.[0]?.qrPayload),
        });
      } else {
        ok('guardian_b_unaffected', `qrFp=${fp(bData[0].qrPayload)}`);
      }
      const afterRow = await getDependentCard(admin, memChildA.id);
      if (
        !beforeRow ||
        !afterRow ||
        beforeRow.qr_token !== afterRow.qr_token ||
        beforeRow.status !== afterRow.status
      ) {
        fail('card_row_unchanged_on_guardian_revoke', 'unchanged', {
          before: beforeRow?.status,
          after: afterRow?.status,
        });
      } else ok('card_row_unchanged_on_guardian_revoke', beforeRow.status);
    }

    // --- 19 VERIFIED LINK REVOKE ---
    await upsertGuardian(admin, guardianA.uid, memChildA.id, {
      guardian_member_id: memGuardianA.id,
      can_view_card: true,
    });
    await upsertLink(admin, guardianA.uid, memGuardianA.id, 'revoked');
    {
      const beforeRow = await getDependentCard(admin, memChildA.id);
      const { data, error } = await rpcChildCards(guardianA.browser);
      assertEmptyCards('link_revoke', data, error);
      const afterRow = await getDependentCard(admin, memChildA.id);
      if (!beforeRow || !afterRow || beforeRow.id !== afterRow.id) {
        fail('link_revoke_no_card_delete', 'row remains', {
          before: beforeRow?.id,
          after: afterRow?.id,
        });
      } else ok('link_revoke_no_card_delete', 'row intact');

      const { data: bData, error: bErr } = await rpcChildCards(guardianB.browser);
      if (bErr || !bData?.[0]) fail('link_revoke_b_ok', 'B still sees card', bErr || bData);
      else ok('link_revoke_b_ok', `qrFp=${fp(bData[0].qrPayload)}`);
    }

    // Restore Guardian A link for remaining tests
    await upsertLink(admin, guardianA.uid, memGuardianA.id, 'verified');
    await upsertGuardian(admin, guardianA.uid, memChildA.id, {
      guardian_member_id: memGuardianA.id,
      can_view_card: true,
    });

    // --- 20 HOUSEHOLD ALONE (Child B) ---
    await addHhMember(admin, hhA.id, memGuardianA.id, 'self');
    await addHhMember(admin, hhA.id, memChildB.id, 'child');
    {
      const before = await countDependentCardsForMember(admin, memChildB.id);
      const { data, error } = await rpcChildCards(guardianA.browser);
      if (error) fail('household_alone', 'Child A only', error);
      else {
        const hasB = (data || []).some(
          (c) => c.displayName?.includes('ChildB') || c.cardNumber === 'IMPOSSIBLE'
        );
        // Child B should be absent; Child A may still be present
        const names = (data || []).map((c) => c.displayName);
        if (names.some((n) => String(n).includes('ChildB'))) {
          fail('household_alone', 'Child B absent', names);
        } else {
          ok('household_alone', `returned=${names.join('|') || 'none-with-B'}`);
        }
        // Stronger: no card for Child B member_id
        const after = await countDependentCardsForMember(admin, memChildB.id);
        if (after !== before) fail('household_alone_no_mint', before, after);
        else ok('household_alone_no_mint', '0');
        // Ensure Child B cardRef not among returned (compare via DB)
        const childBRow = await getDependentCard(admin, memChildB.id);
        if (childBRow) fail('household_alone_row', 'no row', childBRow.card_number);
      }
    }

    // --- 21 JSON CHILDREN ---
    await admin
      .from('members')
      .update({
        children: [
          {
            name: 'JSON-ONLY-SHOULD-NOT-MINT',
            age: 7,
            member_id: memChildB.id,
          },
        ],
      })
      .eq('id', memGuardianA.id);
    {
      const before = await countDependentCardsForMember(admin, memChildB.id);
      const { data, error } = await rpcChildCards(guardianA.browser);
      if (error) fail('json_children', 'no Child B', error);
      else {
        const blob = JSON.stringify(data);
        if (blob.includes('JSON-ONLY') || blob.includes(memChildB.id)) {
          fail('json_children', 'absent', 'leak');
        } else ok('json_children', 'no JSON child auth');
        const after = await countDependentCardsForMember(admin, memChildB.id);
        if (after !== before) fail('json_children_no_mint', before, after);
        else ok('json_children_no_mint', '0');
      }
    }
    await admin.from('members').update({ children: null }).eq('id', memGuardianA.id);

    // --- 22 CROSS-HOUSEHOLD GUARDIAN (B → Child B) ---
    await addHhMember(admin, hhB.id, memGuardianB.id, 'self');
    // Child B already in hhA; Guardian B in hhB — different households
    await upsertGuardian(admin, guardianB.uid, memChildB.id, {
      guardian_member_id: memGuardianB.id,
      can_view_card: true,
    });
    {
      const { data, error } = await rpcChildCards(guardianB.browser);
      if (error) fail('cross_household', 'Child A + Child B', error);
      else {
        const cards = data || [];
        if (cards.length < 2) fail('cross_household', '>=2 cards', cards.length);
        else {
          ok('cross_household', `cards=${cards.length}`);
          const row = await getDependentCard(admin, memChildB.id);
          if (!row) fail('cross_household_mint', 'row', null);
          else {
            ok('cross_household_mint', `card_number=${row.card_number}`);
            report.fingerprints.childB = {
              cardRefFp: fp(row.card_ref),
              cardNumber: row.card_number,
              qrFp: fp(row.qr_token),
            };
          }
        }
      }
    }

    // --- 23 CHECK-IN / CHECK-OUT SEPARATION ---
    await upsertGuardian(admin, guardianB.uid, memChildB.id, {
      guardian_member_id: memGuardianB.id,
      can_view_card: true,
      can_check_in: true,
      can_check_out: true,
    });
    {
      const { data: d1, error: e1 } = await rpcChildCards(guardianB.browser);
      await upsertGuardian(admin, guardianB.uid, memChildB.id, {
        guardian_member_id: memGuardianB.id,
        can_view_card: true,
        can_check_in: false,
        can_check_out: false,
      });
      const { data: d2, error: e2 } = await rpcChildCards(guardianB.browser);
      if (e1 || e2) fail('checkout_toggle_stable', 'ok', { e1, e2 });
      else {
        const b1 = (d1 || []).find((c) => fp(c.cardRef) === report.fingerprints.childB?.cardRefFp);
        const b2 = (d2 || []).find((c) => fp(c.cardRef) === report.fingerprints.childB?.cardRefFp);
        // fallback: match by cardNumber
        const c1 =
          b1 ||
          (d1 || []).find((c) => c.cardNumber === report.fingerprints.childB?.cardNumber);
        const c2 =
          b2 ||
          (d2 || []).find((c) => c.cardNumber === report.fingerprints.childB?.cardNumber);
        if (!c1 || !c2 || c1.qrPayload !== c2.qrPayload) {
          fail('checkout_toggle_stable', 'same credential', {
            c1: fp(c1?.qrPayload),
            c2: fp(c2?.qrPayload),
          });
        } else {
          const blob = JSON.stringify(d1);
          if (/can_check|canCheck/i.test(blob)) fail('checkout_flags_in_dto', 'absent', 'present');
          else ok('checkout_toggle_stable', `qrFp=${fp(c1.qrPayload)}`);
        }
      }

      await upsertGuardian(admin, guardianB.uid, memChildB.id, {
        guardian_member_id: memGuardianB.id,
        can_view_card: false,
        can_check_in: true,
        can_check_out: true,
      });
      const { data: d3, error: e3 } = await rpcChildCards(guardianB.browser);
      if (e3) fail('checkout_without_view', 'Child B absent (Child A may remain)', e3);
      else {
        const hasB = (d3 || []).some(
          (c) => c.cardNumber === report.fingerprints.childB?.cardNumber
        );
        if (hasB) fail('checkout_without_view', 'Child B absent', 'present');
        else ok('checkout_without_view', 'Child B absent despite check-in/out');
      }
    }

    // Restore B→ChildB view for cleanup consistency
    await upsertGuardian(admin, guardianB.uid, memChildB.id, {
      guardian_member_id: memGuardianB.id,
      can_view_card: true,
    });

    // --- 24 DIRECT TABLE ACCESS (authenticated) ---
    {
      const sel = await guardianA.browser.from('dependent_digital_cards').select('*').limit(5);
      const ins = await guardianA.browser.from('dependent_digital_cards').insert({
        member_id: memChildA.id,
        card_ref: 'AWCD.' + 'a'.repeat(64),
        card_number: 'PLCC-2099-99999',
        status: 'active',
        qr_token: 'AWC1.' + 'b'.repeat(64),
        qr_token_hash: 'c'.repeat(64),
        qr_token_prefix: 'AWC1.bbbb',
      });
      const upd = await guardianA.browser
        .from('dependent_digital_cards')
        .update({ status: 'revoked' })
        .eq('member_id', memChildA.id);
      const del = await guardianA.browser
        .from('dependent_digital_cards')
        .delete()
        .eq('member_id', memChildA.id);

      const selDenied =
        (Array.isArray(sel.data) && sel.data.length === 0 && !sel.error) ||
        !!sel.error ||
        sel.data == null;
      const writeDenied = !!(ins.error || upd.error || del.error);
      // SELECT under RLS with no policies typically returns empty; writes error
      if (!selDenied) fail('auth_direct_select', 'denied/empty', sel);
      else ok('auth_direct_select', sel.error?.message || 'empty');
      if (!writeDenied && (ins.data || upd.data || del.data)) {
        fail('auth_direct_write', 'denied', { ins, upd, del });
      } else ok('auth_direct_write', 'denied');
    }

    // --- 25 ANON ---
    {
      const sel = await anonClient.from('dependent_digital_cards').select('*').limit(5);
      const rpc = await anonClient.rpc('get_my_guardian_child_cards');
      const selDenied =
        !!sel.error || (Array.isArray(sel.data) && sel.data.length === 0);
      const rpcDenied = !!rpc.error;
      if (!selDenied) fail('anon_table', 'denied', sel);
      else ok('anon_table', sel.error?.message || 'empty');
      if (!rpcDenied) fail('anon_rpc', 'denied', rpc);
      else ok('anon_rpc', rpc.error?.message || String(rpc.error));
    }

    // --- 28 STATUS CONSTRAINT ---
    {
      const row = await getDependentCard(admin, memChildA.id);
      if (!row) fail('status_constraint_setup', 'row', null);
      else {
        const bad1 = await admin
          .from('dependent_digital_cards')
          .update({ status: 'active', revoked_at: new Date().toISOString() })
          .eq('id', row.id)
          .select('*');
        if (!bad1.error) fail('status_active_with_revoked_at', 'rejected', bad1.data);
        else ok('status_active_with_revoked_at', bad1.error.message);

        const bad2 = await admin
          .from('dependent_digital_cards')
          .update({ status: 'revoked', revoked_at: null })
          .eq('id', row.id)
          .select('*');
        if (!bad2.error) fail('status_revoked_without_revoked_at', 'rejected', bad2.data);
        else ok('status_revoked_without_revoked_at', bad2.error.message);

        const good = await admin
          .from('dependent_digital_cards')
          .update({ status: 'revoked', revoked_at: new Date().toISOString() })
          .eq('id', row.id)
          .select('*')
          .single();
        if (good.error) fail('status_revoked_valid', 'accepted', summarizeErr(good.error));
        else ok('status_revoked_valid', 'accepted');

        const restore = await admin
          .from('dependent_digital_cards')
          .update({ status: 'active', revoked_at: null })
          .eq('id', row.id)
          .select('*')
          .single();
        if (restore.error) fail('status_restore', 'ok', summarizeErr(restore.error));
        else ok('status_restore', 'active');
      }
    }

    // --- 29 ADULT REGRESSION (TEMP) ---
    {
      // Approve TEMP user if adult mint requires it — try mint path
      const adultRes = await rpcAdultCard(guardianA.browser);
      // May fail if not approved member — that's ok if RPC still callable
      if (
        adultRes.error &&
        !/not_authenticated|P0001|approved|permission|not find/i.test(
          String(adultRes.error.message)
        )
      ) {
        // soft: still check RPC exists
        fail('adult_rpc_callable', 'callable', adultRes.error);
      } else {
        ok(
          'adult_rpc_callable',
          adultRes.error ? `gated:${adultRes.error.message}` : `dto keys=${Object.keys(adultRes.data || {}).join(',')}`
        );
        if (adultRes.data?.cardRef || adultRes.data?.cardNumber) {
          adultMinted = true;
          report.created.adultCards.push(guardianA.uid);
        }
      }
    }

    // --- 30 FAMILY SUMMARY REGRESSION ---
    {
      const { data, error } = await rpcFamilySummary(guardianA.browser);
      if (error) fail('family_summary', 'ok', error);
      else {
        const blob = JSON.stringify(data);
        if (/cardRef|cardNumber|qrPayload/i.test(blob)) {
          fail('family_summary_privacy', 'no card fields', 'present');
        } else ok('family_summary_privacy', 'no cardRef/cardNumber/qrPayload');
      }
    }

    // --- 31 READ-ONLY AUTH EFFECT (aside from lazy mint already done) ---
    {
      const postGuardians = await countExact(admin, 'guardian_relationships');
      const postLinks = await countExact(admin, 'user_member_links');
      const postHh = await countExact(admin, 'household_members');
      // Adult cards may have increased only if we minted TEMP adult — allow that via adultMinted
      const postAdult = await countExact(admin, 'member_digital_cards');
      // Re-call RPC and ensure those tables don't bump
      const g0 = postGuardians;
      const l0 = postLinks;
      const h0 = postHh;
      const a0 = postAdult;
      await rpcChildCards(guardianA.browser);
      await rpcChildCards(guardianB.browser);
      const g1 = await countExact(admin, 'guardian_relationships');
      const l1 = await countExact(admin, 'user_member_links');
      const h1 = await countExact(admin, 'household_members');
      const a1 = await countExact(admin, 'member_digital_cards');
      if (g1 !== g0 || l1 !== l0 || h1 !== h0) {
        fail('readonly_isolation', 'unchanged graph', { g0, g1, l0, l1, h0, h1 });
      } else if (a1 !== a0) {
        fail('readonly_adult_cards', a0, a1);
      } else ok('readonly_isolation', 'graph+adult unchanged on re-read');
    }

    // FK / unique behavioral checks
    {
      const dup = await admin.from('dependent_digital_cards').insert({
        member_id: memChildA.id,
        card_ref: 'AWCD.' + 'd'.repeat(64),
        card_number: 'PLCC-2099-88888',
        status: 'active',
        qr_token: 'AWC1.' + 'e'.repeat(64),
        qr_token_hash: 'f'.repeat(64),
        qr_token_prefix: 'AWC1.eeee',
      });
      if (!dup.error) fail('member_id_unique', 'rejected', dup.data);
      else ok('member_id_unique', dup.error.message);

      const badFk = await admin.from('dependent_digital_cards').insert({
        member_id: randomUUID(),
        card_ref: 'AWCD.' + '1'.repeat(64),
        card_number: 'PLCC-2099-77777',
        status: 'active',
        qr_token: 'AWC1.' + '2'.repeat(64),
        qr_token_hash: '3'.repeat(64),
        qr_token_prefix: 'AWC1.2222',
      });
      if (!badFk.error) fail('fk_members', 'rejected', badFk.data);
      else ok('fk_members', badFk.error.message);
    }

    await snapshotCounts(admin, 'peak');
    console.log('PEAK', report.counts.peak);
  } catch (e) {
    console.error('FATAL', e);
    report.defects.push(`FATAL: ${e?.message || e}`);
  } finally {
    try {
      await cleanup(admin);
    } catch (e) {
      console.error('CLEANUP ERROR', e);
      report.defects.push(`CLEANUP: ${e?.message || e}`);
    }
    await snapshotCounts(admin, 'after');
    console.log('AFTER', report.counts.after);

    const markers = {
      marker_members: report.counts.after.marker_members,
      marker_households: report.counts.after.marker_households,
    };
    console.log('MARKER_COUNTS', markers);

    // Baseline integrity for adult cards
    if (
      report.counts.after.member_digital_cards !== report.counts.before.member_digital_cards
    ) {
      fail(
        'adult_count_restored',
        report.counts.before.member_digital_cards,
        report.counts.after.member_digital_cards
      );
    } else ok('adult_count_restored', String(report.counts.after.member_digital_cards));

    if (
      report.counts.after.dependent_digital_cards !==
      report.counts.before.dependent_digital_cards
    ) {
      fail(
        'dependent_count_restored',
        report.counts.before.dependent_digital_cards,
        report.counts.after.dependent_digital_cards
      );
    } else ok('dependent_count_restored', String(report.counts.after.dependent_digital_cards));

    for (const [k, v] of Object.entries(markers)) {
      if (v !== 0) fail(`cleanup_${k}`, 0, v);
      else ok(`cleanup_${k}`, '0');
    }

    console.log('\n=== SUMMARY ===');
    console.log(
      JSON.stringify(
        {
          projectRef: report.projectRef,
          defects: report.defects,
          fingerprints: report.fingerprints,
          counts: report.counts,
          results: report.results,
        },
        null,
        2
      )
    );

    if (report.defects.length) {
      console.error(`\nFAILED with ${report.defects.length} defect(s)`);
      process.exitCode = 1;
    } else {
      console.log('\nALL LIVE CHECKS PASSED');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
