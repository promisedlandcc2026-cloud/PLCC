import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, CheckCheck, Loader2, RotateCcw } from 'lucide-react';
import { departmentsApi, type Activity } from '../../lib/departments';
import { ActivityMeta, DateBlock } from './Activities';
import { DeptIcon } from './DeptIcon';

/** One queue for Pastors and the Apostle: every department's activities awaiting approval. */
export default function Approvals() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [sendBack, setSendBack] = useState<string>('');
  const [note, setNote] = useState('');
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      setItems((await departmentsApi.approvals()).activities);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (a: Activity, decision: 'APPROVED' | 'REJECTED') => {
    setBusy(a.id);
    setRowErr((p) => ({ ...p, [a.id]: '' }));
    try {
      await departmentsApi.post({ action: 'activity_decide', id: a.departmentId, activityId: a.id, decision, note: decision === 'REJECTED' ? note : undefined });
      setItems((prev) => (prev || []).filter((x) => x.id !== a.id));
      setSendBack('');
      setNote('');
      setToast(decision === 'APPROVED' ? `Approved “${a.title}”` : `Sent back “${a.title}”`);
      window.setTimeout(() => setToast(''), 2500);
    } catch (e) {
      setRowErr((p) => ({ ...p, [a.id]: (e as Error).message }));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-6">
      <button type="button" onClick={() => navigate('/departments')} className="flex items-center gap-2 text-sm font-bold text-gray-500 min-h-[36px]">
        <ArrowLeft size={16} aria-hidden /> All departments
      </button>
      <header className="mt-3">
        <h1 className="text-3xl font-black text-[#0d1a14]">Approvals</h1>
        <p className="text-gray-500 mt-1">Activities from every department waiting for a Pastor or the Apostle. Times are Uganda time (EAT).</p>
      </header>

      {error ? <p className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">{error}</p> : null}
      {!items && !error ? <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" aria-label="Loading" /></div> : null}

      {items && !items.length ? (
        <div className="mt-8 rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <span className="mx-auto h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCheck size={26} aria-hidden /></span>
          <p className="mt-3 font-black text-[#0d1a14]">All caught up</p>
          <p className="text-sm text-gray-500 mt-1">Nothing is waiting for approval.</p>
        </div>
      ) : null}

      <ul className="mt-6 space-y-3">
        {(items || []).map((a) => {
          const color = a.department?.color || '#0f3d2c';
          return (
            <li key={a.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <button type="button" onClick={() => navigate(`/departments/${a.departmentId}?tab=activities`)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${color}14`, color }}>
                <DeptIcon name={a.department?.icon || 'Users'} size={13} /> {a.department?.name}
              </button>
              <div className="mt-3 flex gap-3">
                <DateBlock iso={a.startsAt} color={color} />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-[#0d1a14]">{a.title}</p>
                  <ActivityMeta a={a} />
                  {a.description ? <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{a.description}</p> : null}
                  <p className="mt-2 text-[11px] text-gray-400">Planned by {a.createdByName}</p>
                </div>
              </div>
              {rowErr[a.id] ? <p className="mt-3 text-sm text-red-600">{rowErr[a.id]}</p> : null}
              {sendBack === a.id ? (
                <div className="mt-3">
                  <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="What should the department change?" className="w-full rounded-xl border border-gray-200 p-3 text-base" />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => { setSendBack(''); setNote(''); }} className="min-h-[44px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700">Cancel</button>
                    <button type="button" disabled={busy === a.id || note.trim().length < 3} onClick={() => void decide(a, 'REJECTED')} className="min-h-[44px] px-4 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-40">Send back</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-50 pt-3">
                  <button type="button" disabled={busy === a.id} onClick={() => void decide(a, 'APPROVED')} className="min-h-[48px] rounded-xl bg-emerald-600 text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {busy === a.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} aria-hidden />} Approve
                  </button>
                  <button type="button" disabled={busy === a.id} onClick={() => { setSendBack(a.id); setNote(''); }} className="min-h-[48px] rounded-xl bg-red-50 text-sm font-bold text-red-700 flex items-center justify-center gap-1.5">
                    <RotateCcw size={15} aria-hidden /> Send back
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {toast ? (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-[#0d1a14] px-5 py-3 text-sm font-bold text-white shadow-lg flex items-center gap-2">
          <Check size={16} aria-hidden /> {toast}
        </div>
      ) : null}
    </div>
  );
}
