import React, { useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronDown, Clock, MapPin, Pencil, RotateCcw, Wallet, X, XCircle } from 'lucide-react';
import { fmtDay, fmtTime, fmtUgx, kampalaParts, type Activity, type ActivityStatus, type DepartmentDetail } from '../../lib/departments';

/** Department activities: plan → Pastor approves or sends back → done (Phase 2, Nov 25 2026). */

export const STATUS_STYLE: Record<ActivityStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Awaiting approval', cls: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Changes needed', cls: 'bg-red-50 text-red-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
  COMPLETED: { label: 'Done', cls: 'bg-[#0f3d2c]/10 text-[#0f3d2c]' },
};

type Save = (b: Record<string, unknown>, done?: string) => Promise<void>;

export function DateBlock({ iso, color }: { iso: string; color: string }) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { timeZone: 'Africa/Kampala', day: 'numeric' });
  const mon = d.toLocaleDateString('en-GB', { timeZone: 'Africa/Kampala', month: 'short' });
  return (
    <span className="h-14 w-14 shrink-0 rounded-2xl flex flex-col items-center justify-center leading-none" style={{ background: `${color}14`, color }}>
      <span className="text-[11px] font-black uppercase">{mon}</span>
      <span className="text-xl font-black mt-0.5">{day}</span>
    </span>
  );
}

export function ActivityMeta({ a }: { a: Activity }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
      <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden /> {fmtDay(a.startsAt)} · {fmtTime(a.startsAt)}{a.endsAt ? `–${fmtTime(a.endsAt)}` : ''}</span>
      {a.location ? <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden /> {a.location}</span> : null}
      {a.budgetUgx != null ? <span className="inline-flex items-center gap-1 font-bold text-[#7a5c1e]"><Wallet size={12} aria-hidden /> {fmtUgx(a.budgetUgx)}</span> : null}
    </span>
  );
}

export default function Activities({ data, onSave }: { data: DepartmentDetail; onSave: Save }) {
  const { can, me, department: d } = data;
  const all = data.activities || [];
  const [form, setForm] = useState<{ open: boolean; edit?: Activity }>({ open: false });
  const [showOld, setShowOld] = useState(false);
  const now = Date.now();

  const groups = useMemo(() => {
    const by = (s: ActivityStatus[]) => all.filter((a) => s.includes(a.status));
    const asc = (x: Activity[]) => [...x].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    const approved = by(['APPROVED']);
    return {
      needsChanges: asc(by(['REJECTED'])),
      pending: asc(by(['PENDING'])),
      upcoming: asc(approved.filter((a) => +new Date(a.endsAt || a.startsAt) >= now - 3 * 3600_000)),
      toClose: asc(approved.filter((a) => +new Date(a.endsAt || a.startsAt) < now - 3 * 3600_000)),
      past: by(['COMPLETED', 'CANCELLED']),
    };
  }, [all, now]);

  if (!data.phase2Ready) {
    return <Notice text="Activities need a one-time setup. Ask your developer to run plcc_departments_phase2.sql in Supabase." />;
  }

  const mayBudget = can['finance.view'] || can['requisitions.create'];
  const nothing = !all.length;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#0d1a14]">Activities</h2>
          <p className="text-sm text-gray-500">Planned activities go to a Pastor for approval. Times are Uganda time (EAT).</p>
        </div>
        {can['activities.plan'] && d.isActive ? (
          <button type="button" onClick={() => setForm({ open: true })} className="min-h-[44px] px-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2" style={{ background: d.color }}>
            <CalendarPlus size={16} aria-hidden /> Plan activity
          </button>
        ) : null}
      </div>

      {nothing ? (
        <div className="mt-6 rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <span className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: `${d.color}14`, color: d.color }}><CalendarDays size={26} aria-hidden /></span>
          <p className="mt-3 font-black text-[#0d1a14]">No activities yet</p>
          <p className="text-sm text-gray-500 mt-1">{can['activities.plan'] ? 'Plan the first one. It goes to a Pastor for approval.' : 'Approved activities will show here.'}</p>
        </div>
      ) : null}

      <Group title="Changes needed" items={groups.needsChanges} data={data} onSave={onSave} onEdit={(a) => setForm({ open: true, edit: a })} />
      <Group title="Awaiting approval" items={groups.pending} data={data} onSave={onSave} onEdit={(a) => setForm({ open: true, edit: a })} />
      <Group title="Coming up" items={groups.upcoming} data={data} onSave={onSave} onEdit={(a) => setForm({ open: true, edit: a })} />
      <Group title="Took place: mark as done" items={groups.toClose} data={data} onSave={onSave} onEdit={(a) => setForm({ open: true, edit: a })} />

      {groups.past.length ? (
        <div className="mt-6">
          <button type="button" onClick={() => setShowOld((v) => !v)} className="flex items-center gap-1 text-sm font-bold text-gray-500 min-h-[40px]">
            <ChevronDown size={16} className={showOld ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden /> Past & cancelled ({groups.past.length})
          </button>
          {showOld ? <Group title="" items={groups.past} data={data} onSave={onSave} onEdit={() => {}} /> : null}
        </div>
      ) : null}

      {me.isOversight && groups.pending.length ? (
        <p className="mt-4 text-xs text-gray-400">You can approve these here, or all departments at once from Approvals.</p>
      ) : null}

      {form.open ? <ActivityForm color={d.color} edit={form.edit} mayBudget={mayBudget} onClose={() => setForm({ open: false })} onSave={onSave} /> : null}
    </div>
  );
}

