/**
 * Phase 2.7D.3A — Attendance records read API source contracts.
 * Run from Vault: node --import tsx --test scripts/test-attendance-records-read.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const connectRoot = join(root, '..', 'awc-connect-main');
const require = createRequire(import.meta.url);

async function loadLogic() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import('../api/_utils/attendanceRecordsLogic.ts');
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('attendance records read contracts', async () => {
  const logic = await loadLogic();
  const {
    canReadAttendanceRecords,
    ATTENDANCE_RECORDS_READ_ROLES,
    ATTENDANCE_RECORDS_DENIED_ROLES,
    ATTENDANCE_RECORDS_MAX,
    parseSessionIdQuery,
    displayNameFromMemberSafe,
    toSessionContextDto,
    toAttendanceRowDto,
    sanitizeAttendanceRowDto,
    computeTotals,
    httpStatusForRecordsCode,
    FORBIDDEN_ROW_KEYS,
  } = logic;

  const logicSrc = read('api/_utils/attendanceRecordsLogic.ts');
  const handlerSrc = read('api/_utils/attendanceRecordsHandler.ts');
  const coreSrc = read('api/_utils/core.ts');
  const checkinHandlerSrc = read('api/_utils/attendanceCheckinHandler.ts');

  it('A: route mount under attendance/records', () => {
    assert.ok(coreSrc.includes("attendanceSub || '') === 'records'"));
    assert.ok(coreSrc.includes('handleAttendanceRecords'));
    assert.equal(existsSync(join(root, 'api/attendance-records.ts')), false);
  });

  it('B: GET only', () => {
    assert.ok(handlerSrc.includes("method !== 'GET'"));
    assert.ok(handlerSrc.includes('method_not_allowed'));
  });

  it('C/D/E: permission — checkin OR session.manage; denied roles', () => {
    for (const r of [
      'SUPER_ADMIN',
      'ADMIN',
      'PASTOR',
      'ADMIN_STAFF',
      'SECRETARY',
      'ASST_SECRETARY',
      'FIRST_LADY',
    ]) {
      assert.equal(canReadAttendanceRecords(r), true, r);
      assert.equal(ATTENDANCE_RECORDS_READ_ROLES.has(r), true, r);
    }
    for (const r of [
      'MINISTRY_LEADER',
      'FINANCE',
      'WORSHIP_TEAM',
      'MEMBER',
      'PENDING',
      'YOUTH',
    ]) {
      assert.equal(canReadAttendanceRecords(r), false, r);
      assert.equal(ATTENDANCE_RECORDS_DENIED_ROLES.has(r), true, r);
    }
    assert.ok(logicSrc.includes('attendance.checkin') || logicSrc.includes('ATTENDANCE_CHECKIN_ROLES'));
    assert.ok(logicSrc.includes('ATTENDANCE_SESSION_MANAGER_ROLES'));
    assert.equal(logicSrc.includes("'attendance.view'"), false);
  });

  it('F: UUID validation', () => {
    assert.equal(parseSessionIdQuery({}).ok, false);
    assert.equal(parseSessionIdQuery({ sessionId: 'bad' }).code, 'invalid_request');
    assert.equal(parseSessionIdQuery({ sessionId: ' ' + SESSION_ID }).ok, false);
    const good = parseSessionIdQuery({ sessionId: SESSION_ID });
    assert.equal(good.ok, true);
    if (good.ok) assert.equal(good.sessionId, SESSION_ID);
  });

  it('G/H/I: session lookup + DTO + 404 mapping', () => {
    assert.ok(handlerSrc.includes("from('attendance_sessions')"));
    assert.ok(handlerSrc.includes('session_not_found'));
    assert.equal(httpStatusForRecordsCode('session_not_found'), 404);
    const dto = toSessionContextDto({
      id: SESSION_ID,
      title: 'Sunday',
      type: 'worship',
      status: 'open',
      starts_at: 't',
      ends_at: null,
      timezone: 'Africa/Kampala',
      visitor_count: 3,
      created_by: 'x',
      opened_by: 'y',
      closed_by: 'z',
    });
    assert.deepEqual(Object.keys(dto).sort(), [
      'endsAt',
      'id',
      'startsAt',
      'status',
      'timezone',
      'title',
      'type',
      'visitorCount',
    ]);
    assert.equal('createdBy' in dto, false);
    assert.equal('openedBy' in dto, false);
    assert.equal('closedBy' in dto, false);
  });

  it('J/K/L: query by session, DESC, limit 200 + truncated', () => {
    assert.ok(handlerSrc.includes("from('attendance_records')"));
    assert.ok(handlerSrc.includes(".eq('session_id', parsed.sessionId)"));
    assert.ok(handlerSrc.includes("order('checked_in_at', { ascending: false })"));
    assert.equal(ATTENDANCE_RECORDS_MAX, 200);
    assert.ok(handlerSrc.includes('ATTENDANCE_RECORDS_MAX'));
    assert.ok(handlerSrc.includes('truncated'));
  });

  it('M/N: member display join + fallback', () => {
    assert.ok(handlerSrc.includes("from('members')"));
    assert.ok(handlerSrc.includes('first_name, last_name, avatar_url'));
    assert.equal(handlerSrc.includes("from('users')"), false);
    assert.equal(displayNameFromMemberSafe({ first_name: 'Ada', last_name: 'L' }), 'Ada L');
    assert.equal(displayNameFromMemberSafe({ first_name: '', last_name: '' }), 'PLCC Member');
    assert.equal(displayNameFromMemberSafe(null), 'PLCC Member');
  });

  it('O/P/Q/R/S/T: row DTO privacy', () => {
    const row = sanitizeAttendanceRowDto(
      toAttendanceRowDto({
        checkedInAt: '2026-09-14T14:00:00.000Z',
        source: 'digital_card',
        member: { first_name: 'Ada', last_name: 'Lovelace', avatar_url: 'https://cdn.example/a.png' },
      })
    );
    assert.deepEqual(Object.keys(row).sort(), [
      'avatarUrl',
      'checkedInAt',
      'displayName',
      'source',
    ]);
    assert.equal(row.source, 'digital_card');
    for (const k of FORBIDDEN_ROW_KEYS) {
      assert.equal(k in row, false, k);
    }
    const blob = JSON.stringify(row);
    assert.equal(/memberId|attendanceId|checkedInBy|email|phone|dob|qr|token|hash/i.test(blob), false);
  });

  it('U/V/W: counts', () => {
    assert.deepEqual(computeTotals(2, 3), { memberCount: 2, visitorCount: 3, totalCount: 5 });
    assert.deepEqual(computeTotals(0, 3), { memberCount: 0, visitorCount: 3, totalCount: 3 });
    assert.ok(handlerSrc.includes('memberCount'));
    assert.ok(handlerSrc.includes('totalCount'));
  });

  it('X–AA: draft/open/closed/empty readable (no status gate on GET)', () => {
    assert.equal(/status === 'open'|status === \"open\"/.test(handlerSrc), false);
    assert.equal(handlerSrc.includes('session_not_open'), false);
  });

  it('AB: kids isolation — no custody/kids tables', () => {
    assert.equal(/kids_check|guardian|custody|households/i.test(handlerSrc), false);
  });

  it('AC/AD: no legacy attendance writes; GET read-only', () => {
    assert.equal(/\.from\(['\"]attendance['\"]\)/.test(handlerSrc), false);
    assert.equal(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(handlerSrc), false);
  });

  it('AE: no read audit', () => {
    assert.equal(/logAudit|safeAudit|getAudit/.test(handlerSrc), false);
  });

  it('AF: cache before auth', () => {
    assert.ok(handlerSrc.includes("Cache-Control', 'private, no-store'"));
    assert.ok(handlerSrc.includes("Pragma', 'no-cache'"));
    const fn = handlerSrc.slice(handlerSrc.indexOf('export async function handleAttendanceRecords'));
    assert.ok(fn.indexOf('setNoStore(res)') < fn.indexOf('requireAuth'));
  });

  it('AG: error mapping', () => {
    assert.equal(httpStatusForRecordsCode('unauthorized'), 401);
    assert.equal(httpStatusForRecordsCode('forbidden'), 403);
    assert.equal(httpStatusForRecordsCode('invalid_request'), 400);
    assert.equal(httpStatusForRecordsCode('session_not_found'), 404);
    assert.equal(httpStatusForRecordsCode('method_not_allowed'), 405);
    assert.equal(httpStatusForRecordsCode('attendance_unavailable'), 502);
  });

  it('AH: browser table isolation (service_role via getSupabaseAdmin)', () => {
    assert.ok(handlerSrc.includes('getSupabaseAdmin'));
    assert.ok(handlerSrc.includes('requireAuth'));
  });

  it('AI: check-in endpoint unchanged (still separate handler)', () => {
    assert.ok(coreSrc.includes("=== 'check-in'"));
    assert.ok(checkinHandlerSrc.includes('handleAttendanceCheckin') || checkinHandlerSrc.includes('attendance_checkin_member'));
    assert.equal(handlerSrc.includes('attendance_checkin_member'), false);
    assert.equal(handlerSrc.includes('attendance_checkin_by_card_hash'), false);
  });

  it('signed-out / auth wiring', () => {
    assert.ok(handlerSrc.includes('requireAuth'));
  });

  it('Connect unchanged', () => {
    assert.equal(existsSync(join(connectRoot, 'api/_utils/attendanceRecordsHandler.ts')), false);
  });

  it('secret scan — implementation files', () => {
    for (const rel of [
      'api/_utils/attendanceRecordsLogic.ts',
      'api/_utils/attendanceRecordsHandler.ts',
    ]) {
      const src = read(rel);
      assert.equal(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./.test(src), false, rel);
      assert.equal(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['\"][^'\"]+/.test(src), false, rel);
      assert.equal(/@gmail\.com/i.test(src), false, rel);
    }
  });
});
