/**
 * Check-in points client — leader QR, member self check-in, profile points, Home leaderboard.
 * Server: api/_utils/checkinPointsHandler.ts
 */
import { fetchAuthorized } from './api';

export type PointsSeason = { key: string; label: string; emoji: string };

export type PointsSummary = {
  seasonPoints: number;
  lifetimePoints: number;
  checkins: number;
  showOnLeaderboard: boolean;
  rank: number | null;
};

export type SelfQrState = {
  session: { id: string; title: string; status: string; type: string; pointsEnabled: boolean };
  checkedInCount: number;
  recent: string[];
  token: string | null;
  expiresAt: string | null;
  serverNow?: string;
};

export type AwardLine = { reason: string; label: string; points: number; note: string | null };

export type SelfCheckinResult = {
  alreadyCheckedIn: boolean;
  sessionTitle: string;
  pointsEnabled: boolean;
  awards: AwardLine[];
  pointsEarned: number;
  season: PointsSeason;
  summary: PointsSummary | null;
};

export type PointsHistoryRow = {
  label: string;
  reason: string;
  points: number;
  note: string | null;
  sessionTitle: string | null;
  at: string;
};

export type MyPoints = {
  linked: boolean;
  season: PointsSeason;
  summary: PointsSummary | null;
  history: PointsHistoryRow[];
};

export type LeaderRow = { rank: number; name: string; points: number; isMe: boolean };

export type Leaderboard = {
  season: PointsSeason;
  leaders: LeaderRow[];
  me: { points: number; rank: number | null; showOnLeaderboard: boolean } | null;
};

export class PointsApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const BASE = '/api/vault?resource=attendance&subResource=';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchAuthorized(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new PointsApiError(
      String(data?.error || 'Something went wrong. Try again.'),
      String(data?.code || 'error'),
      res.status
    );
  }
  return data as T;
}

export function fetchSelfQr(sessionId: string) {
  return call<SelfQrState>(`self-qr&sessionId=${encodeURIComponent(sessionId)}`);
}

export function setSessionPoints(sessionId: string, pointsEnabled: boolean) {
  return call<{ pointsEnabled: boolean; backfilled?: number }>('self-qr', {
    method: 'PATCH',
    body: JSON.stringify({ sessionId, pointsEnabled }),
  });
}

/** Scanning a kids room code returns the parent's children to pick from. */
export type KidsChild = { id: string; name: string; checkedIn: boolean };
export type KidsChooser = { kind: 'kids'; sessionTitle: string; pass: string; children: KidsChild[] };

export function isKidsChooser(value: unknown): value is KidsChooser {
  return Boolean(value && (value as { kind?: string }).kind === 'kids');
}

export function selfCheckIn(code: string) {
  return call<SelfCheckinResult | KidsChooser>('self-check-in', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export type KidsCheckinResult = {
  ok: boolean;
  sessionTitle: string;
  results: { id: string; ok: boolean; alreadyCheckedIn?: boolean; error?: string }[];
  children: KidsChild[];
};

export function kidsSelfCheckIn(pass: string, childIds: string[]) {
  return call<KidsCheckinResult>('kids-self-check-in', {
    method: 'POST',
    body: JSON.stringify({ pass, childIds }),
  });
}

export function fetchMyPoints() {
  return call<MyPoints>('my-points');
}

export function setShowOnLeaderboard(showOnLeaderboard: boolean) {
  return call<{ showOnLeaderboard: boolean }>('my-points', {
    method: 'PATCH',
    body: JSON.stringify({ showOnLeaderboard }),
  });
}

export function fetchLeaderboard() {
  return call<Leaderboard>('points-leaderboard');
}

/** The link printed inside the QR, so a phone's own camera also opens the Vault. */
export function scanInUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#/scan-in?c=${encodeURIComponent(token)}`;
}

export const SCAN_IN_ROUTE = '/scan-in';
