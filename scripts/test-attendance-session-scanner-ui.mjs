/**
 * Phase 2.7D.5A — Session digital card scanner source contracts.
 * Run: node --test scripts/test-attendance-session-scanner-ui.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('attendance session digital scanner 2.7D.5A', () => {
  const pageSrc = read('pages/attendance/AttendanceSessionAttendance.tsx');
  const scannerSrc = read('components/attendance/AttendanceSessionScanner.tsx');
  const clientSrc = read('lib/attendanceRecordsClient.ts');
  const cameraSrc = read('components/people/CardScannerCamera.tsx');
  const kidsSrc = read('pages/events/KidsKiosk.tsx');
  const whoSrc = read('pages/events/WhoCheckedIn.tsx');
  const appSrc = read('App.tsx');

  it('wires scanner on open session attendance page', () => {
    assert.equal(pageSrc.includes('AttendanceSessionScanner'), true);
    assert.equal(pageSrc.includes('Scan membership cards') || pageSrc.includes('Scan Cards'), true);
    assert.equal(pageSrc.includes('data-digital-scanner="enabled"'), true);
    assert.equal(pageSrc.includes('{open &&'), true);
  });

  it('reuses CardScannerCamera without editing Kids Kiosk', () => {
    assert.equal(scannerSrc.includes('CardScannerCamera'), true);
    assert.equal(cameraSrc.includes('@yudiel/react-qr-scanner'), true);
    assert.equal(kidsSrc.includes('CardScannerCamera'), false);
    assert.equal(kidsSrc.includes('AttendanceSessionScanner'), false);
  });

  it('posts digital_card only (no resolver memberId spoof)', () => {
    assert.equal(clientSrc.includes('checkInMemberDigitalCard'), true);
    assert.equal(clientSrc.includes("mode: 'digital_card'"), true);
    assert.equal(scannerSrc.includes('checkInMemberDigitalCard'), true);
    assert.equal(scannerSrc.includes('card-resolver'), false);
    // Digital card POST must not send client memberId; household bulk may use memberIds separately.
    assert.equal(/checkInMemberDigitalCard[\s\S]{0,400}memberId/.test(clientSrc), false);
  });

  it('shows success / already / unrecognized states', () => {
    assert.equal(scannerSrc.includes('Checked In'), true);
    assert.equal(scannerSrc.includes('Already Checked In'), true);
    assert.equal(scannerSrc.includes('CARD NOT RECOGNIZED'), true);
    assert.equal(scannerSrc.includes('Scan Next Member'), true);
  });

  it('documents adult or child PLCC digital cards', () => {
    assert.equal(/adult or child PLCC digital card/i.test(scannerSrc), true);
  });

  it('isolates legacy attendance sources', () => {
    assert.equal(/resource=events&subResource=attendance/.test(scannerSrc + pageSrc), false);
    assert.equal(whoSrc.includes('fetchTodayAttendance'), true);
    assert.equal(whoSrc.includes("resource: 'events'"), false);
    assert.equal(whoSrc.includes("subResource: 'attendance'"), false);
    assert.equal(/event_checkins|from\('attendance'\)/.test(scannerSrc), false);
  });

  it('does not change Connect or App Kids routes', () => {
    assert.equal(appSrc.includes('/events/kids-kiosk'), true);
    assert.equal(existsSync(join(connectRoot, 'components/attendance/AttendanceSessionScanner.tsx')), false);
  });
});
