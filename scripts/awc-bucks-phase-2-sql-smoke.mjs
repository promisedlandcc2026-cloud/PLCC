/**
 * PLCC Bucks Phase 2 — database checks on top of the real Phase 1 file.
 * NEVER point this at Supabase.
 *   BUCKS_TEST_PG='postgres://postgres@localhost:5432/postgres' node scripts/awc-bucks-phase-2-sql-smoke.mjs
 * Without BUCKS_TEST_PG it skips (exit 0).
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.BUCKS_TEST_PG;
if (!url) {
  console.log('awc-bucks-phase-2-sql-smoke: skipped (set BUCKS_TEST_PG to a disposable local Postgres)');
  process.exit(0);
}
if (/supabase\.(co|com)|pooler\.supabase/i.test(url)) {
  console.error('awc-bucks-phase-2-sql-smoke: refusing to run against Supabase.');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const phase1 = readFileSync(join(root, 'supabase/migrations/awc_bucks_phase_1.sql'), 'utf8');
const phase2 = readFileSync(join(root, 'supabase/migrations/awc_bucks_phase_2.sql'), 'utf8');
const base = new URL(url);
const conn = {
  host: base.hostname || '/tmp',
  port: Number(base.port || 5432),
  user: decodeURIComponent(base.username || 'postgres'),
  password: base.password ? decodeURIComponent(base.password) : undefined,
};
if (base.searchParams.get('host')) conn.host = base.searchParams.get('host');

let fails = 0;
let passes = 0;
const ok = (c, m) => {
  if (c) {
    passes++;
    console.log('  OK  ', m);
  } else {
    fails++;
    console.error('  FAIL', m);
  }
};

const admin = new pg.Client({ ...conn, database: 'postgres' });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS bucks_phase2_test');
await admin.query('CREATE DATABASE bucks_phase2_test');
await admin.end();

const pool = new pg.Pool({ ...conn, database: 'bucks_phase2_test', max: 25 });
const q = async (s, p) => (await pool.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const err = async (s, p) => {
  try {
    await pool.query(s, p);
    return null;
  } catch (e) {
    return e.message;
  }
};

await pool.query(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
  CREATE TABLE public.users (id uuid PRIMARY KEY, name text, role text, email text);
  CREATE TABLE public.members (id uuid PRIMARY KEY, first_name text);
  CREATE TABLE public.household_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid, member_id uuid,
    relationship_type text, status text
  );
  CREATE TABLE public.guardian_relationships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guardian_user_id uuid, child_member_id uuid, status text
  );
  CREATE TABLE public.user_member_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, member_id uuid, status text
  );
  CREATE TABLE public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(),
    user_id uuid, action text, details text, resource_type text, resource_id text, ip_address text, severity text
  );
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`);

ok(!(await err(phase1)), 'Phase 1 applies');
const seedUser = randomUUID();
const seedChild = randomUUID();
await q('INSERT INTO users VALUES ($1,$2,$3,$4)', [seedUser, 'Seed Admin', 'SUPER_ADMIN', 'seed@example.com']);
await q('INSERT INTO members VALUES ($1,$2)', [seedChild, 'Seed']);
await q(`INSERT INTO household_members (member_id, relationship_type, status) VALUES ($1,'child','active')`, [seedChild]);
await q('SELECT public.awc_bucks_award($1,$2,$3,$4)', [seedChild, 'kindness', seedUser, 'k-phase1-seed']);
const before = await q('SELECT id, kind, amount, child_member_id, idempotency_key FROM awc_bucks_ledger ORDER BY created_at, id');
ok(before.length === 1 && before[0].amount === 15, 'Phase 1 wrote one history row before Phase 2');
ok(!(await err(phase2)), 'Phase 2 applies on top of Phase 1');
ok(!(await err(phase2)), 'Phase 2 applies a second time');
const after = await q('SELECT id, kind, amount, child_member_id, idempotency_key FROM awc_bucks_ledger ORDER BY created_at, id');
ok(JSON.stringify(before) === JSON.stringify(after), 'every Phase 1 history row stayed the same');

const wipe = String(await err('TRUNCATE awc_bucks_ledger') || '');
ok(/append-only/i.test(wipe), `wiping the history table is still blocked (${wipe.slice(0, 80)})`);

const U = {};
for (const [k, role, name] of [
  ['super', 'SUPER_ADMIN', 'Jerless Mahabir'],
  ['leader', 'MINISTRY_LEADER', 'Keisha Namirimu'],
  ['leader2', 'MINISTRY_LEADER', 'Other Leader'],
  ['teacher', 'SUNDAY_SCHOOL_TEACHER', 'Grace Owens'],
  ['vol', 'VOLUNTEER', 'Mark Vole'],
  ['parent', 'MEMBER', 'Joe Parent'],
  ['stranger', 'MEMBER', 'Other Parent'],
  ['kiosk', 'KIOSK', 'Kids Desk'],
]) {
  U[k] = randomUUID();
  await q('INSERT INTO users VALUES ($1,$2,$3,$4)', [U[k], name, role, `${k}@example.com`]);
}
const house = randomUUID();
const kidA = randomUUID();
const kidB = randomUUID();
const adultMember = randomUUID();
for (const [id, name, rel] of [
  [kidA, 'Ada', 'child'],
  [kidB, 'Ben', 'child'],
  [adultMember, 'Joe', 'self'],
]) {
  await q('INSERT INTO members VALUES ($1,$2)', [id, name]);
  await q(
    'INSERT INTO household_members (household_id, member_id, relationship_type, status) VALUES ($1,$2,$3,$4)',
    [house, id, rel, 'active']
  );
}
await q(
  `INSERT INTO user_member_links (user_id, member_id, status) VALUES ($1,$2,'verified')`,
  [U.parent, adultMember]
);

await q('SELECT public.awc_bucks_set_caps($1, 5000, 5000)', [U.super]);
const key = () => 'k-' + randomUUID();
const award = async (child, reason, by, k = key()) =>
  (await one('SELECT public.awc_bucks_award($1,$2,$3,$4) r', [child, reason, by, k])).r;
const available = async (child) => (await one('SELECT public.awc_bucks_available($1) b', [child])).b;

console.log('\nNo negative wallet / payback');
let r = await award(kidA, 'special', U.super);
ok(r.ok && r.balance === 50, 'award 50');
r = await one('SELECT public.awc_bucks_reverse($1,$2,$3) r', [r.entryId, U.super, 'wrong child']);
ok(r.ok && r.applied === 50 && r.outstanding === 0 && (await available(kidA)) === 0, 'full reversal when the Bucks are still there');
const spent = await award(kidA, 'special', U.super);
await one(
  `INSERT INTO awc_bucks_redemptions (child_member_id, prize_id, prize_name, price_bucks, status, requested_by, idempotency_key)
   VALUES ($1,'sticker_pack','Sticker Pack',50,'requested',$2,$3)`,
  [kidA, U.parent, key()]
);
r = await one('SELECT public.awc_bucks_reverse($1,$2,$3) r', [spent.entryId, U.super, 'held bucks']);
ok(r.ok && r.applied === 0 && r.outstanding === 50 && (await available(kidA)) === 0, 'reversal does not touch Bucks on hold; the rest is owed');
const next = await award(kidA, 'memory_verse', U.super);
ok(next.ok && next.recovered === 20 && next.balance === 0, 'the next award pays the oldest correction first, all of it');

console.log('\nVolunteers and recommendations');
const grantAll = await err(
  'SELECT public.awc_bucks_set_permissions($1,$2,$3,true,true,true,true,true)',
  [U.super, U.vol, 'Mark', true]
);
ok(/grant_not_allowed/.test(String(grantAll || '')), 'a volunteer cannot be granted award rights');
await q('SELECT public.awc_bucks_set_permissions($1,$2,$3,false,false,true,true,true)', [U.super, U.vol, 'Mark']);
ok(/not_authorized/.test(String(await err('SELECT public.awc_bucks_award($1,$2,$3,$4)', [kidB, 'kindness', U.vol, key()]) || '')), 'volunteer still cannot award');
const rec = (await one('SELECT public.awc_bucks_recommend($1,$2,$3,$4,$5) r', [kidB, 'kindness', U.vol, key(), 'was kind'])).r;
ok(rec.ok && rec.status === 'pending', 'volunteer recommendation does not pay yet');
ok(
  /not_authorized/.test(String(await err('SELECT public.awc_bucks_decide_recommendation($1,$2,true,null)', [rec.recommendationId, U.vol]) || '')),
  'the recommender cannot approve their own note'
);
const decided = (
  await one('SELECT public.awc_bucks_decide_recommendation($1,$2,true,$3) r', [rec.recommendationId, U.leader, 'yes'])
).r;
ok(decided.ok && (await available(kidB)) === 15, 'a different leader approves and the Bucks are paid once');

console.log('\nWho can request');
await q('SELECT public.awc_bucks_adjust_stock($1,$2,1,$3)', [U.super, 'art_kit', 'one kit']);
const parentReq = (await one('SELECT public.awc_bucks_request_prize($1,$2,$3,$4) r', [kidB, 'art_kit', U.parent, key()])).r;
ok(parentReq.ok === false && parentReq.code === 'not_enough', 'linked parent can ask, but not without enough Bucks');
for (let i = 0; i < 8; i++) await award(kidA, 'special', U.leader);
const blocked = String(await err('SELECT public.awc_bucks_request_prize($1,$2,$3,$4)', [kidA, 'art_kit', U.stranger, key()]) || '');
ok(/not_authorized/.test(blocked), 'another parent is refused');
ok(/not_authorized/.test(String(await err('SELECT public.awc_bucks_request_prize($1,$2,$3,$4)', [kidA, 'art_kit', U.kiosk, key()]) || '')), 'kiosk is refused');
const taps = key();
const first = (await one('SELECT public.awc_bucks_request_prize($1,$2,$3,$4) r', [kidA, 'art_kit', U.parent, taps])).r;
const second = (await one('SELECT public.awc_bucks_request_prize($1,$2,$3,$4) r', [kidA, 'art_kit', U.parent, taps])).r;
ok(first.ok && !first.duplicate && second.duplicate && second.requestId === first.requestId, 'twenty-style double tap: one request');
const rows = (await one('SELECT count(*)::int n FROM awc_bucks_redemptions WHERE idempotency_key=$1', [taps])).n;
ok(rows === 1, 'one redemption row for that tap');

console.log('\nLast item and budget');
await q('SELECT public.awc_bucks_upsert_prize($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
  U.super, 'art_kit', 'Creative Art Kit', null, 400, 300, null, true, 40,
]);
await q(
  `SELECT public.awc_bucks_set_budget($1, date_trunc('month', now() AT TIME ZONE 'Africa/Kampala')::date, 100000)`,
  [U.super]
);
ok((await one('SELECT public.awc_bucks_can_approve($1) r', [U.leader])).r === false, 'ministry leader starts without approval');
await q('SELECT public.awc_bucks_set_permissions($1,$2,$3,false,true,true,false,true)', [U.super, U.leader, 'Keisha']);
const other = (await one('SELECT public.awc_bucks_request_prize($1,$2,$3,$4) r', [kidB, 'art_kit', U.leader, key()])).r;
ok(other.ok === false && other.code === 'not_enough', 'second child cannot take the kit without Bucks');
for (let i = 0; i < 8; i++) await award(kidB, 'special', U.leader);
const secondChild = (await one('SELECT public.awc_bucks_request_prize($1,$2,$3,$4) r', [kidB, 'art_kit', U.leader, key()])).r;
ok(secondChild.ok, 'second child can request while one kit is still free');
const approved = (await one('SELECT public.awc_bucks_approve_request($1,$2,false,null) r', [first.requestId, U.leader])).r;
ok(approved.ok, 'first request approved');
const lost = (await one('SELECT public.awc_bucks_approve_request($1,$2,false,null) r', [secondChild.requestId, U.leader])).r;
ok(lost.ok === false && lost.code === 'out_of_stock', 'the last Art Kit goes to exactly one child');

const fulfillKey = first.requestId;
const picks = await Promise.all(
  Array.from({ length: 10 }, () =>
    one('SELECT public.awc_bucks_fulfill_request($1,$2,null,null) r', [fulfillKey, U.leader]).then((row) => row.r)
  )
);
ok(picks.filter((x) => x.ok).length === 1, 'ten pickup taps spend the Bucks once');
ok((await one(`SELECT count(*)::int n FROM awc_bucks_ledger WHERE redemption_id=$1`, [fulfillKey])).n === 1, 'one redemption ledger row');

console.log('\nBudget race');
await q('SELECT public.awc_bucks_adjust_stock($1,$2,10,$3)', [U.super, 'sticker_pack', 'restock']);
await q('SELECT public.awc_bucks_upsert_prize($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
  U.super, 'sticker_pack', 'Sticker Pack', null, 50, 300, null, true, 10,
]);
await q(`DELETE FROM awc_bucks_budget_months`);
await q('SELECT public.awc_bucks_set_budget($1, date_trunc(\'month\', now() AT TIME ZONE \'Africa/Kampala\')::date, 1000)', [U.super]);
const kids = [];
for (let i = 0; i < 6; i++) {
  const id = randomUUID();
  kids.push(id);
  await q('INSERT INTO members VALUES ($1,$2)', [id, 'Kid']);
  await q(
    'INSERT INTO household_members (household_id, member_id, relationship_type, status) VALUES ($1,$2,$3,$4)',
    [house, id, 'child', 'active']
  );
  await award(id, 'special', U.super);
  await one('SELECT public.awc_bucks_request_prize($1,$2,$3,$4)', [id, 'sticker_pack', U.leader, key()]);
}
const open = await q(`SELECT id FROM awc_bucks_redemptions WHERE prize_id='sticker_pack' AND status='requested'`);
const approvals = await Promise.all(
  open.map((row) => one('SELECT public.awc_bucks_approve_request($1,$2,false,null) r', [row.id, U.leader]).then((x) => x.r))
);
ok(approvals.filter((x) => x.ok).length === 3, `six $3 approvals with $10 left → exactly three (got ${approvals.filter((x) => x.ok).length})`);
const over = approvals.find((x) => x.ok === false);
ok(over && (over.code === 'over_budget' || over.code === 'no_budget'), 'the rest are refused for the budget');
const forced = open.find((row) => !approvals[open.indexOf(row)]?.ok);
if (forced) {
  const noNote = (await one('SELECT public.awc_bucks_approve_request($1,$2,true,$3) r', [forced.id, U.leader, 'please'])).r;
  ok(noNote.ok === false || /not_authorized/.test(JSON.stringify(noNote)), 'a ministry leader cannot override the budget');
  const withNote = (await one('SELECT public.awc_bucks_approve_request($1,$2,true,$3) r', [forced.id, U.super, 'Christmas stock'])).r;
  ok(withNote.ok && withNote.override === true, 'Super Admin override with a note is allowed and flagged');
  const audited = (await one(`SELECT count(*)::int n FROM audit_logs WHERE action='awc_bucks.approve_override'`)).n;
  ok(audited >= 1, 'the override is in the audit log');
}

await pool.end();
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
