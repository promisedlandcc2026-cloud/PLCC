/**
 * Vault People → PLCC Card Scanner
 * Staff identity resolve only. No attendance / check-in / child pickup actions.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { hasPermission } from '../../lib/permissions';
import AccessDenied from '../../components/Layout/AccessDenied';
import CardScannerCamera from '../../components/people/CardScannerCamera';
import CardScannerResult from '../../components/people/CardScannerResult';
import { resolveAwcDigitalCard } from '../../lib/cardScannerClient';
import {
  RESULT_AUTO_CLEAR_MS,
  SCANNER_ROUTE,
  isValidCardToken,
  precheckScannedToken,
  type ScannerUiState,
} from '../../lib/cardScannerUi';

const CardScannerPage: React.FC = () => {
  const { userRole } = useNav();
  const allowed = hasPermission(userRole as Role, undefined, SCANNER_ROUTE);

  const [cameraActive, setCameraActive] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [uiState, setUiState] = useState<ScannerUiState>({ kind: 'idle' });
  const [clearInSeconds, setClearInSeconds] = useState<number | null>(null);

  const inFlightRef = useRef(false);
  const lastDecodeRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const stopCamera = useCallback(() => {
    setCameraActive(false);
  }, []);

  const clearTimers = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    if (clearTickRef.current) {
      clearInterval(clearTickRef.current);
      clearTickRef.current = null;
    }
    setClearInSeconds(null);
  }, []);

  const resetScanner = useCallback(() => {
    clearTimers();
    inFlightRef.current = false;
    lastDecodeRef.current = { value: '', at: 0 };
    setManualCode('');
    setUiState({ kind: 'idle' });
    setCameraActive(false);
  }, [clearTimers]);

  const scheduleAutoClear = useCallback(() => {
    clearTimers();
    const endsAt = Date.now() + RESULT_AUTO_CLEAR_MS;
    setClearInSeconds(Math.ceil(RESULT_AUTO_CLEAR_MS / 1000));
    clearTickRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setClearInSeconds(left);
    }, 1000);
    clearTimerRef.current = setTimeout(() => {
      resetScanner();
    }, RESULT_AUTO_CLEAR_MS);
  }, [clearTimers, resetScanner]);

  const resolveToken = useCallback(
    async (token: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setCameraActive(false);
      setManualCode('');
      setUiState({ kind: 'loading' });
      clearTimers();

      try {
        const next = await resolveAwcDigitalCard(token);
        setUiState(next);
        if (next.kind !== 'idle' && next.kind !== 'loading') {
          scheduleAutoClear();
          requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [clearTimers, scheduleAutoClear]
  );

  const onDecode = useCallback(
    (rawValue: string) => {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (lastDecodeRef.current.value === rawValue && now - lastDecodeRef.current.at < 2500) {
        return;
      }
      lastDecodeRef.current = { value: rawValue, at: now };

      const pre = precheckScannedToken(rawValue);
      if (!pre.ok) {
        setCameraActive(false);
        setUiState({ kind: 'malformed' });
        scheduleAutoClear();
        return;
      }
      void resolveToken(pre.token);
    },
    [resolveToken, scheduleAutoClear]
  );

  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Exact AWC1 contract — no trim; reject card numbers / whitespace variants.
    const value = manualCode;
    if (!isValidCardToken(value)) {
      setUiState({ kind: 'malformed' });
      scheduleAutoClear();
      setManualCode('');
      return;
    }
    void resolveToken(value);
  };

  useEffect(() => {
    return () => {
      clearTimers();
      setCameraActive(false);
      inFlightRef.current = false;
    };
  }, [clearTimers]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        setCameraActive(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!allowed) {
    return <AccessDenied />;
  }

  const busy = uiState.kind === 'loading' || inFlightRef.current;

  return (
    <div className="max-w-2xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      <header className="space-y-1">
        <div className="inline-flex items-center gap-2 text-[#0d1a14]">
          <ScanLine size={22} aria-hidden />
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0d1a14]/70">People</p>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">PLCC Card Scanner</h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          Scan or enter an PLCC digital membership card.
        </p>
      </header>

      <CardScannerCamera
        active={cameraActive}
        paused={busy || uiState.kind === 'loading'}
        onStart={() => setCameraActive(true)}
        onStop={stopCamera}
        onDecode={onDecode}
        disabled={busy}
      />

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm" aria-label="Manual card code">
        <form onSubmit={onManualSubmit} className="space-y-3">
          <div>
            <label htmlFor="awc-card-code" className="block text-sm font-bold text-gray-900 mb-1.5">
              Enter card code
            </label>
            <input
              id="awc-card-code"
              name="cardCode"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="AWC1.…"
              disabled={busy}
              className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0d1a14]/30"
              aria-describedby="awc-card-code-help"
            />
            <p id="awc-card-code-help" className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Paste the full AWC1 card code from the QR. Card numbers and names are not accepted.
            </p>
          </div>
          <button
            type="submit"
            disabled={busy || !manualCode}
            className="w-full min-h-[48px] rounded-xl bg-[#0d1a14] text-gold font-bold text-sm disabled:opacity-50"
          >
            Resolve Card
          </button>
        </form>
      </section>

      <div ref={resultRef}>
        <CardScannerResult
          state={uiState}
          onScanAnother={resetScanner}
          onRetry={() => {
            clearTimers();
            setUiState({ kind: 'idle' });
          }}
          clearInSeconds={clearInSeconds}
        />
      </div>
    </div>
  );
};

export default CardScannerPage;
