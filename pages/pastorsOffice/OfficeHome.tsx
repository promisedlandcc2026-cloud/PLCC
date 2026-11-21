import React, { useEffect, useState } from 'react';
import { CalendarDays, LockKeyhole, RefreshCw } from 'lucide-react';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

type Office = { id: string; role: 'PASTOR' | 'PASTORS_ASSISTANT' };
export default function OfficeHome() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = async () => {
    setState('loading');
    try {
      const response = await fetch('/api/vault?resource=pastors-office-mine', { headers: await getAuthHeaders() });
      const data = await parseApiJson<{ ok?: boolean; offices?: Office[] }>(response);
      if (!response.ok || !data.ok || !Array.isArray(data.offices)) throw new Error('unavailable');
      setOffices(data.offices); setState('ready');
    } catch { setState('error'); }
  };
  useEffect(() => { void load(); }, []);
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8" style={{ color: '#0b2242' }}>
    <header className="flex flex-wrap items-center gap-4 rounded-2xl bg-[#071b35] px-5 py-6 text-white sm:px-8">
      <img src="/pastors-office/emblem.png" alt="Pastor’s Office emblem" className="h-20 w-20 rounded-full object-cover" />
      <div><p className="text-xs font-semibold uppercase tracking-widest text-[#eac777]">Promised Land Christian Center</p><h1 className="mt-1 font-serif text-3xl font-bold">Pastor’s Office</h1><p className="mt-1 text-sm text-[#e9eef7]">A private space for pastoral care and scheduling.</p></div>
    </header>
    {state === 'loading' && <p role="status" className="mt-6">Checking your office access…</p>}
    {state === 'error' && <div role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5"><p>We couldn’t check your office access. Please try again.</p><button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#102d50] px-4 py-2 text-white"><RefreshCw size={16} />Try again</button></div>}
    {state === 'ready' && offices.length === 0 && <div className="mt-6 rounded-xl border border-[#d7dfeb] bg-white p-6"><LockKeyhole className="text-[#a77b23]" /><h2 className="mt-3 text-xl font-bold">Office access is not assigned</h2><p className="mt-2 text-sm">Ask a Super Admin to check your Pastor’s Office assignment.</p></div>}
    {state === 'ready' && offices.length > 0 && <section className="mt-6 rounded-xl border border-[#d7dfeb] bg-white p-6"><CalendarDays className="text-[#a77b23]" /><h2 className="mt-3 font-serif text-2xl font-bold">Your pastoral calendar</h2><p className="mt-2 text-sm">Your office access is confirmed. The appointment calendar is being built and is not available yet.</p><p className="mt-3 text-xs text-[#465a70]">{offices.length === 1 ? '1 office' : `${offices.length} offices`} available to your account.</p></section>}
  </main>;
}
