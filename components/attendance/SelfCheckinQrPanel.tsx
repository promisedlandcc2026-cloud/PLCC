/**
 * Leader screen: rotating self check-in QR (new code every 30 seconds).
 * Members scan it with the Vault (or their phone camera) to check themselves in.
 * Plain black-on-white on purpose so phones scan it reliably — no season colors here.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Loader2, Maximize2, Minimize2, Users } from 'lucide-react';
import { useScreenWakeLock } from '../../lib/useScreenWakeLock';
import {
  fetchSelfQr,
  scanInUrl,
  type SelfQrState,
} from '../../lib/checkinPointsClient';

type Props = {
  sessionId: string;
  onCountChange?: () => void;
};

export default function SelfCheckinQrPanel({ sessionId, onCountChange }: Props) {
  const [state, setState] = useState<SelfQrState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [bigScreen, setBigScreen] = useState(false);
  const offsetRef = useRef(0);
  const expiresRef = useRef(0);
  const lastCountRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  useScreenWakeLock(true);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const next = await fetchSelfQr(sessionId);
      if (next.serverNow) offsetRef.current = Date.parse(next.serverNow) - Date.now();
      expiresRef.current = next.expiresAt ? Date.parse(next.expiresAt) : 0;
      setState(next);
      setError(null);
      if (lastCountRef.current != null && next.checkedInCount !== lastCountRef.current) onCountChangeRef.current?.();
      lastCountRef.current = next.checkedInCount;
    } catch (err: any) {
      setError(err?.message || 'Could not load the check-in code.');
    } finally {
      loadingRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      const now = Date.now() + offsetRef.current;
      const left = expiresRef.current ? Math.max(0, Math.ceil((expiresRef.current - now) / 1000)) : 0;
      setSecondsLeft(left);
      // New code when this one runs out; refresh the count every 5 seconds.
      if ((expiresRef.current && left <= 0) || ticks % 5 === 0) void load();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!bigScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBigScreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bigScreen]);


  if (!state) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 flex items-center justify-center gap-3 text-gray-600">
        {error ? (
          <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
        ) : (
          <>
            <Loader2 className="animate-spin" size={18} aria-hidden /> Loading check-in code…
          </>
        )}
      </div>
    );
  }

  const pointsOn = state.session.pointsEnabled;
  const isKids = state.session.type === 'kids';
  const qrValue = state.token ? scanInUrl(state.token) : '';

  const qrBlock = (size: number) =>
    state.token ? (
      <div className="bg-white p-4 rounded-2xl inline-block" aria-label="Check-in QR code">
        <QRCode value={qrValue} size={size} level="M" fgColor="#000000" bgColor="#FFFFFF" />
      </div>
    ) : (
      <p className="text-sm font-semibold text-gray-700 max-w-xs">
        Open the session to show the check-in code.
      </p>
    );

  if (bigScreen) {
    return (
      <div className="fixed inset-0 z-[200] bg-white text-black flex flex-col items-center justify-center p-6 gap-6">
        <button
          type="button"
          onClick={() => setBigScreen(false)}
          className="absolute top-4 right-4 min-h-[48px] inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-black"
        >
          <Minimize2 size={16} aria-hidden /> Exit full screen
        </button>
        <h2 className="text-3xl sm:text-5xl font-black text-center">{state.session.title}</h2>
        <p className="text-xl sm:text-2xl font-bold text-center">
          {isKids ? 'Parents: scan to check in your children' : `Scan to check in${pointsOn ? ' and earn points' : ''}`}
        </p>
        {qrBlock(Math.min(520, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.55)))}
        <div className="flex items-center gap-6 text-xl font-black tabular-nums">
          <span>New code in {secondsLeft}s</span>
          <span className="inline-flex items-center gap-2">
            <Users size={22} aria-hidden /> {state.checkedInCount} {isKids ? 'children in the room' : 'here'}
          </span>
        </div>
        {state.recent.length > 0 && (
          <p className="text-lg font-bold text-gray-700 text-center">
            Just checked in: {state.recent.join(' · ')}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden" aria-label="Self check-in code">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{isKids ? 'Parent check-in code' : 'Self check-in code'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isKids
              ? 'Show this at the classroom door. Parents scan it and check in their own children. Pickup is still done by a teacher at the Kids Kiosk.'
              : 'Members scan this with the Vault.'}{' '}
            It changes every 30 seconds, so a screenshot sent home won’t work.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBigScreen(true)}
          disabled={!state.token}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0d1a14] text-white px-4 text-sm font-black disabled:opacity-50"
        >
          <Maximize2 size={16} aria-hidden /> Full screen
        </button>
      </div>

      <div className="p-5 flex flex-col sm:flex-row items-center gap-6">
        {qrBlock(220)}
        <div className="flex-1 w-full space-y-4">
          {state.token && (
            <p className="text-sm font-bold text-gray-700 tabular-nums">New code in {secondsLeft}s</p>
          )}
          <p className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <Users size={16} aria-hidden /> {state.checkedInCount} {isKids ? 'children in the room' : 'checked in'}
          </p>
          {state.recent.length > 0 && (
            <p className="text-xs text-gray-600">Latest: {state.recent.join(' · ')}</p>
          )}

          {!isKids && (
            <p className="text-xs text-gray-600">
              {pointsOn ? 'Points are on for this session.' : 'Points are off for this session. Turn them on above.'}
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
