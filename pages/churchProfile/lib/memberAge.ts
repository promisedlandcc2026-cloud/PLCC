export function normalizeBirthday(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
}

/** Year stored for birthdays saved without a year (leap year, so Feb 29 works). Never shown, never used for age. */
export const NO_YEAR = 1904;

export function isNoYearBirthday(value: string | null | undefined): boolean {
  return normalizeBirthday(value).startsWith(`${NO_YEAR}-`);
}

export function ageFromBirthday(value: string | null | undefined, asOf = new Date()): number | undefined {
  const iso = normalizeBirthday(value);
  if (!iso || isNoYearBirthday(iso)) return undefined;
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return undefined;
  let age = asOf.getFullYear() - born.getFullYear();
  const month = asOf.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && asOf.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 120) return undefined;
  return age;
}

export function formatBirthdayLabel(value: string | null | undefined): string {
  const iso = normalizeBirthday(value);
  if (!iso) return '';
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return '';
  return born.toLocaleDateString('en-US', isNoYearBirthday(iso)
    ? { month: 'long', day: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
}

export function displayNameFromParts(
  firstName?: string | null,
  lastName?: string | null,
  preferredName?: string | null
): string {
  const legal = [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ');
  return String(preferredName || '').trim() || legal || 'Member';
}

export const ADULT_CONTACT_AGE = 18;

const ADULT_HOUSEHOLD_ROLES = new Set(['Head of Household', 'Spouse', 'Independent Member']);

/** Email and phone belong only to an adult head, spouse, or independent member. */
export function mayHoldOwnContact(member: { age?: number; householdRole?: string }): boolean {
  const role = String(member.householdRole || '');
  if (role === 'Child' || role === 'Youth') return false;
  if (!ADULT_HOUSEHOLD_ROLES.has(role)) return false;
  if (typeof member.age === 'number' && Number.isFinite(member.age) && member.age < ADULT_CONTACT_AGE) {
    return false;
  }
  return true;
}

/** Child is under 13, Youth is 13–17, Independent Member is 18+. */
export function householdRoleAllowedForAge(
  role: string,
  age: number | undefined
): boolean {
  if (age === undefined || !Number.isFinite(age)) return true;
  if (age >= ADULT_CONTACT_AGE) return role !== 'Child' && role !== 'Youth';
  return role !== 'Independent Member';
}

export function householdRoleForAge(
  role: 'Head of Household' | 'Spouse' | 'Youth' | 'Child' | 'Independent Member',
  age: number | undefined
): 'Head of Household' | 'Spouse' | 'Youth' | 'Child' | 'Independent Member' {
  if (householdRoleAllowedForAge(role, age)) return role;
  if (age !== undefined && age >= ADULT_CONTACT_AGE) return 'Independent Member';
  if (age !== undefined && age >= 13) return 'Youth';
  return 'Child';
}

const VAULT_MEMBER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVaultMemberId(id: string): boolean {
  return VAULT_MEMBER_ID.test(String(id || '').trim());
}

export function splitDisplayName(fullName: string): { firstName: string; lastName: string } {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}
