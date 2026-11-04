/**
 * Phase 2.3B — Serve migration static source contracts (Vault).
 * Does NOT apply SQL or contact a live database.
 *
 * Run: node --test scripts/test-serve-phase-2-3-migration.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationPath = join(root, 'supabase/migrations/serve_phase_2_3_core.sql');

describe('serve_phase_2_3_core.sql source contracts', () => {
  it('migration file exists', () => {
    assert.equal(existsSync(migrationPath), true);
  });

  const sql = readFileSync(migrationPath, 'utf8');

  it('creates serve_opportunities and serve_signups', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.serve_opportunities'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.serve_signups'));
  });

  it('user_id references public.users; member_id nullable to members', () => {
    assert.ok(sql.includes('user_id uuid NOT NULL'));
    assert.ok(sql.includes('REFERENCES public.users(id)'));
    assert.ok(sql.includes('member_id uuid NULL'));
    assert.ok(sql.includes('REFERENCES public.members(id)'));
    assert.ok(sql.includes('ON DELETE SET NULL'));
  });

  it('signup RPC does not lookup members / does not assume members.id = auth.uid()', () => {
    const signupFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.serve_signup_opportunity'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.serve_cancel_signup')
    );
    assert.ok(signupFn.length > 100);
    assert.equal(/from\s+public\.members/i.test(signupFn), false);
    assert.equal(/members\.id\s*=\s*auth\.uid/i.test(signupFn), false);
    assert.equal(/ilike\s*\(\s*['"]email/i.test(signupFn), false);
    assert.ok(signupFn.includes('member_id = NULL'));
    assert.ok(signupFn.includes('NULL,\n      v_status') || signupFn.includes('v_uid,\n      NULL,\n      v_status'));
    assert.ok(signupFn.includes('v_has_existing'));
  });

  it('uses FULL UNIQUE(opportunity_id, user_id) — not partial unique', () => {
    assert.ok(sql.includes('UNIQUE (opportunity_id, user_id)'));
    assert.equal(/CREATE UNIQUE INDEX[\s\S]*WHERE status/i.test(sql), false);
    assert.equal(/UNIQUE\s*\([^)]+\)\s*WHERE/i.test(sql), false);
    // Redundant standalone opportunity_id index removed (unique prefix covers lookups)
    assert.equal(sql.includes('serve_signups_opportunity_idx'), false);
  });

  it('pending + confirmed count toward capacity; opportunity FOR UPDATE', () => {
    assert.ok(sql.includes("status IN ('pending', 'confirmed')"));
    assert.ok(sql.includes('FOR UPDATE'));
    assert.ok(sql.includes('opportunity_full'));
  });

  it('active signup is idempotent; cancelled reactivates same row', () => {
    assert.ok(sql.includes("'idempotent', true"));
    assert.ok(sql.includes("v_existing.status IN ('pending', 'confirmed')"));
    assert.ok(sql.includes('UPDATE public.serve_signups'));
    assert.ok(sql.includes('member_id = NULL'));
  });

  it('cancel is own-user only with soft cancel + cancelled idempotency', () => {
    const cancelFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.serve_cancel_signup'));
    assert.ok(cancelFn.includes('AND user_id = v_uid'));
    assert.ok(cancelFn.includes("status = 'cancelled'"));
    assert.ok(cancelFn.includes('cancelled_at = now()'));
    assert.equal(cancelFn.includes('DELETE FROM'), false);
    assert.ok(cancelFn.includes("v_existing.status = 'cancelled'"));
  });

  it('RLS: open opportunities + own signups; no authenticated write policies', () => {
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(sql.includes('serve_opportunities_select_open'));
    assert.ok(sql.includes("status = 'open'"));
    assert.ok(sql.includes('serve_signups_select_own'));
    assert.ok(sql.includes('user_id = auth.uid()'));
    assert.equal(/CREATE POLICY[\s\S]{0,200}FOR INSERT/i.test(sql), false);
    assert.equal(/CREATE POLICY[\s\S]{0,200}FOR UPDATE/i.test(sql), false);
    assert.equal(/CREATE POLICY[\s\S]{0,200}FOR DELETE/i.test(sql), false);
  });

  it('SECURITY DEFINER with empty search_path; execute for authenticated only', () => {
    assert.ok(sql.includes('SECURITY DEFINER'));
    assert.ok(sql.includes("SET search_path = ''"));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.serve_signup_opportunity(uuid) FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.serve_signup_opportunity(uuid) FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.serve_cancel_signup(uuid) FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.serve_cancel_signup(uuid) FROM anon'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.serve_signup_opportunity(uuid) TO authenticated'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.serve_cancel_signup(uuid) TO authenticated'));
  });

  it('does not mutate event_volunteers or notifications schema', () => {
    assert.equal(/ALTER TABLE[\s\S]{0,80}event_volunteers/i.test(sql), false);
    assert.equal(/FROM\s+public\.event_volunteers/i.test(sql), false);
    assert.equal(/INTO\s+public\.event_volunteers/i.test(sql), false);
    assert.equal(/ALTER TABLE[\s\S]{0,80}user_notifications/i.test(sql), false);
    assert.equal(/CHECK\s*\([\s\S]{0,200}assignment[\s\S]{0,80}serve_/i.test(sql), false);
    assert.equal(sql.includes('serve_reminder'), false);
    assert.equal(sql.includes('ALTER TYPE'), false);
  });

  it('lifecycle status excludes stored full; requires_approval present', () => {
    assert.ok(sql.includes("'open', 'cancelled', 'completed'"));
    assert.equal(/status IN \(\s*'open',\s*'full'/i.test(sql), false);
    assert.ok(sql.includes('requires_approval boolean NOT NULL DEFAULT false'));
  });

  it('table grants: authenticated SELECT; service_role ALL; anon revoked', () => {
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.serve_opportunities FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.serve_signups FROM anon'));
    assert.ok(sql.includes('GRANT SELECT ON TABLE public.serve_opportunities TO authenticated'));
    assert.ok(sql.includes('GRANT SELECT ON TABLE public.serve_signups TO authenticated'));
    assert.ok(sql.includes('GRANT ALL ON TABLE public.serve_opportunities TO service_role'));
    assert.ok(sql.includes('GRANT ALL ON TABLE public.serve_signups TO service_role'));
  });

  it('user_not_linked check without members table', () => {
    assert.ok(sql.includes('user_not_linked'));
    assert.ok(sql.includes('FROM public.users u WHERE u.id = v_uid'));
  });
});
