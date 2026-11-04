/**
 * Parent's phone after scanning a kids room code (Nesties, Toddlers, …):
 * pick your children and check them in. A teacher still checks them out at pickup.
 */
import React, { useState } from 'react';
import { Baby, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import {
  kidsSelfCheckIn,
  type KidsChild,
  type KidsChooser,
} from '../../lib/checkinPointsClient';

type Props = {
  chooser: KidsChooser;
  onScanAgain: () => void;
  onDone: () => void;
};

export default function KidsParentCheckin({ chooser, onScanAgain, onDone }: Props) {
  const [children, setChildren] = useState<KidsChild[]>(chooser.children);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(chooser.children.filter((c) => !c.checkedIn).map((c) => c.id))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (picked.size === 0) {
      setError('Tap each child you’re dropping off.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await kidsSelfCheckIn(chooser.pass, [...picked]);
      const nameOf = (id: string) => children.find((c) => c.id === id)?.name || 'Child';
      setChildren(res.children);
      setProblems(res.results.filter((r) => !r.ok).map((r) => `${nameOf(r.id)}: ${r.error || 'not checked in'}`));
      const okIds = res.results.filter((r) => r.ok).map((r) => nameOf(r.id));
      if (okIds.length) setDone(okIds);
      else setError('No one was checked in. A teacher can check your child in at the door.');
    } catch (err: any) {
      setError(err?.message || 'Check-in didn’t go through. A teacher can check your child in at the door.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <div className="rounded-3xl bg-white shadow-sm border border-gray-100 overflow-hidden text-center">
          <div className="p-6 text-white" style={{ background: 'var(--season-accent, #1d372c)' }}>
            <CheckCircle2 className="mx-auto mb-3" size={48} aria-hidden />
            <p className="text-sm font-bold opacity-90">{chooser.sessionTitle}</p>
            <h1 className="text-2xl font-black mt-1">Checked in!</h1>
          </div>
          <ul className="p-5 space-y-2">
            {done.map((name) => (
              <li key={name} className="text-lg font-black text-[#0d1a14]">{name}</li>
            ))}
          </ul>
          <p className="px-5 pb-5 text-base text-gray-700">
            At pickup, come to the teacher and they’ll check your child out.
          </p>
          {problems.length > 0 && (
            <ul className="mx-5 mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm font-semibold text-amber-900 space-y-1">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="w-full min-h-[56px] rounded-2xl bg-[#0d1a14] text-white text-lg font-black"
        >
          Done
        </button>
      </div>
    );
  }

  const waiting = children.filter((c) => !c.checkedIn);

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-5">
      <header className="text-center space-y-2">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center">
          <Baby size={26} aria-hidden />
        </div>
        <p className="text-sm font-bold text-gray-600">{chooser.sessionTitle}</p>
        <h1 className="text-2xl font-black text-[#0d1a14] tracking-tight">Who are you dropping off?</h1>
      </header>

      {children.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-base text-gray-700 space-y-2">
          <p className="font-bold text-gray-900">No children are linked to your account yet.</p>
          <p>
            A teacher can check your child in at the door today. To use your phone next time, add your
            children in <span className="font-bold">Settings → Profile → My children</span>.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {children.map((c) => {
            const on = picked.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={c.checkedIn || busy}
                  aria-pressed={c.checkedIn ? undefined : on}
                  onClick={() => toggle(c.id)}
                  className={`w-full min-h-[64px] rounded-2xl border-2 px-4 flex items-center gap-3 text-left transition-colors ${
                    c.checkedIn
                      ? 'border-gray-200 bg-gray-50 text-gray-500'
                      : on
                        ? 'border-[#1d372c] bg-[#1d372c]/5'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  {c.checkedIn || on ? (
                    <CheckCircle2 size={28} className={c.checkedIn ? 'text-gray-400' : 'text-[#1d372c]'} aria-hidden />
                  ) : (
                    <Circle size={28} className="text-gray-300" aria-hidden />
                  )}
                  <span className="flex-1">
                    <span className="block text-lg font-black text-gray-900">{c.name}</span>
                    {c.checkedIn && <span className="block text-sm font-semibold">Already checked in</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      {waiting.length > 0 && (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || picked.size === 0}
          className="w-full min-h-[60px] rounded-2xl bg-[#0d1a14] text-white text-lg font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" size={20} aria-hidden /> : <CheckCircle2 size={20} aria-hidden />}
          {busy ? 'Checking in…' : picked.size > 1 ? `Check in ${picked.size} children` : 'Check in'}
        </button>
      )}

      <button
        type="button"
        onClick={onScanAgain}
        className="w-full min-h-[48px] rounded-2xl border border-gray-300 text-base font-bold text-gray-700"
      >
        Scan a different code
      </button>
    </div>
  );
}
