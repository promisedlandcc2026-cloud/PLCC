/**
 * PLCC Bucks — leader client (Kids Bucks page). Server: api/_utils/kidsBucksHandler.ts
 * Parents read wallets through fetchKidsView (parentDependentsClient).
 */
import { fetchAuthorized } from './api';
import type { BucksWallet } from './parentDependentsClient';

const BASE = '/api/vault?resource=kids-bucks';

export type BucksReason = { id: string; label: string; amount: number; sort_order?: number; active?: boolean };
export type BucksMe = {
  canAward: boolean;
  canReverse: boolean;
  canApprove?: boolean;
  canFulfill?: boolean;
  canRecommend?: boolean;
  isSuperAdmin: boolean;
  reasons: BucksReason[];
  caps: { weekly: number; daily: number } | null;
};
export type BucksChild = { id: string; name: string; balance: number };
export type BucksAwardResult = {
  ok: true;
  duplicate: boolean;
  entryId: string;
  amount: number;
  reasonLabel: string;
  issuedByName?: string;
  balance: number;
  childId: string;
  childName: string;
};
export type BucksRecentEntry = {
  id: string;
  kind: 'award' | 'reversal';
  amount: number;
  reasonLabel: string;
  awardedBy: string;
  note: string | null;
  childName: string;
  createdAt: string;
  reversed: boolean;
};
export type BucksLeader = {
  userId: string;
  name: string;
  role: string;
  displayName: string | null;
  canAward: boolean;
  canApprove?: boolean;
  canFulfill?: boolean;
  canRecommend?: boolean;
  active: boolean;
};
export type BucksPrize = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  unitCostCents?: number | null;
  onHand?: number;
  inStock?: boolean;
  active?: boolean;
};
export type BucksRequestRow = {
  id: string;
  childName: string;
  prizeName: string;
  price: number;
  status: 'requested' | 'approved';
  requestedAt: string;
  costCents?: number | null;
};
export type BucksRecommendation = {
  id: string;
  childName: string;
  reasonId: string;
  note: string | null;
  recommendedBy: string;
  status: string;
  createdAt: string;
};
export type BucksAdmin = {
  reasons: BucksReason[];
  caps: { weekly: number; daily: number } | null;
  leaders: BucksLeader[];
};

export class BucksError extends Error {
  code: string;
  status: number;
  remaining?: number;
  constructor(message: string, code: string, status: number, remaining?: number) {
    super(message);
    this.name = 'BucksError';
    this.code = code;
    this.status = status;
    this.remaining = remaining;
  }
}

async function call<T>(query: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchAuthorized(`${BASE}&${query}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new BucksError(
      String(data?.error || 'Something went wrong. Try again.'),
      String(data?.code || 'error'),
      res.status,
      typeof data?.remaining === 'number' ? data.remaining : undefined
    );
  }
  return data as T;
}

/** A fresh key per tap: a double tap or retry of the SAME tap pays once. */
export function newIdempotencyKey(): string {
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return `tap-${c.randomUUID()}`;
  return `tap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const fetchBucksMe = () => call<BucksMe & { ok: true }>('action=me');
export const fetchBucksChildren = () => call<{ ok: true; children: BucksChild[] }>('action=children');
export const fetchBucksWallet = (childId: string) =>
  call<{ ok: true; wallet: BucksWallet }>(`action=wallet&childId=${encodeURIComponent(childId)}`);
export const fetchBucksRecent = () => call<{ ok: true; entries: BucksRecentEntry[] }>('action=recent');
export const fetchBucksAdmin = () => call<BucksAdmin & { ok: true }>('action=admin');

export function awardBucks(input: {
  childId?: string;
  cardToken?: string;
  reasonId: string;
  idempotencyKey: string;
  note?: string;
}) {
  return call<BucksAwardResult>('action=award', { method: 'POST', body: JSON.stringify(input) });
}

export function reverseBucks(entryId: string, note: string) {
  return call<{ ok: true; balance: number; outstanding?: number; applied?: number }>('action=reverse', {
    method: 'POST',
    body: JSON.stringify({ entryId, note }),
  });
}

export function setBucksCaps(weekly: number, daily: number) {
  return call<{ ok: true }>('action=caps', { method: 'PATCH', body: JSON.stringify({ weekly, daily }) });
}

export function saveBucksReason(r: { id: string; label: string; amount: number; active: boolean; sortOrder?: number }) {
  return call<{ ok: true }>('action=reason', { method: 'PATCH', body: JSON.stringify(r) });
}

export function saveBucksLeader(l: {
  userId: string;
  displayName: string | null;
  canAward: boolean;
  canApprove?: boolean;
  canFulfill?: boolean;
  canRecommend?: boolean;
  active: boolean;
}) {
  return call<{ ok: true; canAwardNow?: boolean }>('action=leader', { method: 'PATCH', body: JSON.stringify(l) });
}

export const fetchBucksPrizes = () => call<{ ok: true; prizes: BucksPrize[] }>('action=prizes');
export const fetchBucksRequests = () => call<{ ok: true; requests: BucksRequestRow[] }>('action=requests');
export const fetchBucksRecommendations = () =>
  call<{ ok: true; recommendations: BucksRecommendation[] }>('action=recommendations');

export function requestBucksPrize(input: { childId: string; prizeId: string; idempotencyKey: string }) {
  return call<{ ok: true }>('action=request', { method: 'POST', body: JSON.stringify(input) });
}
export function approveBucksRequest(input: { requestId: string; override?: boolean; note?: string }) {
  return call<{ ok: true }>('action=approve', { method: 'POST', body: JSON.stringify(input) });
}
export function fulfillBucksRequest(requestId: string) {
  return call<{ ok: true }>('action=fulfill', { method: 'POST', body: JSON.stringify({ requestId }) });
}
export function closeBucksRequest(input: { requestId: string; which: 'reject' | 'cancel'; note?: string }) {
  return call<{ ok: true }>('action=close', { method: 'POST', body: JSON.stringify(input) });
}
export function recommendBucks(input: { childId: string; reasonId: string; idempotencyKey: string; note?: string }) {
  return call<{ ok: true }>('action=recommend', { method: 'POST', body: JSON.stringify(input) });
}
export function decideBucksRecommendation(input: { recommendationId: string; approve: boolean; note?: string }) {
  return call<{ ok: true }>('action=decide-recommendation', { method: 'POST', body: JSON.stringify(input) });
}
export function saveBucksPrize(input: { id: string; name: string; price: number; unitCostCents: number | null; active?: boolean }) {
  return call<{ ok: true }>('action=prize', { method: 'PATCH', body: JSON.stringify(input) });
}
export function adjustBucksStock(input: { prizeId: string; delta: number; note: string }) {
  return call<{ ok: true; onHand?: number }>('action=stock', { method: 'POST', body: JSON.stringify(input) });
}
export function setBucksBudget(month: string, budgetCents: number) {
  return call<{ ok: true }>('action=budget', { method: 'PATCH', body: JSON.stringify({ month, budgetCents }) });
}

export const BUCKS_COIN = {
  sm: '/images/awc-bucks/coin-64.png',
  md: '/images/awc-bucks/coin-128.png',
  lg: '/images/awc-bucks/coin-256.png',
};
