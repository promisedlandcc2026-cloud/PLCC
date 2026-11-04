/**
 * Phase 2.6D.1 — Dependent digital cards + guardian read RPC contracts.
 * Run from Vault: node --test scripts/test-connect-phase-2-6d-dependent-cards.mjs
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
const mig = join(root, 'supabase/migrations/connect_phase_2_6d_dependent_digital_cards.sql');
const adultMig = join(root, 'supabase/migrations/connect_phase_2_6a_member_digital_cards.sql');
const familyRpcMig = join(root, 'supabase/migrations/connect_phase_2_6c_family_summary_rpc.sql');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(path) {
  return readFileSync(path, 'utf8');
}

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

describe('connect_phase_2_6d_dependent_digital_cards.sql', () => {
  it('A: new dependent table only / additive review-gated', () => {
    assert.equal(existsSync(mig), true);
    const sql = read(mig);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.dependent_digital_cards'));
    assert.equal(/\bINSERT INTO public\.(users|members|households)\b/i.test(sql), false);
    assert.equal(/\bUPDATE public\.(users|members)\b/i.test(sql), false);
  });

  it('B: no adult table ALTER', () => {
    const sql = stripComments(read(mig));
    assert.equal(/ALTER\s+TABLE\s+public\.member_digital_cards\b/i.test(sql), false);
    assert.equal(/DROP\s+TABLE\s+public\.member_digital_cards\b/i.test(sql), false);
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_my_member_digital_card\s*\(/i.test(sql), false);
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.mint_member_digital_card\s*\(/i.test(sql), false);
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rotate_member_digital_card\s*\(/i.test(sql), false);
  });

  it('C: member_id subject', () => {
    const sql = read(mig);
    assert.ok(sql.includes('member_id uuid NOT NULL'));
    assert.ok(sql.includes('REFERENCES public.members(id) ON DELETE CASCADE'));
    assert.ok(sql.includes('Canonical dependent subject'));
  });

  it('D: no user_id column', () => {
    const sql = stripComments(read(mig));
    assert.equal(/\buser_id\s+uuid\b/i.test(sql), false);
    assert.equal(/REFERENCES\s+public\.users\s*\(/i.test(sql), false);
  });

  it('E: member_id unique', () => {
    const sql = read(mig);
    assert.ok(sql.includes('CONSTRAINT dependent_digital_cards_member_uidx UNIQUE (member_id)'));
    assert.ok(sql.includes('ON CONFLICT (member_id) DO NOTHING'));
  });

  it('F: card_ref opaque + unique', () => {
    const sql = read(mig);
    assert.ok(sql.includes('card_ref text NOT NULL'));
    assert.ok(sql.includes('UNIQUE (card_ref)'));
    assert.ok(sql.includes("card_ref ~ '^AWCD\\.[0-9a-f]{64}$'"));
    assert.ok(sql.includes("RETURN 'AWCD.' || encode(gen_random_bytes(32), 'hex')"));
    assert.ok(sql.includes('not derived from member_id'));
  });

  it('G: shared card-number sequence', () => {
    const sql = read(mig);
    assert.ok(sql.includes('member_digital_card_alloc_number()'));
    assert.ok(sql.includes('member_digital_card_number_seq'));
    assert.ok(sql.includes("card_number ~ '^PLCC-[0-9]{4}-[0-9]{5,}$'"));
    assert.equal(/CREATE\s+SEQUENCE\s+.*dependent/i.test(sql), false);
    // Adult migration owns the sequence
    assert.ok(read(adultMig).includes('member_digital_card_number_seq'));
  });

  it('H: AWC1 token', () => {
    const sql = read(mig);
    assert.ok(sql.includes('member_digital_card_new_token()'));
    assert.ok(sql.includes("qr_token ~ '^AWC1\\.[0-9a-f]{64}$'"));
  });

  it('I: SHA-256 hash', () => {
    const sql = read(mig);
    assert.ok(sql.includes('qr_token_hash text NOT NULL'));
    assert.ok(sql.includes("qr_token_hash ~ '^[0-9a-f]{64}$'"));
    // Hash generation lives in reused adult helper
    assert.ok(read(adultMig).includes("digest(convert_to(v_token, 'UTF8'), 'sha256')"));
  });

  it('J: no PII token', () => {
    const sql = stripComments(read(mig));
    assert.equal(/qr_token\s*:?=.*member_id/i.test(sql), false);
    assert.equal(/qr_token\s*:?=.*first_name|qr_token\s*:?=.*dob|qr_token\s*:?=.*email/i.test(sql), false);
    assert.ok(sql.includes('Opaque AWC1') || read(mig).includes('Opaque AWC1'));
  });

  it('K: RLS enabled', () => {
    const sql = read(mig);
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(sql.includes('no authenticated browser table access') || sql.includes('Intentionally no policies'));
  });

  it('L: authenticated table access revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.dependent_digital_cards FROM authenticated'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.dependent_digital_cards FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.dependent_digital_cards FROM PUBLIC'));
    assert.equal(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.dependent_digital_cards\s+TO\s+authenticated/i.test(sql), false);
    assert.equal(/FOR\s+SELECT[\s\S]{0,80}TO\s+authenticated/i.test(sql), false);
  });

  it('M: service_role ALL', () => {
    const sql = read(mig);
    assert.ok(sql.includes('GRANT ALL ON TABLE public.dependent_digital_cards TO service_role'));
  });

  it('N: SECURITY DEFINER read RPC', () => {
    const sql = read(mig);
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.get_my_guardian_child_cards()'));
    assert.ok(/get_my_guardian_child_cards\(\)[\s\S]*?SECURITY DEFINER/i.test(sql));
  });

  it('O: empty search_path', () => {
    const sql = read(mig);
    assert.ok(/get_my_guardian_child_cards\(\)[\s\S]*?SET search_path = ''/i.test(sql));
  });

  it('P: auth.uid only', () => {
    const sql = read(mig);
    assert.ok(sql.includes('v_uid uuid := auth.uid()'));
    assert.equal(/get_my_guardian_child_cards\(\)[\s\S]*?p_user_id|p_member_id|p_child/i.test(sql), false);
  });

  it('Q: verified link required', () => {
    const sql = read(mig);
    assert.ok(sql.includes("user_member_links"));
    assert.ok(sql.includes("status = 'verified'"));
  });

  it('R: active guardian required', () => {
    const sql = read(mig);
    assert.ok(sql.includes('guardian_relationships'));
    assert.ok(sql.includes("gr.status = 'active'"));
  });

  it('S: can_view_card required', () => {
    const sql = read(mig);
    assert.ok(sql.includes('can_view_card = true'));
  });

  it('T: household not used for auth', () => {
    const body = stripComments(read(mig));
    assert.equal(/FROM\s+public\.household_members\b/i.test(body), false);
    assert.equal(/JOIN\s+public\.households\b/i.test(body), false);
    assert.ok(read(mig).includes('Household co-residence NEVER') || read(mig).includes('No household'));
  });

  it('U: JSON children not used', () => {
    // Executable SQL only — COMMENT ON / docs may mention members.children as forbidden.
    const sql = stripComments(read(mig))
      .replace(/COMMENT\s+ON[\s\S]*?;/gi, '');
    assert.equal(/\bjsonb_array_elements(_text)?\s*\(/i.test(sql), false);
    assert.equal(/\bm\.children\b/i.test(sql), false);
    assert.equal(/\bSELECT[\s\S]{0,120}\bmembers\.children\b/i.test(sql), false);
    assert.ok(read(mig).includes('No members.children') || read(mig).includes('NOT valid subjects'));
  });

  it('V: one card per child', () => {
    const sql = read(mig);
    assert.ok(sql.includes('UNIQUE (member_id)'));
    assert.ok(sql.includes('ON CONFLICT (member_id) DO NOTHING'));
  });

  it('W: lazy mint conflict-safe', () => {
    const sql = read(mig);
    assert.ok(sql.includes('Lazy mint'));
    assert.ok(sql.includes('ON CONFLICT (member_id) DO NOTHING'));
    assert.ok(sql.includes('WHERE c.member_id = r.member_id'));
  });

  it('X: no guardian rotate', () => {
    const sql = stripComments(read(mig));
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rotate_/i.test(sql), false);
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.\w*rotate\w*dependent/i.test(sql), false);
  });

  it('Y: no guardian revoke', () => {
    const sql = stripComments(read(mig));
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.revoke_/i.test(sql), false);
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.\w*revoke\w*dependent/i.test(sql), false);
  });

  it('Z: child DTO privacy', () => {
    const sql = read(mig);
    assert.ok(sql.includes("'cardRef'"));
    assert.ok(sql.includes("'displayName'"));
    assert.ok(sql.includes("'label', 'PLCC Child Member'"));
    assert.ok(sql.includes("'cardNumber'"));
    assert.ok(sql.includes("'cardStatus'"));
    assert.ok(sql.includes("'qrPayload'"));
    assert.ok(sql.includes("'issuedAt'"));
    assert.ok(sql.includes("'rotatedAt'"));
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.dependent_digital_card_dto');
    const end = sql.indexOf('$$;', start);
    const dtoBody = sql.slice(start, end);
    assert.equal(/'memberId'|'userId'|'householdId'|'avatarUrl'|'qr_token_hash'/i.test(dtoBody), false);
  });

  it('AA: no check-in/out', () => {
    const sql = stripComments(read(mig));
    assert.equal(/can_check_in|can_check_out|canCheckIn|canCheckOut/i.test(sql), false);
    assert.ok(read(mig).includes('MUST NOT be treated as') || read(mig).includes('Not pickup'));
  });

  it('AB: no family-summary changes', () => {
    const sql = stripComments(read(mig));
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_my_family_summary\s*\(/i.test(sql), false);
    assert.ok(existsSync(familyRpcMig));
  });

  it('AC: no adult RPC changes in this migration', () => {
    const sql = stripComments(read(mig));
    assert.equal(/get_my_member_digital_card|mint_member_digital_card|rotate_member_digital_card/i.test(sql.replace(/member_digital_card_new_token|member_digital_card_alloc_number/g, '')), false);
  });

  it('AD: no scanner', () => {
    const sql = stripComments(read(mig));
    assert.equal(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.resolve_/i.test(sql), false);
  });

  it('AE: no Connect changes required by this phase', () => {
    // Contract: Connect tree must not be modified for 2.6D.1 foundation.
    // Assert migration does not reference Connect paths / UI.
    const sql = read(mig);
    assert.equal(/MemberFamily|fetchMyFamily|pages\//i.test(sql), false);
    if (existsSync(join(connectRoot, 'api'))) {
      const handlers = readdirSync(join(connectRoot, 'api')).filter((f) => f.endsWith('.js'));
      assert.equal(handlers.length, 12);
    }
  });

  it('AF: no production inserts', () => {
    const sql = stripComments(read(mig));
    assert.equal(/\bINSERT\s+INTO\s+public\.(users|members|households|guardian_relationships|user_member_links)\b/i.test(sql), false);
  });

  it('RPC grants: authenticated execute; anon revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.get_my_guardian_child_cards() FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.get_my_guardian_child_cards() FROM anon'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_my_guardian_child_cards() TO authenticated'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_my_guardian_child_cards() TO service_role'));
  });

  it('status/revoked_at consistency CHECK present', () => {
    const sql = read(mig);
    assert.ok(sql.includes('dependent_digital_cards_revoked_at_chk'));
    assert.ok(sql.includes("status = 'revoked' AND revoked_at IS NOT NULL"));
  });
});
