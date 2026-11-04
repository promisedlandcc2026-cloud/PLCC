/**
 * Phase 2.6C.3 — Family-safe read RPC static contracts (A–Z).
 * Run from Vault: node --test scripts/test-connect-phase-2-6c-family-summary.mjs
 *
 * Source-contract only. Does not apply SQL or touch live data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mig = join(root, 'supabase/migrations/connect_phase_2_6c_family_summary_rpc.sql');
const foundation = join(root, 'supabase/migrations/connect_phase_2_6c_family_identity_foundation.sql');
const connectRoot = join(root, '..', 'awc-connect-main');
const connectApi = join(connectRoot, 'api');

function read(path) {
  return readFileSync(path, 'utf8');
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

/** Executable function body only (excludes header docs / COMMENT text). */
function bodyOnly(sql) {
  const m = sql.match(/AS \$\$[\s\S]*END;\s*\$\$;/i);
  return m ? m[0] : sql;
}

function connectApiJsCount() {
  return readdirSync(connectApi).filter((f) => f.endsWith('.js')).length;
}

describe('connect_phase_2_6c_family_summary_rpc.sql', () => {
  it('exists and is review-gated / additive (no table DDL / DML)', () => {
    assert.equal(existsSync(mig), true);
    assert.equal(existsSync(foundation), true);
    const sql = read(mig);
    const code = stripSqlComments(sql);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.equal(/\bCREATE\s+TABLE\b/i.test(code), false);
    assert.equal(/\bALTER\s+TABLE\b/i.test(code), false);
    assert.equal(/\bCREATE\s+POLICY\b/i.test(code), false);
    assert.equal(/\bALTER\s+POLICY\b/i.test(code), false);
    assert.equal(/\bDROP\s+POLICY\b/i.test(code), false);
    assert.equal(/\bINSERT\s+INTO\b/i.test(code), false);
    assert.equal(/\bUPDATE\b/i.test(code), false);
    assert.equal(/\bDELETE\s+FROM\b/i.test(code), false);
  });

  it('A: auth.uid() only — no caller-supplied identity params', () => {
    const sql = read(mig);
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.get_my_family_summary()'));
    assert.ok(sql.includes('v_uid uuid := auth.uid()'));
    assert.equal(/get_my_family_summary\s*\(\s*p_/i.test(sql), false);
    assert.equal(/get_my_family_summary\([^)]*user_id/i.test(sql), false);
    assert.equal(/get_my_family_summary\([^)]*member_id/i.test(sql), false);
    assert.equal(/get_my_family_summary\([^)]*household_id/i.test(sql), false);
  });

  it('B: verified link required for family graph', () => {
    const sql = read(mig);
    assert.ok(sql.includes("l.status = 'verified'"));
    assert.ok(sql.includes('FROM public.user_member_links l'));
    assert.ok(sql.includes("'linked', true"));
  });

  it('C: proposed link denied (linked=false path)', () => {
    const body = bodyOnly(read(mig));
    assert.equal(/status\s*=\s*'proposed'/i.test(body), false);
    assert.ok(body.includes("'linked', false"));
    assert.ok(body.includes("l.status = 'verified'"));
  });

  it('D: revoked link denied (only verified qualifies)', () => {
    const body = bodyOnly(read(mig));
    assert.equal(/status\s*=\s*'revoked'/i.test(body), false);
    assert.ok(body.includes("AND l.status = 'verified'"));
  });

  it('E: no email matching', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/\bemail\b/i.test(body), false);
  });

  it('F: no name matching for identity (display only from verified member)', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/\bilike\b/i.test(body), false);
    assert.equal(/lower\s*\(\s*.*first_name/i.test(body), false);
    assert.equal(/WHERE[\s\S]*first_name\s*=/i.test(body), false);
    assert.ok(body.includes('WHERE m.id = v_self_member_id'));
  });

  it('G: structured household only via household_members', () => {
    const sql = read(mig);
    assert.ok(sql.includes('FROM public.household_members hm'));
    assert.ok(sql.includes("hm.status = 'active'"));
  });

  it('H: legacy household ignored', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/members\.household_id/i.test(body), false);
    assert.equal(/members\.household_name/i.test(body), false);
    // Avoid false positive on hm.household_id (structured path).
    assert.equal(/(^|[^a-z_])m\.household_id/i.test(body), false);
    assert.equal(/(^|[^a-z_])m\.household_name/i.test(body), false);
  });

  it('I: household alone not guardian (cardAccess requires guardian edge)', () => {
    const sql = read(mig);
    assert.ok(sql.includes("v_card := 'none'"));
    assert.ok(sql.includes('FROM public.guardian_relationships gr'));
    assert.ok(sql.includes('gr.can_view_card = true') || sql.includes('r.can_view_card IS TRUE'));
    assert.equal(/cardAccess',\s*'guardian'[\s\S]{0,80}household_members/i.test(sql), false);
  });

  it('J: explicit guardian edge used', () => {
    const sql = read(mig);
    assert.ok(sql.includes('gr.guardian_user_id = v_uid'));
    assert.ok(sql.includes("gr.status = 'active'"));
  });

  it('K: can_view_card required for guardian cardAccess', () => {
    const sql = read(mig);
    assert.ok(sql.includes('can_view_card'));
    assert.ok(
      sql.includes("CASE WHEN r.can_view_card IS TRUE THEN 'guardian' ELSE 'none' END") ||
        sql.includes('gr.can_view_card = true')
    );
  });

  it('L: cross-household guardian supported (no shared-HH requirement)', () => {
    const sql = read(mig);
    assert.ok(sql.includes('Cross-household'));
    const body = stripSqlComments(bodyOnly(sql));
    assert.equal(/guardian_relationships[\s\S]{0,200}household_id\s*=\s*v_hh_id/i.test(body), false);
  });

  it('M: revoked guardian excluded (active only)', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.ok(body.includes("gr.status = 'active'"));
    assert.equal(/gr\.status\s*=\s*'revoked'/i.test(body), false);
  });

  it('N: adult QR / credentials not exposed', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/\bqrPayload\b/i.test(body), false);
    assert.equal(/\bqr_token\b/i.test(body), false);
    assert.equal(/\bcard_number\b/i.test(body), false);
    assert.ok(body.includes("'cardAccess', 'none'"));
  });

  it('O: child QR / credentials not exposed', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/\bqrPayload\b/i.test(body), false);
    assert.equal(/\bqr_token\b/i.test(body), false);
    assert.equal(/\bcard_number\b/i.test(body), false);
    assert.ok(body.includes("'cardAccess', v_card") || body.includes('to_jsonb(v_card)'));
  });

  it('P: no raw member/user/household IDs in returned DTO keys', () => {
    const sql = read(mig);
    assert.equal(/jsonb_build_object\([^)]*'memberId'/i.test(sql), false);
    assert.equal(/jsonb_build_object\([^)]*'userId'/i.test(sql), false);
    assert.equal(/jsonb_build_object\([^)]*'member_id'/i.test(sql), false);
    assert.equal(/jsonb_build_object\([^)]*'user_id'/i.test(sql), false);
    assert.equal(/jsonb_build_object\([^)]*'household_id'/i.test(sql), false);
    assert.equal(/jsonb_build_object\([^)]*'id',\s*v_hh_id/i.test(sql), false);
    assert.ok(sql.includes("jsonb_build_object('name', nullif(trim(coalesce(v_hh_name, '')), ''))"));
  });

  it('Q: no members.children JSON', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/m\.children\b/i.test(body), false);
    assert.equal(/members\.children\b/i.test(body), false);
  });

  it('R: no member_digital_cards query', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/member_digital_cards/i.test(body), false);
  });

  it('S: no writes', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/\bINSERT\b/i.test(body), false);
    assert.equal(/\bUPDATE\b/i.test(body), false);
    assert.equal(/\bDELETE\b/i.test(body), false);
  });

  it('T: SECURITY DEFINER', () => {
    const sql = read(mig);
    assert.ok(/FUNCTION public\.get_my_family_summary\(\)[\s\S]*?SECURITY DEFINER/i.test(sql));
  });

  it('U: empty search_path', () => {
    const sql = read(mig);
    assert.ok(sql.includes("SET search_path = ''"));
    assert.ok(sql.includes('public.users'));
    assert.ok(sql.includes('public.user_member_links'));
    assert.ok(sql.includes('public.household_members'));
    assert.ok(sql.includes('public.guardian_relationships'));
    assert.ok(sql.includes('public.members'));
    assert.ok(sql.includes('public.households'));
  });

  it('V: anon / PUBLIC revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.get_my_family_summary() FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.get_my_family_summary() FROM anon'));
  });

  it('W: authenticated execute granted', () => {
    const sql = read(mig);
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_my_family_summary() TO authenticated'));
  });

  it('X: no RLS weakening', () => {
    const code = stripSqlComments(read(mig));
    assert.equal(/ENABLE ROW LEVEL SECURITY/i.test(code), false);
    assert.equal(/CREATE POLICY/i.test(code), false);
    assert.equal(/DROP POLICY/i.test(code), false);
    assert.equal(/ALTER POLICY/i.test(code), false);
  });

  it('Y: no Connect API change (this phase)', () => {
    const sql = read(mig);
    assert.equal(/api\//i.test(sql), false);
    assert.equal(/vercel/i.test(sql), false);
  });

  it('Z: Connect API .js count remains 12', () => {
    assert.equal(connectApiJsCount(), 12);
  });

  it('multi-household fail-closed householdState=conflict', () => {
    const sql = read(mig);
    assert.ok(sql.includes("v_household_state := 'conflict'"));
    assert.ok(sql.includes('v_hh_count > 1'));
  });

  it('omits canCheckIn/canCheckOut from DTO (minimal/safer)', () => {
    const body = stripSqlComments(bodyOnly(read(mig)));
    assert.equal(/canCheckIn/i.test(body), false);
    assert.equal(/canCheckOut/i.test(body), false);
    assert.equal(/can_check_in/i.test(body), false);
    assert.equal(/can_check_out/i.test(body), false);
  });

  it('dependent avatarUrl forced null (child photo safety)', () => {
    const sql = read(mig);
    assert.ok(sql.includes("'avatarUrl', NULL"));
  });
});
