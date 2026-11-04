export type AddressAs = 'brother' | 'sister';

const TITLE_PREFIX = /^(pastor|first lady|brother|sister)\s+/i;

export function normalizeAddressAs(value: unknown): AddressAs | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'brother' || raw === 'sister') return raw;
  return null;
}

function ageFromBirthday(value: unknown): number | undefined {
  const iso = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  // 1904 = birthday saved without a year (adults enter month & day only) — age unknown.
  if (iso.startsWith('1904-')) return undefined;
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return undefined;
  const asOf = new Date();
  let age = asOf.getFullYear() - born.getFullYear();
  const month = asOf.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && asOf.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 120) return undefined;
  return age;
}

function givenName(input: {
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  fullName?: string | null;
}): string {
  const first = String(input.firstName || '').trim();
  const last = String(input.lastName || '').trim();
  const legal = [first, last].filter(Boolean).join(' ');
  if (legal) return legal;
  const full = String(input.fullName || '').trim();
  if (full) return full;
  return String(input.preferredName || '').trim() || 'Member';
}

function nameKey(value: string): string {
  return value
    .replace(TITLE_PREFIX, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMinor(input: {
  age?: number | null;
  birthday?: string | null;
  householdRole?: string | null;
  minor?: boolean;
}): boolean {
  if (input.minor) return true;
  const role = String(input.householdRole || '').trim().toLowerCase();
  if (role === 'child' || role === 'youth' || role === 'dependent') return true;
  const age = typeof input.age === 'number' && Number.isFinite(input.age) ? input.age : ageFromBirthday(input.birthday);
  return age !== undefined && age < 18;
}

/** Spoken name for directory, profiles, chat, and who's online. Legal records stay unchanged. */
export function courtesyName(input: {
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  fullName?: string | null;
  addressAs?: unknown;
  birthday?: string | null;
  age?: number | null;
  householdRole?: string | null;
  minor?: boolean;
}): string {
  const given = givenName(input);
  const bare = given.replace(TITLE_PREFIX, '').trim() || given;
  const parts = nameKey(given).split(' ').filter(Boolean);
  const first = parts[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  if (first === 'grace' && last === 'hiire') return 'Pastor Grace Hiire';
  if (first === 'kennedy' && last === 'hiire') return 'Pastor Kennedy Hiire';
  if (isMinor(input)) return given;
  if (TITLE_PREFIX.test(given)) return given;
  const address = normalizeAddressAs(input.addressAs);
  if (address === 'brother') return `Brother ${bare}`;
  if (address === 'sister') return `Sister ${bare}`;
  return given;
}

/** Home greeting: title plus the first name, such as Brother Jerless or Pastor Grace. */
export function courtesyGreetingName(input: {
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  fullName?: string | null;
  addressAs?: unknown;
  birthday?: string | null;
  age?: number | null;
  householdRole?: string | null;
  minor?: boolean;
  fallback?: string | null;
}): string {
  const fallbackFirst = String(input.fallback || '').trim().split(/\s+/)[0] || '';
  const spoken = courtesyName({
    ...input,
    firstName: String(input.firstName || '').trim() || fallbackFirst,
  });
  const givenFirst =
    String(input.firstName || '').trim().split(/\s+/)[0] ||
    fallbackFirst ||
    spoken.replace(TITLE_PREFIX, '').split(/\s+/)[0] ||
    'Friend';
  if (/^pastor\s/i.test(spoken)) return `Pastor ${givenFirst}`;
  if (/^first lady\s/i.test(spoken)) return `First Lady ${givenFirst}`;
  if (/^brother\s/i.test(spoken)) return `Brother ${givenFirst}`;
  if (/^sister\s/i.test(spoken)) return `Sister ${givenFirst}`;
  return givenFirst;
}
