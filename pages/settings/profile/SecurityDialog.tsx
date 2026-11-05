import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Check, Copy, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import type { AccountSecurity } from './useAccountSecurity';
import { EmptyState, InlineError } from './ui';

const primaryBtn =
  'w-full h-12 rounded-xl bg-burgundy text-gold font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-60';

const PasskeyPanel: React.FC<{ security: AccountSecurity }> = ({ security }) => (
  <>
    <p className="text-sm text-gray-600 font-medium leading-relaxed">
      Passkeys let you unlock PLCC Canaan with this device. Add one while signed in, then use Passkey on the sign-in page.
    </p>
    {security.passkeys.length === 0 ? (
      <EmptyState>No passkeys yet.</EmptyState>
    ) : (
      <ul className="space-y-2">
        {security.passkeys.map((pk) => (
          <li
            key={pk.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#0d1a14] truncate">{pk.friendly_name || 'Device passkey'}</p>
              <p className="text-xs text-gray-500 font-medium">
                Added {pk.created_at ? new Date(pk.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <button
              type="button"
              disabled={security.busy}
              onClick={() => void security.removePasskey(pk.id)}
              className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-white"
              aria-label={`Remove passkey ${pk.friendly_name || ''}`.trim()}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    )}
    <button type="button" disabled={security.busy} onClick={() => void security.addPasskey()} className={primaryBtn}>
      {security.busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
      Add passkey on this device
    </button>
  </>
);

const MfaPanel: React.FC<{ security: AccountSecurity }> = ({ security }) => {
  const { mfaEnroll, mfaFactors, busy } = security;
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCode('');
    setCopied(false);
  }, [mfaEnroll?.factorId]);

  const copySecret = async () => {
    if (!mfaEnroll) return;
    try {
      await navigator.clipboard.writeText(mfaEnroll.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      security.setError('Could not copy. Select the key and copy it manually.');
    }
  };

  return (
    <>
      <p className="text-sm text-gray-600 font-medium leading-relaxed">
        Use Google Authenticator, Authy, or similar. Scan the QR code, then enter the 6-digit code.
      </p>

      {mfaFactors.length > 0 && !mfaEnroll && (
        <ul className="space-y-2">
          {mfaFactors.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-green-100 bg-green-50/50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-bold text-[#0d1a14]">{f.friendly_name || 'Authenticator app'}</p>
                <p className="text-xs text-green-700 font-medium">Connected</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void security.removeMfa(f.id)}
                className="text-[10px] font-black uppercase tracking-widest text-red-600 px-3 py-2 rounded-xl hover:bg-white"
              >
                Turn off
              </button>
            </li>
          ))}
        </ul>
      )}

      {mfaEnroll ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void security.confirmMfa(code);
          }}
        >
          <p className="text-sm text-gray-600 font-medium leading-relaxed text-center">
            Open your authenticator app → Add account → Scan QR code.
          </p>
          <div className="flex justify-center bg-white border border-gray-100 rounded-xl p-4">
            <QRCode
              value={mfaEnroll.uri}
              size={192}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#0d1a14"
              title="Scan with Google Authenticator or Authy"
            />
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 text-center">Or type this key</p>
            <p className="font-mono text-sm text-[#0d1a14] text-center tracking-wider break-all select-all">
              {mfaEnroll.secretFormatted}
            </p>
            <button
              type="button"
              onClick={() => void copySecret()}
              className="w-full h-10 rounded-xl border border-gray-200 bg-white text-[10px] font-black uppercase tracking-widest text-[#0d1a14] flex items-center justify-center gap-2"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy key'}
            </button>
          </div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            className="w-full h-12 rounded-xl border border-gray-100 px-4 font-bold text-center text-lg tracking-[0.3em] text-[#0d1a14] outline-none focus:border-burgundy/30"
          />
          <button type="submit" disabled={busy || code.length < 6} className={primaryBtn}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            Confirm and turn on
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void security.startMfa()}
            className="w-full text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-[#0d1a14]"
          >
            Generate a new QR code
          </button>
        </form>
      ) : mfaFactors.length === 0 ? (
        <button type="button" disabled={busy} onClick={() => void security.startMfa()} className={primaryBtn}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          Set up 2-step auth
        </button>
      ) : null}
    </>
  );
};

const SecurityDialog: React.FC<{ security: AccountSecurity }> = ({ security }) => {
  const { panel, closePanel } = security;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!panel) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [panel, closePanel]);

  if (!panel) return null;
  const title = panel === 'mfa' ? '2-Step Auth' : 'Passkeys';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/40 p-4"
      onClick={closePanel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-dialog-title"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Security</p>
            <h3 id="security-dialog-title" className="text-lg font-black text-[#0d1a14] tracking-tight">
              {title}
            </h3>
          </div>
          <button
            ref={closeRef}
            type="button"
            disabled={security.busy}
            onClick={closePanel}
            aria-label="Close"
            className="p-2 rounded-xl text-gray-500 hover:text-burgundy hover:bg-gray-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <InlineError message={security.error} />
          {security.loading ? (
            <div className="flex justify-center py-10 text-burgundy">
              <Loader2 className="animate-spin" size={28} />
            </div>
          ) : panel === 'passkey' ? (
            <PasskeyPanel security={security} />
          ) : (
            <MfaPanel security={security} />
          )}
        </div>
      </div>
    </div>
  );
};

export default SecurityDialog;
