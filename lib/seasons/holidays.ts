import { addNyDays, dateOnNyDay, inNyWindow, isLeapYear, nyParts, weekdayNy, type NyDate } from './nyDate';

export type HolidayName = 'thanksgiving' | 'christmas' | 'new_year' | 'easter' | 'anniversary';

export type AnniversarySetting = { month: number; day: number } | null;

/** Anonymous Gregorian computus. Month is 1–12. */
export function easterSunday(year: number): NyDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

/** Fourth Thursday of November. */
export function thanksgivingDay(year: number): NyDate {
  const first = { year, month: 11, day: 1 };
  const delta = (4 - weekdayNy(first) + 7) % 7;
  return { year, month: 11, day: 1 + delta + 21 };
}

function anniversaryCenter(year: number, anniversary: AnniversarySetting): NyDate | null {
  if (!anniversary) return null;
  const month = anniversary.month;
  let day = anniversary.day;
  if (month === 2 && day === 29 && !isLeapYear(year)) day = 28;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = nyParts(dateOnNyDay(year, month, day));
  if (check.month !== month) return null;
  return { year, month, day: check.day };
}

/**
 * Fixed holidays win over the church anniversary.
 * Thanksgiving: Monday before the 4th Thursday through that Sunday.
 * Easter: Palm Sunday through Easter Monday.
 */
export function getActiveHoliday(date: Date, anniversary: AnniversarySetting = null): HolidayName | null {
  const today = nyParts(date);
  const thanksgiving = thanksgivingDay(today.year);
  if (inNyWindow(today, addNyDays(thanksgiving, -3), addNyDays(thanksgiving, 3))) return 'thanksgiving';
  if (today.month === 12 && today.day >= 15 && today.day <= 26) return 'christmas';
  if ((today.month === 12 && today.day === 31) || (today.month === 1 && today.day <= 2)) return 'new_year';
  const easter = easterSunday(today.year);
  if (inNyWindow(today, addNyDays(easter, -7), addNyDays(easter, 1))) return 'easter';
  const center = anniversaryCenter(today.year, anniversary);
  if (center && inNyWindow(today, addNyDays(center, -1), addNyDays(center, 1))) return 'anniversary';
  return null;
}
