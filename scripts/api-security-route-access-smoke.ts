/**
 * Handler-level access checks for the locked API routes.
 * Run: npx tsx scripts/api-security-route-access-smoke.ts
 */
import { requireAuth } from '../api/_utils/auth.js';
import {
  accountantRouteDecision,
  eventsStatsDecision,
  kioskMayListOpenChildren,
  pickColumns,
  toolsRouteDecision,
  MEMBER_WRITE_COLUMNS,
  settingsWriteDecision,
  ORG_PROFILE_COLUMNS,
  publicOrgRow,
} from '../api/_utils/routeAccess.js';
import { canOpenSettingsSection } from '../lib/settingsAccess.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function mockRes() {
  const state: { status: number; body: any } = { status: 0, body: null };
  return {
    state,
    res: {
      status(code: number) {
        state.status = code;
        return this;
      },
      json(body: any) {
        state.body = body;
        return this;
      },
    },
  };
}

async function main() {
  console.log('\nAPI security route access');

  const unsigned = mockRes();
  const auth = await requireAuth({ headers: {} }, unsigned.res, {} as any);
  assert(auth === null, 'unsigned requireAuth returns null');
  assert(unsigned.state.status === 401, 'unsigned request is 401');

  assert(toolsRouteDecision('MEMBER', 'submissions', 'GET') === 'forbidden', 'member cannot read submissions');
  assert(toolsRouteDecision('MEMBER', 'forms', 'POST') === 'forbidden', 'member cannot create forms');
  assert(toolsRouteDecision('MEMBER', 'forms', 'GET') === 'ok', 'member can list forms');
  assert(toolsRouteDecision('MEMBER', 'security_logs', 'GET') === 'forbidden', 'member cannot read security logs');
  assert(toolsRouteDecision('KIOSK', 'forms', 'GET') === 'forbidden', 'kiosk cannot use tools');
  assert(toolsRouteDecision('ADMIN', 'submissions', 'GET') === 'ok', 'admin can read submissions');
  assert(toolsRouteDecision(null, 'forms', 'GET') === 'unauthorized', 'missing role is unauthorized');

  assert(eventsStatsDecision(null) === 'unauthorized', 'events stats unsigned is unauthorized');
  assert(eventsStatsDecision('MEMBER') === 'forbidden', 'member cannot read events stats');
  assert(eventsStatsDecision('STAFF') === 'ok', 'staff can read events stats');

  assert(kioskMayListOpenChildren('KIOSK', true) === false, 'kiosk cannot list open children');
  assert(kioskMayListOpenChildren('STAFF', true) === true, 'staff can list open children');
  assert(kioskMayListOpenChildren('KIOSK', false) === true, 'kiosk may still look up by card');

  const picked = pickColumns(
    { first_name: 'Ada', access_code: '1234', role: 'SUPER_ADMIN' },
    MEMBER_WRITE_COLUMNS
  );
  assert(picked.first_name === 'Ada', 'whitelist keeps first_name');
  assert(!('access_code' in picked), 'whitelist drops access_code');
  assert(!('role' in picked), 'whitelist drops role');

  // Accountant: Fundraisers only
  const acct = (resource: string, extra: Partial<Parameters<typeof accountantRouteDecision>[1]> = {}) =>
    accountantRouteDecision('ACCOUNTANT', { resource, method: 'GET', userId: 'me', ...extra });
  assert(acct('fundraisers', { method: 'POST' }) === 'ok', 'accountant can use fundraisers');
  assert(acct('members') === 'forbidden', 'accountant cannot list members');
  assert(acct('people') === 'forbidden', 'accountant cannot open people');
  assert(acct('finance') === 'forbidden', 'accountant cannot open finance');
  assert(acct('giving') === 'forbidden', 'accountant cannot open giving');
  assert(acct('events') === 'forbidden', 'accountant cannot open events');
  assert(acct('kids-bucks') === 'forbidden', 'accountant cannot open kids');
  assert(acct('users') === 'forbidden', 'accountant cannot list users');
  assert(acct('users', { selfQuery: true }) === 'ok', 'accountant can load own profile');
  assert(acct('users', { method: 'PATCH', bodyId: 'me' }) === 'ok', 'accountant can update own profile');
  assert(acct('users', { method: 'PATCH', bodyId: 'someone-else' }) === 'forbidden', 'accountant cannot update others');
  assert(acct('settings', { scope: 'system' }) === 'ok', 'accountant can load theme');
  assert(acct('settings', { method: 'POST', scope: 'system' }) === 'forbidden', 'accountant cannot change settings');
  assert(acct('notifications') === 'ok', 'accountant sees own notifications');
  assert(accountantRouteDecision('FINANCE', { resource: 'finance', method: 'GET' }) === 'ok', 'gate ignores other roles');

  // Settings: saving church-wide settings needs a church leader
  assert(settingsWriteDecision(null, 'system') === 'unauthorized', 'signed-out cannot save settings');
  assert(settingsWriteDecision('MEMBER', 'system') === 'forbidden', 'member cannot change Preferences');
  assert(settingsWriteDecision('MEMBER', 'integrations') === 'forbidden', 'member cannot change Integrations');
  assert(settingsWriteDecision('FINANCE', 'integrations') === 'forbidden', 'finance cannot change Integrations');
  assert(settingsWriteDecision('MEMBER', 'events') === 'forbidden', 'member cannot change check-in settings');
  assert(settingsWriteDecision('SECRETARY', 'events') === 'ok', 'secretary can still change check-in settings');
  assert(settingsWriteDecision('MEMBER', 'notifications') === 'ok', 'member can save own notifications');
  assert(settingsWriteDecision('ADMIN', 'system') === 'ok', 'admin can save Preferences');
  assert(settingsWriteDecision('PASTOR', 'integrations') === 'ok', 'pastor can save Integrations');
  assert(settingsWriteDecision('FIRST_LADY', 'system') === 'ok', 'first lady can save church settings');
  assert(settingsWriteDecision('SUPER_ADMIN', 'system') === 'ok', 'super admin can save Preferences');
  assert(settingsWriteDecision('KIOSK', 'notifications') === 'forbidden', 'kiosk cannot save settings');
  const orgPicked = pickColumns({ name: 'PLCC', integrations: { stripe: 'x' }, id: 9, system_settings: {} }, ORG_PROFILE_COLUMNS);
  assert(orgPicked.name === 'PLCC' && !('integrations' in orgPicked) && !('id' in orgPicked) && !('system_settings' in orgPicked),
    'Church Profile save keeps only profile fields');
  const shown = publicOrgRow({ name: 'PLCC', integrations: { stripe_secret: 'sk' } });
  assert(shown.name === 'PLCC' && !('integrations' in shown), 'Church Profile read hides integration keys');

  // Settings menu: who sees which section
  assert(canOpenSettingsSection('MEMBER', 'personal'), 'member sees My Profile');
  assert(canOpenSettingsSection('MEMBER', 'notifications'), 'member sees Notifications');
  for (const t of ['organization', 'events', 'integrations', 'system', 'staff-roles', 'security-log', 'audit']) {
    assert(!canOpenSettingsSection('MEMBER', t), `member does not see ${t}`);
  }
  assert(canOpenSettingsSection('FIRST_LADY', 'organization'), 'first lady sees Church Profile');
  assert(!canOpenSettingsSection('FIRST_LADY', 'audit'), 'first lady does not see Audit Log');
  assert(canOpenSettingsSection('PASTOR', 'audit'), 'pastor sees Audit Log');
  assert(!canOpenSettingsSection('ADMIN', 'staff-roles'), 'admin does not see Staff & Roles');
  assert(canOpenSettingsSection('ADMIN', 'system'), 'admin sees Preferences');
  assert(canOpenSettingsSection('PASTOR', 'system'), 'pastor sees Preferences');
  assert(!canOpenSettingsSection('FINANCE', 'system'), 'finance does not see Preferences');
  for (const t of ['personal', 'organization', 'events', 'integrations', 'system', 'staff-roles', 'security-log', 'audit']) {
    assert(canOpenSettingsSection('SUPER_ADMIN', t), `super admin sees ${t}`);
  }
  assert(!canOpenSettingsSection('SUPER_ADMIN', 'nonsense'), 'unknown section is refused');

  console.log('\nAll API security checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
