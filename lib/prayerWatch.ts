/**
 * Intercessors Prayer Watch (Vault): access, the request list, Prayed / Answered marks,
 * and the Tuesday / Friday meeting days. The server checks access on every request;
 * the access hook only shapes the menu.
 */
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';

export const MEETING_DAYS = [2, 5]; // Tuesday, Friday

export type PrayerWatchAccess = {
  allowed: boolean;
  canLead: boolean;
  setUp: boolean;
  roomId: string | null;
  roomName: string | null;
};

export type WatchPrayer = {
  id: string;
  name: string;
  category: string;
  content: string;
  createdAt: string;
  onWall: boolean;
  privateToIntercessors?: boolean;
  prayedAt: string | null;
  prayedBy: string | null;
  answeredAt: string | null;
};

const BASE = '/api/vault?resource=community&subResource=intercessors';
const NONE: PrayerWatchAccess = { allowed: false, canLead: false, setUp: false, roomId: null, roomName: null };
let cache: { key: string; promise: Promise<PrayerWatchAccess> } | null = null;

export function fetchPrayerWatchAccess(key = 'me'): Promise<PrayerWatchAccess> {
  if (cache?.key === key) return cache.promise;
  const promise = apiFetch<any>(`${BASE}&action=access`, { timeoutMs: 20_000 })
    .then((d) => ({
      allowed: d?.allowed === true,
      canLead: d?.canLead === true,
      setUp: d?.setUp === true,
      roomId: typeof d?.roomId === 'string' ? d.roomId : null,
      roomName: typeof d?.ministryName === 'string' ? d.ministryName : null,
    }))
    .catch(() => NONE);
  cache = { key, promise };
  return promise;
}

export function usePrayerWatchAccess(userId: string | null | undefined, role: string | null | undefined): PrayerWatchAccess {
  const [access, setAccess] = useState<PrayerWatchAccess>(NONE);
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setAccess(NONE);
      return;
    }
    void fetchPrayerWatchAccess(`${userId}:${role || ''}`).then((a) => {
      if (!cancelled) setAccess(a);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, role]);
  return access;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const b = err.body as { error?: unknown } | null;
    if (b && typeof b.error === 'string') return b.error;
  }
  return fallback;
}

export async function fetchWatchPrayers(from: Date, to: Date): Promise<WatchPrayer[]> {
  try {
    const d = await apiFetch<any>(`${BASE}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    return Array.isArray(d?.items) ? d.items : [];
  } catch (err) {
    throw new Error(errorMessage(err, 'We couldn’t load the prayer requests. Please try again.'));
  }
}

export async function fetchAnsweredWatchPrayers(): Promise<WatchPrayer[]> {
  try {
    const d = await apiFetch<any>(`${BASE}&view=answered`);
    return Array.isArray(d?.items) ? d.items : [];
  } catch (err) {
    throw new Error(errorMessage(err, 'We couldn’t load the praise reports. Please try again.'));
  }
}

export async function markWatchPrayer(action: 'prayed' | 'answered', id: string, value: boolean): Promise<void> {
  try {
    await apiFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, value }),
    });
  } catch (err) {
    throw new Error(errorMessage(err, 'That change was not saved. Please try again.'));
  }
}

/** Remove a prayer request for good (head of the Intercessors / prayer team). */
export async function removeWatchPrayer(id: string): Promise<void> {
  try {
    await apiFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id }),
    });
  } catch (err) {
    throw new Error(errorMessage(err, 'That request was not removed. Please try again.'));
  }
}

/** Make sure the viewer is in the Intercessor Channel before joining its Live Huddle. */
export async function joinWatchRoom(): Promise<void> {
  try {
    await apiFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join-room' }),
    });
  } catch (err) {
    throw new Error(errorMessage(err, 'We couldn’t open the prayer call. Please try again.'));
  }
}

/** Start (00:00 local) of the last meeting day before today. On a Tuesday this is the Friday before. */
export function lastMeetingStart(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 1; i <= 7; i += 1) {
    const c = new Date(d);
    c.setDate(d.getDate() - i);
    if (MEETING_DAYS.includes(c.getDay())) return c;
  }
  return new Date(d.getTime() - 7 * 86400000);
}

/** Next meeting day, counting today. */
export function nextMeetingDay(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < 7; i += 1) {
    const c = new Date(d);
    c.setDate(d.getDate() + i);
    if (MEETING_DAYS.includes(c.getDay())) return c;
  }
  return d;
}
