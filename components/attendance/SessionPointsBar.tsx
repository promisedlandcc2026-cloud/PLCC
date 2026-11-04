/**
 * Points switch for an attendance session. Sits above the check-in tabs so leaders
 * see it whether they scan cards, search by name, or show the self check-in QR.
 * Turning it on late awards everyone already checked in.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { fetchSelfQr, setSessionPoints } from '../../lib/checkinPointsClient';

type Props = {
  sessionId: string;
  /** Called after points change so the page can refresh its roster. */
  onChanged?: () => void;
};

export default function SessionPointsBar({ sessionId, onChanged }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSelfQr(sessionId)
      .then((s) => alive && setEnabled(s.session.pointsEnabled))
      .catch((err) => alive && setError(err?.message || 'Could not load points.'));
    return () => {
      alive = false;
    };
  }, [sessionId]);

  const toggle = async () => {
    if (enabled == null) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await setSessionPoints(sessionId, !enabled);
      setEnabled(res.pointsEnabled);
      if (res.pointsEnabled && res.backfilled) {
        setMessage(
          `Points awarded to ${res.backfilled} ${res.backfilled === 1 ? 'person' : 'people'} already checked in.`
        );
      } else if (!res.pointsEnabled) {
        setMessage('Points are off. Points already earned stay.');
      }
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Could not change points.');
    } finally {
      setSaving(false);
    }
  };

  // Hide quietly until points are set up in the database.
  if (error && enabled == null) return null;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        enabled ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'
      }`}
    >
      <label className="flex items-center gap-3 cursor-pointer">
        {enabled == null ? (
          <Loader2 className="animate-spin text-gray-400" size={18} aria-hidden />
        ) : (
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#1d372c] shrink-0"
            checked={enabled}
            disabled={saving}
            onChange={() => void toggle()}
          />
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-black text-[#0d1a14]">
            <Star size={14} aria-hidden /> Award points for this session
          </span>
          <span className="block text-xs text-gray-600 mt-0.5">
            10 for checking in, +5 on time, +20 first visit, +10 every 3 in a row. Applies to card scans, name
            search, and the self check-in QR.
          </span>
        </span>
      </label>
      {message && <p className="mt-2 text-xs font-semibold text-emerald-800" role="status">{message}</p>}
      {error && enabled != null && <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{error}</p>}
    </div>
  );
}
