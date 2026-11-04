export { addNyDays, dateOnNyDay, inNyWindow, nyKey, nyParts, parseNyKey } from './nyDate';
export { getCurrentSeason, getSeasonWindow } from './season';
export type { SeasonName, SeasonWindow } from './season';
export { easterSunday, getActiveHoliday, thanksgivingDay } from './holidays';
export type { HolidayName } from './holidays';
export {
  DEFAULT_SEASONAL_SETTINGS,
  getActiveTheme,
  parseSeasonalSettings,
} from './theme';
export type { ActiveTheme, SeasonalSettings, SeasonEffect, ThemeId, ThemeMode } from './theme';

export const SEASON_PREVIEW_KEY = 'awc_season_preview';
export const SEASON_PREVIEW_EVENT = 'awc-season-preview';

export function memberEffectsStorageKey(userId: string): string {
  return `awc_season_effects_off:${userId}`;
}

export function readMemberEffectsOff(userId: string | null | undefined): boolean {
  if (!userId || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(memberEffectsStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function writeMemberEffectsOff(userId: string, off: boolean): void {
  localStorage.setItem(memberEffectsStorageKey(userId), off ? '1' : '0');
  window.dispatchEvent(new Event(SEASON_PREVIEW_EVENT));
}
