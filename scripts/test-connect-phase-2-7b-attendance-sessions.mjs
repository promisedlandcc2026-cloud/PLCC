/**
 * Phase 2.7B — Vault migration contract for attendance_sessions.
 * Run from Vault: node --test scripts/test-connect-phase-2-7b-attendance-sessions.mjs
 *
 * Source-contract only. Does not apply SQL or touch live data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mig = join(root, 'supabase/migrations/connect_phase_2_7b_attendance_sessions.sql');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(path) {
  return readFileSync(path, 'utf8');
}

function codeOnly(sql) {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, '').trim())
    .filter(Boolean)
    .join('\n');
}

describe('connect_phase_2_7b_attendance_sessions.sql', () => {
  it('A: table exists in SQL + review-gated', () => {
    assert.equal(existsSync(mig), true);
    const sql = read(mig);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.attendance_sessions'));
  });

  it('B: additive only', () => {
    const code = codeOnly(read(mig));
    assert.equal(/\bDROP TABLE\b/i.test(code), false);
    assert.equal(/\bDROP COLUMN\b/i.test(code), false);
    assert.ok(code.includes('CREATE TABLE IF NOT EXISTS public.attendance_sessions'));
  });

  it('C: no ALTER attendance', () => {
    const code = codeOnly(read(mig));
    assert.equal(/\bALTER TABLE public\.attendance\b/i.test(code), false);
  });

  it('D: no DROP', () => {
    const code = codeOnly(read(mig));
    // Allow DROP TRIGGER IF EXISTS / DROP POLICY IF EXISTS only
    const bad = code
      .split('\n')
      .filter((l) => /\bDROP\b/i.test(l))
      .filter((l) => !/DROP TRIGGER IF EXISTS/i.test(l) && !/DROP POLICY IF EXISTS/i.test(l));
    assert.equal(bad.length, 0, bad.join('\n'));
  });

  it('E: type allowlist', () => {
    const sql = read(mig);
    assert.ok(
      sql.includes(
        "CHECK (type IN ('worship', 'event', 'serve', 'bible_study', 'kids', 'other'))"
      )
    );
  });

  it('F: status allowlist', () => {
    const sql = read(mig);
    assert.ok(sql.includes("CHECK (status IN ('draft', 'open', 'closed'))"));
    assert.ok(sql.includes("DEFAULT 'draft'"));
  });

  it('G: timezone default Africa/Kampala', () => {
    const sql = read(mig);
    const code = codeOnly(sql);
    assert.ok(sql.includes("DEFAULT 'Africa/Kampala'"));
    // Reject EST label as a DEFAULT/value — docs may mention it as forbidden
    assert.equal(/DEFAULT\s+'Eastern Standard Time'/i.test(code), false);
    assert.ok(/Not Eastern Standard Time|not.*Eastern Standard Time/i.test(sql));
  });

  it('H: visitor_count >= 0', () => {
    const sql = read(mig);
    assert.ok(sql.includes('visitor_count integer NOT NULL DEFAULT 0'));
    assert.ok(sql.includes('CHECK (visitor_count >= 0)'));
  });

  it('I: starts/ends check', () => {
    const sql = read(mig);
    assert.ok(sql.includes('ends_at IS NULL OR ends_at >= starts_at'));
  });

  it('J: lifecycle timestamp consistency', () => {
    const sql = read(mig);
    assert.ok(sql.includes('attendance_sessions_lifecycle_chk'));
    assert.ok(sql.includes("status = 'draft'"));
    assert.ok(sql.includes("status = 'open'"));
    assert.ok(sql.includes("status = 'closed'"));
    assert.ok(sql.includes('opened_at IS NOT NULL'));
    assert.ok(sql.includes('closed_at IS NOT NULL'));
  });

  it('K: event FK', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REFERENCES public.events(id) ON DELETE SET NULL'));
    assert.ok(sql.includes('attendance_sessions_event_type_fk_chk'));
    assert.ok(sql.includes("type <> 'event' OR event_id IS NOT NULL"));
  });

  it('L: serve FK', () => {
    const sql = read(mig);
    assert.ok(
      sql.includes('REFERENCES public.serve_opportunities(id) ON DELETE SET NULL')
    );
  });

  it('M: created_by FK', () => {
    const sql = read(mig);
    assert.ok(/created_by uuid NOT NULL\s+REFERENCES public\.users\(id\)/s.test(sql));
  });

  it('N: opened_by FK', () => {
    const sql = read(mig);
    assert.ok(/opened_by uuid NULL\s+REFERENCES public\.users\(id\)/s.test(sql));
  });

  it('O: closed_by FK', () => {
    const sql = read(mig);
    assert.ok(/closed_by uuid NULL\s+REFERENCES public\.users\(id\)/s.test(sql));
  });

  it('P: RLS enabled', () => {
    const sql = read(mig);
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
  });

  it('Q: PUBLIC revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.attendance_sessions FROM PUBLIC'));
  });

  it('R: anon revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.attendance_sessions FROM anon'));
  });

  it('S: authenticated revoked', () => {
    const sql = read(mig);
    assert.ok(
      sql.includes('REVOKE ALL ON TABLE public.attendance_sessions FROM authenticated')
    );
  });

  it('T: service_role granted', () => {
    const sql = read(mig);
    assert.ok(sql.includes('GRANT ALL ON TABLE public.attendance_sessions TO service_role'));
  });

  it('U: updated_at trigger', () => {
    const sql = read(mig);
    assert.ok(sql.includes('set_attendance_sessions_updated_at'));
    assert.ok(sql.includes('attendance_sessions_set_updated_at'));
    assert.ok(sql.includes('BEFORE UPDATE ON public.attendance_sessions'));
  });

  it('V: indexes', () => {
    const sql = read(mig);
    assert.ok(sql.includes('attendance_sessions_status_starts_idx'));
    assert.ok(sql.includes('attendance_sessions_type_starts_idx'));
    assert.ok(sql.includes('attendance_sessions_event_id_idx'));
    assert.ok(sql.includes('attendance_sessions_serve_opportunity_id_idx'));
    assert.equal(/UNIQUE\s*\(\s*status/i.test(sql), false);
  });

  it('W: no attendance_records', () => {
    const code = codeOnly(read(mig));
    assert.equal(/attendance_records/i.test(code), false);
  });

  it('X: no custody table', () => {
    const code = codeOnly(read(mig));
    assert.equal(/child_custody/i.test(code), false);
  });

  it('Y: no legacy DML', () => {
    const code = codeOnly(read(mig));
    assert.equal(/\b(INSERT|UPDATE|DELETE)\b.*\bpublic\.attendance\b/i.test(code), false);
    assert.equal(/\bINSERT INTO public\.attendance\b/i.test(code), false);
    assert.equal(/\bUPDATE public\.attendance\b/i.test(code), false);
    assert.equal(/\bDELETE FROM public\.attendance\b/i.test(code), false);
  });

  it('Connect isolation: migration not in Connect', () => {
    assert.equal(
      existsSync(join(connectRoot, 'supabase/migrations/connect_phase_2_7b_attendance_sessions.sql')),
      false
    );
  });
});
