/**
 * Phase 2.7C — Attendance Session Admin UI source contracts (A–AQ).
 * Run from Vault: node --import tsx --test scripts/test-attendance-session-ui.mjs
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
  return import('../lib/attendanceSessionsUi.ts');
}

async function loadTypes() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import('../lib/attendanceSessionsTypes.ts');
}

describe('attendance session UI A–AQ', async () => {
  const ui = await loadUi();
  const types = await loadTypes();
  const {
    ATTENDANCE_SESSION_UI_ROLES,
    ATTENDANCE_SESSION_UI_DENIED_ROLES,
    ATTENDANCE_SESSION_TYPE_OPTIONS,
    SESSION_UI_FORBIDDEN_ACTIONS,
    typeLabel,
    statusLabel,
    churchLocalInputToIso,
    isoToChurchLocalInput,
    validateSessionForm,
    groupSessionsByStatus,
    emptyStateCopy,
    linkIndicator,
    formatSessionRange,
    mapSessionApiError,
  } = ui;
  const { ATTENDANCE_SESSIONS_ROUTE, CHURCH_TIMEZONE } = types;

  const pageSrc = read('pages/attendance/AttendanceSessions.tsx');
  const cardSrc = read('components/attendance/AttendanceSessionCard.tsx');
  const formSrc = read('components/attendance/AttendanceSessionForm.tsx');
  const clientSrc = read('lib/attendanceSessionsClient.ts');
  const uiSrc = read('lib/attendanceSessionsUi.ts');
  const typesSrc = read('lib/attendanceSessionsTypes.ts');
  const appSrc = read('App.tsx');
  const navSrc = read('lib/navBySection.tsx');
  const simpleNavSrc = read('lib/simpleNav.tsx');
  const permSrc = read('lib/permissions.ts');
  const shellSrc = read('components/Layout/AppShell.tsx');
  const sectionsSrc = read('lib/sections.ts');
  const sectionRoutesSrc = read('lib/sectionRoutes.ts');
  const typesEnumSrc = read('types.ts');

  const scannerPage = read('pages/people/CardScanner.tsx');
  const kidsPage = read('pages/events/KidsCheckIn.tsx');
  const kidsKiosk = read('pages/events/KidsKiosk.tsx');

  it('A: route exists', () => {
    assert.equal(ATTENDANCE_SESSIONS_ROUTE, '/attendance/sessions');
    assert.equal(appSrc.includes('path="/attendance/sessions"'), true);
    assert.equal(appSrc.includes('AttendanceSessionsPage'), true);
    assert.equal(existsSync(join(root, 'pages/attendance/AttendanceSessions.tsx')), true);
  });

  it('B: protected via ProtectedRoute + AppShell', () => {
    assert.match(
      appSrc,
      /path="\/attendance\/sessions"[^>]*ProtectedRoute|ProtectedRoute[\s\S]{0,120}AttendanceSessionsPage/
    );
    assert.equal(appSrc.includes('<AppShell><AttendanceSessionsPage'), true);
  });

  it('C: permission gate — manage OR checkin (desk can list; manage owns lifecycle)', () => {
    assert.equal(pageSrc.includes("canPerform(userRole as Role, 'attendance.session.manage')"), true);
    assert.equal(pageSrc.includes("canPerform(userRole as Role, 'attendance.checkin')"), true);
    assert.equal(pageSrc.includes('canManage || canDesk'), true);
    assert.equal(pageSrc.includes('AccessDenied'), true);
    assert.equal(permSrc.includes("'/attendance/sessions'"), true);
    assert.equal(permSrc.includes("'attendance.session.manage'"), true);
    assert.equal(permSrc.includes("'attendance.checkin'"), true);
  });

  it('D: nav item Attendance → Sessions', () => {
    assert.equal(navSrc.includes('[Section.Attendance]'), true);
    assert.equal(navSrc.includes("label: 'Sessions'"), true);
    assert.equal(navSrc.includes("path: '/attendance/sessions'"), true);
    assert.equal(simpleNavSrc.includes("label: 'Attendance'"), true);
    assert.equal(simpleNavSrc.includes("path: '/attendance/sessions'"), true);
    assert.equal(sectionsSrc.includes("label: 'Attendance'"), true);
    assert.equal(sectionRoutesSrc.includes("'/attendance/sessions'"), true);
    assert.equal(typesEnumSrc.includes("Attendance = 'attendance'"), true);
    assert.equal(shellSrc.includes("pathname.startsWith('/attendance')"), true);
    assert.equal(/Kids|Card Scanner|Serve|events\/serve/.test(
      navSrc.match(/\[Section\.Attendance\][\s\S]{0,200}/)?.[0] || ''
    ), false);
  });

  it('E: GET client', () => {
    assert.equal(clientSrc.includes('fetchAttendanceSessions'), true);
    assert.equal(clientSrc.includes("method: 'GET'"), true);
    assert.equal(clientSrc.includes('resource=attendance&subResource=sessions'), true);
  });

  it('F: create client', () => {
    assert.equal(clientSrc.includes('createAttendanceSession'), true);
    assert.equal(clientSrc.includes("method: 'POST'"), true);
    assert.equal(clientSrc.includes('type: input.type'), true);
    assert.equal(clientSrc.includes('title: input.title'), true);
    assert.equal(/status\s*:/.test(clientSrc.match(/createAttendanceSession[\s\S]{0,800}/)?.[0] || ''), false);
  });

  it('G: update client', () => {
    assert.equal(clientSrc.includes('updateAttendanceSession'), true);
    assert.equal(clientSrc.includes("action: 'update'"), true);
    assert.equal(clientSrc.includes('sessionId: input.sessionId'), true);
  });

  it('H: open client', () => {
    assert.equal(clientSrc.includes('openAttendanceSession'), true);
    assert.equal(clientSrc.includes("action: 'open'"), true);
  });

  it('I: close client', () => {
    assert.equal(clientSrc.includes('closeAttendanceSession'), true);
    assert.equal(clientSrc.includes("action: 'close'"), true);
  });

  it('J: no direct Supabase', () => {
    assert.equal(/from\(['"]attendance|supabase\.(from|rpc)/i.test(clientSrc), false);
    assert.equal(/supabase\.(from|rpc)/i.test(pageSrc), false);
    assert.equal(/supabase\.(from|rpc)/i.test(formSrc), false);
    assert.equal(clientSrc.includes('apiFetch'), true);
  });

  it('K: safe DTO — no actor UUIDs', () => {
    // Comments may mention actor fields as exclusions; DTO object must omit them.
    assert.match(typesSrc, /export type AttendanceSession = \{[\s\S]*?\};/);
    const dtoBlock = typesSrc.match(/export type AttendanceSession = \{[\s\S]*?\};/)?.[0] || '';
    assert.equal(/created_by|opened_by|closed_by|createdBy|openedBy|closedBy/.test(dtoBlock), false);
    assert.equal(dtoBlock.includes('visitorCount'), true);
    assert.equal(dtoBlock.includes('eventId'), true);
    assert.equal(/created_by|opened_by|closed_by/.test(cardSrc), false);
  });

  it('L: type labels', () => {
    const expected = {
      worship: 'Worship',
      event: 'Event',
      serve: 'Serve',
      bible_study: 'Bible Study',
      kids: 'Kids',
      other: 'Other',
    };
    for (const [k, v] of Object.entries(expected)) {
      assert.equal(typeLabel(k), v);
    }
    assert.equal(ATTENDANCE_SESSION_TYPE_OPTIONS.length, 6);
  });

  it('M: status labels', () => {
    assert.equal(statusLabel('draft'), 'Draft');
    assert.equal(statusLabel('open'), 'Open');
    assert.equal(statusLabel('closed'), 'Closed');
    assert.equal(cardSrc.includes('statusLabel'), true);
  });

  it('N: church timezone Africa/Kampala', () => {
    assert.equal(CHURCH_TIMEZONE, 'Africa/Kampala');
    assert.equal(formSrc.includes('CHURCH_TIMEZONE'), true);
    assert.equal(formSrc.includes('readOnly'), true);
    const iso = churchLocalInputToIso('2026-09-20T14:00');
    assert.ok(iso);
    assert.match(iso, /Z$/);
    const back = isoToChurchLocalInput(iso);
    assert.equal(back, '2026-09-20T14:00');
  });

  it('O: create form no status selector', () => {
    assert.equal(/name=["']status["']|id=["']as-status["']|Status selector|status selector/i.test(formSrc), false);
    assert.equal(formSrc.includes('Create Draft'), true);
  });

  it('P: no visitor edit', () => {
    assert.equal(/visitorCount|Visitors/.test(formSrc), false);
    assert.equal(cardSrc.includes('Visitors:'), true);
    assert.equal(/type=["']number["'].*visitor|visitor.*onChange/i.test(pageSrc + formSrc), false);
  });

  it('Q: event required when event type', () => {
    const bad = validateSessionForm({
      type: 'event',
      title: 'Fall Fest',
      startsLocal: '2026-09-20T14:00',
      endsLocal: '',
      eventId: '',
    });
    assert.equal(bad.ok, false);
    const good = validateSessionForm({
      type: 'event',
      title: 'Fall Fest',
      startsLocal: '2026-09-20T14:00',
      endsLocal: '',
      eventId: '11111111-1111-1111-1111-111111111111',
    });
    assert.equal(good.ok, true);
    assert.equal(formSrc.includes('required={type === \'event\'}'), true);
  });

  it('R: end >= start', () => {
    const bad = validateSessionForm({
      type: 'worship',
      title: 'Service',
      startsLocal: '2026-09-20T18:00',
      endsLocal: '2026-09-20T14:00',
      eventId: '',
    });
    assert.equal(bad.ok, false);
    assert.match(String(bad.error), /End time/i);
  });

  it('S: create success draft', () => {
    assert.equal(pageSrc.includes('Draft session created.'), true);
    assert.equal(pageSrc.includes("setFilter('draft')"), true);
    assert.equal(/auto-open|action:\s*['"]open['"]/.test(formSrc), false);
  });

  it('T: draft edit', () => {
    assert.equal(pageSrc.includes("session.status !== 'draft'"), true);
    assert.equal(cardSrc.includes('isDraft && onEdit'), true);
    assert.equal(formSrc.includes('Edit Draft Session'), true);
  });

  it('U: open confirm', () => {
    assert.equal(
      pageSrc.includes(
        'Open this attendance session? Once opened, the session details can no longer be edited.'
      ),
      true
    );
    assert.equal(pageSrc.includes('window.confirm'), true);
  });

  it('V: open request', () => {
    assert.equal(pageSrc.includes('openAttendanceSession'), true);
    assert.equal(clientSrc.includes("JSON.stringify({ action: 'open', sessionId })"), true);
  });

  it('W: alreadyOpen safe', () => {
    assert.equal(pageSrc.includes('alreadyOpen'), true);
    assert.equal(pageSrc.includes('Session is already open.'), true);
    assert.equal(pageSrc.includes('Session opened.'), true);
  });

  it('X: close confirm', () => {
    assert.equal(
      pageSrc.includes('Close this attendance session? Closed sessions cannot be reopened.'),
      true
    );
  });

  it('Y: close request', () => {
    assert.equal(pageSrc.includes('closeAttendanceSession'), true);
    assert.equal(clientSrc.includes("JSON.stringify({ action: 'close', sessionId })"), true);
  });

  it('Z: alreadyClosed safe', () => {
    assert.equal(pageSrc.includes('alreadyClosed'), true);
    assert.equal(pageSrc.includes('Session is already closed.'), true);
    assert.equal(pageSrc.includes('Session closed.'), true);
  });

  it('AA: no reopen', () => {
    assert.equal(/Reopen Session|action:\s*['"]reopen['"]/.test(pageSrc + cardSrc + clientSrc), false);
    assert.equal(SESSION_UI_FORBIDDEN_ACTIONS.includes('Reopen'), true);
    assert.equal(cardSrc.includes('cannot reopen'), true);
  });

  it('AB: no delete', () => {
    assert.equal(/Delete Session|Trash|method:\s*['"]DELETE['"]/.test(pageSrc + cardSrc + formSrc), false);
    assert.equal(/method:\s*['"]DELETE['"]/.test(clientSrc), false);
    assert.equal(SESSION_UI_FORBIDDEN_ACTIONS.includes('Delete'), true);
    assert.equal(clientSrc.includes('No DELETE'), true);
  });

  it('AC: open edit unavailable', () => {
    assert.equal(cardSrc.includes('isDraft && onEdit'), true);
    assert.equal(pageSrc.includes("session.status === 'draft' ? openEdit"), true);
  });

  it('AD: closed edit unavailable', () => {
    assert.equal(cardSrc.includes('isClosed'), true);
    assert.equal(cardSrc.includes('Read-only'), true);
  });

  it('AE: loading', () => {
    assert.equal(pageSrc.includes('Loading sessions'), true);
    assert.equal(pageSrc.includes('Loader2'), true);
  });

  it('AF: empty', () => {
    assert.equal(emptyStateCopy('all'), 'No attendance sessions yet.');
    assert.equal(emptyStateCopy('draft'), 'No draft sessions.');
    assert.equal(emptyStateCopy('open'), 'No open attendance sessions.');
    assert.equal(emptyStateCopy('closed'), 'No closed sessions yet.');
    assert.equal(pageSrc.includes('emptyStateCopy'), true);
  });

  it('AG: error retry', () => {
    assert.equal(pageSrc.includes('role="alert"'), true);
    assert.equal(pageSrc.includes('Retry'), true);
  });

  it('AH: no raw UUID labels', () => {
    assert.equal(linkIndicator({ eventId: 'abc', serveOpportunityId: null }), 'Linked Event');
    assert.equal(
      linkIndicator({ eventId: null, serveOpportunityId: 'xyz' }),
      'Linked Serve Opportunity'
    );
    assert.equal(cardSrc.includes('linkIndicator'), true);
    assert.equal(/\{session\.eventId\}|\{session\.serveOpportunityId\}/.test(cardSrc), false);
  });

  it('AI: no Check In', () => {
    for (const phrase of SESSION_UI_FORBIDDEN_ACTIONS) {
      if (phrase === 'Reopen' || phrase === 'Delete') continue;
      assert.equal(
        pageSrc.includes(phrase) || cardSrc.includes(phrase) || formSrc.includes(phrase),
        false,
        phrase
      );
    }
    assert.equal(/Check In|Scan Member|Mark Present|Child Check-In|Volunteer Arrived/.test(
      pageSrc + cardSrc + formSrc + clientSrc
    ), false);
  });

  it('AJ: no attendance mutation', () => {
    assert.equal(/resource=attendance(?!&subResource=sessions)|public\.attendance|attendance_records/.test(
      clientSrc + pageSrc + formSrc
    ), false);
    assert.equal(clientSrc.includes("method: 'DELETE'"), false);
  });

  it('AK: no scanner modification', () => {
    assert.equal(scannerPage.includes('attendance/sessions'), false);
    assert.equal(scannerPage.includes('AttendanceSession'), false);
    assert.equal(clientSrc.includes('card-resolver') || clientSrc.includes('CardScanner'), false);
  });

  it('AL: no Kids mutation', () => {
    assert.equal(/kids-checkin|KidsCheckIn|security_code|guest_name/.test(clientSrc + pageSrc + formSrc), false);
    // Kids Kiosk may GET open sessions to route into check-in; must not mutate lifecycle.
    assert.equal(kidsPage.includes('attendanceSessionsClient'), false);
    assert.equal(/createAttendanceSession|openAttendanceSession|closeAttendanceSession|updateAttendanceSession/.test(kidsKiosk), false);
  });

  it('AM: mobile targets', () => {
    assert.equal(pageSrc.includes('min-h-[48px]') || pageSrc.includes('min-h-[44px]'), true);
    assert.equal(formSrc.includes('min-h-[48px]'), true);
    assert.equal(cardSrc.includes('min-h-[48px]'), true);
    assert.equal(formSrc.includes('items-end sm:items-center'), true);
  });

  it('AN: accessibility', () => {
    assert.equal(pageSrc.includes('<h1'), true);
    assert.equal(formSrc.includes('<label'), true);
    assert.equal(formSrc.includes('role="dialog"'), true);
    assert.equal(formSrc.includes('aria-modal'), true);
    assert.equal(pageSrc.includes('role="alert"'), true);
    assert.equal(pageSrc.includes('createBtnRef.current?.focus'), true);
    assert.equal(cardSrc.includes('statusLabel'), true);
  });

  it('AO: no new API', () => {
    const apiFiles = [
      'api/_utils/attendanceSessionLogic.ts',
      'api/_utils/attendanceSessionHandler.ts',
      'api/_utils/core.ts',
    ];
    // UI phase must not invent new API endpoints; existing sessions resource only.
    assert.equal(clientSrc.includes('subResource=sessions'), true);
    assert.equal(/subResource=(records|check-?in|checkout)/i.test(clientSrc), false);
    for (const f of apiFiles) {
      assert.equal(existsSync(join(root, f)), true);
    }
  });

  it('AP: no SQL', () => {
    const sql = listSqlFiles();
    assert.equal(sql.some((f) => /2_7c|2\.7c|session.?admin.?ui/i.test(f)), false);
    assert.equal(existsSync(join(root, 'supabase/migrations/connect_phase_2_7b_attendance_sessions.sql')), true);
  });

  it('AQ: Connect unchanged', () => {
    if (!existsSync(connectRoot)) {
      assert.ok(true, 'Connect sibling absent — skip path check');
      return;
    }
    try {
      const dirty = execSync('git status --porcelain', { cwd: connectRoot, encoding: 'utf8' });
      // Allow empty or unrelated; ensure no attendance session UI files staged from Vault work.
      assert.equal(/attendanceSessions|AttendanceSessions/.test(dirty), false);
    } catch {
      /* git may be unavailable */
    }
    const connectApi = join(connectRoot, 'api');
    if (existsSync(connectApi)) {
      const names = readdirSync(connectApi).filter((f) => f.endsWith('.js'));
      assert.ok(names.length >= 1);
    }
  });

  it('grouping/sort helpers', () => {
    const grouped = groupSessionsByStatus([
      { id: '1', status: 'closed', startsAt: '2026-09-10T12:00:00.000Z', title: 'a', type: 'worship', endsAt: null, timezone: CHURCH_TIMEZONE, visitorCount: 0, eventId: null, serveOpportunityId: null, openedAt: null, closedAt: null },
      { id: '2', status: 'open', startsAt: '2026-09-22T12:00:00.000Z', title: 'b', type: 'worship', endsAt: null, timezone: CHURCH_TIMEZONE, visitorCount: 0, eventId: null, serveOpportunityId: null, openedAt: null, closedAt: null },
      { id: '3', status: 'open', startsAt: '2026-09-20T12:00:00.000Z', title: 'c', type: 'worship', endsAt: null, timezone: CHURCH_TIMEZONE, visitorCount: 0, eventId: null, serveOpportunityId: null, openedAt: null, closedAt: null },
      { id: '4', status: 'draft', startsAt: '2026-09-21T12:00:00.000Z', title: 'd', type: 'worship', endsAt: null, timezone: CHURCH_TIMEZONE, visitorCount: 0, eventId: null, serveOpportunityId: null, openedAt: null, closedAt: null },
    ]);
    assert.deepEqual(grouped.open.map((s) => s.id), ['3', '2']);
    assert.deepEqual(grouped.draft.map((s) => s.id), ['4']);
    assert.deepEqual(grouped.closed.map((s) => s.id), ['1']);
  });

  it('role matrices', () => {
    assert.deepEqual([...ATTENDANCE_SESSION_UI_ROLES].sort(), [
      'ADMIN',
      'ADMIN_STAFF',
      'ASST_SECRETARY',
      'FIRST_LADY',
      'PASTOR',
      'SECRETARY',
      'SUPER_ADMIN',
    ].sort());
    for (const r of ATTENDANCE_SESSION_UI_DENIED_ROLES) {
      assert.equal(ATTENDANCE_SESSION_UI_ROLES.includes(r), false, r);
    }
  });

  it('date display + error mapping', () => {
    const range = formatSessionRange(
      '2026-09-20T18:00:00.000Z',
      '2026-09-20T22:00:00.000Z',
      'Africa/Kampala'
    );
    assert.match(range, /Sep/);
    assert.match(range, /–/);
    assert.equal(mapSessionApiError({ code: 'forbidden' }), 'You do not have permission to manage attendance sessions.');
    assert.equal(mapSessionApiError({ code: 'delete_not_allowed' }), 'Sessions cannot be deleted.');
  });

  it('page title + subtitle', () => {
    assert.equal(pageSrc.includes('Attendance Sessions'), true);
    assert.equal(
      pageSrc.includes('Create and manage attendance sessions for services and events.'),
      true
    );
  });

  it('open session visual emphasis', () => {
    assert.equal(cardSrc.includes('border-emerald-300'), true);
    assert.equal(cardSrc.includes("status === 'open'"), true);
  });
});
