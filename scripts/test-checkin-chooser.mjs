/**
 * Check-in Adult vs Child chooser — source contracts.
 * Run: node --test scripts/test-checkin-chooser.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('check-in Adult vs Child chooser', () => {
  const chooserSrc = read('pages/events/CheckInChooser.tsx');
  const appSrc = read('App.tsx');
  const simpleNav = read('lib/simpleNav.tsx');
  const sectionNav = read('lib/navBySection.tsx');
  const perms = read('lib/permissions.ts');
  const kidsSrc = read('pages/events/KidsKiosk.tsx');
  const cardSrc = read('components/attendance/AttendanceSessionCard.tsx');
  const attendancePage = read('pages/attendance/AttendanceSessionAttendance.tsx');

  it('wires chooser page and route', () => {
    assert.equal(existsSync(join(root, 'pages/events/CheckInChooser.tsx')), true);
    assert.equal(appSrc.includes('CheckInChooserPage'), true);
    assert.equal(appSrc.includes('/events/check-someone-in'), true);
    assert.equal(perms.includes("'/events/check-someone-in'"), true);
  });

  it('exposes Adult and Child choices with correct destinations', () => {
    assert.equal(chooserSrc.includes('data-checkin-choice="child"'), true);
    assert.equal(chooserSrc.includes('data-checkin-choice="adult"'), true);
    assert.equal(chooserSrc.includes('/events/kids-kiosk'), true);
    assert.equal(chooserSrc.includes('ATTENDANCE_SESSIONS_ROUTE') || chooserSrc.includes('/attendance/sessions'), true);
    assert.equal(chooserSrc.includes('Ask a staff member to open Attendance'), true);
    assert.equal(chooserSrc.includes('attendance.checkin'), true);
    assert.equal(chooserSrc.includes('fetchAttendanceSessions'), true);
    assert.equal(chooserSrc.includes('attendancePathForSession'), true);
  });

  it('promotes Start check-in; Today\'s check-ins under Attendance; hides legacy desk duplicates', () => {
    assert.equal(simpleNav.includes('Start check-in'), true);
    assert.equal(simpleNav.includes('/events/check-someone-in'), true);
    assert.equal(simpleNav.includes('Kids Kiosk'), true);
    assert.equal(simpleNav.includes('/events/kids-kiosk'), true);
    assert.equal(simpleNav.includes("Today's check-ins"), true);
    assert.equal(simpleNav.includes('/events/who-checked-in'), true);
    assert.equal(/id:\s*'events'[\s\S]*Who checked in/.test(simpleNav), false);
    assert.equal(simpleNav.includes('Check-in (desk)'), false);
    assert.equal(simpleNav.includes('Kids Check-in'), false);
    assert.equal(simpleNav.includes('Kids checked in'), false);
    assert.equal(sectionNav.includes('Start check-in'), true);
    assert.equal(sectionNav.includes("Today's check-ins"), true);
    assert.equal(sectionNav.includes('Kids Kiosk'), true);
    assert.equal(sectionNav.includes('Check-in (desk)'), false);
  });

  it('Kids Kiosk Family Pass AWC1 path + adult redirect; legacy kiosk-lookup kept', () => {
    assert.equal(kidsSrc.includes('isValidCardToken'), true);
    assert.equal(kidsSrc.includes('lookupKidsCustodyByCard'), true);
    assert.equal(kidsSrc.includes('Check In Child'), true);
    assert.equal(kidsSrc.includes('Check Out Child'), true);
    assert.equal(kidsSrc.includes('adult membership card'), true);
    assert.equal(kidsSrc.includes('/events/check-someone-in'), true);
    assert.equal(kidsSrc.includes('kiosk-lookup'), true);
    assert.equal(kidsSrc.includes('AttendanceSessionScanner'), false);
    assert.equal(kidsSrc.includes('CardScannerCamera'), false);
  });

  it('Attendance CTAs clarify member check-in / scan membership cards', () => {
    assert.equal(cardSrc.includes('Check in members'), true);
    assert.equal(attendancePage.includes('Scan membership cards'), true);
  });
});
