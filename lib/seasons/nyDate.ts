/** Calendar parts in Africa/Kampala. Noon UTC stays the same civil day in both EST and EDT. */

export type NyDate = { year: number; month: number; day: number };

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function nyParts(date: Date): NyDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}

/** A Date whose New York calendar day is the given month/day. */
export function dateOnNyDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
}

export function addNyDays(parts: NyDate, days: number): NyDate {
  const next = dateOnNyDay(parts.year, parts.month, parts.day);
  next.setUTCDate(next.getUTCDate() + days);
  return nyParts(next);
}

export function nyKey(parts: NyDate): string {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function nyNumber(parts: NyDate): number {
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

export function inNyWindow(today: NyDate, start: NyDate, end: NyDate): boolean {
  const n = nyNumber(today);
  return n >= nyNumber(start) && n <= nyNumber(end);
}

export function weekdayNy(parts: NyDate): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
  }).format(dateOnNyDay(parts.year, parts.month, parts.day));
  return WEEKDAY[label] ?? 0;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function parseNyKey(value: string): NyDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = nyParts(dateOnNyDay(year, month, day));
  if (check.year !== year || check.month !== month || check.day !== day) return null;
  return { year, month, day };
}
