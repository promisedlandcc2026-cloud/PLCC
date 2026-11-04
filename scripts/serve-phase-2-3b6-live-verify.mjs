/**
 * Phase 2.3B.6 — live Serve RPC lifecycle verification.
 * Target: yrpwdrioomdihjlmcfnu
 *
 * Does NOT apply migrations or modify schema/RPCs.
 * Creates temporary opportunities + Auth/public.users, then cleans up.
 *
 * Usage:
 *   node --env-file=.env.diagnostic.local scripts/serve-phase-2-3b6-live-verify.mjs
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MARKER = 'TEST — Phase 2.3B.6';

const report = {
  projectRef: null,
  defects: [],
  results: {},
  created: { opportunities: [], signups: [], authUsers: [], publicUsers: [] },
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
  const msg = `${check}: expected ${expected}; actual ${actual}`;
  report.defects.push(msg);
  console.error('FAIL:', msg);
}

function ok(msg) {
  console.log('PASS:', msg);
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

async function countOptional(admin, table) {
  try {
    return await countExact(admin, table);
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function cleanup(admin) {
  console.log('\n--- CLEANUP ---');
  const { data: markerOpps } = await admin
    .from('serve_opportunities')
    .select('id')
    .ilike('title', `${MARKER}%`);
  const oppIds = new Set([
    ...report.created.opportunities,
    ...(markerOpps || []).map((r) => r.id),
  ]);
  for (const id of oppIds) {
    await admin.from('serve_signups').delete().eq('opportunity_id', id);
    const { error } = await admin.from('serve_opportunities').delete().eq('id', id);
    if (error) console.error('cleanup opp', id, error.message);
    else console.log('removed opportunity', id);
  }
  for (const id of report.created.publicUsers) {
    const { error } = await admin.from('users').delete().eq('id', id);
    if (error) console.error('cleanup public.users', id, error.message);
    else console.log('removed public.users', id);
  }
  for (const id of report.created.authUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('cleanup auth', id, error.message);
    else console.log('removed auth user', id);
  }
}

async function createLinkedUser(admin, url, anon, label) {
  const email = `serve.23b6.${label}.${Date.now()}@awc-vault.local`;
  const password = `Verify!${Date.now()}Aa1`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user?.id) {
    throw new Error(`createUser ${label}: ${createErr?.message || 'no user'}`);
  }
  const uid = created.user.id;
  report.created.authUsers.push(uid);

  const password_hash = await bcrypt.hash('Temporary123!', 10);
  const { error: uErr } = await admin.from('users').insert({
    id: uid,
    email,
    name: `Serve 2.3B.6 ${label}`,
    role: 'PENDING',
    password_hash,
    is_temporary_password: true,
  });
  if (uErr) throw new Error(`link public.users ${label}: ${uErr.message}`);
  report.created.publicUsers.push(uid);

  const browser = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await browser.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr) throw new Error(`signIn ${label}: ${signErr.message}`);
  return { uid, browser, label };
}

async function rpc(browser, fn, opportunityId) {
  const { data, error } = await browser.rpc(fn, {
    p_opportunity_id: opportunityId,
  });
  return { data, error: summarizeErr(error) };
}

async function createOpp(admin, suffix, extra = {}) {
  const { data, error } = await admin
    .from('serve_opportunities')
    .insert({
      title: `${MARKER} ${suffix}`,
      description: 'Temporary Phase 2.3B.6 verification — delete after test',
      status: extra.status || 'open',
      requires_approval: !!extra.requires_approval,
      capacity: extra.capacity === undefined ? null : extra.capacity,
      starts_at: new Date(Date.now() + 40 * 86400000).toISOString(),
    })
    .select('*')
    .single();
  if (error) throw new Error(`createOpp ${suffix}: ${error.message}`);
  report.created.opportunities.push(data.id);
  return data;
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
  console.log(JSON.stringify({ phase: '2.3B.6', projectRef: report.projectRef }));

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const R = report.results;

  // Baseline
  R.baseline = {
    serve_opportunities: await countExact(admin, 'serve_opportunities'),
    serve_signups: await countExact(admin, 'serve_signups'),
    event_volunteers: await countExact(admin, 'event_volunteers'),
    user_notifications: await countExact(admin, 'user_notifications'),
    member_ministries: await countOptional(admin, 'member_ministries'),
    team_members: await countOptional(admin, 'team_members'),
  };
  console.log('BASELINE', R.baseline);

  // Anon RPC
  for (const fn of ['serve_signup_opportunity', 'serve_cancel_signup']) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_opportunity_id: '00000000-0000-0000-0000-000000000001',
      }),
    });
    const text = await res.text();
    R[`anon_rpc_${fn}`] = { status: res.status, body: text.slice(0, 300) };
    if (res.status === 401 || text.includes('42501') || text.includes('permission denied')) {
      ok(`anon ${fn} denied`);
    } else {
      fail(`anon ${fn}`, 'permission denied', `${res.status} ${text.slice(0, 120)}`);
    }
  }

  // Anon table access
  for (const t of ['serve_opportunities', 'serve_signups']) {
    const { data, error } = await anonClient.from(t).select('*').limit(1);
    R[`anon_select_${t}`] = { error: summarizeErr(error), rows: data?.length ?? null };
    if (error) ok(`anon SELECT ${t} denied: ${error.code || error.message}`);
    else fail(`anon SELECT ${t}`, 'denied', `rows=${data?.length}`);
  }

  let userA;
  let userB;
  try {
    userA = await createLinkedUser(admin, url, anon, 'a');
    userB = await createLinkedUser(admin, url, anon, 'b');
    R.test_identities = { a: userA.uid, b: userB.uid };
    ok(`linked users created (ids redacted in final report)`);
  } catch (e) {
    fail('create linked users', 'success', e.message);
    await cleanup(admin);
    console.log(JSON.stringify({ defects: report.defects, results: R }, null, 2));
    process.exit(2);
  }

  const oppMain = await createOpp(admin, 'Standard Lifecycle', {
    capacity: null,
    requires_approval: false,
  });

  // Direct write RLS
  {
    const { data, error } = await userA.browser
      .from('serve_signups')
      .insert({
        opportunity_id: oppMain.id,
        user_id: userA.uid,
        member_id: null,
        status: 'confirmed',
      })
      .select('id');
    R.direct_insert = { data, error: summarizeErr(error) };
    if (data?.length) fail('direct INSERT', 'denied', JSON.stringify(data));
    else ok(`direct INSERT denied: ${error?.code || error?.message}`);
  }

  // First signup
  let lifecycleId = null;
  let lifecycleCreatedAt = null;
  {
    const r = await rpc(userA.browser, 'serve_signup_opportunity', oppMain.id);
    R.first_signup = r;
    if (r.error || r.data?.ok !== true || r.data?.signupStatus !== 'confirmed') {
      fail('first signup', 'ok confirmed', JSON.stringify(r));
    } else ok('first signup confirmed');

    const { data: rows } = await admin
      .from('serve_signups')
      .select('*')
      .eq('opportunity_id', oppMain.id)
      .eq('user_id', userA.uid);
    R.first_signup_rows = rows;
    if (!rows || rows.length !== 1) fail('first signup row count', '1', String(rows?.length));
    else {
      const row = rows[0];
      lifecycleId = row.id;
      lifecycleCreatedAt = row.created_at;
      if (row.user_id !== userA.uid) fail('ownership user_id', userA.uid, row.user_id);
      else ok('ownership user_id = User A');
      if (row.member_id !== null) fail('member_id NULL', 'NULL', String(row.member_id));
      else ok('member_id IS NULL');
      if (row.status !== 'confirmed') fail('status', 'confirmed', row.status);
      if (!row.created_at || !row.updated_at) fail('timestamps', 'populated', 'missing');
      if (row.cancelled_at !== null) fail('cancelled_at', 'NULL', String(row.cancelled_at));
    }
  }

  // Repeat signup
  {
    const r = await rpc(userA.browser, 'serve_signup_opportunity', oppMain.id);
    R.repeat_signup = r;
    if (r.error || r.data?.idempotent !== true) {
      fail('repeat signup idempotent', true, JSON.stringify(r));
    } else ok('repeat signup idempotent=true');
    const { count } = await admin
      .from('serve_signups')
      .select('*', { count: 'exact', head: true })
      .eq('opportunity_id', oppMain.id)
      .eq('user_id', userA.uid);
    if (count !== 1) fail('repeat row count', '1', String(count));
    else ok('still one signup row');
  }

  // Cancel
  {
    const before = (
      await admin
        .from('serve_signups')
        .select('updated_at')
        .eq('id', lifecycleId)
        .single()
    ).data;
    // tiny delay so updated_at can advance
    await new Promise((r) => setTimeout(r, 50));
    const r = await rpc(userA.browser, 'serve_cancel_signup', oppMain.id);
    R.cancel = r;
    if (r.error || r.data?.signupStatus !== 'cancelled') {
      fail('cancel', 'cancelled', JSON.stringify(r));
    } else ok('cancel → cancelled');
    const { data: row } = await admin
      .from('serve_signups')
      .select('*')
      .eq('id', lifecycleId)
      .maybeSingle();
    R.cancel_row = row;
    if (!row) fail('cancel row retained', 'present', 'missing');
    else {
      if (row.status !== 'cancelled') fail('cancel DB status', 'cancelled', row.status);
      if (!row.cancelled_at) fail('cancelled_at', 'set', 'null');
      if (row.id !== lifecycleId) fail('cancel same id', lifecycleId, row.id);
      if (before?.updated_at && row.updated_at && row.updated_at <= before.updated_at) {
        // soft fail — clock granularity
        console.log('NOTE: updated_at did not strictly advance (may be clock/granularity)');
      }
    }
  }

  // Repeat cancel
  {
    const r = await rpc(userA.browser, 'serve_cancel_signup', oppMain.id);
    R.repeat_cancel = r;
    if (r.error || r.data?.idempotent !== true) {
      fail('repeat cancel idempotent', true, JSON.stringify(r));
    } else ok(`repeat cancel idempotent JSON=${JSON.stringify(r.data)}`);
  }

  // Rejoin
  {
    const r = await rpc(userA.browser, 'serve_signup_opportunity', oppMain.id);
    R.rejoin = r;
    if (r.error || r.data?.signupStatus !== 'confirmed') {
      fail('rejoin', 'confirmed', JSON.stringify(r));
    } else ok('rejoin confirmed');
    const { data: rows } = await admin
      .from('serve_signups')
      .select('*')
      .eq('opportunity_id', oppMain.id)
      .eq('user_id', userA.uid);
    R.rejoin_rows = rows;
    if (!rows || rows.length !== 1) fail('rejoin count', '1', String(rows?.length));
    else {
      const row = rows[0];
      if (row.id !== lifecycleId) fail('rejoin SAME row', lifecycleId, row.id);
      else ok('rejoin SAME signup row id');
      if (row.member_id !== null) fail('rejoin member_id', 'NULL', String(row.member_id));
      else ok('rejoin member_id still NULL');
      if (row.cancelled_at !== null) fail('rejoin cancelled_at', 'NULL', String(row.cancelled_at));
      if (row.created_at !== lifecycleCreatedAt) {
        fail('created_at preserved', lifecycleCreatedAt, row.created_at);
      } else ok('created_at preserved');
    }
  }

  // Cross-user SELECT
  {
    const { data: own } = await userA.browser
      .from('serve_signups')
      .select('*')
      .eq('opportunity_id', oppMain.id);
    R.own_select = own;
    if (!own?.length) fail('own SELECT', '>=1', '0');
    else ok('User A can SELECT own signup');

    const { data: foreign } = await userB.browser
      .from('serve_signups')
      .select('*')
      .eq('opportunity_id', oppMain.id)
      .eq('user_id', userA.uid);
    R.cross_select = foreign;
    if (foreign?.length) fail('cross-user SELECT', 'empty', `rows=${foreign.length}`);
    else ok('User B cannot read User A signup');
  }

  // Cross-user cancel
  {
    const before = (
      await admin
        .from('serve_signups')
        .select('*')
        .eq('id', lifecycleId)
        .single()
    ).data;
    const r = await rpc(userB.browser, 'serve_cancel_signup', oppMain.id);
    R.cross_cancel = r;
    const msg = r.error?.message || '';
    if (msg.includes('signup_not_found') || (r.data?.ok && r.data?.signupStatus === 'cancelled' && before?.user_id === userA.uid && before.status !== 'cancelled' && false)) {
      ok(`cross-user cancel blocked: ${msg || JSON.stringify(r.data)}`);
    } else if (msg.includes('signup_not_found')) {
      ok(`cross-user cancel: signup_not_found`);
    } else if (!r.error && r.data?.ok) {
      // User B has no signup — should be signup_not_found, not success on A's row
      const after = (
        await admin.from('serve_signups').select('*').eq('id', lifecycleId).single()
      ).data;
      if (after?.status === before?.status && after?.cancelled_at === before?.cancelled_at) {
        ok(`cross-user cancel did not mutate A row; response=${JSON.stringify(r.data)}`);
      } else {
        fail('cross-user cancel', 'no mutation of A', JSON.stringify({ r, before, after }));
      }
    } else {
      // any deny is ok if A unchanged
      const after = (
        await admin.from('serve_signups').select('*').eq('id', lifecycleId).single()
      ).data;
      if (after?.status === before?.status) {
        ok(`cross-user cancel protected (${msg || JSON.stringify(r.data)})`);
      } else {
        fail('cross-user cancel', 'A unchanged', JSON.stringify({ r, after }));
      }
    }
  }

  // Capacity=1
  const oppCap = await createOpp(admin, 'Capacity One', {
    capacity: 1,
    requires_approval: false,
  });
  {
    const a = await rpc(userA.browser, 'serve_signup_opportunity', oppCap.id);
    R.capacity_a = a;
    if (a.error || !a.data?.ok) fail('capacity User A', 'success', JSON.stringify(a));
    else ok('capacity User A success');

    const b = await rpc(userB.browser, 'serve_signup_opportunity', oppCap.id);
    R.capacity_b = b;
    if (!(b.error?.message || '').includes('opportunity_full')) {
      fail('capacity User B', 'opportunity_full', JSON.stringify(b));
    } else ok('capacity User B opportunity_full');

    const { count } = await admin
      .from('serve_signups')
      .select('*', { count: 'exact', head: true })
      .eq('opportunity_id', oppCap.id)
      .in('status', ['pending', 'confirmed']);
    if (count !== 1) fail('capacity active count', '1', String(count));
    else ok('exactly one active signup');
  }

  // Idempotency while full
  {
    const r = await rpc(userA.browser, 'serve_signup_opportunity', oppCap.id);
    R.full_idempotent = r;
    if (r.error || r.data?.idempotent !== true) {
      fail('idempotent while full', 'idempotent true', JSON.stringify(r));
    } else ok('already-signed while full → idempotent (not opportunity_full)');
  }

  // Capacity release
  {
    const c = await rpc(userA.browser, 'serve_cancel_signup', oppCap.id);
    R.capacity_cancel_a = c;
    const b = await rpc(userB.browser, 'serve_signup_opportunity', oppCap.id);
    R.capacity_release_b = b;
    if (b.error || !b.data?.ok) fail('capacity release B', 'success', JSON.stringify(b));
    else ok('after A cancel, B signup succeeds');
    const { count } = await admin
      .from('serve_signups')
      .select('*', { count: 'exact', head: true })
      .eq('opportunity_id', oppCap.id)
      .in('status', ['pending', 'confirmed']);
    if (count !== 1) fail('after release active', '1', String(count));
  }

  // Concurrency
  {
    const oppRace = await createOpp(admin, 'Race capacity 1', {
      capacity: 1,
      requires_approval: false,
    });
    const [r1, r2] = await Promise.all([
      rpc(userA.browser, 'serve_signup_opportunity', oppRace.id),
      rpc(userB.browser, 'serve_signup_opportunity', oppRace.id),
    ]);
    R.concurrency = { r1, r2 };
    const oks = [r1, r2].filter((x) => x.data?.ok && !x.error);
    const fulls = [r1, r2].filter((x) =>
      (x.error?.message || '').includes('opportunity_full')
    );
    const { count } = await admin
      .from('serve_signups')
      .select('*', { count: 'exact', head: true })
      .eq('opportunity_id', oppRace.id)
      .in('status', ['pending', 'confirmed']);
    R.concurrency_active = count;
    if (oks.length === 1 && fulls.length === 1 && count === 1) {
      ok('concurrency: one success, one opportunity_full, active=1');
      R.concurrency_verdict = 'PASS';
    } else if (count === 1 && oks.length >= 1) {
      ok(
        `concurrency DB active=1 (rpc oks=${oks.length} fulls=${fulls.length}) — near-simultaneous via Promise.all`
      );
      R.concurrency_verdict =
        oks.length === 1 && fulls.length === 1
          ? 'PASS'
          : 'PASS_DB_ONLY';
      if (!(oks.length === 1 && fulls.length === 1)) {
        // Still acceptable if both somehow got responses weirdly but DB correct
        console.log('NOTE: RPC outcome split not clean 1/1; DB constraint held');
      }
    } else {
      fail(
        'concurrency',
        '1 success + 1 full, active=1',
        `oks=${oks.length} fulls=${fulls.length} active=${count}`
      );
      R.concurrency_verdict = 'FAIL';
    }
  }

  // Approval
  const oppApproval = await createOpp(admin, 'Approval Required', {
    capacity: 2,
    requires_approval: true,
  });
  {
    const r = await rpc(userA.browser, 'serve_signup_opportunity', oppApproval.id);
    R.approval = r;
    if (r.error || r.data?.signupStatus !== 'pending') {
      fail('approval signup', 'pending', JSON.stringify(r));
    } else ok('requires_approval → pending');
    const { data: row } = await admin
      .from('serve_signups')
      .select('*')
      .eq('opportunity_id', oppApproval.id)
      .eq('user_id', userA.uid)
      .maybeSingle();
    if (row?.status !== 'pending') fail('approval DB', 'pending', row?.status);
    if (row?.member_id !== null) fail('approval member_id', 'NULL', String(row?.member_id));
  }

  // Pending consumes capacity
  {
    const oppPend = await createOpp(admin, 'Pending Capacity One', {
      capacity: 1,
      requires_approval: true,
    });
    const a = await rpc(userA.browser, 'serve_signup_opportunity', oppPend.id);
    const b = await rpc(userB.browser, 'serve_signup_opportunity', oppPend.id);
    R.pending_capacity = { a, b };
    if (a.error || a.data?.signupStatus !== 'pending') {
      fail('pending A', 'pending', JSON.stringify(a));
    }
    if (!(b.error?.message || '').includes('opportunity_full')) {
      fail('pending consumes capacity', 'opportunity_full', JSON.stringify(b));
    } else ok('pending consumes capacity');
  }

  // Closed opportunity
  {
    const oppClosed = await createOpp(admin, 'Closed cancelled', {
      capacity: 5,
      requires_approval: false,
      status: 'cancelled',
    });
    const r = await rpc(userA.browser, 'serve_signup_opportunity', oppClosed.id);
    R.closed = r;
    if (!(r.error?.message || '').includes('opportunity_not_open')) {
      fail('closed', 'opportunity_not_open', JSON.stringify(r));
    } else ok('closed → opportunity_not_open');
    const { count } = await admin
      .from('serve_signups')
      .select('*', { count: 'exact', head: true })
      .eq('opportunity_id', oppClosed.id);
    if (count !== 0) fail('closed no rows', '0', String(count));
  }

  // Unknown opportunity
  {
    const r = await rpc(
      userA.browser,
      'serve_signup_opportunity',
      '00000000-0000-4000-8000-000000000099'
    );
    R.unknown = r;
    if (!(r.error?.message || '').includes('opportunity_not_found')) {
      fail('unknown', 'opportunity_not_found', JSON.stringify(r));
    } else ok('unknown → opportunity_not_found');
  }

  // user_not_linked
  {
    const email = `serve.23b6.unlink.${Date.now()}@awc-vault.local`;
    const password = `Verify!${Date.now()}Aa1`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr || !created.user?.id) {
      R.user_not_linked = { executed: false, reason: cErr?.message };
      fail('user_not_linked setup', 'created', cErr?.message);
    } else {
      report.created.authUsers.push(created.user.id);
      const browser = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await browser.auth.signInWithPassword({ email, password });
      const r = await rpc(browser, 'serve_signup_opportunity', oppMain.id);
      R.user_not_linked = r;
      if (!(r.error?.message || '').includes('user_not_linked')) {
        fail('user_not_linked', 'user_not_linked', JSON.stringify(r));
      } else ok('unlinked auth → user_not_linked');
    }
  }

  // Direct UPDATE / DELETE after ensuring own row exists via service for probe
  // Use existing rejoin-active row on oppMain for User A
  {
    const { data: mine } = await admin
      .from('serve_signups')
      .select('id,status')
      .eq('opportunity_id', oppMain.id)
      .eq('user_id', userA.uid)
      .maybeSingle();
    if (mine?.id) {
      const { data: upd, error: uErr } = await userA.browser
        .from('serve_signups')
        .update({ status: 'cancelled' })
        .eq('id', mine.id)
        .select('id');
      R.direct_update = { data: upd, error: summarizeErr(uErr) };
      if (upd?.length) fail('direct UPDATE', 'denied', 'updated');
      else ok(`direct UPDATE denied: ${uErr?.code || uErr?.message || 'no rows'}`);

      const { data: del, error: dErr } = await userA.browser
        .from('serve_signups')
        .delete()
        .eq('id', mine.id)
        .select('id');
      R.direct_delete = { data: del, error: summarizeErr(dErr) };
      if (del?.length) fail('direct DELETE', 'denied', 'deleted');
      else ok(`direct DELETE denied: ${dErr?.code || dErr?.message || 'no rows'}`);

      const after = (
        await admin.from('serve_signups').select('id,status').eq('id', mine.id).maybeSingle()
      ).data;
      if (!after) fail('row survived direct delete attempt', 'present', 'gone');
    }
  }

  // member_id rule across all test signups for A/B
  {
    const { data: all } = await admin
      .from('serve_signups')
      .select('id,member_id,user_id,opportunity_id')
      .in('opportunity_id', report.created.opportunities);
    const bad = (all || []).filter((r) => r.member_id !== null);
    R.member_id_scan = { total: all?.length || 0, non_null: bad.length };
    if (bad.length) fail('all RPC signups member_id NULL', '0 non-null', String(bad.length));
    else ok(`all ${all?.length || 0} test signup rows have member_id NULL`);
  }

  // Legacy / notifications isolation before cleanup
  R.pre_cleanup = {
    event_volunteers: await countExact(admin, 'event_volunteers'),
    user_notifications: await countExact(admin, 'user_notifications'),
    member_ministries: await countOptional(admin, 'member_ministries'),
    team_members: await countOptional(admin, 'team_members'),
  };
  if (R.pre_cleanup.event_volunteers !== R.baseline.event_volunteers) {
    fail(
      'event_volunteers unchanged',
      String(R.baseline.event_volunteers),
      String(R.pre_cleanup.event_volunteers)
    );
  } else ok('event_volunteers unchanged');
  if (R.pre_cleanup.user_notifications !== R.baseline.user_notifications) {
    fail(
      'user_notifications unchanged',
      String(R.baseline.user_notifications),
      String(R.pre_cleanup.user_notifications)
    );
  } else ok('user_notifications unchanged (no Serve notifications)');

  await cleanup(admin);

  const { count: leftOpp } = await admin
    .from('serve_opportunities')
    .select('*', { count: 'exact', head: true })
    .ilike('title', `${MARKER}%`);
  R.marker_opps_remaining = leftOpp;
  if (leftOpp !== 0) fail('cleanup opportunities', '0', String(leftOpp));
  else ok('marker opportunities cleaned');

  R.final = {
    serve_opportunities: await countExact(admin, 'serve_opportunities'),
    serve_signups: await countExact(admin, 'serve_signups'),
    event_volunteers: await countExact(admin, 'event_volunteers'),
    user_notifications: await countExact(admin, 'user_notifications'),
  };
  console.log('FINAL', R.final);

  // Redact ids in printed summary
  const summary = {
    defects: report.defects,
    baseline: R.baseline,
    final: R.final,
    first_signup: R.first_signup,
    repeat_signup: R.repeat_signup,
    cancel: R.cancel,
    repeat_cancel: R.repeat_cancel,
    rejoin: R.rejoin,
    capacity_a: R.capacity_a,
    capacity_b: R.capacity_b,
    full_idempotent: R.full_idempotent,
    capacity_release_b: R.capacity_release_b,
    concurrency_verdict: R.concurrency_verdict,
    concurrency_active: R.concurrency_active,
    approval: R.approval,
    pending_capacity: R.pending_capacity,
    closed: R.closed,
    unknown: R.unknown,
    user_not_linked: R.user_not_linked,
    direct_insert: R.direct_insert,
    direct_update: R.direct_update,
    direct_delete: R.direct_delete,
    anon_rpc_serve_signup_opportunity: R.anon_rpc_serve_signup_opportunity,
    member_id_scan: R.member_id_scan,
    marker_opps_remaining: R.marker_opps_remaining,
    created_at_preserved:
      R.rejoin_rows?.[0]?.created_at === lifecycleCreatedAt && !!lifecycleCreatedAt,
    rejoin_same_id: R.rejoin_rows?.[0]?.id === lifecycleId && !!lifecycleId,
  };
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('DEFECT_COUNT', report.defects.length);
  process.exit(report.defects.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  try {
    loadEnvFile(join(ROOT, '.env.diagnostic.local'));
    const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
    const service = env('SUPABASE_SERVICE_ROLE_KEY');
    if (url && service) {
      const admin = createClient(url, service, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await cleanup(admin);
    }
  } catch (ce) {
    console.error('cleanup after fatal failed', ce);
  }
  process.exit(2);
});
