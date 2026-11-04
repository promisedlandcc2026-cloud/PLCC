import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';
import {
  dismissStoreNavHint,
  evaluateUnseenPending,
  isStoreNavHintActive,
  setStoreNavHintActive,
  subscribeStoreNavHint,
} from './storeNavHint';

const POLL_MS = 20_000;

type LatestPendingResponse = {
  ok?: boolean;
  orders?: Array<{ created_at?: string }>;
};

/**
 * Polls actionable store orders and drives the Treasury / Store Orders / All cues.
 * Cue turns off when dismiss() is called (All click); turns back on for newer pending orders.
 */
export function useStoreOrderCue(enabled: boolean, userId?: string | null) {
  const [showCue, setShowCue] = useState(() => (enabled ? isStoreNavHintActive() : false));

  const refresh = useCallback(async () => {
    if (!enabled) {
      setShowCue(false);
      return;
    }

    try {
      const data = await apiFetch<LatestPendingResponse>(
        '/api/vault?resource=store-orders&status=actionable&limit=1',
        { userId }
      );
      const latest = data.orders?.[0]?.created_at || null;
      const active = evaluateUnseenPending(latest);
      setStoreNavHintActive(active);
      setShowCue(active);
    } catch {
      // Keep last known cue state on transient auth/network errors
      setShowCue(isStoreNavHintActive());
    }
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled) {
      setShowCue(false);
      return;
    }

    setShowCue(isStoreNavHintActive());
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    const unsub = subscribeStoreNavHint(() => setShowCue(isStoreNavHintActive()));

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [enabled, refresh]);

  const dismiss = useCallback(() => {
    dismissStoreNavHint();
    setShowCue(false);
  }, []);

  return { showCue, dismiss, refresh };
}
