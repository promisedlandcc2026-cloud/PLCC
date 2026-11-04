/**
 * Phase 2.7D.7–2.7D.10 source contracts.
 * Run: node --test scripts/test-connect-phase-2-7d7-d10-roadmap.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('2.7D.7 household check-in', () => {
  const mig = join(root, 'supabase/migrations/connect_phase_2_7d7_household_checkin.sql');
  it('migration + API + scanner sheet', () => {
    assert.equal(existsSync(mig), true);
    const sql = read('supabase/migrations/connect_phase_2_7d7_household_checkin.sql');
    assert.ok(sql.includes('household_bulk'));
    assert.ok(sql.includes('attendance_household_preview_by_card_hash'));
    assert.ok(sql.includes('attendance_checkin_household'));
    assert.ok(sql.includes("type = 'kids'"));
    const core = read('api/_utils/core.ts');
    assert.ok(core.includes('household-preview'));
    assert.ok(core.includes('household-checkin'));
    const scanner = read('components/attendance/AttendanceSessionScanner.tsx');
    assert.ok(scanner.includes('previewHouseholdByCard'));
    assert.ok(scanner.includes('Check In Household'));
    assert.ok(scanner.includes('data-household-checkin-sheet'));
  });
});

describe('2.7D.8 event reconcile', () => {
  it('migration + check-in handler hook', () => {
    const sql = read('supabase/migrations/connect_phase_2_7d8_event_rsvp_reconcile.sql');
    assert.ok(sql.includes('event_attendance_reconciliations'));
    assert.ok(sql.includes('attendance_reconcile_event_checkin'));
    const handler = read('api/_utils/attendanceCheckinHandler.ts');
    assert.ok(handler.includes('attendance_reconcile_event_checkin'));
    assert.ok(handler.includes('reconcileEventIfNeeded'));
  });
});

describe('2.7D.9 volunteer serve gate', () => {
  it('migration + digital pre-check', () => {
    const sql = read('supabase/migrations/connect_phase_2_7d9_volunteer_serve_checkin.sql');
    assert.ok(sql.includes('attendance_require_serve_signup_for_card_hash'));
    assert.ok(sql.includes('serve_signup_required'));
    const handler = read('api/_utils/attendanceCheckinHandler.ts');
    assert.ok(handler.includes('attendance_require_serve_signup_for_card_hash'));
    const logic = read('api/_utils/attendanceCheckinLogic.ts');
    assert.ok(logic.includes('serve_signup_required'));
  });
});

describe('2.7D.10 dashboard + Connect history', () => {
  it('Vault dashboard + Connect RPCs/UI', () => {
    const sql = read('supabase/migrations/connect_phase_2_7d10_attendance_dashboard_history.sql');
    assert.ok(sql.includes('attendance_dashboard_summary'));
    assert.ok(sql.includes('get_my_attendance_history'));
    assert.ok(sql.includes('get_my_children_custody_history'));
    assert.ok(sql.includes('get_my_event_attendance_status'));
    const sqlB = read('supabase/migrations/connect_phase_2_7d10b_family_attendance_history.sql');
    assert.ok(sqlB.includes("'session'"));
    assert.ok(sqlB.includes('attendance_records'));
    assert.ok(sqlB.includes('child_custody_records'));
    const core = read('api/_utils/core.ts');
    assert.ok(core.includes("attendanceSub || '') === 'dashboard'"));
    assert.equal(existsSync(join(root, 'pages/attendance/AttendanceDashboard.tsx')), true);
    assert.ok(read('App.tsx').includes('/attendance/dashboard'));
    assert.ok(read('lib/simpleNav.tsx').includes('/attendance/dashboard'));
    assert.equal(existsSync(join(connectRoot, 'lib/attendanceHistoryClient.ts')), true);
    assert.equal(existsSync(join(connectRoot, 'pages/MemberAttendanceHistory.tsx')), true);
    assert.ok(readFileSync(join(connectRoot, 'App.tsx'), 'utf8').includes('/my-attendance'));
    const page = readFileSync(join(connectRoot, 'pages/MemberAttendanceHistory.tsx'), 'utf8');
    assert.ok(page.includes('You checked in'));
    assert.ok(page.includes('Children’s check-ins'));
  });
});
