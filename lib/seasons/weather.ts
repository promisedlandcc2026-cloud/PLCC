/**
 * Today's weather in Kampala for the Home header effect.
 * Uses Open-Meteo (free, no key). Falls back to Uganda's rainy / dry seasons.
 */
import { nyParts } from './nyDate';

export type WeatherEffect = 'sun' | 'stars' | 'clouds' | 'drizzle' | 'rain' | 'storm';
export type UgandaSeason = 'rainy' | 'dry';

export type TodayWeather = {
  effect: WeatherEffect;
  mark: string;
  label: string;
  tempC: number | null;
  live: boolean;
};

const KAMPALA = { lat: 0.3476, lon: 32.5825 };
const CACHE_KEY = 'plcc_kampala_weather_v1';
const CACHE_MS = 30 * 60 * 1000;

/** Two rainy seasons (Mar–May, Sep–Nov); the rest of the year is dry. */
export function ugandaSeason(date: Date): UgandaSeason {
  const { month } = nyParts(date);
  return (month >= 3 && month <= 5) || (month >= 9 && month <= 11) ? 'rainy' : 'dry';
}

export function seasonalWeather(date: Date): TodayWeather {
  return ugandaSeason(date) === 'rainy'
    ? { effect: 'clouds', mark: '🌦️', label: 'Rainy season', tempC: null, live: false }
    : { effect: 'sun', mark: '☀️', label: 'Dry season', tempC: null, live: false };
}

/** WMO weather code → effect. https://open-meteo.com/en/docs */
export function weatherFromCode(code: number, isDay: boolean, tempC: number | null): TodayWeather {
  const t = typeof tempC === 'number' && Number.isFinite(tempC) ? Math.round(tempC) : null;
  const w = (effect: WeatherEffect, mark: string, label: string): TodayWeather => ({ effect, mark, label, tempC: t, live: true });
  if (code >= 95) return w('storm', '⛈️', 'Thunderstorms');
  if (code >= 80) return w('rain', '🌧️', code === 80 ? 'Rain showers' : 'Heavy showers');
  if (code >= 61) return w('rain', '🌧️', code === 61 ? 'Light rain' : 'Rain');
  if (code >= 51) return w('drizzle', '🌦️', 'Drizzle');
  if (code === 45 || code === 48) return w('clouds', '🌫️', 'Misty');
  if (code === 2 || code === 3) return w('clouds', isDay ? '⛅' : '☁️', code === 3 ? 'Cloudy' : 'Partly cloudy');
  return isDay ? w('sun', '☀️', 'Sunny') : w('stars', '🌙', 'Clear night');
}

function readCache(): TodayWeather | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, weather } = JSON.parse(raw) as { at: number; weather: TodayWeather };
    return Date.now() - at < CACHE_MS ? weather : null;
  } catch {
    return null;
  }
}

export async function fetchKampalaWeather(): Promise<TodayWeather | null> {
  const cached = readCache();
  if (cached) return cached;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 6000);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${KAMPALA.lat}&longitude=${KAMPALA.lon}` +
      '&current=temperature_2m,weather_code,is_day&timezone=Africa%2FKampala';
    const res = await fetch(url, { signal: ctrl.signal });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data?.current;
    if (!cur || typeof cur.weather_code !== 'number') return null;
    const weather = weatherFromCode(cur.weather_code, cur.is_day !== 0, Number(cur.temperature_2m));
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), weather }));
    } catch {
      /* private mode */
    }
    return weather;
  } catch {
    return null;
  }
}
