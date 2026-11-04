/**
 * Staff-safe card scanner result panel.
 * Text-first VALID / CARD NOT VALID. No check-in / pickup actions.
 */
import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, UserRound, XCircle } from 'lucide-react';
import {
  adultInvalidReason,
  dependentPickupDisclaimer,
  headlineForResult,
  initialsFromDisplayName,
  messageForUiState,
  statusLabel,
  type CardScannerResultDto,
  type ScannerUiState,
} from '../../lib/cardScannerUi';

type Props = {
  state: ScannerUiState;
  onScanAnother: () => void;
  onRetry?: () => void;
  clearInSeconds?: number | null;
};

function Avatar({ result }: { result: CardScannerResultDto }) {
  if (result.subjectType === 'dependent') {
    return (
      <div
        className="w-16 h-16 rounded-2xl bg-[#0d1a14]/10 text-[#0d1a14] flex items-center justify-center shrink-0"
        aria-hidden
      >
        <UserRound size={30} />
      </div>
    );
  }

  if (result.avatarUrl && /^https?:\/\//i.test(result.avatarUrl)) {
    return (
      <img
        src={result.avatarUrl}
        alt=""
        className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-gray-200"
      />
    );
  }

  return (
    <div
      className="w-16 h-16 rounded-2xl bg-[#0d1a14] text-gold font-black text-lg flex items-center justify-center shrink-0"
      aria-hidden
    >
      {initialsFromDisplayName(result.displayName)}
    </div>
  );
}

export default function CardScannerResult({
  state,
  onScanAnother,
  onRetry,
  clearInSeconds = null,
}: Props) {
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.kind === 'idle' || state.kind === 'loading') return;
    focusRef.current?.focus();
  }, [state]);

  if (state.kind === 'idle') return null;

  if (state.kind === 'loading') {
    return (
      <div
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-bold text-gray-700">Verifying card…</p>
      </div>
    );
  }

  if (state.kind === 'result') {
    const { result } = state;
    const headline = headlineForResult(result);
    const valid = headline.tone === 'valid';
    const isDependent = result.subjectType === 'dependent';

    return (
      <div
        ref={focusRef}
        tabIndex={-1}
        className={`rounded-2xl border p-5 shadow-sm outline-none ${
          valid ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3 mb-4">
          {valid ? (
            <CheckCircle2 className="text-emerald-700 shrink-0 mt-0.5" size={28} aria-hidden />
          ) : (
            <XCircle className="text-amber-800 shrink-0 mt-0.5" size={28} aria-hidden />
          )}
          <div className="min-w-0">
            <p className={`text-base sm:text-lg font-black tracking-tight ${valid ? 'text-emerald-900' : 'text-amber-950'}`}>
              {headline.text}
            </p>
            {!valid && (
              <p className="text-sm font-semibold text-amber-900 mt-1">{adultInvalidReason(result)}</p>
            )}
            {clearInSeconds != null && clearInSeconds > 0 && (
              <p className="text-xs text-gray-500 mt-1">Clears in {clearInSeconds}s for privacy</p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-4 bg-white/80 rounded-xl border border-black/5 p-4">
          <Avatar result={result} />
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-black text-gray-900 truncate">{result.displayName}</p>
            <p className="text-sm font-semibold text-gray-600">{result.label}</p>
            <p className="text-sm text-gray-700">
              <span className="font-bold">Card number:</span> {result.cardNumber}
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-bold">Card status:</span> {statusLabel(result.cardStatus)}
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-bold">Effective status:</span> {statusLabel(result.effectiveStatus)}
            </p>
          </div>
        </div>

        <p
          className={`mt-4 text-sm font-semibold leading-relaxed ${
            isDependent ? 'text-[#0d1a14] bg-white/90 border border-[#0d1a14]/15 rounded-xl p-3' : 'text-gray-600'
          }`}
        >
          {isDependent ? dependentPickupDisclaimer(result.notice) : result.notice || 'Membership identification only.'}
        </p>

        <button
          type="button"
          onClick={onScanAnother}
          className="mt-5 w-full min-h-[48px] rounded-xl bg-[#0d1a14] text-gold font-bold text-sm"
        >
          Scan Another Card
        </button>
      </div>
    );
  }

  const message = messageForUiState(state);
  const isAlert =
    state.kind === 'conflict' ||
    state.kind === 'rate_limited' ||
    state.kind === 'unavailable' ||
    state.kind === 'error' ||
    state.kind === 'malformed';

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm outline-none"
      role={isAlert ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-amber-700 shrink-0 mt-0.5" size={24} aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-black text-gray-900">
            {state.kind === 'not_found'
              ? 'Card not found'
              : state.kind === 'conflict'
                ? 'Card could not be safely resolved'
                : state.kind === 'malformed'
                  ? 'Invalid card code'
                  : 'Unable to verify'}
          </p>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">{message}</p>
          {clearInSeconds != null && clearInSeconds > 0 && (
            <p className="text-xs text-gray-500 mt-2">Clears in {clearInSeconds}s for privacy</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        {(state.kind === 'unavailable' || state.kind === 'rate_limited') && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[48px] px-4 rounded-xl border border-gray-200 bg-white font-bold text-sm text-gray-800"
          >
            Try Again
          </button>
        )}
        <button
          type="button"
          onClick={onScanAnother}
          className="min-h-[48px] px-4 rounded-xl bg-[#0d1a14] text-gold font-bold text-sm"
        >
          Scan Another Card
        </button>
      </div>
    </div>
  );
}
