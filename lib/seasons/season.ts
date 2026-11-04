import { isLeapYear, nyKey, nyParts, type NyDate } from './nyDate';

export type SeasonName = 'fall' | 'winter' | 'spring' | 'summer';

export type SeasonWindow = {
  season: SeasonName;
  start: string;
  end: string;
};

export function getCurrentSeason(date: Date): SeasonName {
  return getSeasonWindow(date).season;
}

/** Inclusive start and end (YYYY-MM-DD) for the season that contains this New York date. */
export function getSeasonWindow(date: Date): SeasonWindow {
  const { year, month } = nyParts(date);
  if (month >= 9 && month <= 11) {
    return { season: 'fall', start: nyKey({ year, month: 9, day: 1 }), end: nyKey({ year, month: 11, day: 30 }) };
  }
  if (month >= 6 && month <= 8) {
    return { season: 'summer', start: nyKey({ year, month: 6, day: 1 }), end: nyKey({ year, month: 8, day: 31 }) };
  }
  if (month >= 3 && month <= 5) {
    return { season: 'spring', start: nyKey({ year, month: 3, day: 1 }), end: nyKey({ year, month: 5, day: 31 }) };
  }
  if (month === 12) {
    return {
      season: 'winter',
      start: nyKey({ year, month: 12, day: 1 }),
      end: nyKey({ year: year + 1, month: 2, day: isLeapYear(year + 1) ? 29 : 28 }),
    };
  }
  return {
    season: 'winter',
    start: nyKey({ year: year - 1, month: 12, day: 1 }),
    end: nyKey({ year, month: 2, day: isLeapYear(year) ? 29 : 28 }),
  };
}

export function seasonOfParts(parts: NyDate): SeasonName {
  return getCurrentSeason(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 16, 0, 0)));
}
