/**
 * Phase 2.7B — Attendance session admin logic + source contracts.
 * Run from Vault: node --import tsx --test scripts/test-attendance-session-admin.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
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
  return import('../api/_utils/attendanceSessionLogic.ts');
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('attendance session admin contracts', async () => {
  const logic = await loadLogic();
  const {
    isAttendanceSessionManagerRole,
    ATTENDANCE_SESSION_MANAGER_ROLES,
    ATTENDANCE_SESSION_DENIED_ROLES,
    ATTENDANCE_SESSION_TYPES,
    ATTENDANCE_SESSION_STATUSES,
    DEFAULT_ATTENDANCE_TIMEZONE,
    parseCreateSessionBody,
    parsePatchBody,
    detectSpoofFields,
    toSessionDto,
    sanitizeSessionDto,
    isValidIanaTimezone,
    httpStatusForSessionCode,
  } = logic;

  const logicSrc = read('api/_utils/attendanceSessionLogic.ts');
  const handlerSrc = read('api/_utils/attendanceSessionHandler.ts');
  const coreSrc = read('api/_utils/core.ts');
  const permsSrc = read('lib/permissions.ts');
  const migSrc = read('supabase/migrations/connect_phase_2_7b_attendance_sessions.sql');

  it('authorized-role matrix', () => {
    for (const r of [
      'SUPER_ADMIN',
      'ADMIN',
      'PASTOR',
      'ADMIN_STAFF',
      'SECRETARY',
      'ASST_SECRETARY',
      'FIRST_LADY',
    ]) {
      assert.equal(isAttendanceSessionManagerRole(r), true, r);
      assert.equal(ATTENDANCE_SESSION_MANAGER_ROLES.has(r), true, r);
    }
  });

  it('denied roles', () => {
    for (const r of [
      'MINISTRY_LEADER',
      'FINANCE',
      'WORSHIP_TEAM',
      'MEMBER',
      'PENDING',
      'YOUTH',
    ]) {
      assert.equal(isAttendanceSessionManagerRole(r), false, r);
      assert.equal(ATTENDANCE_SESSION_DENIED_ROLES.has(r), true, r);
    }
  });

  it('permission action registered (session.manage; checkin added in 2.7D.2)', () => {
    assert.ok(permsSrc.includes("'attendance.session.manage'"));
    assert.ok(permsSrc.includes("'attendance.checkin'"));
    assert.equal(permsSrc.includes("'child.checkin'"), false);
    assert.equal(permsSrc.includes("'child.checkout'"), false);
    assert.equal(permsSrc.includes("'attendance.override'"), false);
  });

  it('GET/create/open/close contracts + spoof rejection', () => {
    const spoof = parseCreateSessionBody({
      type: 'worship',
      title: 'Sunday',
      startsAt: '2026-09-14T14:00:00.000Z',
      status: 'open',
      created_by: 'x',
    });
    assert.equal(spoof.ok, false);
    assert.equal(spoof.code, 'spoof_rejected');

    const good = parseCreateSessionBody({
      type: 'worship',
      title: 'Sunday Worship',
      startsAt: '2026-09-14T14:00:00.000Z',
      endsAt: '2026-09-14T16:00:00.000Z',
    });
    assert.equal(good.ok, true);
    assert.equal(good.status, undefined);
    assert.equal(good.timezone, DEFAULT_ATTENDANCE_TIMEZONE);
  });

  it('invalid type', () => {
    const r = parseCreateSessionBody({
      type: 'party',
      title: 'X',
      startsAt: '2026-09-14T14:00:00.000Z',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_type');
  });

  it('invalid status injection blocked via spoof', () => {
    const r = parseCreateSessionBody({
      type: 'worship',
      title: 'X',
      startsAt: '2026-09-14T14:00:00.000Z',
      status: 'closed',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'spoof_rejected');
  });

  it('empty title', () => {
    const r = parseCreateSessionBody({
      type: 'worship',
      title: '   ',
      startsAt: '2026-09-14T14:00:00.000Z',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_title');
  });

  it('bad dates', () => {
    const r = parseCreateSessionBody({
      type: 'worship',
      title: 'X',
      startsAt: '2026-09-14T16:00:00.000Z',
      endsAt: '2026-09-14T14:00:00.000Z',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_dates');
  });

  it('event validation: type=event requires eventId', () => {
    const r = parseCreateSessionBody({
      type: 'event',
      title: 'Cookout',
      startsAt: '2026-09-14T14:00:00.000Z',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'event_required');

    const ok = parseCreateSessionBody({
      type: 'event',
      title: 'Cookout',
      startsAt: '2026-09-14T14:00:00.000Z',
      eventId: '11111111-1111-4111-8111-111111111111',
    });
    assert.equal(ok.ok, true);
  });

  it('serve validation: opportunity optional', () => {
    const ok = parseCreateSessionBody({
      type: 'serve',
      title: 'Usher Team Arrival',
      startsAt: '2026-09-14T12:00:00.000Z',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.serveOpportunityId, null);
  });

  it('open / close / update parse', () => {
    const sid = '22222222-2222-4222-8222-222222222222';
    const open = parsePatchBody({ action: 'open', sessionId: sid });
    assert.equal(open.ok, true);
    assert.equal(open.action, 'open');

    const close = parsePatchBody({ action: 'close', sessionId: sid });
    assert.equal(close.ok, true);
    assert.equal(close.action, 'close');

    const update = parsePatchBody({ action: 'update', sessionId: sid, title: 'Renamed' });
    assert.equal(update.ok, true);
    assert.equal(update.action, 'update');
    assert.equal(update.title, 'Renamed');
  });

  it('idempotent open/close codes mapped', () => {
    assert.equal(httpStatusForSessionCode('session_already_closed'), 409);
    assert.equal(httpStatusForSessionCode('session_not_open'), 409);
    assert.equal(httpStatusForSessionCode('session_not_draft'), 409);
    assert.equal(httpStatusForSessionCode('delete_not_allowed'), 405);
  });

  it('safe DTO omits actor UUIDs', () => {
    const dto = toSessionDto({
      id: '33333333-3333-4333-8333-333333333333',
      type: 'worship',
      title: 'Sunday',
      starts_at: '2026-09-14T14:00:00.000Z',
      ends_at: null,
      status: 'draft',
      timezone: 'Africa/Kampala',
      visitor_count: 0,
      event_id: null,
      serve_opportunity_id: null,
      opened_at: null,
      closed_at: null,
      created_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      opened_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      closed_by: null,
    });
    const safe = sanitizeSessionDto(dto);
    assert.equal(safe.createdBy, undefined);
    assert.equal(safe.openedBy, undefined);
    assert.equal(safe.closedBy, undefined);
    assert.equal('created_by' in safe, false);
    assert.ok(safe.id);
    assert.equal(safe.visitorCount, 0);
  });

  it('timezone IANA validation', () => {
    assert.equal(isValidIanaTimezone('Africa/Kampala'), true);
    assert.equal(isValidIanaTimezone('Eastern Standard Time'), false);
    assert.equal(isValidIanaTimezone(''), false);
  });

  it('types/status sets', () => {
    assert.ok(ATTENDANCE_SESSION_TYPES.has('kids'));
    assert.ok(ATTENDANCE_SESSION_STATUSES.has('draft'));
    assert.equal(ATTENDANCE_SESSION_STATUSES.has('cancelled'), false);
  });

  it('handler: route mount, cache headers, audit, no DELETE, no person attendance', () => {
    assert.ok(coreSrc.includes("case 'attendance'"));
    assert.ok(coreSrc.includes("attendanceSub || '') === 'sessions'"));
    assert.ok(coreSrc.includes('handleAttendanceSessions'));
    assert.ok(handlerSrc.includes("private, no-store"));
    assert.ok(handlerSrc.includes('no-cache'));
    assert.ok(/Cache-Control/.test(handlerSrc));
    assert.ok(/Pragma/.test(handlerSrc));
    assert.ok(handlerSrc.includes('attendance_session.create'));
    assert.ok(handlerSrc.includes('attendance_session.open'));
    assert.ok(handlerSrc.includes('attendance_session.close'));
    assert.ok(handlerSrc.includes('attendance_session.update'));
    assert.ok(handlerSrc.includes('delete_not_allowed'));
    assert.ok(handlerSrc.includes('alreadyOpen'));
    assert.ok(handlerSrc.includes('alreadyClosed'));
    assert.ok(handlerSrc.includes('session_already_closed'));
    assert.ok(handlerSrc.includes('session_not_open'));
    assert.ok(handlerSrc.includes('audit failed (non-fatal)'));
    assert.equal(/\.from\(['\"]attendance['\"]\)/.test(handlerSrc), false);
    assert.equal(/attendance_records/.test(handlerSrc), false);
    assert.equal(/child_custody/.test(handlerSrc), false);
    assert.equal(/check.?in/i.test(handlerSrc) && /insert.*attendance/i.test(handlerSrc), false);
  });

  it('actor fields server-derived (created_by from auth)', () => {
    assert.ok(handlerSrc.includes('created_by: auth.user'));
    assert.ok(handlerSrc.includes('opened_by: auth.user'));
    assert.ok(handlerSrc.includes('closed_by: auth.user'));
    assert.ok(handlerSrc.includes("status: 'draft'"));
    assert.ok(handlerSrc.includes('visitor_count: 0'));
  });

  it('no raw DB errors to client', () => {
    assert.ok(handlerSrc.includes("error: 'Attendance session request failed.'"));
    assert.equal(/error\.message \|\| 'Attendance/.test(handlerSrc), false);
  });

  it('event/serve existence checks in handler', () => {
    assert.ok(handlerSrc.includes(".from('events')"));
    assert.ok(handlerSrc.includes(".from('serve_opportunities')"));
    assert.ok(handlerSrc.includes('event_not_found'));
    assert.ok(handlerSrc.includes('serve_opportunity_not_found'));
  });

  it('card-scanner / kids / resolver isolation', () => {
    assert.equal(handlerSrc.includes('cardResolver'), false);
    assert.equal(handlerSrc.includes('KidsKiosk'), false);
    assert.equal(handlerSrc.includes('kiosk-lookup'), false);
    const resolver = read('api/_utils/cardResolverHandler.ts');
    assert.equal(resolver.includes('attendance_sessions'), false);
    const kids = read('pages/events/KidsCheckIn.tsx');
    assert.equal(kids.includes('attendance_sessions'), false);
  });

  it('Connect SHA unchanged + no Connect files', () => {
    const sha = execSync('git rev-parse HEAD', { cwd: connectRoot, encoding: 'utf8' }).trim();
    assert.equal(sha, '5d61a88cc244b68231f59bbaf8b065ca959a17c6');
    assert.equal(
      existsSync(join(connectRoot, 'api/_utils/attendanceSessionHandler.ts')),
      false
    );
  });

  it('migration has no person check-in tables', () => {
    assert.equal(/CREATE TABLE.*attendance_records/i.test(migSrc), false);
    assert.equal(/CREATE TABLE.*child_custody/i.test(migSrc), false);
  });

  it('detectSpoofFields utility', () => {
    assert.deepEqual(detectSpoofFields({ visitorCount: 3 }).sort(), ['visitorCount']);
  });
});
