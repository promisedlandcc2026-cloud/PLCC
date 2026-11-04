/**
 * Per-user Home dashboard dismissals (localStorage).
 * Soft-hide only — does not change Minutes acknowledgements or event data.
 */

export type DashboardDismissalKind = 'minutes' | 'promo';

export type DashboardDismissalEntry = {
  at: string;
  title: string;
  kind: DashboardDismissalKind;
};

export type DashboardDismissalsMap = Record<string, DashboardDismissalEntry>;

const STORAGE_PREFIX = 'awc.dashboard.dismissals.v1.';

export function minutesDismissalKey(documentId: string): string {
  return `minutes:${documentId}`;
}

export function promoDismissalKey(eventId: string): string {
  return `promo:${eventId}`;
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function readMap(userId: string | null | undefined): DashboardDismissalsMap {
  if (!userId || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: DashboardDismissalsMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') {
        // Legacy: timestamp-only
        out[k] = {
          at: v,
          title: k,
          kind: k.startsWith('minutes:') ? 'minutes' : 'promo',
        };
      } else if (v && typeof v === 'object') {
        const e = v as Partial<DashboardDismissalEntry>;
        if (typeof e.at === 'string') {
          out[k] = {
            at: e.at,
            title: typeof e.title === 'string' && e.title.trim() ? e.title : k,
            kind: e.kind === 'minutes' || e.kind === 'promo'
              ? e.kind
              : k.startsWith('minutes:')
                ? 'minutes'
                : 'promo',
          };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(userId: string, map: DashboardDismissalsMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function listDismissals(userId: string | null | undefined): Array<{
  key: string;
  entry: DashboardDismissalEntry;
}> {
  const map = readMap(userId);
  return Object.entries(map)
    .map(([key, entry]) => ({ key, entry }))
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at));
}

export function isDismissed(userId: string | null | undefined, itemKey: string): boolean {
  if (!userId || !itemKey) return false;
  return Boolean(readMap(userId)[itemKey]);
}

export function dismissHomeItem(
  userId: string | null | undefined,
  itemKey: string,
  meta: { title: string; kind: DashboardDismissalKind }
): DashboardDismissalsMap {
  if (!userId || !itemKey) return {};
  const map = readMap(userId);
  map[itemKey] = {
    at: new Date().toISOString(),
    title: meta.title.trim() || itemKey,
    kind: meta.kind,
  };
  writeMap(userId, map);
  return map;
}

export function restoreHomeItem(
  userId: string | null | undefined,
  itemKey: string
): DashboardDismissalsMap {
  if (!userId || !itemKey) return {};
  const map = readMap(userId);
  delete map[itemKey];
  writeMap(userId, map);
  return map;
}

/** True when local calendar date is after the fellowship event date (YYYY-MM-DD). */
export function isFellowshipEventPast(
  eventDateYmd: string,
  now: Date = new Date()
): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(eventDateYmd || '').trim());
  if (!m) return false;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return now.getTime() > end.getTime();
}
