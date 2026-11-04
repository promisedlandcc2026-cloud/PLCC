/**
 * Season and holiday boundaries for Vault themes.
 * Run: npx tsx scripts/season-theme-smoke.ts
 */
import { dateOnNyDay } from '../lib/seasons/nyDate';
import { getCurrentSeason, getSeasonWindow } from '../lib/seasons/season';
import { easterSunday, getActiveHoliday, thanksgivingDay } from '../lib/seasons/holidays';
import { getActiveTheme } from '../lib/seasons/theme';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function on(year: number, month: number, day: number): Date {
  return dateOnNyDay(year, month, day);
}

console.log('Seasons');
assert(getCurrentSeason(on(2026, 9, 1)) === 'fall', 'Sep 1 is fall');
assert(getCurrentSeason(on(2026, 11, 30)) === 'fall', 'Nov 30 is fall');
assert(getCurrentSeason(on(2026, 12, 1)) === 'winter', 'Dec 1 is winter');
assert(getCurrentSeason(on(2026, 8, 31)) === 'summer', 'Aug 31 is summer');
assert(getCurrentSeason(new Date('2026-09-01T03:00:00Z')) === 'summer', 'Sep 1 03:00 UTC is still Aug 31 in New York');
assert(getCurrentSeason(new Date('2026-09-01T04:00:00Z')) === 'fall', 'Sep 1 04:00 UTC is fall in New York');
assert(getCurrentSeason(on(2026, 3, 1)) === 'spring', 'Mar 1 is spring');
assert(getCurrentSeason(on(2026, 5, 31)) === 'spring', 'May 31 is spring');
assert(getCurrentSeason(on(2026, 6, 1)) === 'summer', 'Jun 1 is summer');

const january = getSeasonWindow(on(2026, 1, 15));
assert(january.season === 'winter' && january.start === '2025-12-01' && january.end === '2026-02-28', 'January 2026 winter window');
const december = getSeasonWindow(on(2026, 12, 20));
assert(december.start === '2026-12-01' && december.end === '2027-02-28', 'December 2026 winter window');
const leapWinter = getSeasonWindow(on(2028, 2, 29));
assert(leapWinter.end === '2028-02-29', '2028 winter includes Feb 29');

console.log('Thanksgiving and Easter');
assert(thanksgivingDay(2026).day === 26 && thanksgivingDay(2026).month === 11, 'Thanksgiving 2026 is Nov 26');
assert(thanksgivingDay(2027).day === 25, 'Thanksgiving 2027 is Nov 25');
assert(thanksgivingDay(2028).day === 23, 'Thanksgiving 2028 is Nov 23');
assert(getActiveHoliday(on(2026, 11, 23)) === 'thanksgiving', '2026 window opens the Monday before');
assert(getActiveHoliday(on(2026, 11, 29)) === 'thanksgiving', '2026 window closes that Sunday');
assert(getActiveHoliday(on(2026, 11, 22)) === null, 'the Sunday before the Monday is not Thanksgiving');
assert(getActiveHoliday(on(2027, 11, 22)) === 'thanksgiving' && getActiveHoliday(on(2027, 11, 28)) === 'thanksgiving', '2027 Thanksgiving window');
assert(getActiveHoliday(on(2028, 11, 20)) === 'thanksgiving' && getActiveHoliday(on(2028, 11, 26)) === 'thanksgiving', '2028 Thanksgiving window');

const easterYears: Array<[number, number, number]> = [
  [2026, 4, 5],
  [2027, 3, 28],
  [2028, 4, 16],
];
for (const [year, month, day] of easterYears) {
  const easter = easterSunday(year);
  assert(easter.month === month && easter.day === day, `Easter ${year} is ${month}/${day}`);
  assert(getActiveHoliday(on(year, month, day)) === 'easter', `Easter Sunday ${year} is the Easter theme`);
}
assert(getActiveHoliday(on(2026, 3, 29)) === 'easter', 'Palm Sunday 2026');
assert(getActiveHoliday(on(2026, 4, 6)) === 'easter', 'Easter Monday 2026');
assert(getActiveHoliday(on(2026, 3, 28)) === null, 'the day before Palm Sunday 2026 is spring');
assert(getActiveHoliday(on(2027, 3, 21)) === 'easter', 'Palm Sunday 2027');
assert(getActiveHoliday(on(2027, 3, 29)) === 'easter', 'Easter Monday 2027');
assert(getActiveHoliday(on(2028, 4, 9)) === 'easter', 'Palm Sunday 2028');
assert(getActiveHoliday(on(2028, 4, 17)) === 'easter', 'Easter Monday 2028');

console.log('Christmas, New Year, anniversary, override');
assert(getActiveHoliday(on(2026, 12, 15)) === 'christmas' && getActiveHoliday(on(2026, 12, 26)) === 'christmas', 'Christmas Dec 15–26');
assert(getActiveHoliday(on(2026, 12, 27)) === null, 'Dec 27 is winter');
assert(getActiveHoliday(on(2026, 12, 31)) === 'new_year', 'Dec 31 is New Year');
assert(getActiveHoliday(on(2027, 1, 1)) === 'new_year' && getActiveHoliday(on(2027, 1, 2)) === 'new_year', 'Jan 1–2 is New Year');
assert(getActiveHoliday(on(2027, 1, 3)) === null, 'Jan 3 is winter');

const anniversary = { month: 6, day: 10 };
assert(getActiveHoliday(on(2026, 6, 9), anniversary) === 'anniversary', 'anniversary opens the day before');
assert(getActiveHoliday(on(2026, 6, 11), anniversary) === 'anniversary', 'anniversary closes the day after');
assert(getActiveHoliday(on(2026, 6, 8), anniversary) === null, 'two days before the anniversary is summer');
assert(
  getActiveHoliday(on(2026, 12, 25), { month: 12, day: 25 }) === 'christmas',
  'Christmas wins over the church anniversary'
);
assert(
  getActiveHoliday(on(2027, 2, 28), { month: 2, day: 29 }) === 'anniversary',
  'a Feb 29 anniversary uses Feb 28 in a non-leap year'
);

const christmas = on(2026, 12, 25);
assert(getActiveTheme(christmas).id === 'christmas', 'automatic Christmas');
assert(getActiveTheme(christmas, { mode: 'fall' }).id === 'fall', 'a forced season wins over the holiday');
assert(getActiveTheme(christmas, { mode: 'off' }).id === 'brand', 'off is the base brand');
assert(getActiveTheme(christmas, { mode: 'off' }).effect === 'none', 'off has no effect');
assert(getActiveTheme(on(2026, 10, 2)).id === 'fall' && getActiveTheme(on(2026, 10, 2)).effect === 'leaves', 'October is fall leaves');
assert(getActiveTheme(on(2026, 7, 4)).effect === 'none', 'summer has no particles');

console.log('season-theme-smoke passed');
