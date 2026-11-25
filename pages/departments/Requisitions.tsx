import React, { useState } from 'react';
import { Banknote, Check, CircleDollarSign, Lock, Plus, RotateCcw, X, XCircle } from 'lucide-react';
import { fmtUgx, kampalaParts, type DepartmentDetail, type ReqStatus, type Requisition } from '../../lib/departments';
import { Notice } from './Activities';

/** Requisitions (Phase 3, Nov 25 2026): Head → Finance → Pastor → Paid. UGX. Every step recorded. */

export const REQ_STATUS: Record<ReqStatus, { label: string; cls: string }> = {
  PENDING_HEAD: { label: 'With the Head', cls: 'bg-amber-50 text-amber-700' },
  PENDING_FINANCE: { label: 'With Finance', cls: 'bg-amber-50 text-amber-700' },
  PENDING_PASTOR: { label: 'With a Pastor', cls: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Approved · awaiting payment', cls: 'bg-sky-50 text-sky-700' },
  PAID: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Sent back', cls: 'bg-red-50 text-red-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
};

type Save = (b: Record<string, unknown>, done?: string) => Promise<void>;

/** Head → Finance → Pastor → Paid tracker. */
export function ReqTracker({ r }: { r: Requisition }) {
  const headSkipped = !r.headAt && r.status !== 'PENDING_HEAD' && !(r.status === 'REJECTED' && r.rejectedStage === 'HEAD');
  const steps = [
    { key: 'HEAD', label: 'Head', who: r.headByName || (headSkipped ? 'Skipped' : ''), done: Boolean(r.headAt) || headSkipped },
    { key: 'FINANCE', label: 'Finance', who: r.financeByName, done: Boolean(r.financeAt) },
    { key: 'PASTOR', label: 'Pastor', who: r.pastorByName, done: Boolean(r.pastorAt) },
    { key: 'PAID', label: 'Paid', who: r.paidByName, done: Boolean(r.paidAt) },
  ];
  const current = r.status === 'PENDING_HEAD' ? 0 : r.status === 'PENDING_FINANCE' ? 1 : r.status === 'PENDING_PASTOR' ? 2 : r.status === 'APPROVED' ? 3 : -1;
  const rejectedAt = r.status === 'REJECTED' ? ['HEAD', 'FINANCE', 'PASTOR'].indexOf(r.rejectedStage || '') : -1;
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Approval steps">
      {steps.map((s, i) => {
        const state = rejectedAt === i ? 'rejected' : s.done ? 'done' : current === i ? 'current' : 'todo';
        const dot = state === 'done' ? 'bg-emerald-600 text-white' : state === 'current' ? 'bg-amber-400 text-white' : state === 'rejected' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400';
        return (
          <li key={s.key} className="flex flex-col items-center text-center">
            <span className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-black ${dot}`}>{state === 'done' ? <Check size={14} /> : state === 'rejected' ? <X size={14} /> : i + 1}</span>
            <span className="mt-1 text-[11px] font-bold text-gray-600">{s.label}</span>
            <span className="text-[10px] text-gray-400 truncate max-w-full">{s.who || ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Requisitions({ data, onSave }: { data: DepartmentDetail; onSave: Save }) {
  const { can, department: d } = data;
  const [form, setForm] = useState<{ open: boolean; edit?: Requisition }>({ open: false });
  if (!data.phase3Ready) return <Notice text="Requisitions need a one-time setup. Ask your developer to run plcc_departments_phase3.sql in Supabase." />;
  const list = data.requisitions || [];
  const open = list.filter((r) => ['PENDING_HEAD', 'PENDING_FINANCE', 'PENDING_PASTOR', 'APPROVED', 'REJECTED'].includes(r.status));
  const done = list.filter((r) => r.status === 'PAID' || r.status === 'CANCELLED');
  const sum = (xs: Requisition[]) => xs.reduce((t, r) => t + r.amountUgx, 0);
  const yearStart = `${kampalaParts(new Date().toISOString()).date.slice(0, 4)}-01-01`;
  const paidThisYear = list.filter((r) => r.status === 'PAID' && (r.paidAt || '') >= yearStart);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#0d1a14]">Requisitions</h2>
          <p className="text-sm text-gray-500">Money requests in UGX. Each goes Head → Finance → Pastor, then Finance pays.</p>
        </div>
        {can['requisitions.create'] && d.isActive ? (
          <button type="button" onClick={() => setForm({ open: true })} className="min-h-[44px] px-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2" style={{ background: d.color }}>
            <Plus size={16} aria-hidden /> New requisition
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-lg sm:text-xl font-black text-[#0d1a14]">{fmtUgx(sum(open.filter((r) => r.status !== 'REJECTED')))}</p><p className="text-xs font-bold text-gray-400">In progress</p></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-lg sm:text-xl font-black" style={{ color: d.color }}>{fmtUgx(sum(paidThisYear))}</p><p className="text-xs font-bold text-gray-400">Paid this year</p></div>
      </div>

      {list.length ? (
        <>
          {open.length ? <ul className="mt-5 space-y-3">{open.map((r) => <ReqCard key={r.id} r={r} data={data} onSave={onSave} onEdit={() => setForm({ open: true, edit: r })} />)}</ul> : null}
          {done.length ? (
            <>
              <h3 className="mt-6 text-xs font-black uppercase tracking-wider text-gray-500">Paid & cancelled · {done.length}</h3>
              <ul className="mt-2 space-y-3">{done.map((r) => <ReqCard key={r.id} r={r} data={data} onSave={onSave} onEdit={() => {}} />)}</ul>
            </>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <span className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: `${d.color}14`, color: d.color }}><CircleDollarSign size={26} aria-hidden /></span>
          <p className="mt-3 font-black text-[#0d1a14]">No requisitions yet</p>
          <p className="text-sm text-gray-500 mt-1">{can['requisitions.create'] ? 'Raise one when the department needs funds.' : 'Requisitions from this department will show here.'}</p>
        </div>
      )}
      <p className="mt-5 flex items-start gap-2 text-xs text-gray-400"><Lock size={13} className="shrink-0 mt-0.5" aria-hidden /> Only the Head, Treasurer, Finance, the Pastors and the Apostle can see this tab.</p>
      {form.open ? <ReqForm color={d.color} data={data} edit={form.edit} onClose={() => setForm({ open: false })} onSave={onSave} /> : null}
    </div>
  );
}

export function ReqCard({ r, data, onSave, onEdit, departmentId, actor }: {
  r: Requisition;
  data?: DepartmentDetail;
  onSave: Save;
  onEdit?: () => void;
  departmentId?: string;
  actor?: { oversight: boolean; finance: boolean; head: boolean; meId?: string };
}) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'' | 'reject' | 'pay'>('');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const meId = data?.me_id || actor?.meId;
  const isHead = data ? data.myRole === 'HEAD' : Boolean(actor?.head);
  const isFinance = data ? Boolean(data.me.isFinanceOfficer) : Boolean(actor?.finance);
  const isOversight = data ? data.me.isOversight : Boolean(actor?.oversight);
  const mine = r.createdBy === meId;
  const priorActor = r.headBy === meId || r.financeBy === meId;
  const canDecide = !mine && !priorActor && ((r.status === 'PENDING_HEAD' && isHead) || (r.status === 'PENDING_FINANCE' && isFinance) || (r.status === 'PENDING_PASTOR' && isOversight));
  const canPay = r.status === 'APPROVED' && isFinance && !mine;
  const canCancel = ['PENDING_HEAD', 'PENDING_FINANCE', 'PENDING_PASTOR', 'REJECTED'].includes(r.status) && (mine || isOversight);
  const canResubmit = r.status === 'REJECTED' && mine && data?.can['requisitions.create'];
  const color = r.department?.color || data?.department.color || '#0f3d2c';

  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setErr('');
    try { await onSave({ requisitionId: r.id, ...(departmentId ? { id: departmentId } : {}), ...body }, done); setMode(''); setText(''); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${color}14`, color }}><Banknote size={20} aria-hidden /></span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-[#0d1a14]">{r.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${REQ_STATUS[r.status].cls}`}>{REQ_STATUS[r.status].label}</span>
          </div>
          <p className="text-lg font-black mt-0.5" style={{ color }}>{fmtUgx(r.amountUgx)}</p>
          <p className="text-[11px] text-gray-400">Raised by {r.createdByName} · {new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{r.neededBy ? ` · needed by ${new Date(`${r.neededBy}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}</p>
          {r.purpose ? <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{r.purpose}</p> : null}
        </div>
      </div>
      {r.status !== 'CANCELLED' ? <ReqTracker r={r} /> : null}
      {r.financeNote ? <p className="mt-3 rounded-xl bg-[#f7f6f2] px-3 py-2 text-xs text-gray-600"><b>Finance:</b> {r.financeNote}</p> : null}
      {r.status === 'REJECTED' && r.rejectNote ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>{r.rejectedByName}:</b> {r.rejectNote}</p> : null}
      {r.status === 'PAID' ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Paid by {r.paidByName} · ref <b>{r.paidReference}</b></p> : null}
      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

      {mode ? (
        <div className="mt-3">
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={mode === 'pay' ? 120 : 500} placeholder={mode === 'pay' ? 'Payment reference (e.g. Mobile Money ID)' : 'Why is it being sent back?'} className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-base" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => { setMode(''); setText(''); }} className="min-h-[44px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700">Cancel</button>
            {mode === 'pay'
              ? <button type="button" disabled={busy || text.trim().length < 2} onClick={() => void run({ action: 'req_paid', reference: text }, 'Payment recorded')} className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-40">Record payment</button>
              : <button type="button" disabled={busy || text.trim().length < 3} onClick={() => void run({ action: 'req_decide', decision: 'REJECT', note: text }, 'Sent back')} className="min-h-[44px] px-4 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-40">Send back</button>}
          </div>
        </div>
      ) : (canDecide || canPay || canCancel || canResubmit) ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
          {canDecide ? (
            <>
              <button type="button" disabled={busy} onClick={() => void run({ action: 'req_decide', decision: 'APPROVE' }, 'Approved')} className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50"><Check size={16} aria-hidden /> {r.status === 'PENDING_PASTOR' ? 'Give final approval' : r.status === 'PENDING_FINANCE' ? 'Budget checked · approve' : 'Approve'}</button>
              <button type="button" disabled={busy} onClick={() => setMode('reject')} className="min-h-[44px] px-4 rounded-xl bg-red-50 text-sm font-bold text-red-700 flex items-center gap-1.5"><RotateCcw size={15} aria-hidden /> Send back</button>
            </>
          ) : null}
          {canPay ? <button type="button" disabled={busy} onClick={() => setMode('pay')} className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-sm font-bold text-white flex items-center gap-1.5"><Banknote size={16} aria-hidden /> Mark as paid</button> : null}
          {canResubmit && onEdit ? <button type="button" onClick={onEdit} className="min-h-[44px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700">Fix & resubmit</button> : null}
          {canCancel ? <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Cancel “${r.title}”?`)) void run({ action: 'req_cancel' }, 'Cancelled'); }} className="min-h-[44px] px-3 rounded-xl text-sm font-bold text-gray-500 flex items-center gap-1.5"><XCircle size={15} aria-hidden /> Cancel</button> : null}
        </div>
      ) : null}
    </li>
  );
}

function ReqForm({ color, data, edit, onClose, onSave }: { color: string; data: DepartmentDetail; edit?: Requisition; onClose: () => void; onSave: Save }) {
  const [title, setTitle] = useState(edit?.title || '');
  const [amount, setAmount] = useState(edit ? edit.amountUgx.toLocaleString('en-US') : '');
  const [purpose, setPurpose] = useState(edit?.purpose || '');
  const [neededBy, setNeededBy] = useState(edit?.neededBy || '');
  const [activityId, setActivityId] = useState(edit?.activityId || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const acts = (data.activities || []).filter((a) => a.status === 'APPROVED' || a.status === 'PENDING').slice(0, 15);
  const today = kampalaParts(new Date().toISOString()).date;
  const fmt = (v: string) => { const n = v.replace(/\D/g, ''); return n ? Number(n).toLocaleString('en-US') : ''; };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSave({ action: edit ? 'req_resubmit' : 'req_create', requisitionId: edit?.id, title, amountUgx: amount, purpose, neededBy: neededBy || null, activityId: activityId || null }, edit ? 'Resubmitted' : 'Requisition raised');
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  };
  const input = 'mt-1 w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-base font-normal bg-white';
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => !busy && onClose()}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#0d1a14]">{edit ? 'Fix & resubmit' : 'New requisition'}</h2>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
        </div>
        {edit?.rejectNote ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>Sent back:</b> {edit.rejectNote}</p> : null}
        <label className="block mt-4 text-sm font-bold text-gray-700">What is it for?
          <input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Two wireless microphones" className={input} />
        </label>
        <label className="block mt-3 text-sm font-bold text-gray-700">Amount (UGX)
          <input required inputMode="numeric" value={amount} onChange={(e) => setAmount(fmt(e.target.value))} placeholder="e.g. 1,200,000" className={`${input} text-lg font-black`} />
        </label>
        <label className="block mt-3 text-sm font-bold text-gray-700">Purpose & breakdown <span className="font-normal text-gray-400">(optional)</span>
          <textarea maxLength={2000} rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Why it is needed, and how the amount adds up" className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-base font-normal" />
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm font-bold text-gray-700">Needed by <span className="font-normal text-gray-400">(opt.)</span>
            <input type="date" min={today} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className={input} />
          </label>
          {acts.length && !edit ? (
            <label className="block text-sm font-bold text-gray-700">For an activity <span className="font-normal text-gray-400">(opt.)</span>
              <select value={activityId} onChange={(e) => setActivityId(e.target.value)} className={input}>
                <option value="">None</option>
                {acts.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        <button type="submit" disabled={busy} className="mt-5 w-full min-h-[48px] rounded-xl text-white font-bold disabled:opacity-50" style={{ background: color }}>{busy ? 'Sending…' : edit ? 'Resubmit' : 'Send for approval'}</button>
        <p className="mt-2 text-center text-xs text-gray-400">{data.myRole === 'HEAD' ? 'Goes to Finance, then a Pastor.' : 'Goes to the Head, then Finance, then a Pastor.'}</p>
      </form>
    </div>
  );
}