function Group({ title, items, data, onSave, onEdit }: { title: string; items: Activity[]; data: DepartmentDetail; onSave: Save; onEdit: (a: Activity) => void }) {
  if (!items.length) return null;
  return (
    <section className="mt-6">
      {title ? <h3 className="text-xs font-black uppercase tracking-wider text-gray-500">{title} <span className="text-gray-400">· {items.length}</span></h3> : null}
      <ul className="mt-2 space-y-3">
        {items.map((a) => <ActivityCard key={a.id} a={a} data={data} onSave={onSave} onEdit={onEdit} />)}
      </ul>
    </section>
  );
}

function ActivityCard({ a, data, onSave, onEdit }: { a: Activity; data: DepartmentDetail; onSave: Save; onEdit: (a: Activity) => void }) {
  const { can, me, department: d } = data;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sendBack, setSendBack] = useState(false);
  const [note, setNote] = useState('');
  const mine = a.createdBy === data.me_id;
  const isLeader = can['members.manage'];
  const canEdit = (a.status === 'PENDING' || a.status === 'REJECTED') && (me.isOversight || isLeader || (mine && can['activities.plan']));
  const canCancel = ['PENDING', 'APPROVED', 'REJECTED'].includes(a.status) && (me.isOversight || isLeader || mine);
  const started = +new Date(a.startsAt) <= Date.now();
  const canComplete = a.status === 'APPROVED' && started && (me.isOversight || can['activities.plan'] || isLeader);
  const canApprove = a.status === 'PENDING' && me.isOversight && !mine;

  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setErr('');
    try { await onSave({ activityId: a.id, ...body }, done); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <DateBlock iso={a.startsAt} color={d.color} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-[#0d1a14]">{a.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[a.status].cls}`}>{STATUS_STYLE[a.status].label}</span>
          </div>
          <ActivityMeta a={a} />
          {a.description ? <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{a.description}</p> : null}
          <p className="mt-2 text-[11px] text-gray-400">Planned by {a.createdByName}{a.decidedByName && (a.status === 'APPROVED' || a.status === 'COMPLETED') ? ` · approved by ${a.decidedByName}` : ''}</p>
          {a.status === 'REJECTED' && a.decisionNote ? (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>{a.decidedByName || 'A Pastor'}:</b> {a.decisionNote}</p>
          ) : null}
          {a.status === 'CANCELLED' && a.decisionNote ? <p className="mt-2 text-xs text-gray-500">Reason: {a.decisionNote}</p> : null}
          {a.status === 'COMPLETED' && a.completionNote ? <p className="mt-2 rounded-xl bg-[#f7f6f2] px-3 py-2 text-sm text-gray-600">{a.completionNote}</p> : null}
        </div>
      </div>

      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

      {sendBack ? (
        <div className="mt-3">
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="What should the department change?" className="w-full rounded-xl border border-gray-200 p-3 text-base" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setSendBack(false)} className="min-h-[40px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700">Cancel</button>
            <button type="button" disabled={busy || note.trim().length < 3} onClick={() => void run({ action: 'activity_decide', decision: 'REJECTED', note }, 'Sent back')} className="min-h-[40px] px-4 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-40">Send back</button>
          </div>
        </div>
      ) : (canApprove || canEdit || canCancel || canComplete) ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
          {canApprove ? (
            <>
              <button type="button" disabled={busy} onClick={() => void run({ action: 'activity_decide', decision: 'APPROVED' }, 'Approved')} className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50"><Check size={16} aria-hidden /> Approve</button>
              <button type="button" disabled={busy} onClick={() => setSendBack(true)} className="min-h-[40px] px-4 rounded-xl bg-red-50 text-sm font-bold text-red-700 flex items-center gap-1.5"><RotateCcw size={15} aria-hidden /> Send back</button>
            </>
          ) : null}
          {canComplete ? <button type="button" disabled={busy} onClick={() => { const n = window.prompt('How did it go? (optional)') ?? null; if (n !== null) void run({ action: 'activity_complete', note: n }, 'Marked as done'); }} className="min-h-[40px] px-4 rounded-xl bg-[#0f3d2c] text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50"><CheckCircle2 size={16} aria-hidden /> Mark as done</button> : null}
          {canEdit ? <button type="button" disabled={busy} onClick={() => onEdit(a)} className="min-h-[40px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700 flex items-center gap-1.5"><Pencil size={14} aria-hidden /> {a.status === 'REJECTED' ? 'Fix & resubmit' : 'Edit'}</button> : null}
          {canCancel ? <button type="button" disabled={busy} onClick={() => { const n = window.prompt(`Cancel “${a.title}”? Add a reason (optional)`); if (n !== null) void run({ action: 'activity_cancel', note: n }, 'Cancelled'); }} className="min-h-[40px] px-4 rounded-xl text-sm font-bold text-gray-500 flex items-center gap-1.5"><XCircle size={15} aria-hidden /> Cancel</button> : null}
        </div>
      ) : null}
    </li>
  );
}

