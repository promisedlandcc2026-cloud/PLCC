/**
 * Phase 2.6E.1A — live Vault card-resolver final verification.
 * Invokes handleCardResolver in-process against live Supabase (TEMP rows only).
 *
 * Usage:
 *   node --import tsx --env-file=.env.diagnostic.local \
 *     scripts/connect-phase-2-6e1a-card-resolver-live-verify.mjs
 *
 * Does NOT: apply SQL, modify Connect, commit/push, build scanner UI.
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MARKER = 'TEST — Phase 2.6E.1A';
const MARKER_EMAIL = 'phase26e1a';
const require = createRequire(import.meta.url);

const report = {
  projectRef: null,
  defects: [],
  results: {},
  created: {
    authUsers: [],
    publicUsers: [],
    members: [],
    adultCards: [],
    dependentCards: [],
    auditIds: [],
  },
  counts: { before: {}, peak: {}, after: {} },
  tokensSeen: [],
  responses: [],
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
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

function fp(value) {
  if (!value) return null;
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function synthToken() {
  return `AWC1.${randomBytes(32).toString('hex')}`;
}

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function countExact(admin, table) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function tryCount(admin, table) {
  try {
    return await countExact(admin, table);
  } catch (e) {
    return { missing: true, error: String(e.message || e) };
  }
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
      if (!/Gateway Timeout|timeout|fetch failed|503|502/i.test(msg) || i === attempts) throw e;
      console.warn(`retry ${label} ${i}/${attempts}: ${msg}`);
      await sleep(1200 * i);
    }
  }
  throw last;
}

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    body: null,
    headers,
    setHeader(k, v) {
      headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  return res;
}

function makeReq({ method = 'POST', token, bearer, body, ip = '127.0.0.1' } = {}) {
  const b =
    body !== undefined
      ? body
      : token !== undefined
        ? { token }
        : {};
  return {
    method,
    body: b,
    query: {},
    headers: {
      authorization: bearer ? `Bearer ${bearer}` : undefined,
      'x-forwarded-for': ip,
    },
    socket: { remoteAddress: ip },
  };
}

function assertNoStore(res, check) {
  const cc = String(res.headers['Cache-Control'] || res.headers['cache-control'] || '');
  const pr = String(res.headers['Pragma'] || res.headers['pragma'] || '');
  if (!/private,\s*no-store/i.test(cc) || !/no-cache/i.test(pr)) {
    return fail(check, 'private,no-store + Pragma no-cache', { cc, pr });
  }
  return ok(check, `${cc} / ${pr}`);
}

function assertNoTokenLeak(payload, tokens, check) {
  const blob = JSON.stringify(payload);
  for (const t of tokens) {
    if (t && blob.includes(t)) {
      return fail(check, 'no raw token echo', 'token present in response');
    }
  }
  if (/AWC1\.[0-9a-f]{64}/i.test(blob) && !blob.includes('invalid_card_format')) {
    // Found DTOs should not include AWC1 payloads; not-found/error codes ok without token
    if (blob.includes('"qrPayload"') || blob.includes('"token":"AWC1')) {
      return fail(check, 'no AWC1 payload', 'found in response');
    }
  }
  return ok(check, 'no raw token');
}

function assertAdultDto(result, check) {
  if (!result?.found) return fail(check, 'found adult', result);
  const keys = Object.keys(result).sort();
  const expected = [
    'avatarUrl',
    'cardNumber',
    'cardStatus',
    'displayName',
    'effectiveStatus',
    'found',
    'label',
    'notice',
    'subjectType',
    'valid',
  ];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    return fail(check + '_keys', expected, keys);
  }
  if (result.subjectType !== 'adult') return fail(check, 'adult', result.subjectType);
  if (result.label !== 'PLCC Member') return fail(check, 'PLCC Member', result.label);
  if (result.notice !== 'Membership identification only.') {
    return fail(check, 'membership notice', result.notice);
  }
  const blob = JSON.stringify(result);
  if (/userId|memberId|email|phone|dob|role|qr_token|tokenHash|hash/i.test(blob)) {
    return fail(check + '_privacy', 'no sensitive fields', blob.slice(0, 200));
  }
  return ok(check, `${result.cardNumber} valid=${result.valid}`);
}

function assertDependentDto(result, check) {
  if (!result?.found) return fail(check, 'found dependent', result);
  if (result.subjectType !== 'dependent') return fail(check, 'dependent', result.subjectType);
  if (result.avatarUrl !== null) return fail(check, 'avatar null', result.avatarUrl);
  if (result.label !== 'PLCC Child Member') return fail(check, 'child label', result.label);
  if (!/Not child pickup\/check-out authorization/.test(result.notice || '')) {
    return fail(check, 'pickup disclaimer', result.notice);
  }
  const blob = JSON.stringify(result);
  if (/memberId|guardian|household|dob|can_check|cardRef|qr_token|tokenHash/i.test(blob)) {
    return fail(check + '_privacy', 'no sensitive fields', blob.slice(0, 200));
  }
  return ok(check, `${result.cardNumber} valid=${result.valid}`);
}

async function createAuthUser(admin, url, anon, label, role) {
  const email = `${MARKER_EMAIL}.${label}.${Date.now()}@awc-vault.local`;
  const password = `Verify!${Date.now()}Aa1`;
  const created = await withRetry(`createUser ${label}`, async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user?.id) throw new Error(`createUser ${label}: ${error?.message || 'no user'}`);
    return data;
  });
  const uid = created.user.id;
  report.created.authUsers.push(uid);

  const password_hash = await bcrypt.hash('Temporary123!', 10);
  const { error: uErr } = await admin.from('users').insert({
    id: uid,
    email,
    name: `${MARKER} ${label}`,
    role,
    password_hash,
    is_temporary_password: true,
  });
  if (uErr) throw new Error(`public.users ${label}: ${uErr.message}`);
  report.created.publicUsers.push(uid);

  const browser = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await withRetry(`signIn ${label}`, async () => {
    const { error: signErr } = await browser.auth.signInWithPassword({ email, password });
    if (signErr) throw new Error(`signIn ${label}: ${signErr.message}`);
  });
  const {
    data: { session },
  } = await browser.auth.getSession();
  if (!session?.access_token) throw new Error(`no session for ${label}`);
  return { uid, email, password, browser, label, role, accessToken: session.access_token };
}

async function createMember(admin, label) {
  const id = randomUUID();
  const { data, error } = await admin
    .from('members')
    .insert({
      id,
      first_name: MARKER,
      last_name: label,
      email: `${MARKER_EMAIL}.member.${label}.${Date.now()}@awc-vault.local`,
      status: 'Active',
      role: 'Member',
    })
    .select('*')
    .single();
  if (error) throw new Error(`member ${label}: ${error.message}`);
  report.created.members.push(data.id);
  return data;
}

async function mintAdultCard(browser, uid) {
  const { data, error } = await browser.rpc('get_my_member_digital_card');
  if (error) throw new Error(`mint adult: ${error.message}`);
  // DTO has qrPayload
  const qr = data?.qrPayload || data?.qr_payload;
  if (!qr || !/^AWC1\.[0-9a-f]{64}$/.test(qr)) {
    throw new Error(`mint adult: bad qr ${JSON.stringify(data)?.slice(0, 120)}`);
  }
  report.created.adultCards.push(uid);
  report.tokensSeen.push(qr);
  return { dto: data, token: qr, cardNumber: data.cardNumber || data.card_number };
}

async function rotateAdultCard(browser) {
  const { data, error } = await browser.rpc('rotate_member_digital_card');
  if (error) throw new Error(`rotate: ${error.message}`);
  const qr = data?.qrPayload || data?.qr_payload;
  if (!qr) throw new Error('rotate: no qr');
  report.tokensSeen.push(qr);
  return { dto: data, token: qr, cardNumber: data.cardNumber || data.card_number };
}

async function getAdultRow(admin, userId) {
  const { data, error } = await admin
    .from('member_digital_cards')
    .select('user_id, card_number, status, qr_token, qr_token_hash, revoked_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureDependent(admin, memberId) {
  const { data, error } = await admin.rpc('ensure_dependent_digital_card', {
    p_member_id: memberId,
  });
  if (error) throw new Error(`ensure dependent: ${error.message}`);
  // returns row object
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.qr_token) throw new Error('ensure dependent: no qr_token');
  report.created.dependentCards.push(memberId);
  report.tokensSeen.push(row.qr_token);
  return row;
}

async function main() {
  loadEnvFile(join(ROOT, '.env.diagnostic.local'));
  loadEnvFile(join(ROOT, '.env.local'));

  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const service = env('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY');
  const anon = env('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
  if (!url || !service || !anon) {
    console.error('Missing Supabase env');
    process.exit(2);
  }
  report.projectRef = url.match(/https?:\/\/([^.]+)/)?.[1] || url;

  // Ensure handler sees same env
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = service;

  require('tsx/cjs');
  const { handleCardResolver, __resetCardResolverRateLimitForTests } = await import(
    '../api/_utils/cardResolverHandler.ts'
  );

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const SIDE_TABLES = [
    'member_digital_cards',
    'dependent_digital_cards',
    'audit_logs',
    'event_volunteers',
    'serve_signups',
    'guardian_relationships',
    'household_members',
    'user_member_links',
    'attendance',
    'event_attendance',
    'user_notifications',
    'notifications',
    'child_consents',
  ];

  console.log(`\n=== Phase 2.6E.1A live verify @ ${report.projectRef} ===\n`);

  for (const t of SIDE_TABLES) {
    report.counts.before[t] = await tryCount(admin, t);
  }

  let staff, memberActor, financeActor, ministryActor, worshipActor;
  let adultUser, adultPendingUser, depMember;
  let adultToken, adultCardNumber;
  let depToken, depCardNumber;
  let collisionAdultUid, collisionDepMemberId;
  let auditStart = new Date().toISOString();

  try {
    // --- actors ---
    staff = await createAuthUser(admin, url, anon, 'staff-pastor', 'PASTOR');
    memberActor = await createAuthUser(admin, url, anon, 'member', 'MEMBER');
    financeActor = await createAuthUser(admin, url, anon, 'finance', 'FINANCE');
    ministryActor = await createAuthUser(admin, url, anon, 'ministry', 'MINISTRY_LEADER');
    worshipActor = await createAuthUser(admin, url, anon, 'worship', 'WORSHIP_TEAM');
    ok('live_allowed_staff_created', `PASTOR ${staff.uid.slice(0, 8)}`);

    __resetCardResolverRateLimitForTests();

    // --- signed out ---
    {
      const res = makeRes();
      await handleCardResolver(makeReq({ token: synthToken() }), res);
      if (res.statusCode !== 401 || res.body?.code !== 'unauthorized') {
        fail('signed_out', '401 unauthorized', { status: res.statusCode, body: res.body });
      } else ok('signed_out', '401');
      assertNoStore(res, 'cache_401');
    }

    // --- denied roles ---
    for (const [label, actor] of [
      ['MEMBER', memberActor],
      ['FINANCE', financeActor],
      ['MINISTRY_LEADER', ministryActor],
      ['WORSHIP_TEAM', worshipActor],
    ]) {
      const res = makeRes();
      await handleCardResolver(
        makeReq({ token: synthToken(), bearer: actor.accessToken }),
        res
      );
      if (res.statusCode !== 403 || res.body?.code !== 'forbidden') {
        fail(`deny_${label}`, '403 forbidden', { status: res.statusCode, body: res.body });
      } else ok(`deny_${label}`, '403');
      if (res.body?.result?.found) fail(`deny_${label}_no_dto`, 'no result', res.body.result);
      assertNoStore(res, `cache_403_${label}`);
      report.responses.push(res.body);
    }

    // --- GET method ---
    {
      const res = makeRes();
      await handleCardResolver(
        makeReq({ method: 'GET', bearer: staff.accessToken, body: {} }),
        res
      );
      if (res.statusCode !== 405 || res.body?.code !== 'method_not_allowed') {
        fail('post_only', '405', { status: res.statusCode, body: res.body });
      } else ok('post_only', '405');
      assertNoStore(res, 'cache_405');
    }

    // --- malformed ---
    for (const [label, token] of [
      ['foo', 'foo'],
      ['uuid', randomUUID()],
      ['card_number', 'PLCC-2026-00001'],
      ['uppercase', `AWC1.${'A'.repeat(64)}`],
      ['short', `AWC1.${'a'.repeat(32)}`],
      ['whitespace', ` AWC1.${'a'.repeat(64)}`],
    ]) {
      const res = makeRes();
      await handleCardResolver(makeReq({ token, bearer: staff.accessToken }), res);
      if (res.statusCode !== 400 || res.body?.code !== 'invalid_card_format') {
        fail(`malformed_${label}`, '400 invalid_card_format', {
          status: res.statusCode,
          body: res.body,
        });
      } else ok(`malformed_${label}`, '400');
      assertNoTokenLeak(res.body, [token], `malformed_${label}_no_echo`);
      assertNoStore(res, `cache_400_${label}`);
      report.responses.push(res.body);
    }

    // --- client spoof ---
    {
      const tok = synthToken();
      report.tokensSeen.push(tok);
      const res = makeRes();
      await handleCardResolver(
        makeReq({
          bearer: staff.accessToken,
          body: {
            token: tok,
            role: 'SUPER_ADMIN',
            userId: staff.uid,
            subjectType: 'adult',
            valid: true,
          },
        }),
        res
      );
      if (res.statusCode !== 400 || res.body?.code !== 'invalid_request') {
        fail('client_spoof', '400 invalid_request', { status: res.statusCode, body: res.body });
      } else ok('client_spoof', '400 invalid_request');
      assertNoTokenLeak(res.body, [tok], 'client_spoof_no_echo');
    }
    {
      const tok = synthToken();
      report.tokensSeen.push(tok);
      const res = makeRes();
      await handleCardResolver(
        makeReq({
          bearer: staff.accessToken,
          body: { token: tok, user_id: staff.uid, member_id: randomUUID(), qrTokenHash: 'x' },
        }),
        res
      );
      if (res.statusCode !== 400 || res.body?.code !== 'invalid_request') {
        fail('client_spoof_snake', '400 invalid_request', {
          status: res.statusCode,
          body: res.body,
        });
      } else ok('client_spoof_snake', '400');
    }

    // --- unknown valid token ---
    __resetCardResolverRateLimitForTests();
    {
      const tok = synthToken();
      report.tokensSeen.push(tok);
      const res = makeRes();
      await handleCardResolver(makeReq({ token: tok, bearer: staff.accessToken }), res);
      if (
        res.statusCode !== 200 ||
        res.body?.ok !== true ||
        res.body?.result?.found !== false ||
        res.body?.result?.code !== 'card_not_found'
      ) {
        fail('unknown_token', '200 card_not_found', { status: res.statusCode, body: res.body });
      } else ok('unknown_token', 'card_not_found');
      assertNoTokenLeak(res.body, [tok], 'unknown_no_echo');
      assertNoStore(res, 'cache_200_not_found');
      report.responses.push(res.body);
    }

    // --- adult active ---
    __resetCardResolverRateLimitForTests();
    adultUser = await createAuthUser(admin, url, anon, 'adult-active', 'MEMBER');
    {
      const minted = await mintAdultCard(adultUser.browser, adultUser.uid);
      adultToken = minted.token;
      adultCardNumber = minted.cardNumber;
      const res = makeRes();
      await handleCardResolver(makeReq({ token: adultToken, bearer: staff.accessToken }), res);
      if (res.statusCode !== 200 || !res.body?.result?.found) {
        fail('adult_active', '200 found', { status: res.statusCode, body: res.body });
      } else {
        const r = res.body.result;
        if (r.valid !== true || r.cardStatus !== 'active' || r.effectiveStatus !== 'active') {
          fail('adult_active', 'valid active', r);
        } else {
          assertAdultDto(r, 'adult_active_dto');
          ok('adult_active', `${r.cardNumber}`);
        }
      }
      assertNoTokenLeak(res.body, [adultToken], 'adult_active_no_echo');
      assertNoStore(res, 'cache_200_found');
      report.responses.push(res.body);
    }

    // MEMBER with own QR still forbidden
    {
      const res = makeRes();
      await handleCardResolver(
        makeReq({ token: adultToken, bearer: memberActor.accessToken }),
        res
      );
      if (res.statusCode !== 403) {
        fail('member_own_qr_denied', '403', { status: res.statusCode, body: res.body });
      } else ok('member_own_qr_denied', '403');
    }

    // --- adult inactive ---
    __resetCardResolverRateLimitForTests();
    {
      const { error } = await admin
        .from('member_digital_cards')
        .update({ status: 'inactive', revoked_at: null })
        .eq('user_id', adultUser.uid);
      if (error) throw error;
      const res = makeRes();
      await handleCardResolver(makeReq({ token: adultToken, bearer: staff.accessToken }), res);
      const r = res.body?.result;
      if (
        res.statusCode !== 200 ||
        !r?.found ||
        r.valid !== false ||
        r.cardStatus !== 'inactive' ||
        r.effectiveStatus !== 'inactive'
      ) {
        fail('adult_inactive', 'found valid=false inactive', {
          status: res.statusCode,
          result: r,
        });
      } else ok('adult_inactive', 'valid=false');
    }

    // --- adult revoked ---
    __resetCardResolverRateLimitForTests();
    {
      const { error } = await admin
        .from('member_digital_cards')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('user_id', adultUser.uid);
      if (error) throw error;
      const res = makeRes();
      await handleCardResolver(makeReq({ token: adultToken, bearer: staff.accessToken }), res);
      const r = res.body?.result;
      if (
        res.statusCode !== 200 ||
        !r?.found ||
        r.valid !== false ||
        r.cardStatus !== 'revoked' ||
        r.effectiveStatus !== 'revoked'
      ) {
        fail('adult_revoked', 'found valid=false revoked', { status: res.statusCode, result: r });
      } else ok('adult_revoked', 'valid=false revoked');

      // restore active for rotate test
      const { error: e2 } = await admin
        .from('member_digital_cards')
        .update({ status: 'active', revoked_at: null })
        .eq('user_id', adultUser.uid);
      if (e2) throw e2;
    }

    // --- adult PENDING effective ---
    __resetCardResolverRateLimitForTests();
    adultPendingUser = await createAuthUser(admin, url, anon, 'adult-pending-mint', 'MEMBER');
    let pendingToken;
    {
      const minted = await mintAdultCard(adultPendingUser.browser, adultPendingUser.uid);
      pendingToken = minted.token;
      const { error } = await admin
        .from('users')
        .update({ role: 'PENDING' })
        .eq('id', adultPendingUser.uid);
      if (error) throw error;
      const res = makeRes();
      await handleCardResolver(makeReq({ token: pendingToken, bearer: staff.accessToken }), res);
      const r = res.body?.result;
      if (
        res.statusCode !== 200 ||
        !r?.found ||
        r.cardStatus !== 'active' ||
        r.effectiveStatus !== 'inactive' ||
        r.valid !== false
      ) {
        fail('adult_pending', 'active stored / effective inactive', {
          status: res.statusCode,
          result: r,
        });
      } else ok('adult_pending', 'effective inactive');
    }

    // --- dependent active ---
    __resetCardResolverRateLimitForTests();
    depMember = await createMember(admin, 'child-active');
    {
      const row = await ensureDependent(admin, depMember.id);
      depToken = row.qr_token;
      depCardNumber = row.card_number;
      const res = makeRes();
      await handleCardResolver(makeReq({ token: depToken, bearer: staff.accessToken }), res);
      const r = res.body?.result;
      if (
        res.statusCode !== 200 ||
        !r?.found ||
        r.subjectType !== 'dependent' ||
        r.valid !== true ||
        r.cardStatus !== 'active'
      ) {
        fail('dependent_active', 'found dependent valid', { status: res.statusCode, result: r });
      } else {
        assertDependentDto(r, 'dependent_active_dto');
        ok('dependent_active', r.cardNumber);
      }
      assertNoTokenLeak(res.body, [depToken], 'dependent_active_no_echo');
    }

    // --- dependent inactive ---
    __resetCardResolverRateLimitForTests();
    {
      const { error } = await admin
        .from('dependent_digital_cards')
        .update({ status: 'inactive', revoked_at: null })
        .eq('member_id', depMember.id);
      if (error) throw error;
      const res = makeRes();
      await handleCardResolver(makeReq({ token: depToken, bearer: staff.accessToken }), res);
      const r = res.body?.result;
      if (!r?.found || r.valid !== false || r.cardStatus !== 'inactive') {
        fail('dependent_inactive', 'found valid=false', r);
      } else ok('dependent_inactive', 'valid=false');
    }

    // --- dependent revoked ---
    __resetCardResolverRateLimitForTests();
    {
      const { error } = await admin
        .from('dependent_digital_cards')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('member_id', depMember.id);
      if (error) throw error;
      const res = makeRes();
      await handleCardResolver(makeReq({ token: depToken, bearer: staff.accessToken }), res);
      const r = res.body?.result;
      if (!r?.found || r.valid !== false || r.cardStatus !== 'revoked') {
        fail('dependent_revoked', 'found revoked', r);
      } else ok('dependent_revoked', 'valid=false revoked');
    }

    // --- rotate adult ---
    __resetCardResolverRateLimitForTests();
    {
      // ensure adult active again and refresh session token if needed
      await admin
        .from('member_digital_cards')
        .update({ status: 'active', revoked_at: null })
        .eq('user_id', adultUser.uid);
      const before = await getAdultRow(admin, adultUser.uid);
      const oldTok = before.qr_token;
      report.tokensSeen.push(oldTok);

      // resolve old before rotate
      {
        const res = makeRes();
        await handleCardResolver(makeReq({ token: oldTok, bearer: staff.accessToken }), res);
        if (!res.body?.result?.found) fail('rotate_before', 'found', res.body);
        else ok('rotate_before', 'found');
      }

      const rotated = await rotateAdultCard(adultUser.browser);
      const newTok = rotated.token;

      {
        const res = makeRes();
        await handleCardResolver(makeReq({ token: oldTok, bearer: staff.accessToken }), res);
        if (
          res.statusCode !== 200 ||
          res.body?.result?.found !== false ||
          res.body?.result?.code !== 'card_not_found'
        ) {
          fail('rotate_old', 'card_not_found', res.body);
        } else ok('rotate_old', 'card_not_found');
      }
      {
        const res = makeRes();
        await handleCardResolver(makeReq({ token: newTok, bearer: staff.accessToken }), res);
        if (!res.body?.result?.found || res.body.result.subjectType !== 'adult') {
          fail('rotate_new', 'adult found', res.body);
        } else ok('rotate_new', res.body.result.cardNumber);
        adultToken = newTok;
      }
    }

    // --- collision (TEMP same hash across tables) ---
    __resetCardResolverRateLimitForTests();
    {
      collisionAdultUid = (await createAuthUser(admin, url, anon, 'collision-adult', 'MEMBER')).uid;
      collisionDepMemberId = (await createMember(admin, 'collision-child')).id;
      const sharedTok = synthToken();
      const sharedHash = hashToken(sharedTok);
      report.tokensSeen.push(sharedTok);

      let adultNum = `PLCC-2099-${String(Date.now()).slice(-5)}`;
      let depNum = `PLCC-2098-${String(Date.now()).slice(-5)}`;
      try {
        const { data: n1 } = await admin.rpc('member_digital_card_alloc_number');
        if (n1) adultNum = n1;
        const { data: n2 } = await admin.rpc('member_digital_card_alloc_number');
        if (n2) depNum = n2;
      } catch {
        /* fallback synthetic numbers */
      }

      const { error: aErr } = await admin.from('member_digital_cards').insert({
        user_id: collisionAdultUid,
        card_number: adultNum,
        status: 'active',
        qr_token: sharedTok,
        qr_token_hash: sharedHash,
        qr_token_prefix: sharedTok.slice(0, 12),
      });
      if (aErr) throw new Error(`collision adult insert: ${aErr.message}`);
      report.created.adultCards.push(collisionAdultUid);

      const depRef = `AWCD.${randomBytes(32).toString('hex')}`;
      const { error: dErr } = await admin.from('dependent_digital_cards').insert({
        member_id: collisionDepMemberId,
        card_ref: depRef,
        card_number: depNum,
        status: 'active',
        qr_token: sharedTok,
        qr_token_hash: sharedHash,
        qr_token_prefix: sharedTok.slice(0, 12),
      });
      if (dErr) throw new Error(`collision dep insert: ${dErr.message}`);
      report.created.dependentCards.push(collisionDepMemberId);

      const res = makeRes();
      await handleCardResolver(makeReq({ token: sharedTok, bearer: staff.accessToken }), res);
      if (res.statusCode !== 409 || res.body?.code !== 'resolver_conflict') {
        fail('collision', '409 resolver_conflict', { status: res.statusCode, body: res.body });
      } else ok('collision', '409 fail-closed');
      if (res.body?.result?.found) fail('collision_no_dto', 'no identity', res.body.result);
      assertNoStore(res, 'cache_409');
      assertNoTokenLeak(res.body, [sharedTok], 'collision_no_echo');

      // immediate cleanup of collision rows
      await admin.from('member_digital_cards').delete().eq('user_id', collisionAdultUid);
      await admin.from('dependent_digital_cards').delete().eq('member_id', collisionDepMemberId);
    }

    // peak counts
    for (const t of SIDE_TABLES) {
      report.counts.peak[t] = await tryCount(admin, t);
    }

    // --- rate limit (process-local) ---
    __resetCardResolverRateLimitForTests();
    {
      let limited = false;
      let lastRes = null;
      for (let i = 0; i < 12; i++) {
        const res = makeRes();
        await handleCardResolver(
          makeReq({ token: synthToken(), bearer: staff.accessToken, ip: '203.0.113.50' }),
          res
        );
        lastRes = res;
        if (res.statusCode === 429 && res.body?.code === 'scanner_rate_limited') {
          limited = true;
          assertNoStore(res, 'cache_429');
          break;
        }
      }
      if (!limited) {
        fail('rate_limit_local', '429 scanner_rate_limited within burst', {
          lastStatus: lastRes?.statusCode,
          lastBody: lastRes?.body,
        });
      } else {
        ok(
          'rate_limit_local',
          '429 best-effort per process / Vercel isolate (NOT globally authoritative)'
        );
      }
      __resetCardResolverRateLimitForTests();
    }

    // --- audit privacy ---
    {
      const { data: audits, error } = await admin
        .from('audit_logs')
        .select('id, action, details, resource_type, user_id, created_at')
        .eq('action', 'card_resolver.scan')
        .gte('created_at', auditStart)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) fail('audit_query', 'ok', error.message);
      else if (!audits?.length) fail('audit_rows', '>=1', 0);
      else {
        ok('audit_rows', String(audits.length));
        let dirty = false;
        for (const row of audits) {
          report.created.auditIds.push(row.id);
          const blob = typeof row.details === 'string' ? row.details : JSON.stringify(row.details);
          if (/AWC1\.[0-9a-fA-F]{20,}/.test(blob)) dirty = true;
          if (/[0-9a-f]{64}/.test(blob) && !/cardNumber|PLCC-\d{4}/.test(blob)) {
            // full hash alone is 64 hex — reject if details contain bare 64-hex hash field
            if (/tokenHash|"hash"|qr_token_hash/i.test(blob)) dirty = true;
          }
          if (/dob|guardian|pickup|can_check/i.test(blob)) dirty = true;
        }
        if (dirty) fail('audit_privacy', 'no token/hash/DOB/guardian', 'sensitive present');
        else ok('audit_privacy', 'clean');
      }
    }

    // side-effect baselines (non-audit should be unchanged after cleanup; check now vs before for mutable sides excluding cards)
    for (const t of [
      'event_volunteers',
      'serve_signups',
      'guardian_relationships',
      'household_members',
      'user_member_links',
      'attendance',
      'event_attendance',
      'user_notifications',
      'notifications',
      'child_consents',
    ]) {
      const before = report.counts.before[t];
      const now = await tryCount(admin, t);
      if (before?.missing || now?.missing) {
        ok(`side_${t}`, 'table not present / skipped');
        continue;
      }
      if (before !== now) fail(`side_${t}`, String(before), now);
      else ok(`side_${t}`, `unchanged ${before}`);
    }
  } catch (e) {
    fail('live_runner', 'no throw', String(e?.message || e));
    console.error(e);
  } finally {
    console.log('\n=== CLEANUP ===');
    try {
      // cards
      for (const uid of report.created.adultCards) {
        await admin.from('member_digital_cards').delete().eq('user_id', uid);
      }
      for (const mid of report.created.dependentCards) {
        await admin.from('dependent_digital_cards').delete().eq('member_id', mid);
      }
      // also by marker adult users
      for (const uid of report.created.publicUsers) {
        await admin.from('member_digital_cards').delete().eq('user_id', uid);
      }
      for (const mid of report.created.members) {
        await admin.from('dependent_digital_cards').delete().eq('member_id', mid);
        await admin.from('members').delete().eq('id', mid);
      }
      // TEMP audit rows
      if (report.created.auditIds.length) {
        await admin.from('audit_logs').delete().in('id', report.created.auditIds);
      } else {
        await admin
          .from('audit_logs')
          .delete()
          .eq('action', 'card_resolver.scan')
          .gte('created_at', auditStart);
      }
      for (const uid of report.created.publicUsers) {
        await admin.from('users').delete().eq('id', uid);
      }
      for (const uid of report.created.authUsers) {
        await admin.auth.admin.deleteUser(uid);
      }
    } catch (ce) {
      console.error('cleanup error', ce);
      report.defects.push(`cleanup: ${ce.message || ce}`);
    }

    for (const t of SIDE_TABLES) {
      report.counts.after[t] = await tryCount(admin, t);
    }

    // marker residual
    const mu = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .ilike('name', `%${MARKER}%`);
    const mm = await admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .ilike('first_name', `%${MARKER}%`);
    if ((mu.count || 0) === 0 && (mm.count || 0) === 0) ok('marker_cleanup', '0');
    else fail('marker_cleanup', '0', { users: mu.count, members: mm.count });

    // card counts restored
    for (const t of ['member_digital_cards', 'dependent_digital_cards']) {
      const b = report.counts.before[t];
      const a = report.counts.after[t];
      if (b !== a) fail(`count_restore_${t}`, String(b), a);
      else ok(`count_restore_${t}`, `${b} → ${a}`);
    }

    // global token leak across all recorded responses
    {
      const blob = JSON.stringify(report.responses);
      let leak = false;
      for (const t of report.tokensSeen) {
        if (t && blob.includes(t)) leak = true;
      }
      if (leak) fail('token_response_scan', 'no leaks', 'leak found');
      else ok('token_response_scan', `checked ${report.tokensSeen.length} tokens`);
    }

    console.log('\n=== COUNTS before → peak → after ===');
    for (const t of SIDE_TABLES) {
      console.log(
        t,
        report.counts.before[t],
        '→',
        report.counts.peak[t],
        '→',
        report.counts.after[t]
      );
    }

    console.log('\n=== SUMMARY ===');
    console.log('defects:', report.defects.length);
    if (report.defects.length) {
      for (const d of report.defects) console.log(' -', d);
      process.exitCode = 1;
    } else {
      console.log('ALL LIVE CHECKS PASSED');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
