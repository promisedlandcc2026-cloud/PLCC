import React, { useEffect, useState } from 'react';
import { X, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { fetchAuthorized } from '../../../lib/api';
import { Member } from '../types';
import { useChurch } from '../context/ChurchContext';

interface ProfileQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member;
}

export const ProfileQrModal: React.FC<ProfileQrModalProps> = ({
  isOpen,
  onClose,
  member,
}) => {
  const { currentUser } = useChurch();
  const viewingSelf = member.id === currentUser.id;
  const [qrPayload, setQrPayload] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setQrPayload('');
    setAccessCode('');
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
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-sm w-full border border-stone-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-[#1d372c]" />
            <h3 className="font-bold text-sm text-stone-900">Membership pass</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-center space-y-4">
          {!viewingSelf && (
            <p className="text-xs text-stone-600 leading-relaxed">
              This sample profile is not a church pass. The code below is your signed-in membership card.
            </p>
          )}

          {loading && <p className="text-xs text-stone-500">Loading your pass…</p>}
          {error && <p className="text-xs text-[#1d372c]">{error}</p>}

          {qrPayload && (
            <div className="p-4 bg-white rounded-2xl border border-[#C9A35A]/40 inline-block">
              <QRCode
                value={qrPayload}
                size={200}
                style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                fgColor="#0d1a14"
              />
              <p className="mt-2 text-[10px] text-stone-500">Scan at check-in</p>
            </div>
          )}

          {accessCode && (
            <div className="bg-gray-100 py-3 px-6 rounded-2xl inline-block border-2 border-gray-200">
              <p className="text-[10px] uppercase font-black text-gray-600 mb-1 tracking-widest">Backup code</p>
              <p className="text-3xl font-black text-[#0d1a14] tracking-[0.2em] font-mono">{accessCode}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
