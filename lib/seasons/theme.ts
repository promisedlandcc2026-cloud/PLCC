import { getActiveHoliday, type AnniversarySetting, type HolidayName } from './holidays';
import { getSeasonWindow, type SeasonName } from './season';
import { seasonalWeather, ugandaSeason, type UgandaSeason, type WeatherEffect } from './weather';

export type ThemeId = SeasonName | UgandaSeason | HolidayName | 'brand';
export type ThemeMode = 'automatic' | 'off' | SeasonName | UgandaSeason | HolidayName;
export type SeasonEffect = 'leaves' | 'snow' | 'petals' | 'sparkles' | WeatherEffect | 'none';

export type SeasonalSettings = {
  mode: ThemeMode;
  effects: boolean;
  anniversaryMonth: number | null;
  anniversaryDay: number | null;
};

export type ActiveTheme = {
  id: ThemeId;
  season: SeasonName;
  seasonStart: string;
  seasonEnd: string;
  holiday: HolidayName | null;
  mark: string;
  greeting: string | null;
  effect: SeasonEffect;
  /** Kampala weather line for the Home header, e.g. "Light rain · 23°C". */
  weatherLabel?: string | null;
};

export const DEFAULT_SEASONAL_SETTINGS: SeasonalSettings = {
  mode: 'automatic',
  effects: true,
  anniversaryMonth: null,
  anniversaryDay: null,
};

const THEME_MODES = new Set<ThemeMode>([
  'automatic',
  'off',
  'rainy',
  'dry',
  'fall',
  'winter',
  'spring',
  'summer',
  'thanksgiving',
  'christmas',
  'new_year',
  'easter',
  'anniversary',
]);

const LOOK: Record<Exclude<ThemeId, 'brand'>, { mark: string; greeting: string | null; effect: SeasonEffect }> = {
  fall: { mark: '🍂', greeting: null, effect: 'leaves' },
  winter: { mark: '❄️', greeting: null, effect: 'snow' },
  spring: { mark: '🌸', greeting: null, effect: 'petals' },
  summer: { mark: '☀️', greeting: null, effect: 'none' },
  rainy: { mark: '🌧️', greeting: null, effect: 'rain' },
  dry: { mark: '☀️', greeting: null, effect: 'sun' },
  thanksgiving: { mark: '🦃', greeting: 'Happy Thanksgiving from PLCC', effect: 'leaves' },
  christmas: { mark: '🎄', greeting: 'Merry Christmas from PLCC', effect: 'sparkles' },
  new_year: { mark: '🎉', greeting: 'Happy New Year from PLCC', effect: 'sparkles' },
  easter: { mark: '🌸', greeting: 'Happy Easter from PLCC', effect: 'petals' },
  anniversary: { mark: '🎉', greeting: 'Happy anniversary from PLCC', effect: 'none' },
};

export function parseSeasonalSettings(raw: unknown): SeasonalSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode = THEME_MODES.has(source.mode as ThemeMode) ? (source.mode as ThemeMode) : 'automatic';
  const effects = source.effects !== false;
  const month = Number(source.anniversaryMonth);
  const day = Number(source.anniversaryDay);
  const anniversaryMonth = month >= 1 && month <= 12 ? month : null;
  const anniversaryDay = day >= 1 && day <= 31 ? day : null;
  if (!anniversaryMonth || !anniversaryDay) {
    return { mode, effects, anniversaryMonth: null, anniversaryDay: null };
  }
  return { mode, effects, anniversaryMonth, anniversaryDay };
}

function anniversaryOf(settings: SeasonalSettings): AnniversarySetting {
  if (!settings.anniversaryMonth || !settings.anniversaryDay) return null;
  return { month: settings.anniversaryMonth, day: settings.anniversaryDay };
}

function themeFor(id: Exclude<ThemeId, 'brand'>, date: Date, holiday: HolidayName | null): ActiveTheme {
  const window = getSeasonWindow(date);
  const look = LOOK[id];
  return {
    id,
    season: window.season,
    seasonStart: window.start,
    seasonEnd: window.end,
    holiday,
    mark: look.mark,
    greeting: look.greeting,
    effect: look.effect,
  };
}

export function getActiveTheme(date: Date, rawSettings?: Partial<SeasonalSettings> | null): ActiveTheme {
  const settings = parseSeasonalSettings({ ...DEFAULT_SEASONAL_SETTINGS, ...(rawSettings || {}) });
  const seasonWindow = getSeasonWindow(date);
  const holiday = getActiveHoliday(date, anniversaryOf(settings));
  if (settings.mode === 'off') {
    return {
      id: 'brand',
      season: seasonWindow.season,
      seasonStart: seasonWindow.start,
      seasonEnd: seasonWindow.end,
      holiday,
      mark: '',
      greeting: null,
      effect: 'none',
    };
  }
  if (settings.mode !== 'automatic') {
    return {
      ...themeFor(settings.mode, date, holiday),
      holiday,
    };
  }
  // Uganda: no US Thanksgiving. Otherwise the season's look until live weather arrives.
  const localHoliday = holiday === 'thanksgiving' ? null : holiday;
  if (localHoliday) return themeFor(localHoliday, date, localHoliday);
  const fallback = seasonalWeather(date);
  return {
    ...themeFor(ugandaSeason(date), date, null),
    mark: fallback.mark,
    effect: fallback.effect,
    weatherLabel: fallback.label,
  };
}
