/**
 * Phase 2.7B.1 — live attendance_sessions verification (TEMP only).
 * Invokes handleAttendanceSessions in-process against live Supabase.
 *
 * Usage:
 *   node --import tsx --env-file=.env.diagnostic.local \
 *     scripts/connect-phase-2-7b1-attendance-sessions-live-verify.mjs
 *
 * Does NOT: reapply SQL, commit/push/deploy, mutate legacy attendance,
 * start check-in/UI, modify Connect.
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MARKER = 'TEST — Phase 2.7B.1';
const MARKER_EMAIL = 'phase27b1';
const require = createRequire(import.meta.url);

const report = {
  projectRef: null,
  defects: [],
  results: {},
  created: {
    authUsers: [],
    publicUsers: [],
    sessions: [],
    auditIds: [],
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(label, fn, attempts = 4) {
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

function fail(check, expected, actual) {
  const msg = `${check}: expected ${expected}; actual ${JSON.stringify(actual)?.slice(0, 300)}`;
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

function makeReq({ method = 'GET', bearer, body, query = {}, ip = '127.0.0.1' } = {}) {
  return {
    method,
    body: body || {},
    query: { resource: 'attendance', subResource: 'sessions', ...query },
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
    return fail(check, 'private, no-store + Pragma no-cache', { cc, pr });
  }
  return ok(check, `${res.statusCode}`);
}

function assertSafeDto(session, check) {
  if (!session || typeof session !== 'object') return fail(check, 'session object', session);
  const keys = Object.keys(session).sort();
  const allowed = new Set([
    'id',
    'type',
    'title',
    'startsAt',
    'endsAt',
    'status',
    'timezone',
    'visitorCount',
    'eventId',
    'serveOpportunityId',
    'openedAt',
    'closedAt',
  ]);
  for (const k of keys) {
    if (!allowed.has(k)) return fail(check, `only safe keys`, keys);
  }
  const blob = JSON.stringify(session);
  if (/created_by|opened_by|closed_by|createdBy|openedBy|closedBy/i.test(blob)) {
    return fail(check, 'no actor ids', blob.slice(0, 200));
  }
  return ok(check, keys.join(','));
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
    return { error: String(e.message || e) };
  }
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
  return { uid, email, role, accessToken: session.access_token, browser };
}

async function cleanup(admin) {
  console.log('\n--- CLEANUP ---');
  // marker sessions
  const { data: markerSessions } = await admin
    .from('attendance_sessions')
    .select('id')
    .ilike('title', `${MARKER}%`);
  const sessionIds = new Set([
    ...report.created.sessions,
    ...(markerSessions || []).map((r) => r.id),
  ]);
  for (const id of sessionIds) {
    const { error } = await admin.from('attendance_sessions').delete().eq('id', id);
    if (error) console.error('cleanup session', id, error.message);
    else console.log('removed session', id.slice(0, 8));
  }

  // TEMP audit
  if (report.created.publicUsers.length) {
    const { data: audits } = await admin
      .from('audit_logs')
      .select('id, action, resource_id, details')
      .in('action', [
        'attendance_session.create',
        'attendance_session.open',
        'attendance_session.close',
        'attendance_session.update',
      ])
      .order('created_at', { ascending: false })
      .limit(200);
    for (const a of audits || []) {
      const rid = a.resource_id;
      const details = JSON.stringify(a.details || {});
      if (sessionIds.has(rid) || details.includes(MARKER) || report.created.sessions.includes(rid)) {
        report.created.auditIds.push(a.id);
      }
    }
  }
  for (const id of report.created.auditIds) {
    const { error } = await admin.from('audit_logs').delete().eq('id', id);
    if (error) console.error('cleanup audit', id, error.message);
    else console.log('removed audit', id.slice(0, 8));
  }

  for (const id of report.created.publicUsers) {
    const { error } = await admin.from('users').delete().eq('id', id);
    if (error) console.error('cleanup public.users', id, error.message);
    else console.log('removed public.users', id.slice(0, 8));
  }
  for (const id of report.created.authUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('cleanup auth', id, error.message);
    else console.log('removed auth', id.slice(0, 8));
  }

  const left = await admin
    .from('attendance_sessions')
    .select('id', { count: 'exact', head: true })
    .ilike('title', `${MARKER}%`);
  console.log('marker session count after cleanup:', left.count);
}

async function main() {
  loadEnvFile(join(ROOT, '.env.diagnostic.local'));
  loadEnvFile(join(ROOT, '.env.local'));

  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const service = env('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
  if (!url || !service || !anonKey) {
    console.error('Missing Supabase env');
    process.exit(2);
  }
  report.projectRef = url.match(/https?:\/\/([^.]+)/)?.[1] || url;

  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = service;

  require('tsx/cjs');
  const { handleAttendanceSessions } = await import('../api/_utils/attendanceSessionHandler.ts');

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n=== Phase 2.7B.1 live verify @ ${report.projectRef} ===\n`);

  report.counts.before.attendance = await countExact(admin, 'attendance');
  report.counts.before.attendance_sessions = await countExact(admin, 'attendance_sessions');
  report.counts.before.audit_logs = await tryCount(admin, 'audit_logs');
  report.counts.before.events = await countExact(admin, 'events');
  report.counts.before.serve_opportunities = await countExact(admin, 'serve_opportunities');
  console.log('baseline attendance=', report.counts.before.attendance);
  console.log('baseline sessions=', report.counts.before.attendance_sessions);

  // --- OpenAPI column check ---
  {
    const openapi = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        Accept: 'application/openapi+json',
      },
    });
    const schema = await openapi.json();
    const props = Object.keys(schema?.definitions?.attendance_sessions?.properties || {}).sort();
    const expected = [
      'closed_at',
      'closed_by',
      'created_at',
      'created_by',
      'ends_at',
      'event_id',
      'id',
      'opened_at',
      'opened_by',
      'serve_opportunity_id',
      'starts_at',
      'status',
      'timezone',
      'title',
      'type',
      'updated_at',
      'visitor_count',
    ];
    if (JSON.stringify(props) !== JSON.stringify(expected)) {
      fail('live_columns', expected, props);
    } else ok('live_columns', props.join(','));

    const detail = schema.definitions.attendance_sessions.properties;
    if (detail.status?.default !== 'draft') fail('default_status', 'draft', detail.status?.default);
    else ok('default_status', 'draft');
    if (detail.timezone?.default !== 'Africa/Kampala') {
      fail('default_timezone', 'Africa/Kampala', detail.timezone?.default);
    } else ok('default_timezone', 'Africa/Kampala');
    if (detail.visitor_count?.default !== 0 && detail.visitor_count?.default !== '0') {
      fail('default_visitor', 0, detail.visitor_count?.default);
    } else ok('default_visitor', '0');
    if (!String(detail.id?.default || '').includes('gen_random_uuid')) {
      fail('default_id', 'gen_random_uuid()', detail.id?.default);
    } else ok('default_id', 'gen_random_uuid()');
    if (!String(detail.created_at?.default || '').includes('now')) {
      fail('default_created_at', 'now()', detail.created_at?.default);
    } else ok('default_created_at', 'now()');
    if (!String(detail.updated_at?.default || '').includes('now')) {
      fail('default_updated_at', 'now()', detail.updated_at?.default);
    } else ok('default_updated_at', 'now()');

    // FK docs
    const ev = String(detail.event_id?.description || '');
    const sv = String(detail.serve_opportunity_id?.description || '');
    const cb = String(detail.created_by?.description || '');
    if (!/fk table='events'/i.test(ev)) fail('fk_event_doc', 'events fk', ev.slice(0, 80));
    else ok('fk_event_doc');
    if (!/fk table='serve_opportunities'/i.test(sv)) fail('fk_serve_doc', 'serve fk', sv.slice(0, 80));
    else ok('fk_serve_doc');
    if (!/fk table='users'/i.test(cb)) fail('fk_created_by_doc', 'users fk', cb.slice(0, 80));
    else ok('fk_created_by_doc');
  }

  // Index catalog — PostgREST cannot query pg_indexes
  report.results.index_catalog =
    'NOT_LIVE_QUERYABLE_VIA_POSTGREST — migration defines indexes; pg_catalog not exposed';
  console.log('NOTE:', report.results.index_catalog);

  let staff;
  let deniedActors = [];
  let eventId = null;

  try {
    // Pick existing event (read-only)
    const { data: events } = await admin.from('events').select('id, name').limit(1);
    eventId = events?.[0]?.id || null;
    if (eventId) ok('existing_event_ref', eventId.slice(0, 8));
    else fail('existing_event_ref', 'at least one event', null);

    // Actors
    staff = await createAuthUser(admin, url, anonKey, 'pastor', 'PASTOR');
    deniedActors = await Promise.all([
      createAuthUser(admin, url, anonKey, 'member', 'MEMBER'),
      createAuthUser(admin, url, anonKey, 'finance', 'FINANCE'),
      createAuthUser(admin, url, anonKey, 'ministry', 'MINISTRY_LEADER'),
      createAuthUser(admin, url, anonKey, 'worship', 'WORSHIP_TEAM'),
      createAuthUser(admin, url, anonKey, 'pending', 'PENDING'),
      createAuthUser(admin, url, anonKey, 'youth', 'YOUTH'),
    ]);
    ok('temp_actors_created', `staff=${staff.uid.slice(0, 8)}`);

    // --- RLS / grants ---
    {
      const sel = await anon.from('attendance_sessions').select('id').limit(5);
      const selMsg = String(sel.error?.message || sel.error?.code || '');
      if (/permission denied|42501/i.test(selMsg)) {
        ok('anon_select_denied', selMsg);
      } else if (!sel.error && (sel.data || []).length === 0) {
        // RLS deny-by-absence can return empty rather than error
        ok('anon_select_denied', 'empty under RLS (no policies)');
      } else {
        fail('anon_select_denied', 'denied/empty', {
          rows: (sel.data || []).length,
          error: sel.error?.message || sel.error?.code || null,
        });
      }

      const ins = await anon.from('attendance_sessions').insert({
        type: 'worship',
        title: `${MARKER} anon-insert`,
        starts_at: new Date().toISOString(),
        created_by: staff.uid,
      });
      if (!ins.error || !/permission denied|42501|row-level security/i.test(ins.error.message)) {
        fail('anon_insert_denied', 'permission denied', ins.error?.message);
        // cleanup if leaked
        if (ins.data?.[0]?.id) {
          report.created.sessions.push(ins.data[0].id);
        }
      } else ok('anon_insert_denied', ins.error.message);

      // authenticated browser (member JWT) — still no table grants
      const memClient = deniedActors[0].browser;
      const mSel = await memClient.from('attendance_sessions').select('id').limit(1);
      if (mSel.error && /permission denied|42501/i.test(mSel.error.message || '')) {
        ok('authenticated_select_denied', mSel.error.message);
      } else if ((mSel.data || []).length === 0) {
        ok('authenticated_select_empty', '0 rows');
      } else {
        fail('authenticated_select_denied', 'denied/empty', mSel.data);
      }

      const mIns = await memClient.from('attendance_sessions').insert({
        type: 'worship',
        title: `${MARKER} auth-insert`,
        starts_at: new Date().toISOString(),
        created_by: deniedActors[0].uid,
      });
      if (!mIns.error || !/permission denied|42501|row-level security/i.test(mIns.error.message)) {
        fail('authenticated_insert_denied', 'permission denied', mIns.error?.message);
      } else ok('authenticated_insert_denied', mIns.error.message);

      const mUpd = await memClient
        .from('attendance_sessions')
        .update({ title: 'x' })
        .eq('id', '00000000-0000-4000-8000-000000000001');
      if (mUpd.error && /permission denied|42501/i.test(mUpd.error.message || '')) {
        ok('authenticated_update_denied', mUpd.error.message);
      } else if (!mUpd.error) {
        ok('authenticated_update_no_rows', '0 affected under RLS/grants');
      } else {
        fail('authenticated_update_denied', 'denied', mUpd.error.message);
      }

      const mDel = await memClient
        .from('attendance_sessions')
        .delete()
        .eq('id', '00000000-0000-4000-8000-000000000001');
      if (mDel.error && /permission denied|42501/i.test(mDel.error.message || '')) {
        ok('authenticated_delete_denied', mDel.error.message);
      } else if (!mDel.error) {
        ok('authenticated_delete_no_rows', '0 affected');
      } else {
        fail('authenticated_delete_denied', 'denied', mDel.error.message);
      }
    }

    // --- DB constraint probes (service_role TEMP, cleanup after each fail) ---
    async function expectDbReject(label, row) {
      const { data, error } = await admin.from('attendance_sessions').insert(row).select('id').maybeSingle();
      if (data?.id) {
        report.created.sessions.push(data.id);
        fail(label, 'constraint reject', 'inserted');
        return;
      }
      if (!error) {
        fail(label, 'constraint reject', 'no error');
        return;
      }
      ok(label, error.message.slice(0, 80));
    }

    const baseDraft = {
      type: 'worship',
      title: `${MARKER} constraint-base`,
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      created_by: staff.uid,
    };

    await expectDbReject('db_invalid_type', { ...baseDraft, type: 'party' });
    await expectDbReject('db_invalid_status', { ...baseDraft, status: 'running' });
    await expectDbReject('db_negative_visitor', { ...baseDraft, visitor_count: -1 });
    await expectDbReject('db_ends_before_starts', {
      ...baseDraft,
      starts_at: '2026-09-20T16:00:00.000Z',
      ends_at: '2026-09-20T14:00:00.000Z',
    });
    await expectDbReject('db_event_without_event_id', {
      ...baseDraft,
      type: 'event',
      event_id: null,
    });
    await expectDbReject('db_open_without_opened', {
      ...baseDraft,
      status: 'open',
    });
    await expectDbReject('db_bad_event_fk', {
      ...baseDraft,
      type: 'event',
      event_id: '00000000-0000-4000-8000-000000000099',
    });
    await expectDbReject('db_bad_serve_fk', {
      ...baseDraft,
      type: 'serve',
      serve_opportunity_id: '00000000-0000-4000-8000-000000000098',
    });

    // Valid defaults via service insert (then API path uses handler)
    {
      const { data, error } = await admin
        .from('attendance_sessions')
        .insert({
          type: 'worship',
          title: `${MARKER} defaults-probe`,
          starts_at: new Date(Date.now() + 2 * 86400000).toISOString(),
          created_by: staff.uid,
        })
        .select('*')
        .single();
      if (error) fail('db_defaults_insert', 'ok', error.message);
      else {
        report.created.sessions.push(data.id);
        if (data.status !== 'draft') fail('db_status_default_live', 'draft', data.status);
        else ok('db_status_default_live', data.status);
        if (data.timezone !== 'Africa/Kampala') {
          fail('db_timezone_default_live', 'Africa/Kampala', data.timezone);
        } else ok('db_timezone_default_live', data.timezone);
        if (data.visitor_count !== 0) fail('db_visitor_default_live', 0, data.visitor_count);
        else ok('db_visitor_default_live', '0');
        if (data.opened_at || data.opened_by || data.closed_at || data.closed_by) {
          fail('db_draft_lifecycle_nulls', 'all null', data);
        } else ok('db_draft_lifecycle_nulls');

        const before = data.updated_at;
        await sleep(1100);
        const { data: upd, error: uErr } = await admin
          .from('attendance_sessions')
          .update({ title: `${MARKER} defaults-probe-updated` })
          .eq('id', data.id)
          .select('updated_at, title')
          .single();
        if (uErr) fail('updated_at_trigger', 'ok', uErr.message);
        else if (!upd?.updated_at || upd.updated_at === before) {
          fail('updated_at_trigger', 'changed', { before, after: upd?.updated_at });
        } else ok('updated_at_trigger', `${before} → ${upd.updated_at}`);
      }
    }

    // service_role manage
    {
      const { count, error } = await admin
        .from('attendance_sessions')
        .select('*', { count: 'exact', head: true });
      if (error) fail('service_role_select', 'ok', error.message);
      else ok('service_role_select', `count=${count}`);
    }

    // ========== LOCAL API vs LIVE DB ==========
    const futureStart = new Date(Date.now() + 3 * 86400000).toISOString();

    // 401
    {
      const res = makeRes();
      await handleAttendanceSessions(makeReq({ method: 'GET' }), res);
      if (res.statusCode !== 401) fail('api_401', 401, res.statusCode);
      else ok('api_401');
      assertNoStore(res, 'cache_401');
    }

    // Denied roles 403
    for (const actor of deniedActors) {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({ method: 'GET', bearer: actor.accessToken }),
        res
      );
      if (res.statusCode !== 403 || res.body?.code !== 'forbidden') {
        fail(`api_denied_${actor.role}`, '403 forbidden', {
          status: res.statusCode,
          code: res.body?.code,
        });
      } else ok(`api_denied_${actor.role}`);
      assertNoStore(res, `cache_403_${actor.role}`);
    }
    ok('denied_role_matrix', 'MEMBER FINANCE MINISTRY_LEADER WORSHIP_TEAM PENDING YOUTH');

    // Allowed GET
    {
      const res = makeRes();
      await handleAttendanceSessions(makeReq({ method: 'GET', bearer: staff.accessToken }), res);
      if (res.statusCode !== 200 || !res.body?.ok) fail('api_get', 200, res);
      else ok('api_get', `sessions=${(res.body.sessions || []).length}`);
      assertNoStore(res, 'cache_200_get');
    }

    // Allowed role smoke: SECRETARY create (quick)
    const secretary = await createAuthUser(admin, url, anonKey, 'secretary', 'SECRETARY');
    ok('allowed_role_SECRETARY_auth', secretary.uid.slice(0, 8));

    // CREATE draft
    let draftId = null;
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'POST',
          bearer: staff.accessToken,
          body: {
            type: 'worship',
            title: MARKER,
            startsAt: futureStart,
            timezone: 'Africa/Kampala',
          },
        }),
        res
      );
      if (res.statusCode !== 201 || !res.body?.session?.id) {
        fail('api_create_draft', '201 session', res.body);
      } else {
        draftId = res.body.session.id;
        report.created.sessions.push(draftId);
        assertSafeDto(res.body.session, 'dto_create');
        if (res.body.session.status !== 'draft') fail('create_status', 'draft', res.body.session.status);
        else ok('create_status', 'draft');
        if (res.body.session.visitorCount !== 0) {
          fail('create_visitor', 0, res.body.session.visitorCount);
        } else ok('create_visitor', '0');
        if (res.body.session.openedAt || res.body.session.closedAt) {
          fail('create_lifecycle_null', 'nulls', res.body.session);
        } else ok('create_lifecycle_null');
        // verify created_by in DB
        const { data: row } = await admin
          .from('attendance_sessions')
          .select('created_by, status, visitor_count, timezone')
          .eq('id', draftId)
          .single();
        if (row?.created_by !== staff.uid) fail('create_created_by', staff.uid.slice(0, 8), row?.created_by);
        else ok('create_created_by', 'TEMP actor');
        ok('api_create_draft', draftId.slice(0, 8));
      }
      assertNoStore(res, 'cache_201_create');
    }

    // Event session
    if (eventId) {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'POST',
          bearer: staff.accessToken,
          body: {
            type: 'event',
            title: `${MARKER} event`,
            startsAt: futureStart,
            eventId,
          },
        }),
        res
      );
      if (res.statusCode !== 201) fail('api_event_session', 201, res.body);
      else {
        report.created.sessions.push(res.body.session.id);
        ok('api_event_session', res.body.session.id.slice(0, 8));
        assertSafeDto(res.body.session, 'dto_event');
      }
    }

    // Event without eventId
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'POST',
          bearer: staff.accessToken,
          body: { type: 'event', title: `${MARKER} bad-event`, startsAt: futureStart },
        }),
        res
      );
      if (res.statusCode !== 400 || res.body?.code !== 'event_required') {
        fail('api_event_without_id', '400 event_required', res.body);
      } else ok('api_event_without_id', res.body.code);
      assertNoStore(res, 'cache_400_event');
    }

    // Generic serve
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'POST',
          bearer: secretary.accessToken,
          body: { type: 'serve', title: `${MARKER} serve`, startsAt: futureStart },
        }),
        res
      );
      if (res.statusCode !== 201) fail('api_serve_generic', 201, res.body);
      else {
        report.created.sessions.push(res.body.session.id);
        if (res.body.session.serveOpportunityId != null) {
          fail('api_serve_null_opp', null, res.body.session.serveOpportunityId);
        } else ok('api_serve_generic', res.body.session.id.slice(0, 8));
      }
    }

    // Invalid input matrix (API)
    const invalidCases = [
      ['api_invalid_type', { type: 'party', title: MARKER, startsAt: futureStart }, 'invalid_type'],
      [
        'api_status_spoof',
        { type: 'worship', title: MARKER, startsAt: futureStart, status: 'open' },
        'spoof_rejected',
      ],
      ['api_empty_title', { type: 'worship', title: '  ', startsAt: futureStart }, 'invalid_title'],
      [
        'api_bad_dates',
        {
          type: 'worship',
          title: MARKER,
          startsAt: '2026-09-20T16:00:00.000Z',
          endsAt: '2026-09-20T14:00:00.000Z',
        },
        'invalid_dates',
      ],
      [
        'api_bad_timezone',
        {
          type: 'worship',
          title: MARKER,
          startsAt: futureStart,
          timezone: 'Eastern Standard Time',
        },
        'invalid_timezone',
      ],
      [
        'api_spoof_opened_by',
        {
          type: 'worship',
          title: MARKER,
          startsAt: futureStart,
          opened_by: staff.uid,
        },
        'spoof_rejected',
      ],
    ];
    for (const [label, body, code] of invalidCases) {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({ method: 'POST', bearer: staff.accessToken, body }),
        res
      );
      if (res.body?.code !== code) fail(label, code, res.body);
      else ok(label, code);
    }

    // Draft edit
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'update', sessionId: draftId, title: `${MARKER} edited` },
        }),
        res
      );
      if (res.statusCode !== 200 || res.body?.session?.title !== `${MARKER} edited`) {
        fail('api_draft_edit', 'edited title', res.body);
      } else ok('api_draft_edit');
    }

    // Draft close → session_not_open
    {
      const resDraft = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'POST',
          bearer: staff.accessToken,
          body: { type: 'kids', title: `${MARKER} draft-close`, startsAt: futureStart },
        }),
        resDraft
      );
      const kidDraft = resDraft.body?.session?.id;
      if (kidDraft) report.created.sessions.push(kidDraft);
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'close', sessionId: kidDraft },
        }),
        res
      );
      if (res.body?.code !== 'session_not_open') fail('api_draft_close', 'session_not_open', res.body);
      else ok('api_draft_close', 'session_not_open');
    }

    // Open
    let openedAt1 = null;
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'open', sessionId: draftId },
        }),
        res
      );
      if (res.statusCode !== 200 || res.body?.session?.status !== 'open') {
        fail('api_open', 'open', res.body);
      } else {
        openedAt1 = res.body.session.openedAt;
        const { data: row } = await admin
          .from('attendance_sessions')
          .select('opened_by, opened_at, closed_by, closed_at, status')
          .eq('id', draftId)
          .single();
        if (row?.opened_by !== staff.uid || !row.opened_at || row.closed_by || row.closed_at) {
          fail('api_open_db', 'opened set / closed null', row);
        } else ok('api_open', openedAt1);
      }
    }

    // Idempotent open
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'open', sessionId: draftId },
        }),
        res
      );
      if (!res.body?.alreadyOpen || res.body?.session?.openedAt !== openedAt1) {
        fail('api_open_idempotent', 'alreadyOpen same timestamp', res.body);
      } else ok('api_open_idempotent');
    }

    // Open edit denied
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'update', sessionId: draftId, title: `${MARKER} open-edit` },
        }),
        res
      );
      if (res.body?.code !== 'session_not_draft') fail('api_open_edit', 'session_not_draft', res.body);
      else ok('api_open_edit', 'session_not_draft');
    }

    // Close
    let closedAt1 = null;
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'close', sessionId: draftId },
        }),
        res
      );
      if (res.body?.session?.status !== 'closed') fail('api_close', 'closed', res.body);
      else {
        closedAt1 = res.body.session.closedAt;
        const { data: row } = await admin
          .from('attendance_sessions')
          .select('closed_by, closed_at, opened_by, opened_at, status')
          .eq('id', draftId)
          .single();
        if (row?.closed_by !== staff.uid || !row.closed_at || !row.opened_by) {
          fail('api_close_db', 'closed set', row);
        } else ok('api_close', closedAt1);
      }
    }

    // Idempotent close
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'close', sessionId: draftId },
        }),
        res
      );
      if (!res.body?.alreadyClosed || res.body?.session?.closedAt !== closedAt1) {
        fail('api_close_idempotent', 'alreadyClosed same timestamp', res.body);
      } else ok('api_close_idempotent');
    }

    // Reopen denied
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'open', sessionId: draftId },
        }),
        res
      );
      if (res.body?.code !== 'session_already_closed') {
        fail('api_reopen', 'session_already_closed', res.body);
      } else ok('api_reopen', 'session_already_closed');
    }

    // Closed edit denied
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({
          method: 'PATCH',
          bearer: staff.accessToken,
          body: { action: 'update', sessionId: draftId, title: `${MARKER} closed-edit` },
        }),
        res
      );
      if (res.body?.code !== 'session_not_draft') {
        fail('api_closed_edit', 'session_not_draft', res.body);
      } else ok('api_closed_edit', 'session_not_draft');
    }

    // DELETE API
    {
      const res = makeRes();
      await handleAttendanceSessions(
        makeReq({ method: 'DELETE', bearer: staff.accessToken, body: { sessionId: draftId } }),
        res
      );
      if (res.statusCode !== 405 || res.body?.code !== 'delete_not_allowed') {
        fail('api_delete', '405 delete_not_allowed', res.body);
      } else ok('api_delete', '405');
      assertNoStore(res, 'cache_405');
    }

    // Peak counts
    report.counts.peak.attendance = await countExact(admin, 'attendance');
    report.counts.peak.attendance_sessions = await countExact(admin, 'attendance_sessions');
    report.counts.peak.audit_logs = await tryCount(admin, 'audit_logs');

    // Audit presence
    {
      const { data: audits } = await admin
        .from('audit_logs')
        .select('id, action, resource_id, details')
        .in('resource_id', report.created.sessions)
        .in('action', [
          'attendance_session.create',
          'attendance_session.open',
          'attendance_session.close',
          'attendance_session.update',
        ]);
      const actions = new Set((audits || []).map((a) => a.action));
      for (const a of [
        'attendance_session.create',
        'attendance_session.open',
        'attendance_session.close',
        'attendance_session.update',
      ]) {
        if (!actions.has(a)) fail(`audit_${a}`, 'present', [...actions]);
        else ok(`audit_${a}`);
      }
      for (const a of audits || []) {
        report.created.auditIds.push(a.id);
        const blob = JSON.stringify(a.details || {});
        if (/password|service_role|Bearer |AWC1\./i.test(blob)) {
          fail('audit_privacy', 'no secrets', blob.slice(0, 100));
        }
      }
      if (report.results.audit_privacy !== 'FAIL') ok('audit_privacy');
    }

    // Legacy attendance isolation mid-run
    if (report.counts.peak.attendance !== report.counts.before.attendance) {
      fail(
        'legacy_attendance_mid',
        report.counts.before.attendance,
        report.counts.peak.attendance
      );
    } else ok('legacy_attendance_mid', String(report.counts.peak.attendance));

    // Allowed roles remaining smoke (ADMIN via role update? create ADMIN actor)
    for (const role of ['ADMIN', 'ADMIN_STAFF', 'ASST_SECRETARY', 'FIRST_LADY', 'SUPER_ADMIN']) {
      const actor = await createAuthUser(admin, url, anonKey, role.toLowerCase(), role);
      const res = makeRes();
      await handleAttendanceSessions(makeReq({ method: 'GET', bearer: actor.accessToken }), res);
      if (res.statusCode !== 200) fail(`allowed_${role}`, 200, res.statusCode);
      else ok(`allowed_${role}`);
    }
  } catch (e) {
    console.error('FATAL:', e);
    report.defects.push(`FATAL: ${e?.message || e}`);
  } finally {
    await cleanup(admin);
    report.counts.after.attendance = await countExact(admin, 'attendance');
    report.counts.after.attendance_sessions = await countExact(admin, 'attendance_sessions');
    report.counts.after.audit_logs = await tryCount(admin, 'audit_logs');
    report.counts.after.events = await countExact(admin, 'events');
    report.counts.after.serve_opportunities = await countExact(admin, 'serve_opportunities');

    const markerLeft = await admin
      .from('attendance_sessions')
      .select('id', { count: 'exact', head: true })
      .ilike('title', `${MARKER}%`);
    report.markerLeft = markerLeft.count;

    if (report.counts.after.attendance !== report.counts.before.attendance) {
      fail(
        'legacy_attendance_final',
        report.counts.before.attendance,
        report.counts.after.attendance
      );
    } else ok('legacy_attendance_final', String(report.counts.after.attendance));

    if (report.counts.after.events !== report.counts.before.events) {
      fail('events_count_stable', report.counts.before.events, report.counts.after.events);
    } else ok('events_count_stable');

    if (report.markerLeft !== 0) fail('marker_cleanup', 0, report.markerLeft);
    else ok('marker_cleanup', '0');
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    projectRef: report.projectRef,
    defects: report.defects,
    results: report.results,
    counts: report.counts,
    markerLeft: report.markerLeft,
    sessionIdsCreated: report.created.sessions.length,
  }, null, 2));

  if (report.defects.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
