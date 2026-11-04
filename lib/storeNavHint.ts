const SEEN_AT_KEY = 'awc_store_nav_seen_at';
const ACTIVE_CACHE_KEY = 'awc_store_nav_hint_active';
/** Legacy one-shot dismiss flag from earlier walkthrough. */
const LEGACY_DISMISS_KEY = 'awc_store_nav_hint_v2';

export const STORE_NAV_HINT_EVENT = 'awc-store-nav-hint';

export const ACTIONABLE_STORE_STATUSES = ['pending_payment', 'awaiting_pickup'] as const;

function notifyListeners() {
  try {
    window.dispatchEvent(new Event(STORE_NAV_HINT_EVENT));
  } catch {
    // ignore
  }
}

export function getStoreNavSeenAt(): string | null {
  try {
    return localStorage.getItem(SEEN_AT_KEY);
  } catch {
    return null;
  }
}

/**
 * Cue is active when there is an actionable pending order newer than the
 * watermark set when staff clicked "All".
 * No watermark + any pending → active (first-time / never dismissed).
 */
export function evaluateUnseenPending(latestPendingCreatedAt: string | null): boolean {
  if (!latestPendingCreatedAt) return false;
  const seenAt = getStoreNavSeenAt();
  if (!seenAt) return true;
  const pendingMs = new Date(latestPendingCreatedAt).getTime();
  const seenMs = new Date(seenAt).getTime();
  if (Number.isNaN(pendingMs) || Number.isNaN(seenMs)) return true;
  return pendingMs > seenMs;
}

/** Cached flag for sync UI reads; updated by the poller. */
export function isStoreNavHintActive(): boolean {
  try {
    return localStorage.getItem(ACTIVE_CACHE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setStoreNavHintActive(active: boolean): void {
  try {
    const next = active ? '1' : '0';
    if (localStorage.getItem(ACTIVE_CACHE_KEY) === next) return;
    localStorage.setItem(ACTIVE_CACHE_KEY, next);
    notifyListeners();
  } catch {
    // ignore storage failures
  }
}

/** Dismiss cues until a newer pending order arrives (watermark = now or provided ISO). */
export function dismissStoreNavHint(seenAt?: string): void {
  try {
    localStorage.setItem(SEEN_AT_KEY, seenAt || new Date().toISOString());
    localStorage.removeItem(LEGACY_DISMISS_KEY);
    localStorage.setItem(ACTIVE_CACHE_KEY, '0');
    notifyListeners();
  } catch {
    // ignore storage failures
  }
}

export function subscribeStoreNavHint(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(STORE_NAV_HINT_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(STORE_NAV_HINT_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
