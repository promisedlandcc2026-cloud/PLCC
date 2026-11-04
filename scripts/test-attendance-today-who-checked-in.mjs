/**
 * Unify Who checked in with Sessions — source contracts.
 * Run: node --test scripts/test-attendance-today-who-checked-in.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('attendance today + Who checked in unify', () => {
  const whoSrc = read('pages/events/WhoCheckedIn.tsx');
  const clientSrc = read('lib/attendanceRecordsClient.ts');
  const coreSrc = read('api/_utils/core.ts');
  const handlerSrc = read('api/_utils/attendanceTodayHandler.ts');
  const logicSrc = read('api/_utils/attendanceTodayLogic.ts');
  const simpleNav = read('lib/simpleNav.tsx');
  const sectionNav = read('lib/navBySection.tsx');
  const askSrc = read('api/_utils/askAdminPrompt.ts');
  const chooserSrc = read('pages/events/CheckInChooser.tsx');

  it('routes attendance&subResource=today', () => {
    assert.equal(coreSrc.includes("attendanceSub || '') === 'today'"), true);
    assert.equal(handlerSrc.includes('handleAttendanceToday'), true);
    assert.equal(handlerSrc.includes("from('attendance_records')"), true);
    assert.equal(/from\('attendance'\)/.test(handlerSrc), false);
  });

  it('WhoCheckedIn uses today API not legacy events attendance', () => {
    assert.equal(whoSrc.includes('fetchTodayAttendance'), true);
    assert.equal(whoSrc.includes('deleteTodayAttendanceRecord'), true);
    assert.equal(clientSrc.includes('ATTENDANCE_TODAY_API'), true);
    assert.equal(clientSrc.includes('fetchTodayAttendance'), true);
    assert.equal(read('lib/attendanceRecordsTypes.ts').includes('subResource=today'), true);
    assert.equal(whoSrc.includes("resource: 'events'"), false);
    assert.equal(whoSrc.includes("subResource: 'attendance'"), false);
  });

  it("nav: Today's check-ins under Attendance; removed from Events", () => {
    assert.equal(simpleNav.includes("Today's check-ins"), true);
    assert.equal(simpleNav.includes('/events/who-checked-in'), true);
    assert.equal(simpleNav.includes('Start check-in'), true);
    assert.match(
      simpleNav,
      /id:\s*'attendance'[\s\S]*Today's check-ins[\s\S]*id:\s*'events'/
    );
    assert.equal(/id:\s*'events'[\s\S]*Who checked in/.test(simpleNav), false);
    assert.equal(sectionNav.includes("Today's check-ins"), true);
    assert.equal(sectionNav.includes('Start check-in'), true);
    assert.equal(chooserSrc.includes('Start check-in'), true);
  });

  it('Ask Admin no longer says Who checked in is legacy-separate', () => {
    assert.equal(/Legacy Events "Who checked in" is separate/.test(askSrc), false);
    assert.equal(askSrc.includes("Today's check-ins"), true);
  });

  it('today logic exports day bounds and kids filter helpers', () => {
    assert.equal(logicSrc.includes('export function churchDayBoundsUtc'), true);
    assert.equal(logicSrc.includes('export function isKidsTodayRow'), true);
    assert.equal(logicSrc.includes('export function paginateTodayRows'), true);
    assert.equal(logicSrc.includes("relationship_type"), false);
  });
});
