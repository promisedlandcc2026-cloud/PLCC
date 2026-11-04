/**
 * Phase 2.5 — Vault migration contract for private sermon_notes.
 * Run from Vault: node --test scripts/test-connect-phase-2-5-sermon-notes.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mig = join(root, 'supabase/migrations/connect_phase_2_5_sermon_notes.sql');

describe('connect_phase_2_5_sermon_notes.sql', () => {
  it('exists and stays additive / review-gated', () => {
    assert.equal(existsSync(mig), true);
    const sql = readFileSync(mig, 'utf8');
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.sermon_notes'));
  });

  it('locks ownership to public.users(id) / auth.uid()', () => {
    const sql = readFileSync(mig, 'utf8');
    assert.ok(sql.includes('REFERENCES public.users(id) ON DELETE CASCADE'));
    assert.ok(sql.includes('USING (user_id = auth.uid())'));
    assert.ok(sql.includes('WITH CHECK (user_id = auth.uid())'));
    assert.equal(/REFERENCES public\.members\b/i.test(sql), false);
  });

  it('enables self-only CRUD RLS and denies anon', () => {
    const sql = readFileSync(mig, 'utf8');
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
    for (const name of [
      'sermon_notes_select_own',
      'sermon_notes_insert_own',
      'sermon_notes_update_own',
      'sermon_notes_delete_own',
    ]) {
      assert.ok(sql.includes(name), name);
    }
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.sermon_notes FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.sermon_notes FROM anon'));
    assert.ok(sql.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sermon_notes TO authenticated'));
  });

  it('allows optional sermon link and youtube/manual sources without share flags', () => {
    const sql = readFileSync(mig, 'utf8');
    assert.ok(sql.includes('REFERENCES public.sermons(id) ON DELETE SET NULL'));
    assert.ok(sql.includes("CHECK (source_type IN ('sermon', 'youtube', 'manual'))"));
    assert.equal(/\b(is_public|shared_with|visibility|household_id)\b/i.test(sql), false);
  });
});
