/**
 * Phase 2.7D.5B — Dependent digital card session check-in source contracts.
 * Run from Vault: node --test scripts/test-connect-phase-2-7d5b-dependent-attendance-checkin.mjs
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
const mig = join(root, 'supabase/migrations/connect_phase_2_7d5b_dependent_attendance_checkin.sql');
const mig7d2 = join(root, 'supabase/migrations/connect_phase_2_7d2_digital_attendance_checkin.sql');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(path) {
  return readFileSync(path, 'utf8');
}

function readRel(rel) {
  return readFileSync(join(root, rel), 'utf8');
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

/** Split adult vs dependent branches by adult path marker (kids reject for adults). */
function dependentBranch(body) {
  const marker = "IF v_session.type = 'kids' THEN";
  const idx = body.indexOf(marker);
  assert.ok(idx > 0, 'adult kids-reject marker missing');
  return body.slice(0, idx);
}

function adultBranch(body) {
  const marker = "IF v_session.type = 'kids' THEN";
  const idx = body.indexOf(marker);
  assert.ok(idx > 0, 'adult kids-reject marker missing');
  return body.slice(idx);
}

describe('connect_phase_2_7d5b_dependent_attendance_checkin.sql', () => {
  it('A: migration exists + review-gated additive REPLACE only', () => {
    assert.equal(existsSync(mig), true);
    const sql = read(mig);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    const code = codeOnly(sql);
    assert.ok(code.includes('CREATE OR REPLACE FUNCTION public.attendance_checkin_by_card_hash'));
    assert.equal(/\bCREATE TABLE\b/i.test(code), false);
    assert.equal(/\bALTER TABLE\b/i.test(code), false);
    assert.equal(/\bDROP TABLE\b/i.test(code), false);
    assert.equal(/\bINSERT\s+INTO\s+public\.attendance\b/i.test(code), false);
  });

  it('B: signature hash-only + SECURITY DEFINER + service_role', () => {
    const sql = read(mig);
    assert.ok(
      /attendance_checkin_by_card_hash\(\s*p_session_id uuid,\s*p_qr_token_hash text,\s*p_actor_user_id uuid\s*\)/s.test(
        sql
      )
    );
    assert.ok(/SECURITY DEFINER/.test(sql));
    assert.ok(/SET search_path = ''/.test(sql));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.attendance_checkin_by_card_hash[\s\S]*TO service_role/.test(sql));
    assert.equal(/p_token\b|p_raw|p_qr_token\b(?!_hash)/.test(sql), false);
  });

  it('C: collision fail-closed; no adult_card_required on dependent hit', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes('member_digital_cards'));
    assert.ok(body.includes('dependent_digital_cards'));
    assert.ok(body.includes("RAISE EXCEPTION 'card_resolution_conflict'"));
    assert.ok(body.includes("RAISE EXCEPTION 'card_not_found'"));
    assert.equal(body.includes("RAISE EXCEPTION 'adult_card_required'"), false);
  });

  it('D: dependent path uses child member_id and allows kids sessions', () => {
    const body = rpcBody(read(mig));
    const dep = dependentBranch(body);
    assert.ok(dep.includes('v_dependent.member_id'));
    assert.ok(dep.includes("'kids'"));
    assert.ok(/status IS DISTINCT FROM 'active'/.test(dep));
    assert.ok(dep.includes("RAISE EXCEPTION 'card_not_valid'"));
    assert.ok(dep.includes("RAISE EXCEPTION 'member_not_found'"));
    assert.equal(/user_member_links/.test(dep), false);
    assert.ok(dep.includes("'digital_card'"));
    assert.ok(/ON CONFLICT \(session_id, member_id\) DO NOTHING/.test(dep));
    assert.ok(dep.includes("'alreadyCheckedIn', true"));
  });

  it('E: adult path unchanged — rejects kids; requires verified UML', () => {
    const body = rpcBody(read(mig));
    const adult = adultBranch(body);
    assert.ok(adult.includes("v_session.type = 'kids'"));
    assert.ok(adult.includes("RAISE EXCEPTION 'session_type_not_allowed'"));
    assert.ok(adult.includes('member_digital_card_effective_status'));
    assert.ok(adult.includes('user_member_links'));
    assert.ok(/status = 'verified'/.test(adult));
    assert.ok(adult.includes("RAISE EXCEPTION 'member_link_required'"));
    assert.ok(adult.includes("RAISE EXCEPTION 'member_link_conflict'"));
    assert.equal(/v_dependent\.member_id/.test(adult), false);
  });

  it('F: not pickup authorization; no legacy attendance / PII / raw token', () => {
    const sql = read(mig);
    assert.ok(/NOT pickup|not pickup|NOT.*pickup/i.test(sql));
    const body = rpcBody(sql);
    assert.equal(/\bhouseholds\b|\bguardians?\b|\bemail\b|\bphone\b|\bbirthday\b|\bdob\b/i.test(body), false);
    assert.equal(/can_check_in|can_check_out|audit_logs|INSERT INTO public\.attendance\b/.test(body), false);
    assert.equal(/AWC1\./.test(body), false);
  });

  it('G: does not replace attendance_checkin_member; 7d2 file retained', () => {
    const sql = read(mig);
    assert.equal(/CREATE OR REPLACE FUNCTION public\.attendance_checkin_member/.test(sql), false);
    assert.equal(existsSync(mig7d2), true);
  });

  it('H: Connect repo unchanged by this migration file', () => {
    assert.equal(existsSync(join(connectRoot, 'package.json')), true);
    assert.equal(
      existsSync(join(connectRoot, 'supabase/migrations/connect_phase_2_7d5b_dependent_attendance_checkin.sql')),
      false
    );
  });

  it('I: git diff --check clean / no tabs', () => {
    try {
      execSync('git diff --check -- supabase/migrations/connect_phase_2_7d5b_dependent_attendance_checkin.sql', {
        cwd: root,
        stdio: 'pipe',
      });
    } catch {
      const sql = read(mig);
      assert.equal(/\t/.test(sql), false);
    }
  });
});

