/** Church-local (Africa/Kampala) week helpers shared by Kids View and badges. */
export const TZ = 'Africa/Kampala';
export const DAY_MS = 86_400_000;

/** YYYY-MM-DD of the Sunday that starts the (church-local) week containing `d`. */
export function weekStartKey(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const local = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')));
  return new Date(local - Math.max(0, wd) * DAY_MS).toISOString().slice(0, 10);
}

export function shiftWeek(key: string, weeks: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + weeks * 7 * DAY_MS).toISOString().slice(0, 10);
}

