/**
 * Phase 2.7D.5A / 2.7D.5B / 2.7D.7 — Session digital membership card scanner.
 * Adult or child AWC1 check-in. After adult scan on non-kids sessions, optional
 * household bulk check-in (structured household_members).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, ScanLine, Users, X } from 'lucide-react';
import CardScannerCamera from '../people/CardScannerCamera';
import { checkInMemberDigitalCard } from '../../lib/attendanceRecordsClient';
import type { AttendanceCheckinResult } from '../../lib/attendanceRecordsTypes';
import {
  DIGITAL_SCAN_SUCCESS_HOLD_MS,
  mapCheckinApiError,
} from '../../lib/attendanceRecordsUi';
import {
  isValidCardToken,
  precheckScannedToken,
} from '../../lib/cardScannerUi';
import {
  checkInHousehold,
  previewHouseholdByCard,
  type HouseholdPreviewMember,
  type HouseholdPreviewResult,
} from '../../lib/householdCheckinClient';

type Props = {
  sessionId: string;
  sessionTitle: string;
  sessionType?: string;
  memberCount: number;
  onCheckedIn: (result: AttendanceCheckinResult) => void | Promise<void>;
  onSessionInvalid?: () => void | Promise<void>;
  onHouseholdCheckedIn?: () => void | Promise<void>;
};

type Feedback =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; name: string }
  | { kind: 'already'; name: string }
  | { kind: 'error'; message: string };

export default function AttendanceSessionScanner({
  sessionId,
  sessionTitle,
  sessionType,
  memberCount,
  onCheckedIn,
  onSessionInvalid,
  onHouseholdCheckedIn,
}: Props) {
  const [cameraActive, setCameraActive] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const [household, setHousehold] = useState<HouseholdPreviewResult | null>(null);
  const [selectedHh, setSelectedHh] = useState<Set<string>>(new Set());
  const [hhSaving, setHhSaving] = useState(false);
  const [hhMsg, setHhMsg] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const lastDecodeRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const allowHousehold = String(sessionType || '').toLowerCase() !== 'kids';

  const clearHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const resumeScanning = useCallback(() => {
    clearHold();
    inFlightRef.current = false;
    lastDecodeRef.current = { value: '', at: 0 };
    setManualCode('');
    setFeedback({ kind: 'idle' });
    setHousehold(null);
    setSelectedHh(new Set());
    setHhMsg(null);
    setCameraActive(true);
  }, [clearHold]);

  const scheduleResume = useCallback(() => {
    clearHold();
    holdTimerRef.current = setTimeout(() => {
      resumeScanning();
    }, DIGITAL_SCAN_SUCCESS_HOLD_MS);
  }, [clearHold, resumeScanning]);

  const maybeOfferHousehold = useCallback(
    async (token: string) => {
      if (!allowHousehold) return;
      try {
        const preview = await previewHouseholdByCard({ sessionId, token });
        const eligible = preview.members.filter((m) => !m.alreadyCheckedIn);
        if (eligible.length === 0) return;
        clearHold();
        setHousehold(preview);
        setSelectedHh(new Set(eligible.map((m) => m.memberId)));
      } catch {
        /* household offer is best-effort; individual check-in already succeeded */
      }
    },
    [allowHousehold, sessionId, clearHold]
  );

  const submitToken = useCallback(
    async (token: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setCameraActive(false);
      setManualCode('');
      setFeedback({ kind: 'loading' });
      setHousehold(null);
      setHhMsg(null);
      clearHold();

      try {
        const result = await checkInMemberDigitalCard({ sessionId, token });
        const name = result.displayName || 'PLCC Member';
        setFeedback(
          result.alreadyCheckedIn
            ? { kind: 'already', name }
            : { kind: 'success', name }
        );
        await onCheckedIn(result);
        requestAnimationFrame(() =>
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        );
        await maybeOfferHousehold(token);
        if (!household) {
          // scheduleResume only if no sheet will show — checked after await via state lag;
          // use eligible check return value instead
        }
      } catch (err: any) {
        const msg = String(err?.message || mapCheckinApiError({}, 'Could not check in this member.'));
        setFeedback({ kind: 'error', message: msg });
        if (
          /session is closed/i.test(msg) ||
          /before checking in/i.test(msg) ||
          /session not found/i.test(msg)
        ) {
          await onSessionInvalid?.();
        }
        requestAnimationFrame(() =>
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        );
      } finally {
        inFlightRef.current = false;
      }
    },
    [sessionId, onCheckedIn, onSessionInvalid, clearHold, maybeOfferHousehold]
  );

  // After check-in, auto-resume only when no household sheet is open
  useEffect(() => {
    if (feedback.kind !== 'success' && feedback.kind !== 'already') return;
    if (household) return;
    scheduleResume();
  }, [feedback.kind, household, scheduleResume]);

  const onDecode = useCallback(
    (rawValue: string) => {
      if (inFlightRef.current || household) return;
      if (feedback.kind === 'loading' || feedback.kind === 'success' || feedback.kind === 'already') {
        return;
      }
      const now = Date.now();
      if (lastDecodeRef.current.value === rawValue && now - lastDecodeRef.current.at < 2500) {
        return;
      }
      lastDecodeRef.current = { value: rawValue, at: now };

      const pre = precheckScannedToken(rawValue);
      if (!pre.ok) {
        setCameraActive(false);
        setFeedback({
          kind: 'error',
          message: 'CARD NOT RECOGNIZED — This PLCC card could not be verified.',
        });
        return;
      }
      void submitToken(pre.token);
    },
    [feedback.kind, household, submitToken]
  );

  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = manualCode;
    if (!isValidCardToken(value)) {
      setFeedback({
        kind: 'error',
        message: 'CARD NOT RECOGNIZED — This PLCC card could not be verified.',
      });
      setManualCode('');
      return;
    }
    void submitToken(value);
  };

  const toggleHh = (id: string) => {
    setSelectedHh((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmHousehold = async () => {
    if (!household || selectedHh.size === 0) return;
    setHhSaving(true);
    setHhMsg(null);
    try {
      const result = await checkInHousehold({
        sessionId: household.sessionId,
        anchorMemberId: household.anchorMemberId,
        memberIds: Array.from(selectedHh),
      });
      setHhMsg(
        `Checked in ${result.checkedInCount} household member${result.checkedInCount === 1 ? '' : 's'}${
          result.alreadyCheckedInCount
            ? ` (${result.alreadyCheckedInCount} already in)`
            : ''
        }`
      );
      await onHouseholdCheckedIn?.();
      setTimeout(() => resumeScanning(), 1800);
    } catch (err: any) {
      setHhMsg(err?.message || 'Household check-in failed.');
    } finally {
      setHhSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      clearHold();
      setCameraActive(false);
      inFlightRef.current = false;
    };
  }, [clearHold]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') setCameraActive(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const busy = feedback.kind === 'loading' || inFlightRef.current || !!household;

  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm space-y-4"
      aria-label="Attendance card scanner"
      data-attendance-scanner="digital-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[#1d372c] mb-1">
            <ScanLine size={18} aria-hidden />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">
              Attendance Scanner
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-[#0d1a14] break-words">{sessionTitle}</h2>
          <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-emerald-800">
            Open
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2 text-center shrink-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Checked In</p>
          <p className="text-2xl font-black text-[#0d1a14] tabular-nums">{memberCount}</p>
        </div>
      </div>

      <CardScannerCamera
        active={cameraActive}
        paused={busy}
        onStart={() => setCameraActive(true)}
        onStop={() => setCameraActive(false)}
        onDecode={onDecode}
        disabled={busy}
      />

      <form onSubmit={onManualSubmit} className="space-y-3 border-t border-gray-100 pt-4">
        <label htmlFor="session-awc-card-code" className="block text-sm font-bold text-gray-900">
          Enter card code
        </label>
        <input
          id="session-awc-card-code"
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
          aria-describedby="session-awc-card-help"
        />
        <p id="session-awc-card-help" className="text-xs text-gray-500 leading-relaxed">
          Paste the full AWC1 code from an adult or child PLCC digital card QR. After an adult scan,
          you can check in their structured household without scanning each person.
        </p>
        <button
          type="submit"
          disabled={busy || !manualCode}
          className="w-full min-h-[48px] rounded-xl bg-[#0d1a14] text-gold font-bold text-sm disabled:opacity-50"
        >
          Check In Card
        </button>
      </form>

      <div ref={resultRef} aria-live="polite">
        {feedback.kind === 'loading' && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-6 flex items-center justify-center gap-3 text-gray-600">
            <Loader2 className="animate-spin" size={22} aria-hidden />
            <span className="text-sm font-bold">Checking in…</span>
          </div>
        )}

        {(feedback.kind === 'success' || feedback.kind === 'already') && !household && (
          <div
            role="status"
            className={`rounded-2xl border-2 px-4 py-6 text-center space-y-2 ${
              feedback.kind === 'success'
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-amber-300 bg-amber-50'
            }`}
          >
            {feedback.kind === 'success' && (
              <CheckCircle2 className="mx-auto text-emerald-700" size={40} aria-hidden />
            )}
            <p
              className={`text-lg font-black uppercase tracking-wide ${
                feedback.kind === 'success' ? 'text-emerald-900' : 'text-amber-950'
              }`}
            >
              {feedback.kind === 'success' ? 'Checked In' : 'Already Checked In'}
            </p>
            <p className="text-xl font-black text-[#0d1a14]">{feedback.name}</p>
            <button
              type="button"
              onClick={resumeScanning}
              className="mt-2 w-full min-h-[48px] rounded-xl bg-[#0d1a14] text-gold font-bold text-sm"
            >
              Scan Next Member
            </button>
          </div>
        )}

        {feedback.kind === 'error' && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 space-y-3"
          >
            <p className="text-sm font-semibold text-red-900 whitespace-pre-line">{feedback.message}</p>
            <button
              type="button"
              onClick={resumeScanning}
              className="w-full min-h-[48px] rounded-xl border border-red-200 bg-white text-[#0d1a14] font-bold text-sm"
            >
              Scan Next Member
            </button>
          </div>
        )}
      </div>

      {household && (
        <div
          className="rounded-2xl border-2 border-[#0d1a14]/20 bg-[#0d1a14]/[0.03] overflow-hidden"
          data-household-checkin-sheet="true"
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold flex items-center gap-1.5">
                <Users size={12} /> Check in household
              </p>
              <p className="text-sm font-bold text-[#0d1a14] mt-0.5">
                Select family members to check in together
              </p>
            </div>
            <button
              type="button"
              onClick={resumeScanning}
              className="p-2 rounded-lg text-gray-400 hover:text-[#0d1a14] min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Skip household check-in"
            >
              <X size={18} />
            </button>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {household.members.map((m: HouseholdPreviewMember) => {
              const disabled = m.alreadyCheckedIn;
              const selected = selectedHh.has(m.memberId);
              return (
                <button
                  key={m.memberId}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleHh(m.memberId)}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left disabled:opacity-50 ${
                    selected ? 'bg-[#0d1a14]/[0.04]' : ''
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      selected ? 'bg-[#0d1a14] border-[#0d1a14] text-gold' : 'border-gray-200'
                    }`}
                  >
                    {selected && <CheckCircle2 size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#0d1a14] truncate">{m.displayName}</p>
                    <p className="text-[11px] text-gray-500 capitalize">
                      {m.isAnchor
                        ? 'Scanned member'
                        : String(m.relationshipType || 'household').replace(/_/g, ' ')}
                    </p>
                  </div>
                  {m.alreadyCheckedIn && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      Already in
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="p-4 border-t border-gray-100 space-y-2">
            {hhMsg && (
              <p className="text-xs font-semibold text-[#0d1a14]" role="status">
                {hhMsg}
              </p>
            )}
            <button
              type="button"
              disabled={hhSaving || selectedHh.size === 0}
              onClick={() => void confirmHousehold()}
              className="w-full min-h-[48px] rounded-xl bg-[#0d1a14] text-gold font-black text-sm disabled:opacity-40"
            >
              {hhSaving ? 'Saving…' : `Check In Household (${selectedHh.size})`}
            </button>
            <button
              type="button"
              onClick={resumeScanning}
              className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-600"
            >
              Skip — scan next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
