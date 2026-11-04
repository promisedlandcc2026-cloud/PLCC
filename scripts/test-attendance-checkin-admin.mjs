/**
 * Phase 2.7D.2 — Attendance check-in admin logic + source contracts.
 * Run from Vault: node --import tsx --test scripts/test-attendance-checkin-admin.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const connectRoot = join(root, '..', 'awc-connect-main');
const require = createRequire(import.meta.url);

async function loadLogic() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import('../api/_utils/attendanceCheckinLogic.ts');
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const SYNTH_TOKEN =
  'AWC1.' + 'a'.repeat(64);
const SYNTH_HASH = createHash('sha256').update(SYNTH_TOKEN, 'utf8').digest('hex');
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

describe('attendance check-in admin contracts', async () => {
  const logic = await loadLogic();
  const {
    isAttendanceCheckinRole,
    ATTENDANCE_CHECKIN_ROLES,
    ATTENDANCE_CHECKIN_DENIED_ROLES,
    MINISTRY_LEADER_CHECKIN_FUTURE_NOTE,
    parseCheckinBody,
    hashCardToken,
    isValidCardToken,
    displayNameFromMemberSafe,
    toClientAttendanceDto,
    sanitizeClientAttendanceDto,
    mapRpcErrorMessage,
    httpStatusForCheckinCode,
    normalizeRpcResult,
    detectSpoofFields,
  } = logic;

  const logicSrc = read('api/_utils/attendanceCheckinLogic.ts');
  const handlerSrc = read('api/_utils/attendanceCheckinHandler.ts');
  const coreSrc = read('api/_utils/core.ts');
  const permsSrc = read('lib/permissions.ts');
  const migSrc = read('supabase/migrations/connect_phase_2_7d2_digital_attendance_checkin.sql');

  it('auth roles allowlist', () => {
    for (const r of [
      'SUPER_ADMIN',
      'ADMIN',
      'PASTOR',
      'ADMIN_STAFF',
      'SECRETARY',
      'ASST_SECRETARY',
      'FIRST_LADY',
      'SUNDAY_SCHOOL_TEACHER',
      'TEACHER',
      'MINISTRY_LEADER',
      'KIOSK',
    ]) {
      assert.equal(isAttendanceCheckinRole(r), true, r);
      assert.equal(ATTENDANCE_CHECKIN_ROLES.has(r), true, r);
    }
  });

  it('role deny matrix', () => {
    for (const r of [
      'FINANCE',
      'WORSHIP_TEAM',
      'MEMBER',
      'PENDING',
      'YOUTH',
      'VOLUNTEER',
      'PARENT',
    ]) {
      assert.equal(isAttendanceCheckinRole(r), false, r);
      assert.equal(ATTENDANCE_CHECKIN_DENIED_ROLES.has(r), true, r);
    }
    assert.ok(MINISTRY_LEADER_CHECKIN_FUTURE_NOTE.includes('Children') || MINISTRY_LEADER_CHECKIN_FUTURE_NOTE.includes('SUNDAY_SCHOOL'));
  });

  it('permission attendance.checkin registered; separate from session.manage', () => {
    assert.ok(permsSrc.includes("'attendance.checkin'"));
    assert.ok(permsSrc.includes("'attendance.session.manage'"));
    assert.ok(/'attendance\.checkin':\s*ATTENDANCE_CHECKIN_ROLES/.test(permsSrc));
  });

  it('POST-only wiring in core + handler', () => {
    assert.ok(coreSrc.includes("attendanceSub || '') === 'check-in'"));
    assert.ok(coreSrc.includes('handleAttendanceCheckin'));
    assert.ok(handlerSrc.includes("method !== 'POST'"));
    assert.ok(handlerSrc.includes('method_not_allowed'));
    assert.ok(handlerSrc.includes("requireAuth"));
  });

  it('manual request contract', () => {
    const good = parseCheckinBody({
      mode: 'manual_staff',
      sessionId: SESSION_ID,
      memberId: MEMBER_ID,
    });
    assert.equal(good.ok, true);
    if (good.ok) {
      assert.equal(good.mode, 'manual_staff');
      assert.equal(good.sessionId, SESSION_ID);
      assert.equal(good.memberId, MEMBER_ID);
    }
  });

  it('digital request contract', () => {
    const good = parseCheckinBody({
      mode: 'digital_card',
      sessionId: SESSION_ID,
      token: SYNTH_TOKEN,
    });
    assert.equal(good.ok, true);
    if (good.ok && good.mode === 'digital_card') {
      assert.equal(good.token, SYNTH_TOKEN);
    }
  });

  it('spoof fields rejected', () => {
    for (const field of [
      'checkedInAt',
      'checked_in_at',
      'checkedInBy',
      'source',
      'userId',
      'displayName',
      'alreadyCheckedIn',
      'attendanceId',
      'cardNumber',
      'qrTokenHash',
      'role',
      'valid',
      'status',
    ]) {
      const r = parseCheckinBody({
        mode: 'manual_staff',
        sessionId: SESSION_ID,
        memberId: MEMBER_ID,
        [field]: 'x',
      });
      assert.equal(r.ok, false, field);
      assert.equal(r.code, 'spoof_rejected', field);
    }
  });

  it('digital forbids memberId; manual forbids token', () => {
    const dig = parseCheckinBody({
      mode: 'digital_card',
      sessionId: SESSION_ID,
      token: SYNTH_TOKEN,
      memberId: MEMBER_ID,
    });
    assert.equal(dig.ok, false);
    assert.equal(dig.code, 'spoof_rejected');

    const man = parseCheckinBody({
      mode: 'manual_staff',
      sessionId: SESSION_ID,
      memberId: MEMBER_ID,
      token: SYNTH_TOKEN,
    });
    assert.equal(man.ok, false);
    assert.equal(man.code, 'spoof_rejected');
  });

  it('invalid UUID', () => {
    const r = parseCheckinBody({
      mode: 'manual_staff',
      sessionId: 'not-a-uuid',
      memberId: MEMBER_ID,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_uuid');
  });

  it('token validation exact — no trim', () => {
    assert.equal(isValidCardToken(SYNTH_TOKEN), true);
    assert.equal(isValidCardToken(' ' + SYNTH_TOKEN), false);
    assert.equal(isValidCardToken(SYNTH_TOKEN + ' '), false);
    assert.equal(isValidCardToken('AWC1.' + 'G'.repeat(64)), false);
    const bad = parseCheckinBody({
      mode: 'digital_card',
      sessionId: SESSION_ID,
      token: 'bad',
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'invalid_card_format');
  });

  it('token hash SHA-256; handler discards raw', () => {
    assert.equal(hashCardToken(SYNTH_TOKEN), SYNTH_HASH);
    assert.equal(/^[0-9a-f]{64}$/.test(SYNTH_HASH), true);
    assert.ok(handlerSrc.includes('hashCardToken(token)'));
    assert.ok(handlerSrc.includes('attendance_checkin_by_card_hash'));
    assert.ok(handlerSrc.includes('p_qr_token_hash: tokenHash'));
    // Never log raw token
    assert.equal(/console\.(log|info|warn|error).*token(?!Hash)/i.test(handlerSrc), false);
    assert.equal(handlerSrc.includes('details: { token'), false);
  });

  it('manual RPC + digital atomic RPC wiring', () => {
    assert.ok(handlerSrc.includes("rpc('attendance_checkin_member'"));
    assert.ok(handlerSrc.includes("p_source: 'manual_staff'"));
    assert.ok(handlerSrc.includes("rpc('attendance_checkin_by_card_hash'"));
    assert.ok(migSrc.includes('attendance_checkin_by_card_hash'));
  });

  it('DTO privacy + display name', () => {
    assert.equal(displayNameFromMemberSafe({ first_name: 'Ada', last_name: 'Lovelace' }), 'Ada Lovelace');
    assert.equal(displayNameFromMemberSafe({ first_name: '  ', last_name: '' }), 'PLCC Member');
    const dto = sanitizeClientAttendanceDto(
      toClientAttendanceDto(
        {
          attendanceId: 'a',
          sessionId: SESSION_ID,
          memberId: MEMBER_ID,
          checkedInAt: '2026-09-14T14:00:00.000Z',
          source: 'manual_staff',
          alreadyCheckedIn: true,
        },
        'Ada Lovelace'
      )
    );
    assert.deepEqual(Object.keys(dto).sort(), [
      'alreadyCheckedIn',
      'checkedInAt',
      'displayName',
      'source',
    ]);
    assert.equal(dto.alreadyCheckedIn, true);
    assert.equal('memberId' in dto, false);
    assert.equal('attendanceId' in dto, false);
    assert.equal('email' in dto, false);
  });

  it('session + card error HTTP mapping', () => {
    assert.equal(httpStatusForCheckinCode('session_not_found'), 404);
    assert.equal(httpStatusForCheckinCode('session_not_open'), 409);
    assert.equal(httpStatusForCheckinCode('session_closed'), 409);
    assert.equal(httpStatusForCheckinCode('session_type_not_allowed'), 409);
    assert.equal(httpStatusForCheckinCode('invalid_card_format'), 400);
    assert.equal(httpStatusForCheckinCode('card_not_found'), 404);
    assert.equal(httpStatusForCheckinCode('card_not_valid'), 403);
    assert.equal(httpStatusForCheckinCode('adult_card_required'), 409);
    assert.equal(httpStatusForCheckinCode('member_link_required'), 409);
    assert.equal(httpStatusForCheckinCode('card_resolution_conflict'), 409);
    assert.equal(httpStatusForCheckinCode('attendance_unavailable'), 502);
    assert.equal(httpStatusForCheckinCode('unauthorized'), 401);
    assert.equal(httpStatusForCheckinCode('forbidden'), 403);
    assert.equal(httpStatusForCheckinCode('method_not_allowed'), 405);
  });

  it('RPC error message mapping', () => {
    assert.equal(mapRpcErrorMessage('session_not_found'), 'session_not_found');
    assert.equal(mapRpcErrorMessage('ERROR: member_link_required'), 'member_link_required');
    assert.equal(mapRpcErrorMessage('resolver_conflict'), 'card_resolution_conflict');
  });

  it('normalizeRpcResult + duplicate alreadyCheckedIn semantics', () => {
    const n = normalizeRpcResult({
      attendanceId: 'a',
      sessionId: SESSION_ID,
      memberId: MEMBER_ID,
      checkedInAt: 't',
      source: 'digital_card',
      alreadyCheckedIn: true,
    });
    assert.equal(n?.alreadyCheckedIn, true);
  });

  it('cache headers set before auth', () => {
    assert.ok(handlerSrc.includes("Cache-Control', 'private, no-store'"));
    assert.ok(handlerSrc.includes("Pragma', 'no-cache'"));
    const fn = handlerSrc.slice(handlerSrc.indexOf('export async function handleAttendanceCheckin'));
    const setIdx = fn.indexOf('setNoStore(res)');
    const authIdx = fn.indexOf('requireAuth');
    assert.ok(setIdx >= 0 && authIdx > setIdx);
  });

  it('audit: attendance.checkin; target member; no token/hash/name/email', () => {
    assert.ok(handlerSrc.includes("action: 'attendance.checkin'"));
    assert.ok(handlerSrc.includes("resourceType: 'member'"));
    assert.ok(handlerSrc.includes('resourceId: rpc.memberId'));
    assert.ok(handlerSrc.includes('alreadyCheckedIn: rpc.alreadyCheckedIn'));
    // Audit details blocks must not include displayName / token / hash / email
    const auditBlocks = handlerSrc.match(/safeAudit\(\{[\s\S]*?\}\);/g) || [];
    assert.ok(auditBlocks.length >= 2);
    for (const block of auditBlocks) {
      assert.equal(/displayName|tokenHash|qr_token|email|cardNumber/i.test(block), false);
    }
    assert.ok(handlerSrc.includes('audit failed (non-fatal)'));
  });

  it('rate limit separate digital vs manual; not scanner resolver', () => {
    assert.ok(logicSrc.includes('DIGITAL_CHECKIN_RATE_LIMITS'));
    assert.ok(logicSrc.includes('MANUAL_CHECKIN_RATE_LIMITS'));
    assert.ok(handlerSrc.includes('DIGITAL_CHECKIN_RATE_LIMITS'));
    assert.ok(handlerSrc.includes('MANUAL_CHECKIN_RATE_LIMITS'));
    assert.equal(handlerSrc.includes('CARD_RESOLVER_RATE_LIMITS'), false);
  });

  it('no legacy attendance / visitor / serve / event registration mutations', () => {
    const stripped = handlerSrc.replace(/safeAudit|logAudit|getAudit/g, '');
    assert.equal(/\.from\(['\"]attendance['\"]\)/.test(stripped), false);
    // allow serve_signup_* RPC names; ban table mutations on visitors / serve_signups / event_registrations
    assert.equal(/visitor_count\s*[:=]|from\(['\"]visitors['\"]\)/i.test(stripped), false);
    assert.equal(/from\(['\"]serve_signups['\"]\)|from\(['\"]event_registrations['\"]\)/i.test(stripped), false);
    assert.equal(/\.from\(['\"]dependent_digital_cards['\"]\)/.test(stripped), false);
  });

  it('member search reuse path: People GET returns members.id', () => {
    // Reusable path for future manual UI staff selection:
    // GET /api/vault?resource=people&query=<text> → { ok, members: [{ id, ... }] }
    assert.ok(coreSrc.includes("case 'people'"));
    assert.ok(coreSrc.includes("from('members').select('*')"));
    assert.ok(coreSrc.includes('first_name.ilike'));
  });

  it('detectSpoofFields digital extras', () => {
    const hits = detectSpoofFields({ mode: 'digital_card', memberId: MEMBER_ID }, 'digital_card');
    assert.ok(hits.includes('memberId'));
  });

  it('no UI routes for check-in scanner in this phase', () => {
    assert.equal(existsSync(join(root, 'pages/AttendanceCheckIn.tsx')), false);
    assert.ok(handlerSrc.includes('No scanner UI'));
  });

  it('Connect unchanged — no check-in handler there', () => {
    assert.equal(existsSync(join(connectRoot, 'api/_utils/attendanceCheckinHandler.ts')), false);
  });

  it('secret scan — no JWT/service keys/raw prod tokens in implementation files', () => {
    for (const rel of [
      'api/_utils/attendanceCheckinLogic.ts',
      'api/_utils/attendanceCheckinHandler.ts',
      'supabase/migrations/connect_phase_2_7d2_digital_attendance_checkin.sql',
    ]) {
      const src = read(rel);
      assert.equal(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./.test(src), false, rel);
      assert.equal(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['\"][^'\"]+/.test(src), false, rel);
      assert.equal(/sk_live_|sk_test_[A-Za-z0-9]{20,}/.test(src), false, rel);
      assert.equal(/TEMP.?password|@gmail\.com/i.test(src), false, rel);
    }
    assert.ok(SYNTH_TOKEN.startsWith('AWC1.'));
    assert.equal(SYNTH_TOKEN.length, 69);
  });
});
