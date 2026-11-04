/**
 * Phase 2.7D.2 — Static migration contract for digital atomic check-in RPC.
 * Run from Vault: node --test scripts/test-connect-phase-2-7d2-digital-attendance-checkin.mjs
 *
 * Source-contract only. Does not apply SQL or touch live data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mig = join(root, 'supabase/migrations/connect_phase_2_7d2_digital_attendance_checkin.sql');
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

function rpcBody(sql) {
  const m = sql.match(
    /CREATE OR REPLACE FUNCTION public\.attendance_checkin_by_card_hash\([\s\S]*?\)\s*RETURNS jsonb[\s\S]*?AS \$\$([\s\S]*?)\$\$;/
  );
  assert.ok(m, 'RPC body not found');
  return m[1];
}

describe('connect_phase_2_7d2_digital_attendance_checkin.sql', () => {
  it('A: migration exists + review-gated', () => {
    assert.equal(existsSync(mig), true);
    const sql = read(mig);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
  });

  it('B: additive RPC only — no table DDL/DML on attendance_records', () => {
    const code = codeOnly(read(mig));
    assert.ok(code.includes('CREATE OR REPLACE FUNCTION public.attendance_checkin_by_card_hash'));
    assert.equal(/\bCREATE TABLE\b/i.test(code), false);
    assert.equal(/\bALTER TABLE\b/i.test(code), false);
    assert.equal(/\bDROP TABLE\b/i.test(code), false);
    assert.equal(/\bINSERT\s+INTO\s+public\.attendance\b/i.test(code), false);
    assert.equal(/\bUPDATE\s+public\.attendance\b/i.test(code), false);
  });

  it('C: signature hash-only + actor', () => {
    const sql = read(mig);
    assert.ok(
      /attendance_checkin_by_card_hash\(\s*p_session_id uuid,\s*p_qr_token_hash text,\s*p_actor_user_id uuid\s*\)/s.test(
        sql
      )
    );
    assert.equal(/p_token\b|p_raw|p_qr_token\b(?!_hash)/.test(sql), false);
  });

  it('D: SECURITY DEFINER + empty search_path + service_role only', () => {
    const sql = read(mig);
    assert.ok(/SECURITY DEFINER/.test(sql));
    assert.ok(/SET search_path = ''/.test(sql));
    assert.ok(/REVOKE ALL ON FUNCTION public\.attendance_checkin_by_card_hash/.test(sql));
    assert.ok(/FROM anon/.test(sql));
    assert.ok(/FROM authenticated/.test(sql));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.attendance_checkin_by_card_hash[\s\S]*TO service_role/.test(sql));
  });

  it('E: hash format gate (64 hex)', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes("p_qr_token_hash !~ '^[0-9a-f]{64}$'"));
    assert.ok(body.includes("RAISE EXCEPTION 'invalid_token_hash'"));
  });

  it('F: session authority mirrors member RPC', () => {
    const body = rpcBody(read(mig));
    assert.ok(/FOR SHARE/.test(body));
    assert.ok(body.includes("RAISE EXCEPTION 'session_not_found'"));
    assert.ok(body.includes("RAISE EXCEPTION 'session_not_open'"));
    assert.ok(body.includes("RAISE EXCEPTION 'session_closed'"));
    assert.ok(body.includes("RAISE EXCEPTION 'session_type_not_allowed'"));
    assert.ok(body.includes("v_session.type = 'kids'"));
  });

  it('G: adult-only + collision fail-closed', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes('member_digital_cards'));
    assert.ok(body.includes('dependent_digital_cards'));
    assert.ok(body.includes("RAISE EXCEPTION 'card_resolution_conflict'"));
    assert.ok(body.includes("RAISE EXCEPTION 'adult_card_required'"));
    assert.ok(body.includes("RAISE EXCEPTION 'card_not_found'"));
  });

  it('H: effective status via existing helper', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes('member_digital_card_effective_status'));
    assert.ok(body.includes("RAISE EXCEPTION 'card_not_valid'"));
  });

  it('I: verified link required; no auto-promote', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes('user_member_links'));
    assert.ok(/status = 'verified'/.test(body));
    assert.ok(body.includes("RAISE EXCEPTION 'member_link_required'"));
    assert.ok(body.includes("RAISE EXCEPTION 'member_link_conflict'"));
    assert.equal(/status = 'proposed'|UPDATE.*verified|auto.?verif/i.test(body), false);
  });

  it('J: insert digital_card + idempotent ON CONFLICT', () => {
    const body = rpcBody(read(mig));
    assert.ok(/source,\s*checked_in_by/.test(body));
    assert.ok(body.includes("'digital_card'"));
    assert.ok(/ON CONFLICT \(session_id, member_id\) DO NOTHING/.test(body));
    assert.ok(body.includes("'alreadyCheckedIn', false"));
    assert.ok(body.includes("'alreadyCheckedIn', true"));
  });

  it('K: no households/guardians/email/phone/DOB/raw token/audit writes', () => {
    const body = rpcBody(read(mig));
    assert.equal(/\bhouseholds\b|\bguardians?\b|\bemail\b|\bphone\b|\bbirthday\b|\bdob\b/i.test(body), false);
    assert.equal(/audit_logs|INSERT INTO public\.attendance\b/.test(body), false);
    assert.equal(/AWC1\./.test(body), false);
  });

  it('L: does not replace attendance_checkin_member', () => {
    const sql = read(mig);
    assert.equal(/CREATE OR REPLACE FUNCTION public\.attendance_checkin_member/.test(sql), false);
  });

  it('M: Connect repo unchanged by this migration file presence', () => {
    assert.equal(existsSync(join(connectRoot, 'package.json')), true);
    // Ensure we did not add this migration under Connect
    assert.equal(
      existsSync(join(connectRoot, 'supabase/migrations/connect_phase_2_7d2_digital_attendance_checkin.sql')),
      false
    );
  });

  it('N: git diff --check clean for migration (when staged/unstaged)', () => {
    try {
      execSync('git diff --check -- supabase/migrations/connect_phase_2_7d2_digital_attendance_checkin.sql', {
        cwd: root,
        stdio: 'pipe',
      });
    } catch (e) {
      // File may be untracked — check working tree file has no obvious tab issues via read
      const sql = read(mig);
      assert.equal(/\t/.test(sql), false);
    }
  });
});
