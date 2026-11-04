/**
 * Phase 2.6A — Vault migration contract for member_digital_cards.
 * Run from Vault: node --test scripts/test-connect-phase-2-6a-member-cards.mjs
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
const mig = join(root, 'supabase/migrations/connect_phase_2_6a_member_digital_cards.sql');
const connectRoot = join(root, '..', 'awc-connect-main');
const membersPage = join(root, 'pages/people/Members.tsx');

function read(path) {
  return readFileSync(path, 'utf8');
}

describe('connect_phase_2_6a_member_digital_cards.sql', () => {
  it('exists and stays additive / review-gated', () => {
    assert.equal(existsSync(mig), true);
    const sql = read(mig);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.member_digital_cards'));
    assert.equal(/\bINSERT INTO public\.(users|members)\b/i.test(sql), false);
    assert.equal(/\bUPDATE public\.(users|members)\b/i.test(sql), false);
  });

  it('A: locks canonical subject to public.users(id) / auth.uid()', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REFERENCES public.users(id) ON DELETE CASCADE'));
    assert.ok(sql.includes('CONSTRAINT member_digital_cards_user_uidx UNIQUE (user_id)'));
    assert.ok(sql.includes('v_uid uuid := auth.uid()'));
    assert.ok(sql.includes('USING (user_id = auth.uid())'));
  });

  it('B: enforces one card per user', () => {
    const sql = read(mig);
    assert.ok(sql.includes('UNIQUE (user_id)'));
    assert.ok(sql.includes('ON CONFLICT (user_id) DO NOTHING'));
  });

  it('C: QR is opaque AWC1 token — not raw UUID', () => {
    const sql = read(mig);
    assert.ok(sql.includes("qr_token ~ '^AWC1\\.[0-9a-f]{64}$'"));
    assert.ok(sql.includes("v_token := 'AWC1.' || encode(gen_random_bytes(32), 'hex')"));
    assert.equal(/qr_token\s*:?=\s*.*member\.id/i.test(sql), false);
    assert.equal(/qr_token\s*:?=\s*.*user_id/i.test(sql), false);
    assert.equal(/value=\{member\.id\}/.test(sql), false);
  });

  it('D: never email/name/phone matches for identity or member_id', () => {
    const sql = read(mig);
    assert.equal(/\b(ilike|lower\(.*email|phone\s*=|first_name|last_name)\b/i.test(sql), false);
    assert.ok(sql.includes('member_id stays NULL') || sql.includes('member_id left NULL') || sql.includes('member_id,\n    NULL'));
    assert.ok(/INSERT INTO public\.member_digital_cards[\s\S]*NULL,\s*\n\s*v_number/i.test(sql));
  });

  it('E: token entropy + generation authority is server/RPC not browser', () => {
    const sql = read(mig);
    assert.ok(sql.includes('gen_random_bytes(32)'));
    assert.ok(sql.includes("digest(convert_to(v_token, 'UTF8'), 'sha256')"));
    assert.ok(sql.includes('SECURITY DEFINER'));
    assert.ok(sql.includes('member_digital_card_new_token'));
    assert.ok(sql.includes('Browser must NEVER generate tokens'));
    assert.equal(/localStorage|crypto\.subtle|window\./i.test(sql), false);
  });

  it('F: anon denied on table and helper RPCs', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.member_digital_cards FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.member_digital_cards FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.get_my_member_digital_card() FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.mint_member_digital_card() FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.rotate_member_digital_card() FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.member_digital_card_new_token() FROM anon'));
  });

  it('G: own SELECT only; no token-based scanner SELECT policy', () => {
    const sql = read(mig);
    assert.ok(sql.includes('member_digital_cards_select_own'));
    assert.ok(sql.includes('FOR SELECT'));
    assert.ok(sql.includes('USING (user_id = auth.uid())'));
    assert.ok(sql.includes('GRANT SELECT ON TABLE public.member_digital_cards TO authenticated'));
    assert.equal(/USING\s*\(\s*qr_token/i.test(sql), false);
    assert.equal(/USING\s*\(\s*qr_token_hash/i.test(sql), false);
  });

  it('H: no authenticated browser writes on table', () => {
    const sql = read(mig);
    assert.equal(/FOR INSERT[\s\S]{0,80}TO authenticated/i.test(sql), false);
    assert.equal(/FOR UPDATE[\s\S]{0,80}TO authenticated/i.test(sql), false);
    assert.equal(/FOR DELETE[\s\S]{0,80}TO authenticated/i.test(sql), false);
    assert.ok(sql.includes('No INSERT / UPDATE / DELETE policies'));
  });

  it('I: member_id nullable enrichment only', () => {
    const sql = read(mig);
    assert.ok(sql.includes('member_id uuid NULL REFERENCES public.members(id) ON DELETE SET NULL'));
    assert.ok(sql.includes('NEVER ownership'));
    assert.ok(sql.includes('OPTIONAL enrichment'));
  });

  it('J: no family/child/guardian/household schema', () => {
    const sql = read(mig);
    assert.equal(/\b(parent_id|guardian_id|household_id|family_id|child_id)\b/i.test(sql), false);
    assert.equal(/\bhousehold_card|\bfamily_pass|\bchild_card\b/i.test(sql), false);
    assert.ok(sql.includes('no family/child columns') || sql.includes('Family Pass'));
  });

  it('K: card number unique + year-sequence format', () => {
    const sql = read(mig);
    assert.ok(sql.includes('UNIQUE (card_number)'));
    assert.ok(sql.includes('member_digital_card_number_seq'));
    assert.ok(sql.includes('nextval'));
    assert.ok(sql.includes("'PLCC-' || v_year || '-' || lpad"));
    assert.ok(sql.includes("card_number ~ '^PLCC-[0-9]{4}-[0-9]{5,}$'"));
  });

  it('L: rotate invalidates prior credential and keeps card_number', () => {
    const sql = read(mig);
    assert.ok(sql.includes('rotate_member_digital_card'));
    assert.ok(sql.includes('qr_token = v_tok.token'));
    assert.ok(sql.includes('qr_token_hash = v_tok.token_hash'));
    assert.ok(sql.includes('rotated_at = now()'));
    assert.ok(sql.includes('card_number unchanged'));
    assert.ok(sql.includes('Old token/hash immediately invalid'));
  });

  it('M: status model + effective approval behavior', () => {
    const sql = read(mig);
    assert.ok(sql.includes("CHECK (status IN ('active', 'inactive', 'revoked'))"));
    assert.ok(sql.includes('member_digital_card_effective_status'));
    assert.ok(sql.includes("WHEN p_stored = 'revoked' THEN 'revoked'"));
    assert.ok(sql.includes('THEN \'inactive\''));
    assert.ok(sql.includes('cardStatus'));
  });

  it('N: approved-member mint gate without recursive users RLS patterns', () => {
    const sql = read(mig);
    assert.ok(sql.includes('member_digital_card_is_approved_role'));
    assert.ok(sql.includes("RAISE EXCEPTION 'not_approved'"));
    assert.ok(sql.includes('SECURITY DEFINER'));
    assert.ok(sql.includes('FROM public.users u'));
    assert.ok(sql.includes('avoid recursive RLS'));
    assert.equal(/EXISTS\s*\(\s*SELECT[\s\S]{0,120}FROM public\.users[\s\S]{0,80}auth\.uid/i.test(sql), false);
  });

  it('O: Connect API function count remains 12 (no new card bridge in this phase)', () => {
    const apiDir = join(connectRoot, 'api');
    assert.equal(existsSync(apiDir), true);
    const handlers = readdirSync(apiDir).filter((f) => f.endsWith('.js'));
    assert.equal(handlers.length, 12, `expected 12 api/*.js, got ${handlers.length}: ${handlers.join(',')}`);
    assert.equal(handlers.some((f) => /card/i.test(f)), false);
  });

  it('P: Connect browser surface does not introduce service_role for cards', () => {
    // Phase 2.6A does not add Connect card client files yet; guard against accidental adds.
    const cardClient = join(connectRoot, 'lib/memberDigitalCardClient.ts');
    assert.equal(existsSync(cardClient), false);
    const sql = read(mig);
    assert.ok(sql.includes('GRANT ALL ON TABLE public.member_digital_cards TO service_role'));
    // service_role grant is server-side only — migration must not instruct browser use
    assert.equal(/VITE_.*SERVICE_ROLE|service_role.*browser/i.test(sql), false);
  });

  it('Q: existing Vault Official Member Pass (raw members.id QR) is unmodified', () => {
    assert.equal(existsSync(membersPage), true);
    const page = read(membersPage);
    assert.ok(page.includes('Official Member Pass'));
    assert.ok(page.includes('value={member.id}'));
    const sql = read(mig);
    assert.equal(sql.includes('Members.tsx'), true); // documented as out of scope
    assert.equal(/ALTER TABLE public\.members\b/i.test(sql), false);
    assert.equal(/UPDATE pages\/people\/Members/i.test(sql), false);
  });

  it('stores hash for future resolve and documents no resolve RPC yet', () => {
    const sql = read(mig);
    assert.ok(sql.includes('qr_token_hash text NOT NULL'));
    assert.ok(sql.includes('UNIQUE (qr_token_hash)'));
    assert.ok(sql.includes('resolve_member_digital_card'));
    assert.ok(sql.includes('NOT created in 2.6A') || sql.includes('Future (NOT created'));
    assert.equal(/CREATE OR REPLACE FUNCTION public\.resolve_member/i.test(sql), false);
  });
});
