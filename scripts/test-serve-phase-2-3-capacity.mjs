/**
 * Phase 2.3E — Serve capacity RPC static source contracts (Vault).
 * Does NOT apply SQL or contact a live database.
 *
 * Run: node --test scripts/test-serve-phase-2-3-capacity.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationPath = join(
  root,
  'supabase/migrations/serve_phase_2_3e_capacity_rpc.sql'
);

describe('serve_phase_2_3e_capacity_rpc.sql source contracts', () => {
  it('migration file exists', () => {
    assert.equal(existsSync(migrationPath), true);
  });

  const sql = readFileSync(migrationPath, 'utf8');

  it('defines SECURITY DEFINER capacity RPC with empty search_path', () => {
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.serve_opportunity_capacity'));
    assert.ok(sql.includes('SECURITY DEFINER'));
    assert.ok(/SET\s+search_path\s*=\s*''/.test(sql));
  });

  it('requires auth.uid and linked public.users; no members identity assumption', () => {
    assert.ok(sql.includes('auth.uid()'));
    assert.ok(sql.includes('not_authenticated'));
    assert.ok(sql.includes('user_not_linked'));
    assert.ok(sql.includes('FROM public.users'));
    assert.equal(/members\.user_id|members\.id\s*=\s*auth\.uid/i.test(sql), false);
  });

  it('counts only pending + confirmed; excludes cancelled/declined via active filter', () => {
    assert.ok(sql.includes("status IN ('pending', 'confirmed')"));
    assert.equal(/status\s+IN\s*\(\s*'cancelled'/i.test(sql), false);
  });

  it('returns aggregate fields only — no roster / user_id / member_id / email', () => {
    assert.ok(sql.includes('active_signup_count'));
    assert.ok(sql.includes('remaining_slots'));
    assert.ok(sql.includes('GREATEST'));
    // RETURN TABLE columns only aggregates
    const returns = sql.slice(
      sql.indexOf('RETURNS TABLE'),
      sql.indexOf('LANGUAGE plpgsql')
    );
    assert.ok(returns.includes('opportunity_id'));
    assert.ok(returns.includes('capacity'));
    assert.equal(/user_id|member_id|email|roster|signup_id/i.test(returns), false);
  });

  it('member visibility: open + ends_at null or future', () => {
    assert.ok(sql.includes("o.status = 'open'"));
    assert.ok(sql.includes('ends_at IS NULL') || sql.includes('o.ends_at IS NULL'));
  });

  it('batch max 50 and dedupe', () => {
    assert.ok(sql.includes('> 50') || sql.includes('cardinality(v_ids) > 50'));
    assert.ok(sql.includes('too_many_opportunity_ids'));
    assert.ok(sql.includes('DISTINCT'));
  });

  it('grants execute to authenticated; revokes PUBLIC and anon', () => {
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.serve_opportunity_capacity'));
    assert.ok(sql.includes('TO authenticated'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.serve_opportunity_capacity'));
    assert.ok(sql.includes('FROM PUBLIC'));
    assert.ok(sql.includes('FROM anon'));
  });

  it('does not weaken RLS or mutate serve_signups / notifications / event_volunteers', () => {
    assert.equal(/DROP POLICY|CREATE POLICY/i.test(sql), false);
    assert.equal(/ALTER TABLE public\.serve_signups/i.test(sql), false);
    assert.equal(/INSERT INTO|UPDATE public\.serve_signups|DELETE FROM/i.test(sql), false);
    assert.equal(/event_volunteers|user_notifications/i.test(sql), false);
    assert.equal(/CREATE TABLE/i.test(sql), false);
  });

  it('lexical order after signup normalize', () => {
    const core = 'serve_phase_2_3_core.sql';
    const norm = 'serve_phase_2_3_signup_normalize.sql';
    const cap = 'serve_phase_2_3e_capacity_rpc.sql';
    assert.ok(norm > core);
    assert.ok(cap > norm);
  });
});
