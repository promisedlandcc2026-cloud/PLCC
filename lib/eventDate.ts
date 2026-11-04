/**
 * Calendar event date helpers — prefer the `date` column (YYYY-MM-DD)
 * over `starts_at`, which may be stale or set to "now" on create.
 */

export function toEventYmd(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const parsed = Date.parse(s);
  if (!Number.isFinite(parsed)) return null;
  const d = new Date(parsed);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Canonical calendar day for an event row / home card. */
export function eventCalendarYmd(ev?: {
  date?: string | null;
  start_time?: string | null;
  starts_at?: string | null;
} | null): string | null {
  if (!ev) return null;
  return toEventYmd(ev.date) || toEventYmd(ev.start_time || ev.starts_at);
}

export function eventsOverviewPath(dateYmd?: string | null): string {
  const ymd = toEventYmd(dateYmd);
  if (!ymd) return '/events/overview';
  return `/events/overview?date=${encodeURIComponent(ymd)}`;
}

/** Local noon so weekday labels don't shift across timezones for date-only values. */
export function eventLocalNoon(dateYmd: string): Date {
  return new Date(`${dateYmd}T12:00:00`);
}

export function formatEventDayLabel(dateYmd: string): string {
  try {
    return eventLocalNoon(dateYmd).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateYmd;
  }
}

export function formatEventWhenLabel(opts?: {
  date?: string | null;
  start_time?: string | null;
  starts_at?: string | null;
  time?: string | null;
  includeWeekdayLong?: boolean;
} | null): string {
  if (!opts) return 'See calendar';
  const ymd = eventCalendarYmd(opts);
  if (!ymd) return 'See calendar';
  const timeStr = String(opts.time || '').trim();
  try {
    const d = eventLocalNoon(ymd);
    const dayPart = d.toLocaleDateString(undefined, {
      weekday: opts.includeWeekdayLong ? 'long' : 'short',
      month: 'short',
      day: 'numeric',
    });
    return timeStr ? `${dayPart} · ${timeStr}` : dayPart;
  } catch {
    return timeStr ? `${ymd} · ${timeStr}` : ymd;
  }
}

/** Build an ISO-ish starts_at from calendar date + display time (best-effort). */
/**
 * Church time offset ("-04:00" in summer, "-05:00" in winter) for a wall-clock time in
 * Africa/Kampala. Event start times are saved with it so "2:00 PM" means 2 PM in Acton,
 * not 2 PM UTC (which showed events 4–5 hours early).
 */
export function easternOffset(ymd: string, hour = 12, minute = 0): string {
  const guess = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), hour, minute);
  for (const off of [4, 5]) {
    const t = new Date(guess + off * 3_600_000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Kampala',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(t);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    if (h === hour) return `-0${off}:00`;
  }
  return '-05:00';
}

export function buildStartsAtFromDateAndTime(
  dateYmd: string,
  timeLabel?: string | null
): string | null {
  const ymd = toEventYmd(dateYmd);
  if (!ymd) return null;
  const raw = String(timeLabel || '').trim();
  if (!raw) return `${ymd}T12:00:00${easternOffset(ymd, 12, 0)}`;

  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return `${ymd}T12:00:00${easternOffset(ymd, 12, 0)}`;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return `${ymd}T12:00:00${easternOffset(ymd, 12, 0)}`;
  return `${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${easternOffset(ymd, hour, minute)}`;
}