function ActivityForm({ color, edit, mayBudget, onClose, onSave }: { color: string; edit?: Activity; mayBudget: boolean; onClose: () => void; onSave: Save }) {
  const start = edit ? kampalaParts(edit.startsAt) : null;
  const [title, setTitle] = useState(edit?.title || '');
  const [date, setDate] = useState(start?.date || '');
  const [startTime, setStartTime] = useState(start?.time || '');
  const [endTime, setEndTime] = useState(edit?.endsAt ? kampalaParts(edit.endsAt).time : '');
  const [location, setLocation] = useState(edit?.location || '');
  const [description, setDescription] = useState(edit?.description || '');
  const [budget, setBudget] = useState(edit?.budgetUgx != null ? String(edit.budgetUgx) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const today = kampalaParts(new Date().toISOString()).date;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSave(
        { action: edit ? 'activity_update' : 'activity_create', ...(edit ? { activityId: edit.id } : {}), title, date, startTime, endTime, location, description, ...(mayBudget ? { budgetUgx: budget } : {}) },
        edit ? (edit.status === 'REJECTED' ? 'Resubmitted for approval' : 'Saved') : 'Sent for approval'
      );
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-base font-normal bg-white';
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => !busy && onClose()}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#0d1a14]">{edit ? (edit.status === 'REJECTED' ? 'Fix & resubmit' : 'Edit activity') : 'Plan an activity'}</h2>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
        </div>
        {edit?.status === 'REJECTED' && edit.decisionNote ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>Requested change:</b> {edit.decisionNote}</p> : null}
        <label className="block mt-4 text-sm font-bold text-gray-700">What
          <input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Choir rehearsal" className={input} />
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm font-bold text-gray-700 sm:col-span-1">Date
            <input required type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <label className="block text-sm font-bold text-gray-700">Starts
              <input required type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={input} />
            </label>
            <label className="block text-sm font-bold text-gray-700">Ends <span className="font-normal text-gray-400">(opt.)</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={input} />
            </label>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400">Uganda time (EAT)</p>
        <label className="block mt-3 text-sm font-bold text-gray-700">Where <span className="font-normal text-gray-400">(optional)</span>
          <input maxLength={160} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main sanctuary" className={input} />
        </label>
        <label className="block mt-3 text-sm font-bold text-gray-700">Details <span className="font-normal text-gray-400">(optional)</span>
          <textarea maxLength={2000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Purpose, who should come, what to bring" className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-base font-normal" />
        </label>
        {mayBudget ? (
          <label className="block mt-3 text-sm font-bold text-gray-700">Estimated budget <span className="font-normal text-gray-400">(UGX, optional)</span>
            <input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d,]/g, ''))} placeholder="e.g. 500,000" className={input} />
          </label>
        ) : null}
        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        <button type="submit" disabled={busy} className="mt-5 w-full min-h-[48px] rounded-xl text-white font-bold disabled:opacity-50" style={{ background: color }}>
          {busy ? 'Sending…' : edit ? (edit.status === 'REJECTED' ? 'Resubmit for approval' : 'Save') : 'Send for approval'}
        </button>
        {!edit ? <p className="mt-2 text-center text-xs text-gray-400">A Pastor or the Apostle will approve it. The department is notified once approved.</p> : null}
      </form>
    </div>
  );
}

export function Notice({ text }: { text: string }) {
  return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 max-w-xl">{text}</div>;
}
