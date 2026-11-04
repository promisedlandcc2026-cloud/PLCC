import { useEffect } from 'react';

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Keep the device screen awake while `enabled` is true (Screen Wake Lock API).
 * No-ops when unsupported; reacquires after the tab becomes visible again.
 */
export function useScreenWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return;

    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock?.request) return;

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const releaseSentinel = () => {
      const current = sentinel;
      sentinel = null;
      if (!current || current.released) return;
      void current.release().catch(() => {
        /* ignore — already released by the browser */
      });
    };

    const request = async () => {
      try {
        if (cancelled || document.visibilityState !== 'visible') return;
        releaseSentinel();
        const next = await nav.wakeLock!.request('screen');
        if (cancelled || document.visibilityState !== 'visible') {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
        next.addEventListener('release', () => {
          if (sentinel === next) sentinel = null;
        });
      } catch {
        /* denied: low battery, power save, permissions policy, etc. */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void request();
      } else {
        // Browser releases the lock when hidden; drop our reference.
        sentinel = null;
      }
    };

    void request();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      releaseSentinel();
    };
  }, [enabled]);
}
