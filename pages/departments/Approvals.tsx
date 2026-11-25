import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Banknote, CalendarDays, Check, CheckCheck, ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import { departmentsApi, type Activity, type Report, type Requisition } from '../../lib/departments';
import { ActivityMeta, DateBlock } from './Activities';
import { DeptIcon } from './DeptIcon';
import { ReqCard } from './Requisitions';
import { ReportBody, ReviewActions } from './Reports';

/**
 * One place for everything waiting on you: activities and reports (Pastors and the Apostle),
 * requisitions at your stage (Heads, Finance, Pastors), and approved requisitions to pay (Finance).
 */
type Tab = 'activities' | 'requisitions' | 'reports';
type Data = Awaited<ReturnType<typeof departmentsApi.approvals>>;

export default function Approvals() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await departmentsApi.approvals());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2500); };
  const save = async (body: Record<string, unknown>, done?: string) => {
    await departmentsApi.post(body);
    await load();
    if (done) flash(done);
  };

  const counts = { activities: data?.activities.length || 0, requisitions: data?.requisitions.length || 0, reports: data?.reports.length || 0 };
  const tabs: { key: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'activities', label: 'Activities', icon: <CalendarDays size={16} />, show: Boolean(data?.roles.oversight) },
    { key: 'requisitions', label: 'Requisitions', icon: <Banknote size={16} />, show: Boolean(data?.phase3Ready) },
    { key: 'reports', label: 'Reports', icon: <BarChart3 size={16} />, show: Boolean(data?.roles.oversight && data?.phase3Ready) },
  ];
  const visible = tabs.filter((t) => t.show);
  const requested = params.get('tab') as Tab | null;
  const firstWithItems = visible.find((t) => counts[t.key] > 0)?.key;
  const tab: Tab = requested && visible.some((t) => t.key === requested) ? requested : firstWithItems || visible[0]?.key || 'activities';
  const total = counts.activities + counts.requisitions + counts.reports;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-6">
      <button type="button" onClick={() => navigate('/departments')} className="flex items-center gap-2 text-sm font-bold text-gray-500 min-h-[36px]">
        <ArrowLeft size={16} aria-hidden /> All departments
      </button>
      <header className="mt-3">
        <h1 className="text-3xl font-black text-[#0d1a14]">Approvals</h1>
        <p className="text-gray-500 mt-1">{data ? (total ? `${total} waiting for you across every department.` : 'Nothing waiting for you.') : 'Everything waiting for you, across every department.'}</p>
      </header>

      {error ? <p className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">{error}</p> : null}
      {!data && !error ? <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" aria-label="Loading" /></div> : null}

      {data && visible.length > 1 ? (
        <nav className="mt-5 grid gap-2 rounded-2xl bg-white border border-gray-100 p-1.5" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }} aria-label="Approval types">
          {visible.map((t) => (
            <button key={t.key} type="button" onClick={() => setParams({ tab: t.key }, { replace: true })} className={`min-h-[44px] rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 ${tab === t.key ? 'bg-[#0f3d2c] text-white' : 'text-gray-600'}`} aria-current={tab === t.key ? 'page' : undefined}>
              {t.icon} <span className="hidden sm:inline">{t.label}</span>
              {counts[t.key] ? <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black flex items-center justify-center ${tab === t.key ? 'bg-white text-[#0f3d2c]' : 'bg-[#b8862f] text-white'}`}>{counts[t.key]}</span> : null}
            </button>
          ))}
        </nav>
      ) : null}

      {data ? (
        <div className="mt-5">
          {tab === 'activities' ? <ActivityQueue items={data.activities} onSave={save} navigate={navigate} /> : null}
          {tab === 'requisitions' ? (
            data.requisitions.length ? (
              <ul className="space-y-3">
                {data.requisitions.map((r: Requisition) => (
                  <div key={r.id}>
                    <DeptChip d={r.department} onClick={() => navigate(`/departments/${r.departmentId}?tab=requisitions`)} />
                    <ReqCard r={r} onSave={save} departmentId={r.departmentId} actor={{ ...data.roles, head: data.roles.head && r.status === 'PENDING_HEAD' }} />
                  </div>
                ))}
              </ul>
            ) : <Empty text={data.roles.finance ? 'No requisitions to check or pay.' : 'No requisitions waiting for you.'} />
          ) : null}
          {tab === 'reports' ? <ReportQueue items={data.reports} onSave={save} navigate={navigate} /> : null}
        </div>
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-[#0d1a14] px-5 py-3 text-sm font-bold text-white shadow-lg flex items-center gap-2">
          <Check size={16} aria-hidden /> {toast}
        </div>
      ) : null}
    </div>
  );
}

function DeptChip({ d, onClick }: { d?: { name: string; color: string; icon: string }; onClick: () => void }) {
  if (!d) return null;
  return (
    <button type="button" onClick={onClick} className="mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${d.color}14`, color: d.color }}>
      <DeptIcon name={d.icon} size={13} /> {d.name}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-center">
      <span className="mx-auto h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCheck size={26} aria-hidden /></span>
      <p className="mt-3 font-black text-[#0d1a14]">All caught up</p>
      <p className="text-sm text-gray-500 mt-1">{text}</p>
    </div>
  );
}

function ActivityQueue({ items, onSave, navigate }: { items: Activity[]; onSave: (b: Record<string, unknown>, d?: string) => Promise<void>; navigate: (p: string) => void }) {
  const [busy, setBusy] = useState('');
  const [sendBack, setSendBack] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  if (!items.length) return <Empty text="No activities waiting for approval." />;
  const decide = async (a: Activity, decision: 'APPROVED' | 'REJECTED') => {
    setBusy(a.id);
    setErr((p) => ({ ...p, [a.id]: '' }));
    try {
      await onSave({ action: 'activity_decide', id: a.departmentId, activityId: a.id, decision, note: decision === 'REJECTED' ? note : undefined }, decision === 'APPROVED' ? `Approved “${a.title}”` : `Sent back “${a.title}”`);
      setSendBack('');
      setNote('');
    } catch (e) {
      setErr((p) => ({ ...p, [a.id]: (e as Error).message }));
    } finally {
      setBusy('');
    }
  };
  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const color = a.department?.color || '#0f3d2c';
        return (
          <li key={a.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <DeptChip d={a.department} onClick={() => navigate(`/departments/${a.departmentId}?tab=activities`)} />
            <div className="mt-2 flex gap-3">
              <DateBlock iso={a.startsAt} color={color} />
              <div className="flex-1 min-w-0">
                <p className="font-black text-[#0d1a14]">{a.title}</p>
                <ActivityMeta a={a} />
                {a.description ? <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{a.description}</p> : null}
                <p className="mt-2 text-[11px] text-gray-400">Planned by {a.createdByName}</p>
              </div>
            </div>
            {err[a.id] ? <p className="mt-3 text-sm text-red-600">{err[a.id]}</p> : null}
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
  );
}

function ReportQueue({ items, onSave, navigate }: { items: Report[]; onSave: (b: Record<string, unknown>, d?: string) => Promise<void>; navigate: (p: string) => void }) {
  const [openId, setOpenId] = useState(items[0]?.id || '');
  if (!items.length) return <Empty text="No reports waiting for review." />;
  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="p-4 pb-0"><DeptChip d={r.department} onClick={() => navigate(`/departments/${r.departmentId}?tab=reports`)} /></div>
          <button type="button" onClick={() => setOpenId(openId === r.id ? '' : r.id)} className="w-full text-left px-4 pb-4 pt-1 flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="block font-black text-[#0d1a14]">{r.title}</span>
              <span className="block text-xs text-gray-400">By {r.submittedByName} · {new Date(r.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </span>
            <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${openId === r.id ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {openId === r.id ? (
            <div className="px-4 pb-4 border-t border-gray-50 pt-3">
              <ReportBody r={r} />
              <ReviewActions r={r} onSave={onSave} departmentId={r.departmentId} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
