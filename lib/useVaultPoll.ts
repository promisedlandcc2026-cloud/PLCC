import { useCallback, useEffect, useRef, type DependencyList } from 'react';
import { isAuthPollingHalted, onAuthPollingChange } from './authSession';

/** Network-error backoff steps; a successful poll resets to the normal interval. */
export const POLL_BACKOFF_STEPS_MS = [5_000, 10_000, 30_000] as const;

/** Pure: delay before the next poll after `failures` consecutive network errors. */
export function nextPollDelayMs(intervalMs: number, failures: number): number {
  if (failures <= 0) return intervalMs;
  const step = POLL_BACKOFF_STEPS_MS[Math.min(failures, POLL_BACKOFF_STEPS_MS.length) - 1];
  return Math.max(intervalMs, step);
}

function canPollNow(): boolean {
  if (isAuthPollingHalted()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  return true;
}

/**
 * Shared poller for /api/vault reads (chat unread, notifications, messages).
 * - Runs `poll` now and every `intervalMs` while `enabled`.
 * - Pauses while offline or the tab is hidden; resumes on 'online' / 'visibilitychange'.
 * - Stops after an auth failure or sign-out (resumes when a session is hydrated again).
 * - If `poll` throws (network error), backs off 5s → 10s → 30s instead of hammering.
 *
 * Returns `trigger()` to poll immediately (e.g. on window focus or after a user action).
 */
export function useVaultPoll(
  poll: () => Promise<void>,
  options: { intervalMs: number; enabled?: boolean; deps?: DependencyList }
): () => void {
  const { intervalMs, enabled = true, deps = [] } = options;
  const pollRef = useRef(poll);
  pollRef.current = poll;
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let running = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clear = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const schedule = (ms: number) => {
      clear();
      if (stopped || isAuthPollingHalted()) return;
      timer = setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      timer = undefined;
      // Paused ticks are not rescheduled; the online/visibility handlers restart them.
      if (stopped || running || !canPollNow()) return;
      running = true;
      try {
        await pollRef.current();
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
      }
      if (!stopped) schedule(nextPollDelayMs(intervalMs, failures));
    };

    const resume = () => {
      if (stopped || running || !canPollNow()) return;
      clear();
      void tick();
    };

    const onVisibility = () => {
      if (document.hidden) clear();
      else resume();
    };
    const onOffline = () => clear();

    triggerRef.current = resume;
    window.addEventListener('online', resume);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    const unsubscribe = onAuthPollingChange((halted) => {
      if (halted) clear();
      else resume();
    });

    void tick();

    return () => {
      stopped = true;
      clear();
      triggerRef.current = () => {};
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);

  return useCallback(() => triggerRef.current(), []);
}
