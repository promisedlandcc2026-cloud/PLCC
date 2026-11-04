/**
 * Phase 2.7D.3B — Manual Member Check-In UI source contracts (A–AR).
 * Run from Vault: node --import tsx --test scripts/test-manual-attendance-ui.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const connectRoot = join(root, '..', 'awc-connect-main');
const require = createRequire(import.meta.url);

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function listSqlFiles() {
  const mig = join(root, 'supabase', 'migrations');
  if (!existsSync(mig)) return [];
  return readdirSync(mig).filter((f) => f.endsWith('.sql'));
}

async function loadUi() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import('../lib/attendanceRecordsUi.ts');
}

async function loadTypes() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import('../lib/attendanceRecordsTypes.ts');
}

describe('manual attendance check-in UI A–AR', async () => {
  const ui = await loadUi();
  const types = await loadTypes();

  const {
    ATTENDANCE_CHECKIN_UI_ROLES,
    ATTENDANCE_CHECKIN_UI_DENIED_ROLES,
    MANUAL_CHECKIN_UI_FORBIDDEN,
    isValidSessionIdParam,
    sourceLabel,
    formatCheckedInAt,
    emptyRosterCopy,
    draftSessionMessage,
    closedSessionMessage,
    truncatedRosterMessage,
    searchHintMessage,
    searchMinMet,
    mapCheckinApiError,
    mapRecordsApiError,
    mapPeopleSearchError,
    successNewCheckinMessage,
    successAlreadyCheckedInMessage,
    attendancePathForSession,
    mapPeopleRowToSearchHit,
  } = ui;

  const {
    ATTENDANCE_SESSION_ATTENDANCE_ROUTE,
    ATTENDANCE_RECORDS_API,
    ATTENDANCE_CHECKIN_API,
    PEOPLE_SEARCH_API,
    ATTENDANCE_SEARCH_MIN_CHARS,
    ATTENDANCE_SEARCH_DEBOUNCE_MS,
    CHURCH_TIMEZONE,
  } = types;

  const pageSrc = read('pages/attendance/AttendanceSessionAttendance.tsx');
  const rosterSrc = read('components/attendance/AttendanceRoster.tsx');
  const searchSrc = read('components/attendance/AttendanceMemberSearch.tsx');
  const summarySrc = read('components/attendance/AttendanceSummary.tsx');
  const cardSrc = read('components/attendance/AttendanceSessionCard.tsx');
  const clientSrc = read('lib/attendanceRecordsClient.ts');
  const uiSrc = read('lib/attendanceRecordsUi.ts');
  const typesSrc = read('lib/attendanceRecordsTypes.ts');
  const appSrc = read('App.tsx');
  const shellSrc = read('components/Layout/AppShell.tsx');
  const simpleNavSrc = read('lib/simpleNav.tsx');
  const navSrc = read('lib/navBySection.tsx');
  const permSrc = read('lib/permissions.ts');
  const sessionsPageSrc = read('pages/attendance/AttendanceSessions.tsx');

  const allUi =
    pageSrc +
    rosterSrc +
    searchSrc +
    summarySrc +
    cardSrc +
    clientSrc +
    uiSrc +
    typesSrc;

  it('A: route', () => {
    assert.equal(
      ATTENDANCE_SESSION_ATTENDANCE_ROUTE,
      '/attendance/sessions/:sessionId/attendance'
    );
    assert.equal(
      appSrc.includes('path="/attendance/sessions/:sessionId/attendance"'),
      true
    );
    assert.equal(appSrc.includes('AttendanceSessionAttendancePage'), true);
    assert.equal(
      existsSync(join(root, 'pages/attendance/AttendanceSessionAttendance.tsx')),
      true
    );
  });

  it('B: ProtectedRoute + AppShell', () => {
    assert.equal(appSrc.includes('<AppShell><AttendanceSessionAttendancePage'), true);
    assert.match(
      appSrc,
      /ProtectedRoute[\s\S]{0,80}AttendanceSessionAttendancePage|AttendanceSessionAttendancePage[\s\S]{0,40}ProtectedRoute/
    );
  });

  it('C: attendance.checkin permission', () => {
    assert.equal(pageSrc.includes("canPerform(userRole as Role, 'attendance.checkin')"), true);
    assert.equal(pageSrc.includes('AccessDenied'), true);
    assert.equal(permSrc.includes("'attendance.checkin'"), true);
  });

  it('D: denied roles', () => {
    for (const r of [
      'FINANCE',
      'WORSHIP_TEAM',
      'MEMBER',
      'PENDING',
      'YOUTH',
    ]) {
      assert.equal(ATTENDANCE_CHECKIN_UI_DENIED_ROLES.includes(r), true, r);
    }
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
      assert.equal(ATTENDANCE_CHECKIN_UI_ROLES.includes(r), true, r);
    }
  });

  it('E: session param validation', () => {
    assert.equal(isValidSessionIdParam('not-a-uuid'), false);
    assert.equal(isValidSessionIdParam(''), false);
    assert.equal(
      isValidSessionIdParam('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      true
    );
    assert.equal(pageSrc.includes('isValidSessionIdParam'), true);
    assert.equal(pageSrc.includes('Attendance session not found.'), true);
  });

  it('F: records client', () => {
    assert.equal(clientSrc.includes('ATTENDANCE_RECORDS_API'), true);
    assert.equal(clientSrc.includes('fetchAttendanceRecords'), true);
    assert.equal(ATTENDANCE_RECORDS_API.includes('subResource=records'), true);
    assert.equal(clientSrc.includes("method: 'GET'"), true);
  });

  it('G: no direct Supabase', () => {
    assert.equal(/from\(['\"]attendance_records['\"]\)|createClient|supabase\.from/.test(clientSrc + pageSrc), false);
    assert.equal(clientSrc.includes('ATTENDANCE_RECORDS_API'), true);
    assert.equal(clientSrc.includes('apiFetch'), true);
    assert.equal(typesSrc.includes('/api/vault?resource=attendance'), true);
  });

  it('H: View Attendance / Check in members action', () => {
    assert.equal(
      cardSrc.includes('View Attendance') || cardSrc.includes('Check in members'),
      true
    );
    assert.equal(cardSrc.includes('attendancePathForSession'), true);
    assert.equal(cardSrc.includes('>Check In<'), false);
    assert.equal(cardSrc.includes('Take Attendance'), false);
    assert.equal(cardSrc.includes('Scan Card'), false);
  });

  it('I: Attendance nav active', () => {
    assert.equal(shellSrc.includes("pathname.startsWith('/attendance')"), true);
    assert.equal(simpleNavSrc.includes("path: '/attendance/sessions'"), true);
    assert.equal(
      /label:\s*'Sessions'[\s\S]{0,120}path:\s*'\/attendance\/sessions'/.test(simpleNavSrc + navSrc) ||
        simpleNavSrc.includes("path: '/attendance/sessions'"),
      true
    );
    // No sixth top-level attendance destination
    assert.equal(simpleNavSrc.includes('/attendance/sessions/:'), false);
    assert.equal(sessionsPageSrc.includes('Create Session'), true);
  });

  it('J: safe roster DTO', () => {
    assert.equal(typesSrc.includes('AttendanceRosterRow'), true);
    assert.equal(typesSrc.includes('displayName'), true);
    assert.equal(typesSrc.includes('checkedInAt'), true);
    assert.equal(typesSrc.includes('avatarUrl'), true);
    assert.equal(typesSrc.includes('source'), true);
  });

  it('K: no roster IDs', () => {
    assert.equal(/memberId|attendanceId|checkedInBy/.test(typesSrc.match(/AttendanceRosterRow[\s\S]*?};/)?.[0] || ''), false);
    assert.equal(rosterSrc.includes('memberId'), false);
    assert.equal(rosterSrc.includes('attendanceId'), false);
    assert.equal(rosterSrc.includes('checkedInBy'), false);
  });

  it('L: counts', () => {
    assert.equal(summarySrc.includes('Members'), true);
    assert.equal(summarySrc.includes('Visitors'), true);
    assert.equal(summarySrc.includes('Total'), true);
    assert.equal(pageSrc.includes('memberCount'), true);
    assert.equal(pageSrc.includes('visitorCount'), true);
    assert.equal(pageSrc.includes('totalCount'), true);
  });

  it('M: visitor display only', () => {
    const surface = pageSrc + rosterSrc + searchSrc + summarySrc + cardSrc + clientSrc;
    assert.equal(/Add Visitor|Remove Visitor|Edit Visitors/.test(surface), false);
    assert.equal(summarySrc.includes('visitorCount'), true);
  });

  it('N: open enables search', () => {
    assert.equal(pageSrc.includes('isOpenStatus'), true);
    assert.equal(pageSrc.includes('AttendanceMemberSearch'), true);
    assert.equal(searchSrc.includes('Member Search'), true);
  });

  it('O: draft disables check-in', () => {
    assert.equal(pageSrc.includes('draftSessionMessage'), true);
    assert.equal(draftSessionMessage().includes('Open this session before checking in'), true);
    assert.equal(pageSrc.includes('{open &&'), true);
  });

  it('P: closed read-only', () => {
    assert.equal(pageSrc.includes('closedSessionMessage'), true);
    assert.equal(closedSessionMessage().includes('closed'), true);
    assert.equal(closedSessionMessage().includes('This attendance session is closed'), true);
  });

  it('Q: People API reuse', () => {
    assert.equal(PEOPLE_SEARCH_API, '/api/vault?resource=people');
    assert.equal(clientSrc.includes('searchPeopleForAttendance'), true);
    assert.equal(clientSrc.includes('PEOPLE_SEARCH_API'), true);
    assert.equal(clientSrc.includes('encodeURIComponent(q)'), true);
    assert.equal(typesSrc.includes('resource=people'), true);
  });

  it('R: search minimum', () => {
    assert.equal(ATTENDANCE_SEARCH_MIN_CHARS, 2);
    assert.equal(searchMinMet('a'), false);
    assert.equal(searchMinMet('ab'), true);
    assert.equal(searchHintMessage(), 'Search by member name.');
    assert.equal(searchSrc.includes('searchMinMet') || searchSrc.includes('ATTENDANCE_SEARCH_MIN_CHARS'), true);
  });

  it('S: debounce/stale guard', () => {
    assert.ok(ATTENDANCE_SEARCH_DEBOUNCE_MS >= 250 && ATTENDANCE_SEARCH_DEBOUNCE_MS <= 350);
    assert.equal(searchSrc.includes('requestSeq'), true);
    assert.equal(searchSrc.includes('ATTENDANCE_SEARCH_DEBOUNCE_MS'), true);
  });

  it('T: canonical member id internal', () => {
    assert.equal(typesSrc.includes('memberId: string'), true);
    assert.equal(clientSrc.includes('memberId: input.memberId'), true);
    assert.equal(searchSrc.includes('hit.memberId'), true);
    // Never render memberId as visible children text
    assert.equal(/>\s*\{hit\.memberId\}\s*</.test(searchSrc), false);
    assert.equal(searchSrc.includes('displayName'), true);
  });

  it('U: no PII display', () => {
    assert.equal(/email|phone|birthday|address|DOB/i.test(searchSrc + rosterSrc), false);
  });

  it('V: manual POST exact body', () => {
    assert.equal(clientSrc.includes("mode: 'manual_staff'"), true);
    assert.equal(clientSrc.includes('sessionId: input.sessionId'), true);
    assert.equal(clientSrc.includes('memberId: input.memberId'), true);
    assert.equal(ATTENDANCE_CHECKIN_API.includes('subResource=check-in'), true);
  });

  it('W: no source/actor/timestamp client fields', () => {
    const postBody = clientSrc.match(/JSON\.stringify\(\{[\s\S]*?\}\)/)?.[0] || '';
    assert.equal(/source:|actor:|timestamp:|status:|displayName:|card/.test(postBody), false);
    assert.equal(postBody.includes("mode: 'manual_staff'"), true);
  });

  it('X: in-flight guard', () => {
    assert.equal(pageSrc.includes('checkingInMemberId'), true);
    assert.equal(searchSrc.includes('checkingInMemberId'), true);
    assert.equal(searchSrc.includes('Checking in'), true);
  });

  it('Y: new success', () => {
    assert.equal(successNewCheckinMessage('Ada'), 'Ada checked in.');
    assert.equal(pageSrc.includes('successNewCheckinMessage'), true);
    assert.equal(pageSrc.includes('role="status"'), true);
  });

  it('Z: duplicate success', () => {
    assert.equal(
      successAlreadyCheckedInMessage('Ada'),
      'Ada is already checked in.'
    );
    assert.equal(pageSrc.includes('successAlreadyCheckedInMessage'), true);
  });

  it('AA: server displayName authority', () => {
    assert.equal(pageSrc.includes('result.displayName'), true);
    assert.equal(clientSrc.includes('asCheckinResult'), true);
  });

  it('AB: roster refresh', () => {
    assert.equal(pageSrc.includes('load({ soft: true })'), true);
    assert.equal(pageSrc.includes('Checked-In Members') || rosterSrc.includes('Checked-In Members'), true);
  });

  it('AC: source labels', () => {
    assert.equal(sourceLabel('manual_staff'), 'Manual');
    assert.equal(sourceLabel('digital_card'), 'Digital Card');
    assert.equal(rosterSrc.includes('sourceLabel'), true);
  });

  it('AD: church timezone', () => {
    assert.equal(CHURCH_TIMEZONE, 'Africa/Kampala');
    assert.equal(uiSrc.includes('Africa/Kampala'), true);
    assert.equal(rosterSrc.includes('formatCheckedInAt'), true);
    const sample = formatCheckedInAt('2026-03-15T15:00:00.000Z', 'Africa/Kampala');
    assert.ok(sample.length > 3);
  });

  it('AE: empty states', () => {
    assert.equal(emptyRosterCopy('open'), 'No members have been checked in yet.');
    assert.equal(emptyRosterCopy('draft'), 'No attendance has been recorded.');
    assert.equal(
      emptyRosterCopy('closed'),
      'No member attendance was recorded for this session.'
    );
  });

  it('AF: truncated copy', () => {
    assert.equal(
      truncatedRosterMessage(),
      'Showing the 200 most recent member check-ins.'
    );
    assert.equal(rosterSrc.includes('truncatedRosterMessage'), true);
  });

  it('AG: Refresh', () => {
    assert.equal(pageSrc.includes('aria-label="Refresh attendance"'), true);
    assert.equal(pageSrc.includes('RefreshCw'), true);
  });

  it('AH: error mapping', () => {
    assert.equal(
      mapRecordsApiError({ code: 'session_not_found' }),
      'Attendance session not found.'
    );
    assert.equal(
      mapCheckinApiError({ code: 'session_not_open' }),
      'Open this session before checking in members.'
    );
    assert.equal(
      mapCheckinApiError({ code: 'session_closed' }),
      'This attendance session is closed.'
    );
    assert.equal(
      mapCheckinApiError({ code: 'session_type_not_allowed' }),
      'This session does not support member attendance check-in.'
    );
    assert.equal(
      mapCheckinApiError({ code: 'member_not_found' }),
      'This member could not be checked in.'
    );
    assert.equal(
      mapCheckinApiError({ code: 'checkin_rate_limited' }),
      'Too many check-in attempts. Please wait a moment and try again.'
    );
    assert.equal(
      mapCheckinApiError({ code: 'attendance_unavailable' }),
      'Attendance is temporarily unavailable. Please try again.'
    );
    assert.equal(mapPeopleSearchError(), 'Member search is temporarily unavailable.');
  });

  it('AI: digital session scanner wired (Phase 2.7D.5A)', () => {
    assert.equal(pageSrc.includes('AttendanceSessionScanner'), true);
    assert.equal(
      pageSrc.includes('Scan membership cards') || pageSrc.includes('Scan Cards'),
      true
    );
    assert.equal(clientSrc.includes('checkInMemberDigitalCard'), true);
    assert.equal(clientSrc.includes("mode: 'digital_card'"), true);
    assert.equal(/card-resolver/.test(pageSrc), false);
    assert.equal(existsSync(join(root, 'components/attendance/AttendanceSessionScanner.tsx')), true);
    const scannerSrc = read('components/attendance/AttendanceSessionScanner.tsx');
    assert.equal(scannerSrc.includes('CardScannerCamera'), true);
    assert.equal(scannerSrc.includes('checkInMemberDigitalCard'), true);
    assert.equal(scannerSrc.includes('Already Checked In'), true);
    assert.equal(scannerSrc.includes('CARD NOT RECOGNIZED'), true);
    assert.equal(/kids-kiosk|KidsKiosk|public\.attendance|event_checkins/.test(scannerSrc), false);
  });

  it('AJ: no visitor mutation', () => {
    const surface = pageSrc + rosterSrc + searchSrc + summarySrc + cardSrc + clientSrc;
    assert.equal(/Add Visitor|Remove Visitor|Edit Visitors/.test(surface), false);
  });

  it('AK: no correction/delete', () => {
    for (const phrase of MANUAL_CHECKIN_UI_FORBIDDEN) {
      if (['Open Session', 'Close Session', 'QR'].includes(phrase)) continue;
      assert.equal(pageSrc.includes(phrase) || rosterSrc.includes(phrase), false, phrase);
    }
    assert.equal(/Mark Absent|Checkout|Edit Time|Change Source|Undo/.test(pageSrc + rosterSrc), false);
  });

  it('AL: no lifecycle mutation', () => {
    assert.equal(pageSrc.includes('Open Session'), false);
    assert.equal(pageSrc.includes('Close Session'), false);
    assert.equal(pageSrc.includes('openAttendanceSession'), false);
    assert.equal(pageSrc.includes('closeAttendanceSession'), false);
  });

  it('AM: no Kids integration', () => {
    assert.equal(/kids-checkin|KidsCheckIn|KidsKiosk|security_code|guest_name/.test(allUi), false);
  });

  it('AN: no storage', () => {
    assert.equal(/localStorage|sessionStorage|indexedDB/i.test(pageSrc + searchSrc + clientSrc), false);
  });

  it('AO: no sensitive logs', () => {
    assert.equal(/console\.(log|debug|info|warn)\(/.test(pageSrc + searchSrc + clientSrc + rosterSrc), false);
  });

  it('AP: accessibility', () => {
    assert.equal(pageSrc.includes('<h1'), true);
    assert.equal(searchSrc.includes('<label'), true);
    assert.equal(pageSrc.includes('role="status"'), true);
    assert.equal(pageSrc.includes('role="alert"'), true);
    assert.equal(pageSrc.includes('Loading attendance'), true);
    assert.equal(searchSrc.includes('focus-visible') || pageSrc.includes('focus-visible'), true);
  });

  it('AQ: mobile targets', () => {
    assert.equal(pageSrc.includes('max-w-4xl'), true);
    assert.equal(searchSrc.includes('min-h-[48px]'), true);
    assert.equal(cardSrc.includes('min-h-[48px]'), true);
    assert.equal(pageSrc.includes('min-h-[48px]'), true);
  });

  it('AR: Connect isolation', () => {
    assert.equal(existsSync(join(connectRoot, 'pages/attendance/AttendanceSessionAttendance.tsx')), false);
    assert.equal(existsSync(join(connectRoot, 'lib/attendanceRecordsClient.ts')), false);
    let sha = '';
    try {
      sha = execSync('git rev-parse HEAD', { cwd: connectRoot, encoding: 'utf8' }).trim();
    } catch {
      sha = '';
    }
    if (sha) {
      assert.equal(sha, '5d61a88cc244b68231f59bbaf8b065ca959a17c6');
    }
  });

  it('people search maps canonical id internally', () => {
    const hit = mapPeopleRowToSearchHit({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      first_name: 'Temp',
      last_name: 'Member',
      avatar_url: null,
      status: 'Active',
      email: 'secret@example.com',
    });
    assert.equal(hit?.memberId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    assert.equal(hit?.displayName, 'Temp Member');
  });

  it('path helper', () => {
    assert.equal(
      attendancePathForSession('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      '/attendance/sessions/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/attendance'
    );
  });

  it('no SQL added this phase', () => {
    const sql = listSqlFiles().filter((f) => /2_7d3b|manual.?check.?in.?ui/i.test(f));
    assert.equal(sql.length, 0);
  });

  it('security scan — no secrets in new UI files', () => {
    for (const rel of [
      'lib/attendanceRecordsClient.ts',
      'lib/attendanceRecordsUi.ts',
      'lib/attendanceRecordsTypes.ts',
      'pages/attendance/AttendanceSessionAttendance.tsx',
      'components/attendance/AttendanceRoster.tsx',
      'components/attendance/AttendanceMemberSearch.tsx',
      'components/attendance/AttendanceSummary.tsx',
    ]) {
      const src = read(rel);
      assert.equal(/eyJ[A-Za-z0-9_-]{20,}\.|service_role|sk_live|sb_secret/i.test(src), false, rel);
    }
  });
});
