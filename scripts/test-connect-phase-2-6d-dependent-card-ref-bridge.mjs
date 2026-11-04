/**
 * Phase 2.6D.2B — Dependent UI reference bridge (Family Summary cardRef).
 * Run from Vault: node --test scripts/test-connect-phase-2-6d-dependent-card-ref-bridge.mjs
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
const mig = join(root, 'supabase/migrations/connect_phase_2_6d_dependent_card_ref_bridge.sql');
const foundation = join(root, 'supabase/migrations/connect_phase_2_6d_dependent_digital_cards.sql');
const adultMig = join(root, 'supabase/migrations/connect_phase_2_6a_member_digital_cards.sql');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(path) {
  return readFileSync(path, 'utf8');
}

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

function familyBody(sql) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.get_my_family_summary()');
  const end = sql.indexOf('COMMENT ON FUNCTION public.get_my_family_summary()', start);
  return sql.slice(start, end > start ? end : undefined);
}

function childBody(sql) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.get_my_guardian_child_cards()');
  const end = sql.indexOf('COMMENT ON FUNCTION public.get_my_guardian_child_cards()', start);
  return sql.slice(start, end > start ? end : undefined);
}

function ensureBody(sql) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.ensure_dependent_digital_card(');
  const end = sql.indexOf('COMMENT ON FUNCTION public.ensure_dependent_digital_card', start);
  return sql.slice(start, end > start ? end : undefined);
}

describe('connect_phase_2_6d_dependent_card_ref_bridge.sql', () => {
  it('exists / review-gated / no table DDL', () => {
    assert.equal(existsSync(mig), true);
    assert.equal(existsSync(foundation), true);
    const sql = read(mig);
    const code = stripComments(sql);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.equal(/\bCREATE\s+TABLE\b/i.test(code), false);
    assert.equal(/\bALTER\s+TABLE\b/i.test(code), false);
    assert.equal(/\bCREATE\s+POLICY\b/i.test(code), false);
  });

  it('A: Family dependent has cardRef field', () => {
    const body = familyBody(read(mig));
    assert.ok(body.includes("'cardRef'"));
    assert.ok(body.includes("'cardAccess', v_card"));
  });

  it('B: cardRef only guardian-authorized', () => {
    const body = familyBody(read(mig));
    assert.ok(body.includes("v_card := 'guardian'"));
    assert.ok(body.includes('ensure_dependent_digital_card'));
    assert.ok(body.includes("v_card = 'guardian'"));
  });

  it('C: none → null cardRef', () => {
    const body = familyBody(read(mig));
    assert.ok(body.includes('v_card_ref := NULL'));
    assert.ok(body.includes("'cardRef', v_card_ref") || body.includes("'{cardRef}'"));
  });

  it('D: household-only → null (no mint without guardian)', () => {
    const body = familyBody(read(mig));
    // Household children default v_card := 'none' before guardian check
    assert.ok(body.includes("v_card := 'none'"));
    // ensure only after guardian+can_view_card path
    assert.ok(body.includes('gr.can_view_card = true'));
  });

  it('E: view=false → none + null (no ensure)', () => {
    const body = familyBody(read(mig));
    assert.ok(
      body.includes("CASE WHEN r.can_view_card IS TRUE THEN 'guardian' ELSE 'none' END")
    );
    assert.ok(body.includes("IF v_card = 'guardian' THEN"));
  });

  it('F: view=true → AWCD via ensure', () => {
    const sql = read(mig);
    assert.ok(existsSync(foundation));
    assert.ok(read(foundation).includes("card_ref ~ '^AWCD\\.[0-9a-f]{64}$'"));
    assert.ok(familyBody(sql).includes('v_card_ref := v_ensured.card_ref'));
  });

  it('G: no raw member id in returned DTO keys', () => {
    const body = stripComments(familyBody(read(mig)));
    assert.equal(/'memberId'|"memberId"/i.test(body), false);
    assert.equal(/'member_id',\s*r\.member_id/i.test(body), false);
    assert.equal(/'userId'|"userId"/i.test(body), false);
    assert.equal(/'householdId'|"householdId"/i.test(body), false);
    assert.equal(/'guardianId'|"guardianId"/i.test(body), false);
  });

  it('H: no QR in Family Summary DTO', () => {
    const body = stripComments(familyBody(read(mig)));
    assert.equal(/'qrPayload'/i.test(body), false);
    assert.equal(/'qr_token'/i.test(body), false);
    assert.equal(/qr_token/i.test(body), false);
  });

  it('I: no card number in Family Summary DTO', () => {
    const body = stripComments(familyBody(read(mig)));
    assert.equal(/'cardNumber'/i.test(body), false);
    assert.equal(/'card_number'/i.test(body), false);
    // ensure returns row but Family only copies card_ref
    assert.ok(body.includes('v_ensured.card_ref'));
    assert.equal(/v_ensured\.card_number|v_ensured\.qr_token/i.test(body), false);
  });

  it('J: no check flags', () => {
    const body = stripComments(familyBody(read(mig)));
    assert.equal(/can_check_in|can_check_out|canCheckIn|canCheckOut/i.test(body), false);
  });

  it('K: no email/phone/DOB', () => {
    const body = stripComments(familyBody(read(mig)));
    assert.equal(/\bemail\b|\bphone\b|\bdob\b|\bbirthday\b/i.test(body), false);
  });

  it('L: multiple guardians same cardRef (one card per member)', () => {
    const ensure = ensureBody(read(mig));
    assert.ok(ensure.includes('ON CONFLICT (member_id) DO NOTHING'));
    assert.ok(ensure.includes('WHERE c.member_id = p_member_id'));
  });

  it('M: guardian revoke removes/nulls ref (cardAccess none → cardRef null)', () => {
    const body = familyBody(read(mig));
    assert.ok(body.includes("ELSE 'none' END"));
    assert.ok(body.includes('v_card_ref := NULL'));
    assert.ok(body.includes("jsonb_set(v_entry, '{cardRef}'"));
  });

  it('N: verified-link revoke hides graph', () => {
    const body = familyBody(read(mig));
    assert.ok(body.includes("l.status = 'verified'"));
    assert.ok(body.includes("'linked', false"));
  });

  it('O: cross-household works', () => {
    const body = familyBody(read(mig));
    assert.ok(body.includes('Cross-household'));
    assert.ok(body.includes('ensure_dependent_digital_card(r.member_id)'));
  });

  it('P: conflict behavior preserved', () => {
    const body = familyBody(read(mig));
    assert.ok(body.includes("v_household_state := 'conflict'"));
    assert.ok(body.includes('v_hh_count > 1'));
  });

  it('Q: child-card RPC behavior preserved via ensure', () => {
    const body = stripComments(childBody(read(mig)));
    assert.ok(body.includes('SECURITY DEFINER'));
    assert.ok(body.includes("SET search_path = ''"));
    assert.ok(body.includes('gr.can_view_card = true'));
    assert.ok(body.includes('ensure_dependent_digital_card'));
    assert.ok(body.includes('dependent_digital_card_dto'));
    assert.equal(/FROM\s+public\.household_members\b/i.test(body), false);
  });

  it('R: helper not browser-callable', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.ensure_dependent_digital_card(uuid) FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.ensure_dependent_digital_card(uuid) FROM anon'));
    assert.ok(
      sql.includes('REVOKE ALL ON FUNCTION public.ensure_dependent_digital_card(uuid) FROM authenticated')
    );
    assert.equal(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.ensure_dependent_digital_card\(uuid\)\s+TO\s+authenticated/i.test(
        sql
      ),
      false
    );
  });

  it('S: no RLS weakening', () => {
    const code = stripComments(read(mig));
    assert.equal(/ENABLE ROW LEVEL SECURITY/i.test(code), false);
    assert.equal(/CREATE POLICY|DROP POLICY|ALTER POLICY/i.test(code), false);
    assert.equal(/GRANT\s+(SELECT|ALL)\s+ON\s+TABLE\s+public\.dependent_digital_cards\s+TO\s+authenticated/i.test(code), false);
  });

  it('T: no adult card changes', () => {
    const code = stripComments(read(mig));
    assert.equal(/ALTER\s+TABLE\s+public\.member_digital_cards/i.test(code), false);
    assert.equal(/get_my_member_digital_card|mint_member_digital_card|rotate_member_digital_card/i.test(code), false);
    assert.ok(existsSync(adultMig));
  });

  it('U: no Connect changes required by this phase artifact', () => {
    const sql = read(mig);
    assert.equal(/MemberFamily|dependentCardClient|pages\//i.test(sql), false);
  });

  it('V: no new API function', () => {
    assert.equal(existsSync(join(connectRoot, 'api/child-card.js')), false);
    assert.equal(existsSync(join(connectRoot, 'api/family-card.js')), false);
  });

  it('W: API count remains 12', () => {
    const handlers = readdirSync(join(connectRoot, 'api')).filter((f) => f.endsWith('.js'));
    assert.equal(handlers.length, 12);
  });

  it('ensure helper is SECURITY DEFINER with empty search_path', () => {
    const body = ensureBody(read(mig));
    assert.ok(/ensure_dependent_digital_card\([\s\S]*?SECURITY DEFINER/i.test(body));
    assert.ok(body.includes("SET search_path = ''"));
  });

  it('family summary grants remain authenticated execute; anon revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.get_my_family_summary() FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.get_my_family_summary() FROM anon'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_my_family_summary() TO authenticated'));
  });
});
