/**
 * Does the signed-in person have Fundraiser access? Asked once per session (by role, or the
 * per-person switch). The server enforces it on every request; this only shapes the menu.
 */
import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export type FundraiserAccess = { allowed: boolean; canManage: boolean; canDelete: boolean };

const NONE: FundraiserAccess = { allowed: false, canManage: false, canDelete: false };
let cache: { key: string; promise: Promise<FundraiserAccess> } | null = null;
const listeners = new Set<() => void>();

export function fetchFundraiserAccess(key: string): Promise<FundraiserAccess> {
  if (cache?.key === key) return cache.promise;
  const promise = apiFetch<FundraiserAccess & { ok: boolean }>('/api/vault?resource=fundraisers&action=access', { timeoutMs: 20_000 })
    .then((d) => ({ allowed: d?.allowed === true, canManage: d?.canManage === true, canDelete: d?.canDelete === true }))
    .catch(() => NONE);
  cache = { key, promise };
  return promise;
}

/** Call after the switch changes for the current user, so the menu updates. */
export function resetFundraiserAccess(): void {
  cache = null;
  listeners.forEach((fn) => fn());
}

export function useFundraiserAccess(userId: string | null | undefined, role: string | null | undefined): FundraiserAccess {
  const [access, setAccess] = useState<FundraiserAccess>(NONE);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const fn = () => setNonce((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setAccess(NONE);
      return;
    }
    void fetchFundraiserAccess(`${userId}:${role || ''}`).then((a) => {
      if (!cancelled) setAccess(a);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, role, nonce]);
  return access;
}
