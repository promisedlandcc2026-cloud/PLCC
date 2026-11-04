/**
 * The signed-in member's own membership QR, for a leader to scan at check-in.
 * Standalone (works on Home and the profile) — same pass as the profile's "Member QR".
 * Black-on-white with a bright screen so a scanner reads it quickly.
 */
import React, { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { QrCode, X } from 'lucide-react';
import { fetchAuthorized } from '../../lib/api';
import { useScreenWakeLock } from '../../lib/useScreenWakeLock';

type Props = { open: boolean; onClose: () => void };

const MyPassQrModal: React.FC<Props> = ({ open, onClose }) => {
  const [qrPayload, setQrPayload] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useScreenWakeLock(open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const res = await fetchAuthorized('/api/vault?resource=people&subResource=member-pass');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data.qrPayload) {
          setError(data?.error || 'Could not load your membership pass.');
          return;
        }
        setQrPayload(String(data.qrPayload));
        setAccessCode(String(data.accessCode || ''));
      } catch {
        if (!cancelled) setError('Could not load your membership pass.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-pass-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-[#1d372c]" aria-hidden />
            <h3 id="my-pass-title" className="font-black text-sm text-[#0d1a14]">My check-in QR</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-center space-y-4">
          <p className="text-sm text-gray-700">Show this to a leader. They scan it and you earn your points.</p>

          {loading && <p className="text-xs text-gray-500">Loading your code…</p>}
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}

          {qrPayload && (
            <div className="p-4 bg-white rounded-2xl border border-gray-200 inline-block">
              <QRCode value={qrPayload} size={220} level="M" fgColor="#000000" bgColor="#FFFFFF" />
            </div>
          )}

          {accessCode && (
            <div className="bg-gray-100 py-3 px-6 rounded-2xl inline-block">
              <p className="text-[10px] uppercase font-black text-gray-600 mb-1 tracking-widest">Backup code</p>
              <p className="text-3xl font-black text-[#0d1a14] tracking-[0.2em] font-mono">{accessCode}</p>
            </div>
          )}

          <p className="text-xs text-gray-500">Turn your screen brightness up if it doesn’t scan.</p>
        </div>
      </div>
    </div>
  );
};

export default MyPassQrModal;
