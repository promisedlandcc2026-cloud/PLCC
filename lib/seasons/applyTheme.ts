import { fetchWithTimeout, getAuthHeaders } from '../api';
import {
  dateOnNyDay,
  DEFAULT_SEASONAL_SETTINGS,
  getActiveTheme,
  parseNyKey,
  parseSeasonalSettings,
  readMemberEffectsOff,
  SEASON_PREVIEW_EVENT,
  SEASON_PREVIEW_KEY,
  type ActiveTheme,
  type SeasonalSettings,
  type ThemeMode,
} from './index';
import { fetchKampalaWeather } from './weather';

export type SeasonPreview = { mode: ThemeMode; date: string | null };

export type PublishedSeason = {
  theme: ActiveTheme;
  showEffects: boolean;
};

const listeners = new Set<(published: PublishedSeason) => void>();
const initialTheme = getActiveTheme(new Date());
let published: PublishedSeason = {
  theme: initialTheme,
  // Show the season's effect immediately; refreshSeasonTheme may turn it off
  // when the church or this member has seasonal effects off.
  showEffects: initialTheme.effect !== 'none',
};

export function getPublishedSeason(): PublishedSeason {
  return published;
}

export function subscribeSeason(listener: (published: PublishedSeason) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readSeasonPreview(): SeasonPreview | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SEASON_PREVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mode?: string; date?: string | null };
    const mode = parseSeasonalSettings({ mode: parsed.mode }).mode;
    const date = typeof parsed.date === 'string' && parseNyKey(parsed.date) ? parsed.date : null;
    if (mode === 'automatic' && !date) return null;
    return { mode, date };
  } catch {
    return null;
  }
}

export function writeSeasonPreview(preview: SeasonPreview | null): void {
  if (!preview || (preview.mode === 'automatic' && !preview.date)) {
    sessionStorage.removeItem(SEASON_PREVIEW_KEY);
  } else {
    sessionStorage.setItem(SEASON_PREVIEW_KEY, JSON.stringify(preview));
  }
  window.dispatchEvent(new Event(SEASON_PREVIEW_EVENT));
}

async function loadChurchSeasonalSettings(): Promise<SeasonalSettings> {
  try {
    const headers = await getAuthHeaders().catch(() => ({}));
    const res = await fetchWithTimeout('/api/vault?resource=settings&scope=system', { headers }, 8_000).catch(() => null);
    if (!res?.ok) return DEFAULT_SEASONAL_SETTINGS;
    const data = await res.json().catch(() => null);
    return parseSeasonalSettings(data?.settings?.seasonal);
  } catch {
    return DEFAULT_SEASONAL_SETTINGS;
  }
}

export async function refreshSeasonTheme(): Promise<PublishedSeason> {
  const church = await loadChurchSeasonalSettings();
  const preview = readSeasonPreview();
  const date = preview?.date
    ? dateOnNyDay(
        Number(preview.date.slice(0, 4)),
        Number(preview.date.slice(5, 7)),
        Number(preview.date.slice(8, 10))
      )
    : new Date();
  let theme = getActiveTheme(date, {
    ...church,
    mode: preview ? preview.mode : church.mode,
  });
  // Automatic, not a holiday, and today (not a previewed date): use Kampala's live weather.
  if ((theme.id === 'rainy' || theme.id === 'dry') && (preview ? preview.mode : church.mode) === 'automatic' && !preview?.date) {
    const live = await fetchKampalaWeather();
    if (live) {
      theme = {
        ...theme,
        mark: live.mark,
        effect: live.effect,
        weatherLabel: live.tempC !== null ? `${live.label} · ${live.tempC}°C in Kampala` : `${live.label} in Kampala`,
      };
    }
  }
  const userId = typeof localStorage === 'undefined' ? null : localStorage.getItem('awc_user_id');
  // Reduced motion still shows the leaves; SeasonParticles holds them still.
  const showEffects = church.effects && !readMemberEffectsOff(userId) && theme.effect !== 'none';
  published = { theme, showEffects };
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.season = theme.id;
    document.documentElement.dataset.seasonEffects = showEffects ? theme.effect : 'none';
  }
  listeners.forEach((listener) => listener(published));
  return published;
}
