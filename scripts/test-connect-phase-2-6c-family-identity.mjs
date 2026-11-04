/**
 * Phase 2.6C.1 — Vault migration contract for family identity foundation.
 * Run from Vault: node --test scripts/test-connect-phase-2-6c-family-identity.mjs
 *
 * Source-contract only. Does not apply SQL or touch live data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mig = join(root, 'supabase/migrations/connect_phase_2_6c_family_identity_foundation.sql');
const connectRoot = join(root, '..', 'awc-connect-main');
const coreTs = join(root, 'api/_utils/core.ts');

function read(path) {
  return readFileSync(path, 'utf8');
}

function listConnectSchemaLeakHint() {
  // Schema migrations stay in Vault. Connect may ship Family UI (2.6C.4B+)
  // but must never host the identity foundation SQL.
  const forbidden = [
    'supabase/migrations/connect_phase_2_6c_family_identity_foundation.sql',
    'supabase/migrations/connect_phase_2_6d_dependent_digital_cards.sql',
  ];
  return forbidden.filter((rel) => existsSync(join(connectRoot, rel)));
}

describe('connect_phase_2_6c_family_identity_foundation.sql', () => {
  it('exists and stays additive / review-gated (no production DML)', () => {
    assert.equal(existsSync(mig), true);
    const sql = read(mig);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.user_member_links'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.household_members'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.guardian_relationships'));
    // Real DML only — ignore documentation lines that say "NO INSERT INTO …"
    const dmlLines = sql
      .split('\n')
      .map((l) => l.replace(/--.*$/, '').trim())
      .filter(Boolean)
      .join('\n');
    assert.equal(/\bINSERT INTO public\.(users|members|households|user_member_links|household_members|guardian_relationships)\b/i.test(dmlLines), false);
    assert.equal(/\bUPDATE public\.(users|members|households|member_digital_cards)\b/i.test(dmlLines), false);
    assert.equal(/\bDROP (TABLE|COLUMN)\b/i.test(dmlLines), false);
    assert.equal(/\bALTER TABLE public\.(members|users|households|member_digital_cards)\b/i.test(dmlLines), false);
  });

  it('A: no email matching', () => {
    const sql = read(mig);
    assert.equal(/\bilike\b/i.test(sql), false);
    assert.equal(/\bemail\s*=/i.test(sql), false);
    assert.ok(sql.includes('NO email/name/phone matching') || sql.includes('No email/name/phone matching'));
  });

  it('B: no phone matching', () => {
    const sql = read(mig);
    assert.equal(/\bphone\s*=/i.test(sql), false);
    assert.equal(/lower\(.*phone/i.test(sql), false);
  });

  it('C: no name matching', () => {
    const sql = read(mig);
    assert.equal(/\bfirst_name\b/i.test(sql), false);
    assert.equal(/\blast_name\b/i.test(sql), false);
    assert.equal(/\bdisplay_name\s*=/i.test(sql), false);
  });

  it('D: user_member_links explicit', () => {
    const sql = read(mig);
    assert.ok(sql.includes('public.user_member_links'));
    assert.ok(sql.includes('REFERENCES public.users(id) ON DELETE CASCADE'));
    assert.ok(sql.includes('REFERENCES public.members(id) ON DELETE CASCADE'));
    assert.ok(sql.includes('canonical 1:1 link') || sql.includes('canonical, explicit'));
  });

  it('E: proposed != verified', () => {
    const sql = read(mig);
    assert.ok(sql.includes("'proposed'"));
    assert.ok(sql.includes("'verified'"));
    assert.ok(sql.includes("'revoked'"));
    assert.ok(sql.includes("CHECK (status IN ('proposed', 'verified', 'revoked'))"));
    assert.ok(sql.includes('proposed = candidate only') || sql.includes('candidate only'));
    assert.ok(sql.includes('verified = may authorize') || sql.includes('authorization-grade'));
  });

  it('F: one user/member link each', () => {
    const sql = read(mig);
    assert.ok(sql.includes('user_id uuid PRIMARY KEY'));
    assert.ok(sql.includes('CONSTRAINT user_member_links_member_uidx UNIQUE (member_id)'));
    assert.ok(sql.includes('At most one member per user') || sql.includes('one user per member'));
  });

  it('G: household_members structured', () => {
    const sql = read(mig);
    assert.ok(sql.includes('household_id uuid NOT NULL'));
    assert.ok(sql.includes('REFERENCES public.households(id) ON DELETE CASCADE'));
    assert.ok(sql.includes('CONSTRAINT household_members_household_member_uidx UNIQUE (household_id, member_id)'));
    assert.equal(/\bis_adult\b/i.test(sql), false);
    assert.equal(/\bis_dependent\b/i.test(sql), false);
  });

  it('H: guardian relationship explicit', () => {
    const sql = read(mig);
    assert.ok(sql.includes('guardian_user_id uuid NOT NULL'));
    assert.ok(sql.includes('child_member_id uuid NOT NULL'));
    assert.ok(sql.includes("'parent'"));
    assert.ok(sql.includes("'legal_guardian'"));
    assert.ok(sql.includes("'authorized_guardian'"));
    assert.ok(sql.includes('UNIQUE (guardian_user_id, child_member_id)'));
  });

  it('I: household membership does not grant guardian automatically', () => {
    const sql = read(mig);
    assert.ok(sql.includes('MUST NEVER authorize child card view') || sql.includes('Does NOT grant guardian'));
    assert.ok(sql.includes('NO automatic guardian from household membership'));
    assert.equal(/household_members[\s\S]{0,200}can_view_card/i.test(sql), false);
  });

  it('J: can_view_card separate from check-in/out', () => {
    const sql = read(mig);
    assert.ok(sql.includes('can_view_card boolean NOT NULL DEFAULT false'));
    assert.ok(sql.includes('can_check_in boolean NOT NULL DEFAULT false'));
    assert.ok(sql.includes('can_check_out boolean NOT NULL DEFAULT false'));
    assert.ok(sql.includes('Independent of check-in/out') || sql.includes('Do not imply'));
    assert.ok(sql.includes('must NEVER authorize pickup') || sql.includes('NOT authorize pickup'));
  });

  it('K: guardian relation may cross households', () => {
    const sql = read(mig);
    assert.ok(sql.includes('Must NOT require shared household_id') || sql.includes('co-residence is NOT required'));
    // No household_id column on guardian_relationships (strip comments first)
    const createGuardian = sql.match(
      /CREATE TABLE IF NOT EXISTS public\.guardian_relationships \([\s\S]*?\);/
    );
    assert.ok(createGuardian);
    assert.equal(/\bhousehold_id\b/i.test(createGuardian[0]), false);
  });

  it('L: no adult spouse QR sharing', () => {
    const sql = read(mig);
    assert.ok(sql.includes('NO spouse QR sharing') || sql.includes('spouse QR'));
    assert.equal(/\bspouse_card\b|\bshare_qr\b|\badult_grant\b/i.test(sql), false);
  });

  it('M: no child card schema', () => {
    const sql = read(mig);
    assert.equal(/\bchild_digital_cards\b|\bdependent_cards\b|\bsubject_type\b/i.test(sql), false);
    assert.ok(sql.includes('child digital cards') || sql.includes('NO ALTER public.member_digital_cards'));
  });

  it('N: member_digital_cards unchanged', () => {
    const sql = read(mig);
    assert.equal(/\bALTER TABLE public\.member_digital_cards\b/i.test(sql), false);
    assert.equal(/\bCREATE TABLE.*member_digital_cards\b/i.test(sql), false);
    assert.ok(sql.includes('NO ALTER public.member_digital_cards'));
  });

  it('O: members.children unchanged', () => {
    const sql = read(mig);
    const dmlLines = sql
      .split('\n')
      .map((l) => l.replace(/--.*$/, '').trim())
      .filter(Boolean)
      .join('\n');
    assert.equal(/\bALTER TABLE public\.members\b/i.test(dmlLines), false);
    assert.equal(/\bDROP COLUMN\b.*\bchildren\b/i.test(dmlLines), false);
    assert.equal(/\bADD COLUMN\b.*\bchildren\b/i.test(dmlLines), false);
    assert.ok(
      sql.includes('NO ALTER public.members.children') ||
        sql.includes('JSON-only members.children entries are NOT valid subjects')
    );
  });

  it('P: members.household fields unchanged', () => {
    const sql = read(mig);
    assert.equal(/\bALTER TABLE public\.members\b/i.test(sql), false);
    assert.ok(sql.includes('Legacy members.household') || sql.includes('household_id / household_name'));
  });

  it('Q: anon denied', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.user_member_links FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.household_members FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.guardian_relationships FROM anon'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.user_member_links FROM PUBLIC'));
  });

  it('R: browser writes denied', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_member_links FROM authenticated'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.household_members FROM authenticated'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.guardian_relationships FROM authenticated'));
    assert.equal(/FOR INSERT[\s\S]{0,80}TO authenticated/i.test(sql), false);
    assert.equal(/FOR UPDATE[\s\S]{0,80}TO authenticated/i.test(sql), false);
    assert.equal(/FOR DELETE[\s\S]{0,80}TO authenticated/i.test(sql), false);
  });

  it('S: RLS enabled', () => {
    const sql = read(mig);
    assert.ok(sql.includes('ALTER TABLE public.user_member_links ENABLE ROW LEVEL SECURITY'));
    assert.ok(sql.includes('ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY'));
    assert.ok(sql.includes('ALTER TABLE public.guardian_relationships ENABLE ROW LEVEL SECURITY'));
    assert.ok(sql.includes('user_member_links_select_own'));
    assert.ok(sql.includes('USING (user_id = auth.uid())'));
    assert.ok(sql.includes('No client SELECT/INSERT/UPDATE/DELETE policies on household_members'));
    assert.ok(sql.includes('No client SELECT/INSERT/UPDATE/DELETE policies on guardian_relationships'));
  });

  it('T: service role server only', () => {
    const sql = read(mig);
    assert.ok(sql.includes('GRANT ALL ON TABLE public.user_member_links TO service_role'));
    assert.ok(sql.includes('GRANT ALL ON TABLE public.household_members TO service_role'));
    assert.ok(sql.includes('GRANT ALL ON TABLE public.guardian_relationships TO service_role'));
    assert.ok(sql.includes('service_role only') || sql.includes('Vault/server service_role'));
  });

  it('U: no Family RPC yet', () => {
    const sql = read(mig);
    assert.equal(/CREATE OR REPLACE FUNCTION public\.(get_my_family|list_family|family_)/i.test(sql), false);
    assert.ok(sql.includes('NO Family RPC'));
  });

  it('V: no 13th Connect API', () => {
    assert.equal(existsSync(join(connectRoot, 'api')), true);
    const apis = readdirSync(join(connectRoot, 'api')).filter((f) => f.endsWith('.js'));
    assert.equal(apis.length, 12);
    assert.equal(existsSync(join(connectRoot, 'api/family.js')), false);
    assert.equal(existsSync(join(connectRoot, 'api/member-family.js')), false);
  });

  it('W: Connect must not host Vault family/card schema migrations', () => {
    const leaked = listConnectSchemaLeakHint();
    assert.deepEqual(
      leaked,
      [],
      `Unexpected Connect-hosted schema files: ${leaked.join(', ')}`
    );
  });

  it('X: unrelated core.ts untouched by this phase artifact', () => {
    // Contract: migration must not mention/edit core.ts; this test file only
    // references the path as a read-only existence check for the unrelated file.
    const sql = read(mig);
    assert.equal(/core\.ts/i.test(sql), false);
    assert.equal(/api\/_utils\/core/i.test(sql), false);
    assert.equal(existsSync(coreTs), true);
    // Ensure we did not stage edits via this phase by checking mtime is irrelevant;
    // git status of core.ts is expected dirty from prior unrelated work — do not touch it.
  });

  it('updated_at triggers are table-specific', () => {
    const sql = read(mig);
    assert.ok(sql.includes('set_user_member_links_updated_at'));
    assert.ok(sql.includes('set_household_members_updated_at'));
    assert.ok(sql.includes('set_guardian_relationships_updated_at'));
    assert.equal(/\bupdate_updated_at_column\b/.test(sql), false);
  });

  it('indexes avoid redundancy', () => {
    const sql = read(mig);
    assert.ok(sql.includes('household_members_member_id_idx'));
    assert.ok(sql.includes('guardian_relationships_child_member_id_idx'));
    assert.ok(sql.includes('guardian_relationships_active_guardian_idx'));
  });

  it('link_method constrained without auto-verify', () => {
    const sql = read(mig);
    assert.ok(sql.includes("'same_uuid'"));
    assert.ok(sql.includes("'staff_verified'"));
    assert.ok(sql.includes("'migration'"));
    assert.ok(sql.includes('never auto-verified by this migration'));
  });
});
