/**
 * Static source contracts for Serve Phase 2.3 migration history:
 * - serve_phase_2_3_core.sql (fresh schema)
 * - serve_phase_2_3_signup_normalize.sql (legacy-collision normalize)
 *
 * Does NOT apply SQL or contact a live database.
 *
 * Run: node --test scripts/test-serve-phase-2-3-normalize.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corePath = join(root, 'supabase/migrations/serve_phase_2_3_core.sql');
const normalizePath = join(
  root,
  'supabase/migrations/serve_phase_2_3_signup_normalize.sql'
);
const abandonedFixPath = join(
  root,
  'supabase/migrations/serve_phase_2_3_signup_contract_fix.sql'
);

function execOnly(sql) {
  return sql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
}

describe('serve_phase_2_3 migration history — normalize contracts', () => {
  it('core + normalize exist; abandoned large fix is not present', () => {
    assert.equal(existsSync(corePath), true);
    assert.equal(existsSync(normalizePath), true);
    assert.equal(existsSync(abandonedFixPath), false);
  });

  it('lexical order places core before normalize', () => {
    assert.ok('serve_phase_2_3_core.sql' < 'serve_phase_2_3_signup_normalize.sql');
  });

  const core = existsSync(corePath) ? readFileSync(corePath, 'utf8') : '';
  const sql = existsSync(normalizePath) ? readFileSync(normalizePath, 'utf8') : '';
  const exec = execOnly(sql);

  it('core creates correct fresh serve_signups contract', () => {
    assert.ok(core.includes('member_id uuid NULL'));
    assert.ok(core.includes('user_id uuid NOT NULL'));
    assert.ok(core.includes('REFERENCES public.users(id)'));
    assert.ok(core.includes('ON DELETE CASCADE'));
    assert.ok(core.includes('REFERENCES public.members(id)'));
    assert.ok(core.includes('ON DELETE SET NULL'));
    assert.ok(core.includes('updated_at timestamptz NOT NULL DEFAULT now()'));
    assert.ok(core.includes('UNIQUE (opportunity_id, user_id)'));
    assert.ok(core.includes('serve_signups_user_status_idx'));
    assert.equal(core.includes('serve_signups_opportunity_idx'), false);
    // status column has no DEFAULT in CREATE TABLE
    const signupBlock = core.slice(
      core.indexOf('CREATE TABLE IF NOT EXISTS public.serve_signups'),
      core.indexOf('CREATE INDEX IF NOT EXISTS serve_signups_user_status_idx')
    );
    assert.ok(/status text NOT NULL/.test(signupBlock));
    assert.equal(/status text NOT NULL DEFAULT/i.test(signupBlock), false);
  });

  it('normalization is transaction-wrapped', () => {
    assert.match(sql, /^\s*BEGIN\s*;/m);
    assert.match(sql, /^\s*COMMIT\s*;/m);
  });

  it('normalization does not DROP TABLE / truncate / delete rows', () => {
    assert.equal(/DROP\s+TABLE/i.test(exec), false);
    assert.equal(/TRUNCATE/i.test(exec), false);
    assert.equal(/DELETE\s+FROM\s+public\.serve_signups/i.test(exec), false);
  });

  it('normalization does not touch event_volunteers or notifications', () => {
    assert.equal(/event_volunteers/i.test(exec), false);
    assert.equal(/user_notifications/i.test(exec), false);
  });

  it('normalization targets member_id nullable and user_id NOT NULL', () => {
    assert.ok(sql.includes('ALTER COLUMN member_id DROP NOT NULL'));
    assert.ok(sql.includes('ALTER COLUMN user_id SET NOT NULL'));
  });

  it('normalization ensures user FK CASCADE, member SET NULL, opportunity CASCADE', () => {
    assert.ok(sql.includes('REFERENCES public.users(id)'));
    assert.ok(sql.includes('ON DELETE CASCADE'));
    assert.ok(sql.includes('REFERENCES public.members(id)'));
    assert.ok(sql.includes('ON DELETE SET NULL'));
    assert.ok(sql.includes('REFERENCES public.serve_opportunities(id)'));
    assert.ok(sql.includes('IF NOT v_ok'));
  });

  it('normalization adds/backfills updated_at and removes status default', () => {
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS updated_at'));
    assert.ok(sql.includes('COALESCE(updated_at, created_at, now())'));
    assert.ok(sql.includes('ALTER COLUMN updated_at SET NOT NULL'));
    assert.ok(sql.includes('ALTER COLUMN status DROP DEFAULT'));
  });

  it('normalization ensures status CHECK and drops legacy duplicate name', () => {
    assert.ok(sql.includes("CHECK (status IN ('pending', 'confirmed', 'cancelled', 'declined'))"));
    assert.ok(sql.includes('serve_signups_status_chk'));
    assert.ok(sql.includes('DROP CONSTRAINT IF EXISTS serve_signups_status_check'));
  });

  it('normalization removes legacy member unique and ensures opportunity/user unique', () => {
    assert.ok(sql.includes('serve_signups_opportunity_id_member_id_key'));
    assert.ok(/opportunity_id\s*,\s*member_id/.test(sql));
    assert.ok(sql.includes('UNIQUE (opportunity_id, user_id)'));
    assert.ok(sql.includes('serve_signups_opportunity_user_uidx'));
    assert.ok(sql.includes('IF NOT v_has'));
  });

  it('normalization ensures user_status index and drops redundant opportunity index', () => {
    assert.ok(sql.includes('serve_signups_user_status_idx'));
    assert.ok(sql.includes('DROP INDEX IF EXISTS public.serve_signups_opportunity_idx'));
  });

  it('normalization includes preflight guards', () => {
    assert.ok(sql.includes('serve_signups_user_id_null'));
    assert.ok(sql.includes('serve_signups_user_id_orphan'));
    assert.ok(sql.includes('serve_signups_duplicate_opportunity_user'));
    assert.ok(sql.includes('serve_signups_invalid_status'));
  });

  it('normalization does not recreate RPCs or CREATE TABLE serve_signups', () => {
    assert.equal(/CREATE OR REPLACE FUNCTION public\.serve_signup_opportunity/i.test(sql), false);
    assert.equal(/CREATE OR REPLACE FUNCTION public\.serve_cancel_signup/i.test(sql), false);
    assert.equal(/CREATE TABLE/i.test(exec), false);
  });
});
