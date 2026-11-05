import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareText } from 'lucide-react';
import { fetchAuthorized } from '../../lib/api';

/**
 * "Turn on text sign-in" — members who joined with email/password confirm their mobile
 * number once (a texted code), so "Text me a code" on the sign-in page works for them.
 * The number on the profile alone is never enough: anyone can type a number there.
 *
 * Shared by the Vault profile; PLCC Connect calls the same API (resource=auth-phone-code).
 */
type Status = { enabled: boolean; phone: string | null };

async function call(body: Record<string, unknown>): Promise<any> {
  const res = await fetchAuthorized('/api/vault?resource=auth-phone-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json && json.error) || 'Text sign-in failed. Please try again.');
  return json || {};
}

export default function TextSignInCard({ defaultPhone }: { defaultPhone?: string | null }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [phone, setPhone] = useState(String(defaultPhone || ''));
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'code'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    call({ action: 'link-status' })
      .then((s) => live && setStatus({ enabled: Boolean(s.enabled), phone: s.phone || null }))
      .catch(() => live && setUnavailable(true));
    return () => {
      live = false;
    };
  }, []);

  if (unavailable) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await call({ action: 'link-request', phone });
      setStep('code');
      setNote('Code sent. Check your texts.');
    });

  const confirm = () =>
    run(async () => {
      const out = await call({ action: 'link-verify', phone, code: code.replace(/\D/g, '') });
      setStatus({ enabled: true, phone: out.phone || null });
      setStep('idle');
      setCode('');
      setNote(out.message || 'Text sign-in is on.');
    });

  const turnOff = () =>
    run(async () => {
      await call({ action: 'unlink' });
      setStatus({ enabled: false, phone: null });
      setNote('Text sign-in is off. You can turn it back on any time.');
    });

  const big =
    'w-full min-h-[3.25rem] rounded-xl px-5 text-base font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2';

  return (
    <div id="cp-text-sign-in" className="scroll-mt-20 bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#1d372c]/10 text-[#1d372c] flex items-center justify-center shrink-0">
          <MessageSquareText size={20} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-stone-900">Sign in by text</h2>
          <p className="text-sm text-stone-600 mt-0.5 leading-relaxed">
            Get a 6-digit code by text instead of typing a password. Works in the Vault and PLCC Connect.
          </p>
        </div>
      </div>

      {!status ? (
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Loader2 className="animate-spin" size={16} /> Checking…
        </div>
      ) : status.enabled && step === 'idle' ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-900">
            <CheckCircle2 size={20} className="shrink-0" /> On for {status.phone || 'your number'}
          </p>
          <button type="button" disabled={busy} onClick={() => { setStep('idle'); setNote(''); setError(''); setCode(''); setPhone(''); setStatus({ ...status, enabled: false }); }} className={`${big} border-2 border-stone-300 text-stone-800 hover:bg-stone-50`}>
            Use a different number
          </button>
          <button type="button" disabled={busy} onClick={turnOff} className="w-full text-sm font-semibold text-stone-500 underline underline-offset-2 py-2">
            Turn off text sign-in
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-sm font-semibold text-stone-700 mb-1.5">Your mobile number</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0772 123456"
              className="w-full rounded-xl border-2 border-stone-200 px-4 py-3 text-lg focus:border-[#1d372c] focus:outline-none"
            />
          </label>
          {step === 'code' ? (
            <>
              <label className="block">
                <span className="block text-sm font-semibold text-stone-700 mb-1.5">6-digit code from the text</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-xl border-2 border-stone-200 px-4 py-3 text-2xl tracking-[0.4em] text-center focus:border-[#1d372c] focus:outline-none"
                />
              </label>
              <button type="button" disabled={busy || code.length !== 6} onClick={confirm} className={`${big} bg-[#1d372c] text-white hover:bg-[#12231c]`}>
                {busy ? <Loader2 className="animate-spin" size={18} /> : null} Confirm and turn on
              </button>
              <button type="button" disabled={busy} onClick={sendCode} className={`${big} border-2 border-stone-300 text-stone-800 hover:bg-stone-50`}>
                Text me a new code
              </button>
            </>
          ) : (
            <button type="button" disabled={busy || phone.replace(/\D/g, '').length < 10} onClick={sendCode} className={`${big} bg-[#1d372c] text-white hover:bg-[#12231c]`}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : null} Turn on text sign-in
            </button>
          )}
        </div>
      )}

      {note ? <p className="text-sm font-semibold text-emerald-800">{note}</p> : null}
      {error ? (
        <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
      ) : null}
    </div>
  );
}
