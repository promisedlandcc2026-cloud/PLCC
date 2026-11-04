/**
 * Vault staff member roster + contacts (pure; mirrors lib/permissions PEOPLE_ROSTER_ROLES).
 * Connect opt-in directory stays separate — regular members do not use this gate.
 */

export const PEOPLE_ROSTER_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'MINISTRY_LEADER',
  'SECRETARY',
  'ASST_SECRETARY',
  'STAFF',
  'ADMIN_STAFF',
  'FIRST_LADY',
]);

export function canViewPeopleRoster(role: string | null | undefined): boolean {
  return PEOPLE_ROSTER_ROLES.has(String(role || '').toUpperCase());
}
