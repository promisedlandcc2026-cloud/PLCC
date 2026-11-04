/**
 * PLCC Bucks Phase 1 — database test suite (70 checks).
 * Runs the migration in a FRESH throwaway database and tests roles, caps,
 * reversals, append-only history, lockdown and real parallel-connection races.
 *
 * NEVER point this at Supabase. It needs a local/disposable Postgres superuser:
 *   BUCKS_TEST_PG='postgres://postgres@localhost:5432/postgres' node scripts/awc-bucks-sql-smoke.mjs
 * Without BUCKS_TEST_PG it skips (exit 0).
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.BUCKS_TEST_PG;
if (!url) {
  console.log('awc-bucks-sql-smoke: skipped (set BUCKS_TEST_PG to a disposable local Postgres)');
  process.exit(0);
}
if (/supabase\.(co|com)|pooler\.supabase/i.test(url)) {
  console.error('awc-bucks-sql-smoke: refusing to run against Supabase. Use a local Postgres.');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(join(root, 'supabase/migrations/awc_bucks_phase_1.sql'), 'utf8');
const base = new URL(url);
const conn = { host: base.hostname || '/tmp', port: Number(base.port || 5432), user: decodeURIComponent(base.username || 'postgres'), password: base.password ? decodeURIComponent(base.password) : undefined };
if (base.searchParams.get('host')) conn.host = base.searchParams.get('host');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  OK  ', m); } else { fails++; console.error('  FAIL', m); } };
const section = (t) => console.log(`\n${t}`);

// fresh database per run
const admin = new pg.Client({ ...conn, database: 'postgres' });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS bucks_test');
await admin.query('CREATE DATABASE bucks_test');
await admin.end();

const pool = new pg.Pool({ ...conn, database: 'bucks_test', max: 25 });
const q = async (s, p) => (await pool.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const err = async (s, p) => { try { await pool.query(s, p); return null; } catch (e) { return e.message; } };

// Stubs with the live column names Bucks touches
await pool.query(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
  CREATE TABLE public.users (id uuid PRIMARY KEY, name text, role text, email text);
  CREATE TABLE public.members (id uuid PRIMARY KEY, first_name text);
  CREATE TABLE public.household_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid, member_id uuid, relationship_type text, status text);
  CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), user_id uuid, action text, details text, resource_type text, resource_id text, ip_address text, severity text);
  -- Supabase-like default: table privileges for the API roles on new tables
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`);

section('Migration');
ok(!(await err(SQL)), 'applies cleanly');
ok(!(await err(SQL)), 'applies a second time (safe to re-run)');

// People
const U = {};
for (const [k, role, name] of [
  ['super', 'SUPER_ADMIN', 'Jerless Mahabir'], ['leader', 'MINISTRY_LEADER', 'Keisha Namirimu'],
  ['teacher', 'SUNDAY_SCHOOL_TEACHER', 'Grace Owens'], ['teacher2', 'TEACHER', 'Paul Reed'],
  ['sec', 'SECRETARY', 'Ruth Allen'], ['asst', 'ASST_SECRETARY', 'Ann Lee'], ['vol', 'VOLUNTEER', 'Mark Vole'],
  ['kiosk', 'KIOSK', 'Kids Desk'], ['member', 'MEMBER', 'Joe Parent'], ['pastor', 'PASTOR', 'Pastor Sam'],
]) { U[k] = randomUUID(); await q('INSERT INTO users VALUES ($1,$2,$3,$4)', [U[k], name, role, `${k}@example.com`]); }
const kids = Array.from({ length: 6 }, () => randomUUID());
const adult = randomUUID();
for (const id of kids) { await q('INSERT INTO members VALUES ($1,$2)', [id, 'Kid']); await q(`INSERT INTO household_members (member_id, relationship_type, status) VALUES ($1,'child','active')`, [id]); }
await q('INSERT INTO members VALUES ($1,$2)', [adult, 'Grown']);
await q(`INSERT INTO household_members (member_id, relationship_type, status) VALUES ($1,'self','active')`, [adult]);

const key = () => 'k-' + randomUUID();
const award = async (child, reason, by, k = key()) => (await one('SELECT public.awc_bucks_award($1,$2,$3,$4) r', [child, reason, by, k])).r;
const awardErr = (child, reason, by) => err('SELECT public.awc_bucks_award($1,$2,$3,$4)', [child, reason, by, key()]);
const reverse = async (entry, by, note = 'mistake') => (await one('SELECT public.awc_bucks_reverse($1,$2,$3) r', [entry, by, note])).r;
const reverseErr = (entry, by, note = 'mistake') => err('SELECT public.awc_bucks_reverse($1,$2,$3)', [entry, by, note]);
const balance = async (child) => (await one('SELECT public.awc_bucks_balance_of($1) b', [child])).b;

section('Unauthorized awards are refused by the database (not just the app)');
const [k1, k2, k3, k4, k5, k6] = kids;
for (const who of ['vol', 'kiosk', 'member']) ok(/not_authorized/.test(await awardErr(k1, 'kindness', U[who])), `${who.toUpperCase()} cannot award`);
ok(/not_authorized/.test(await awardErr(k1, 'kindness', randomUUID())), 'unknown user cannot award');
ok(/not_authorized/.test(await awardErr(k1, 'kindness', U.sec)), 'SECRETARY without kids.bucks.award cannot award');
ok(/not_authorized/.test(await awardErr(k1, 'kindness', U.asst)), 'ASST_SECRETARY without kids.bucks.award cannot award');
ok(/not_a_child/.test(await awardErr(adult, 'kindness', U.leader)), 'an adult cannot receive Bucks');
ok(/unknown_reason/.test(await awardErr(k1, 'attendance', U.leader)), 'no attendance reason exists');
ok((await balance(k1)) === 0, 'nothing was written by refused awards');

section('Permissions and display names (Super Admin only)');
ok(/not_authorized/.test(await err('SELECT public.awc_bucks_set_leader($1,$2,$3,true,true)', [U.leader, U.sec, 'Sis. Ruth'])), 'a non–Super Admin cannot grant kids.bucks.award');
let r = (await one('SELECT public.awc_bucks_set_leader($1,$2,$3,true,true) r', [U.super, U.sec, 'Sister Ruth'])).r;
ok(r.ok && r.canAwardNow === true, 'Super Admin grants SECRETARY kids.bucks.award');
r = await award(k1, 'brought_bible', U.sec);
ok(r.ok && r.issuedByName === 'Sister Ruth', 'granted SECRETARY can award; parents see the approved name "Sister Ruth"');
await q('SELECT public.awc_bucks_set_leader($1,$2,NULL,false,true)', [U.super, U.sec]);
ok(/not_authorized/.test(await awardErr(k1, 'brought_bible', U.sec)), 'revoking the permission stops SECRETARY at once');
ok(/not_authorized/.test(await awardErr(k1, 'brought_bible', U.vol)), 'VOLUNTEER still refused (no grant path)');
await q('SELECT public.awc_bucks_set_leader($1,$2,$3,false,true)', [U.super, U.leader, 'Teacher Keisha']);
r = await award(k1, 'memory_verse', U.leader);
ok(r.ok && r.issuedByName === 'Teacher Keisha', 'approved display name "Teacher Keisha" is used');
r = await award(k1, 'kindness', U.teacher);
ok(r.ok && r.issuedByName === 'Grace O.', 'no approved name → first name + last initial ("Grace O."), never contact info');
await q('SELECT public.awc_bucks_set_leader($1,$2,NULL,false,false)', [U.super, U.teacher2]);
ok(/not_authorized/.test(await awardErr(k1, 'kindness', U.teacher2)), 'Super Admin can suspend a core leader (active = false)');
const wallet = (await one('SELECT public.awc_bucks_wallet($1) w', [k1])).w;
const walletJson = JSON.stringify(wallet);
ok(!walletJson.includes('@example.com') && !walletJson.includes(U.leader), 'wallet shows no email and no leader id');
ok(wallet.history.some(h => h.awardedBy === 'Teacher Keisha' && h.reasonLabel === 'Memorized a Bible verse' && h.amount === 20), 'wallet line reads "+20 · Memorized a Bible verse · Teacher Keisha"');

section('Idempotency (no double awards)');
const fixed = key();
const a1 = await award(k2, 'kindness', U.leader, fixed);
const a2 = await award(k2, 'kindness', U.leader, fixed);
ok(a1.ok && !a1.duplicate && a2.duplicate && a2.entryId === a1.entryId, 'same key twice → one entry, second call says duplicate');
ok((await balance(k2)) === 15, 'balance counted once (15)');
ok(/idempotency_key_reused/.test(await err('SELECT public.awc_bucks_award($1,$2,$3,$4)', [k3, 'kindness', U.leader, fixed])), 'a key cannot be reused for another child');

section('Cap boundaries (weekly 100 per child across all leaders · daily 60 per leader per child)');
// k3: leader gives 20+20+20 = 60 exactly (daily cap) → next 5 refused with remaining 0
for (let i = 0; i < 3; i++) await award(k3, 'memory_verse', U.leader);
ok((await balance(k3)) === 60, 'leader reaches exactly 60 for one child in a day');
r = await award(k3, 'brought_bible', U.leader);
ok(!r.ok && r.code === 'daily_cap' && r.remaining === 0, 'leader +5 over 60 refused (daily_cap, 0 left)');
// another leader adds 20+15 = 95, then +5 = 100 exactly, then +5 refused
await award(k3, 'memory_verse', U.teacher); await award(k3, 'kindness', U.teacher);
ok((await balance(k3)) === 95, 'second leader brings the child to 95');
r = await award(k3, 'brought_bible', U.teacher);
ok(r.ok && r.balance === 100, 'exactly 100 in a week is allowed');
r = await award(k3, 'brought_bible', U.pastor);
ok(!r.ok && r.code === 'weekly_cap' && r.remaining === 0, 'a third leader cannot go past 100 (weekly cap is per child, across all leaders)');
r = await award(k3, 'special', U.pastor);
ok(!r.ok && r.code === 'weekly_cap', 'a big reason cannot jump the cap either');

section('Reversals: audited, once only, and cannot be used to bypass a cap');
const k3entries = await q(`SELECT id, amount FROM awc_bucks_ledger WHERE child_member_id=$1 AND kind='award' ORDER BY created_at`, [k3]);
ok(/not_authorized/.test(await reverseErr(k3entries[0].id, U.teacher)), 'a TEACHER cannot reverse');
ok(/not_authorized/.test(await reverseErr(k3entries[0].id, U.sec)), 'a SECRETARY cannot reverse');
ok(/note_required/.test(await reverseErr(k3entries[0].id, U.leader, '  ')), 'a reversal needs a written note');
r = await reverse(k3entries[0].id, U.leader, 'Gave to the wrong child');
ok(r.ok && r.amount === -20 && r.balance === 80, 'MINISTRY_LEADER reverses 20 → balance 80');
r = await reverse(k3entries[0].id, U.super, 'again');
ok(!r.ok && r.code === 'already_reversed', 'the same award cannot be reversed twice');
const revId = (await one(`SELECT id FROM awc_bucks_ledger WHERE reverses_id=$1`, [k3entries[0].id])).id;
ok(/not_reversible/.test(await reverseErr(revId, U.super)), 'a reversal cannot itself be reversed');
// cap bypass attempt: award/reverse/award loop must never let the child KEEP more than 100 this week
for (let i = 0; i < 5; i++) {
  const x = await award(k3, 'memory_verse', U.pastor);
  if (x.ok) await reverse(x.entryId, U.super, 'loop test');
}
await award(k3, 'memory_verse', U.pastor);
await award(k3, 'memory_verse', U.pastor);
const keptThisWeek = (await one(`SELECT coalesce(sum(l.amount),0)::int s FROM awc_bucks_ledger l WHERE l.child_member_id=$1 AND l.kind='award' AND NOT EXISTS (SELECT 1 FROM awc_bucks_ledger r WHERE r.reverses_id=l.id)`, [k3])).s;
ok(keptThisWeek <= 100 && (await balance(k3)) <= 100, `award/reverse loops cannot push kept Bucks past the cap (kept ${keptThisWeek})`);
const auditCount = (await one(`SELECT count(*)::int n FROM audit_logs WHERE action IN ('awc_bucks.award','awc_bucks.reverse')`)).n;
const ledgerCount = (await one(`SELECT count(*)::int n FROM awc_bucks_ledger`)).n;
ok(auditCount === ledgerCount, `every ledger row has an audit_logs row (${ledgerCount} / ${auditCount})`);

section('Church week = Monday 00:00 → Sunday 23:59 Eastern');
const ws = async (ts) => (await one(`SELECT to_char(public.awc_bucks_week_start($1::timestamptz) AT TIME ZONE 'Africa/Kampala','Dy YYYY-MM-DD HH24:MI') w`, [ts])).w;
ok((await ws('2026-10-18 23:59:00-04')) === 'Mon 2026-10-12 00:00', 'Sunday 11:59 PM belongs to the week that started Monday Oct 12');
ok((await ws('2026-10-19 00:00:00-04')) === 'Mon 2026-10-19 00:00', 'Monday 12:00 AM starts a new week');
ok((await ws('2026-11-02 03:30:00-05')) === 'Mon 2026-11-02 00:00', 'works across the November daylight-saving change');
// awards dated last Sunday night do not count toward this week
const lastSunday = (await one(`SELECT public.awc_bucks_week_start(now()) - interval '1 hour' t`)).t;
await q(`INSERT INTO awc_bucks_ledger (child_member_id, kind, amount, reason_id, reason_label, issued_by, issued_by_name, idempotency_key, created_at) VALUES ($1,'award',50,'special','Special achievement',$2,'Old','k-lastweek-1',$3)`, [k4, U.leader, lastSunday]);
await q(`INSERT INTO awc_bucks_ledger (child_member_id, kind, amount, reason_id, reason_label, issued_by, issued_by_name, idempotency_key, created_at) VALUES ($1,'award',50,'special','Special achievement',$2,'Old','k-lastweek-2',$3)`, [k4, U.teacher, lastSunday]);
r = await award(k4, 'special', U.pastor);
ok(r.ok && r.balance === 150, '100 earned last Sunday night does not block Monday (new week starts fresh)');

section('Concurrency (real parallel connections)');
// 20 simultaneous awards of 20 for one child from 4 leaders (5 each). Weekly cap 100 → exactly 5 may land.
const racers = [U.leader, U.teacher, U.pastor, U.super];
const results = await Promise.all(Array.from({ length: 20 }, (_, i) => award(k5, 'memory_verse', racers[i % 4])));
const landed = results.filter(x => x.ok).length;
ok(landed === 5 && (await balance(k5)) === 100, `20 parallel awards → exactly 5 landed, balance exactly 100 (got ${landed}, ${await balance(k5)})`);
// 15 simultaneous requests with the SAME key → one row
const same = key();
const dupes = await Promise.all(Array.from({ length: 15 }, () => award(k6, 'kindness', U.leader, same)));
const rows = (await one(`SELECT count(*)::int n FROM awc_bucks_ledger WHERE idempotency_key=$1`, [same])).n;
ok(rows === 1 && dupes.filter(d => d.duplicate).length === 14, `15 parallel double-taps with one key → 1 row, 14 duplicates`);
// 10 simultaneous reversals of one award → exactly one reversal
const target = dupes[0].entryId;
const revs = await Promise.all(Array.from({ length: 10 }, () => reverse(target, U.super, 'race')));
ok(revs.filter(x => x.ok).length === 1 && (await balance(k6)) === 0, '10 parallel reversals → exactly one, balance back to 0');
// daily cap under a race: one leader fires 10 × 20 at a fresh child → only 3 land (60)
const k7 = randomUUID();
await q('INSERT INTO members VALUES ($1,$2)', [k7, 'Kid']);
await q(`INSERT INTO household_members (member_id, relationship_type, status) VALUES ($1,'child','active')`, [k7]);
const dRace = await Promise.all(Array.from({ length: 10 }, () => award(k7, 'memory_verse', U.leader)));
ok(dRace.filter(x => x.ok).length === 3 && (await balance(k7)) === 60, '10 parallel awards from one leader → exactly 3 land (daily cap 60)');

section('Append-only history');
const anyRow = (await one('SELECT id FROM awc_bucks_ledger LIMIT 1')).id;
ok(/append-only/.test(await err('UPDATE awc_bucks_ledger SET amount = 999 WHERE id=$1', [anyRow])), 'UPDATE refused (even as database owner)');
ok(/append-only/.test(await err('DELETE FROM awc_bucks_ledger WHERE id=$1', [anyRow])), 'DELETE refused (even as database owner)');
ok(/append-only/i.test(String(await err('TRUNCATE awc_bucks_ledger') || '')), 'TRUNCATE refused (Phase 1 sentence or "<table> is append-only")');
ok(/awc_bucks_ledger_shape/.test(await err(`INSERT INTO awc_bucks_ledger (child_member_id, kind, amount, reason_label, issued_by, issued_by_name, idempotency_key) VALUES ($1,'award',-5,'x',$2,'x','k-negative-1')`, [k1, U.leader])), 'a negative "award" is rejected by the table itself');

section('No direct client access (anon / authenticated) and no direct writes by the server');
const asRole = async (role, s, p) => { const c = await pool.connect(); try { await c.query(`SET ROLE ${role}`); await c.query(s, p); return null; } catch (e) { return e.message; } finally { await c.query('RESET ROLE'); c.release(); } };
for (const role of ['anon', 'authenticated']) {
  ok(/permission denied/.test(await asRole(role, 'SELECT * FROM awc_bucks_ledger')), `${role}: cannot read the ledger`);
  ok(/permission denied/.test(await asRole(role, `INSERT INTO awc_bucks_ledger (child_member_id, kind, amount, reason_id, reason_label, issued_by, issued_by_name, idempotency_key) VALUES ($1,'award',5,'kindness','x',$2,'x','k-client-1')`, [k1, U.leader])), `${role}: cannot insert Bucks`);
  ok(/permission denied/.test(await asRole(role, 'SELECT public.awc_bucks_award($1,$2,$3,$4)', [k1, 'kindness', U.leader, key()])), `${role}: cannot call award`);
  ok(/permission denied/.test(await asRole(role, 'SELECT public.awc_bucks_set_caps($1,500,500)', [U.super])), `${role}: cannot change caps`);
  ok(/permission denied/.test(await asRole(role, 'SELECT * FROM awc_bucks_settings')), `${role}: cannot read settings`);
}
ok(/permission denied/.test(await asRole('service_role', `INSERT INTO awc_bucks_ledger (child_member_id, kind, amount, reason_id, reason_label, issued_by, issued_by_name, idempotency_key) VALUES ($1,'award',5,'kindness','x',$2,'x','k-svc-1')`, [k1, U.leader])), 'service role: cannot insert directly (must use awc_bucks_award)');
ok(/permission denied/.test(await asRole('service_role', 'UPDATE awc_bucks_settings SET weekly_cap_per_child = 999')), 'service role: cannot edit caps directly (must use awc_bucks_set_caps)');
ok(!(await asRole('service_role', 'SELECT public.awc_bucks_wallet($1)', [k1])), 'service role: can read a wallet through the function');
ok(!(await asRole('service_role', 'SELECT public.awc_bucks_award($1,$2,$3,$4)', [k2, 'brought_bible', U.leader, key()])), 'service role: can award through the function');

section('Super Admin caps');
ok(/not_authorized/.test(await err('SELECT public.awc_bucks_set_caps($1,200,80)', [U.pastor])), 'PASTOR cannot change caps');
r = (await one('SELECT public.awc_bucks_set_caps($1,120,80) r', [U.super])).r;
ok(r.ok && (await one('SELECT weekly_cap_per_child w, daily_cap_per_issuer_per_child d FROM awc_bucks_settings')).w === 120, 'Super Admin changes caps to 120 / 80 (audited)');
ok(/check constraint/.test(await err('SELECT public.awc_bucks_set_caps($1,0,80)', [U.super])), 'a cap of 0 is rejected');

section('Existing data stays safe');
const before = (await one('SELECT count(*)::int n FROM awc_bucks_ledger WHERE child_member_id=$1', [k1])).n;
ok(before > 0, 'child has history');
await q('DELETE FROM members WHERE id=$1', [k1]);
ok((await one('SELECT count(*)::int n FROM awc_bucks_ledger WHERE child_member_id=$1', [k1])).n === 0, 'deleting the child member record still works (Bucks history goes with it)');
await q(`UPDATE household_members SET status='inactive' WHERE member_id=$1`, [k2]);
ok(/not_a_child/.test(await awardErr(k2, 'kindness', U.leader)) && (await balance(k2)) > 0, 'a child removed from a household keeps history but gets no new awards');

await pool.end();
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