describe('2.7D.5B API / UI contracts stay digital_card-only', () => {
  const handlerSrc = readRel('api/_utils/attendanceCheckinHandler.ts');
  const logicSrc = readRel('api/_utils/attendanceCheckinLogic.ts');
  const uiSrc = readRel('lib/attendanceRecordsUi.ts');
  const scannerSrc = readRel('components/attendance/AttendanceSessionScanner.tsx');
  const kidsSrc = readRel('pages/events/KidsKiosk.tsx');

  it('handler still posts hash-only RPC; no client memberId on digital path', () => {
    assert.ok(handlerSrc.includes("attendance_checkin_by_card_hash"));
    assert.ok(handlerSrc.includes('hashCardToken'));
    assert.ok(logicSrc.includes("mode: 'digital_card'"));
    assert.ok(logicSrc.includes("digital_card must not include memberId"));
    assert.equal(/\.from\(['\"]dependent_digital_cards['\"]\)/.test(handlerSrc), false);
    assert.equal(/\.from\(['\"]member_digital_cards['\"]\)/.test(handlerSrc), false);
  });

  it('invalid/revoked dependent messaging stays non-sensitive', () => {
    assert.ok(uiSrc.includes("case 'card_not_valid'"));
    assert.ok(uiSrc.includes('This PLCC card is not valid for check-in.'));
    assert.equal(/hash|member_id|qr_token/i.test(uiSrc.match(/case 'card_not_valid':[\s\S]*?return '[^']+'/)?.[0] || ''), false);
    assert.ok(handlerSrc.includes("case 'card_not_valid'"));
  });

  it('scanner accepts adult or child copy; no Kids Kiosk / legacy attendance', () => {
    assert.ok(/adult or child PLCC digital card/i.test(scannerSrc));
    assert.ok(scannerSrc.includes('checkInMemberDigitalCard'));
    assert.equal(scannerSrc.includes('card-resolver'), false);
    assert.equal(scannerSrc.includes('memberId'), false);
    assert.equal(kidsSrc.includes('AttendanceSessionScanner'), false);
    assert.equal(/from\(['\"]attendance['\"]\)|event_checkins/.test(scannerSrc), false);
  });
});
