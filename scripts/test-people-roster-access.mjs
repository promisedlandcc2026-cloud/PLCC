/**
 * Vault member roster access — staff-only full contacts; Connect directory stays opt-in.
 * Run: node --import tsx --test scripts/test-people-roster-access.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

async function loadModules() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  const [perms, roster, types] = await Promise.all([
    import('../lib/permissions.ts'),
    import('../api/_utils/peopleRosterLogic.ts'),
    import('../types.ts'),
  ]);
  return { perms, roster, types };
}

describe('people roster access', async () => {
  const { perms, roster, types } = await loadModules();
  const { Role } = types;
  const { canPerform, hasPermission, PEOPLE_ROSTER_ROLES, PATH_PERMISSIONS } = perms;
  const { canViewPeopleRoster, PEOPLE_ROSTER_ROLES: apiRoles } = roster;

  const membersSrc = read('pages/people/Members.tsx');
  const householdsSrc = read('pages/people/Households.tsx');
  const coreSrc = read('api/_utils/core.ts');
  const dirMig = read('supabase/migrations/connect_phase_2_8b_member_directory.sql');

  it('A: PEOPLE_ROSTER_ROLES includes pastoral staff + Connect bridge roles', () => {
    const expected = [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.PASTOR,
      Role.MINISTRY_LEADER,
      Role.SECRETARY,
      Role.ASST_SECRETARY,
      Role.STAFF,
      Role.ADMIN_STAFF,
      Role.FIRST_LADY,
    ].sort();
    assert.deepEqual([...PEOPLE_ROSTER_ROLES].map(String).sort(), expected);
    assert.deepEqual([...apiRoles].sort(), expected);
  });

  it('B: MEMBER denied; SECRETARY and MINISTRY_LEADER allowed', () => {
    assert.equal(canPerform(Role.MEMBER, 'people.view_roster'), false);
    assert.equal(hasPermission(Role.MEMBER, undefined, '/members'), false);
    assert.equal(hasPermission(Role.MEMBER, undefined, '/households'), false);
    assert.equal(canViewPeopleRoster('MEMBER'), false);

    assert.equal(canPerform(Role.SECRETARY, 'people.view_roster'), true);
    assert.equal(hasPermission(Role.SECRETARY, undefined, '/members'), true);
    assert.equal(canViewPeopleRoster('SECRETARY'), true);

    assert.equal(canPerform(Role.MINISTRY_LEADER, 'people.view_roster'), true);
    assert.equal(hasPermission(Role.MINISTRY_LEADER, undefined, '/members'), true);
    assert.equal(canViewPeopleRoster('MINISTRY_LEADER'), true);
  });

  it('C: path permissions wire /members and /households to roster roles', () => {
    assert.equal(PATH_PERMISSIONS['/members'], PEOPLE_ROSTER_ROLES);
    assert.equal(PATH_PERMISSIONS['/households'], PEOPLE_ROSTER_ROLES);
    assert.equal(PATH_PERMISSIONS['/family']?.includes(Role.MEMBER), true);
  });

  it('D: UI AccessDenied + API canViewPeopleRoster gate', () => {
    assert.equal(membersSrc.includes("people.view_roster"), true);
    assert.equal(membersSrc.includes('AccessDenied'), true);
    assert.equal(householdsSrc.includes("people.view_roster"), true);
    assert.equal(householdsSrc.includes('AccessDenied'), true);
    assert.equal(coreSrc.includes('canViewPeopleRoster'), true);
    assert.equal(coreSrc.includes('peopleRosterLogic'), true);
    assert.match(coreSrc, /Only pastoral and admin staff can view the full member roster/);
    assert.match(coreSrc, /directory privacy/);
  });

  it('E: Connect member directory remains opt-in (no Vault roster change)', () => {
    assert.equal(dirMig.includes('list_member_directory'), true);
    assert.equal(dirMig.includes('directory_opt_in'), true);
    assert.equal(dirMig.includes('member_directory_is_eligible'), true);
  });
});
