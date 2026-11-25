import React, { useState } from 'react';
import { BarChart3, CheckCircle2, ChevronDown, FilePlus2, Gauge, RotateCcw, X } from 'lucide-react';
import { kampalaParts, pct, type DepartmentDetail, type Performance, type Report, type ReportType } from '../../lib/departments';
import { Notice } from './Activities';

/** Department reports & performance (Phase 3, Nov 25 2026). Reviewed by Pastors and the Apostle. */

const STATUS: Record<Report['status'], { label: string; cls: string }> = {
  SUBMITTED: { label: 'Awaiting review', cls: 'bg-amber-50 text-amber-700' },
  REVIEWED: { label: 'Reviewed', cls: 'bg-emerald-50 text-emerald-700' },
  RETURNED: { label: 'Returned', cls: 'bg-red-50 text-red-700' },
};
const SECTIONS: { key: keyof Pick<Report, 'summary' | 'achievements' | 'challenges' | 'plans' | 'supportNeeded'>; label: string; hint: string }[] = [
  { key: 'summary', label: 'Summary', hint: 'How the period went, in a few sentences' },
  { key: 'achievements', label: 'What went well', hint: 'Achievements, souls reached, milestones' },
  { key: 'challenges', label: 'Challenges', hint: 'What made things hard' },
  { key: 'plans', label: 'Plans for next period', hint: 'What you will do next' },
  { key: 'supportNeeded', label: 'Support needed from leadership', hint: 'People, money, decisions' },
];

type Save = (b: Record<string, unknown>, done?: string) => Promise<void>;

export function scoreTone(score: number | null) {
  if (score == null) return { label: 'Not enough data yet', cls: 'text-gray-400', bg: 'bg-gray-100' };
  if (score >= 75) return { label: 'Strong', cls: 'text-emerald-700', bg: 'bg-emerald-50' };
  if (score >= 50) return { label: 'Steady', cls: 'text-amber-700', bg: 'bg-amber-50' };
  return { label: 'Needs attention', cls: 'text-red-700', bg: 'bg-red-50' };
}

export function PerformanceCard({ p, color }: { p: Performance; color: string }) {
  const tone = scoreTone(p.score);
  const Bar = ({ label, value, detail }: { label: string; value: number | null; detail: string }) => (
    <div>
      <div className="flex items-baseline justify-between text-sm"><span className="font-bold text-gray-700">{label}</span><span className="font-black" style={{ color: value == null ? '#9ca3af' : color }}>{pct(value)}</span></div>
      <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(value || 0) * 100}%`, background: color }} /></div>
      <p className="mt-1 text-[11px] text-gray-400">{detail}</p>
    </div>
  );
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-black text-[#0d1a14]"><Gauge size={18} className="text-[#b8862f]" aria-hidden /> Department health</h3>
          <p className="text-xs text-gray-400 mt-0.5">Last 90 days</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black" style={{ color: p.score == null ? '#9ca3af' : color }}>{p.score ?? '—'}</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.bg} ${tone.cls}`}>{tone.label}</span>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Bar label="Attendance" value={p.attendanceRate} detail={p.sessions ? `${p.sessions} session${p.sessions === 1 ? '' : 's'} recorded` : 'No sessions recorded'} />
        <Bar label="Activities done" value={p.completionRate} detail={p.activitiesApproved ? `${p.activitiesCompleted} of ${p.activitiesApproved} marked done` : 'No past activities'} />
        <Bar label="Monthly reports" value={p.reportRate} detail={`${p.reportsSubmitted} of the last ${p.reportsDue} months`} />
      </div>
      <p className="mt-4 text-[11px] text-gray-400">Score: attendance 40%, activities 30%, reports 30%. Parts without data are left out.{p.openRequisitions ? ` · ${p.openRequisitions} open requisition${p.openRequisitions === 1 ? '' : 's'}` : ''}</p>
    </section>
  );
}

export function ReportBody({ r }: { r: Report }) {
  return (
    <div className="space-y-3">
      {SECTIONS.filter((s) => r[s.key]).map((s) => (
        <div key={s.key}>
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">{s.label}</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{r[s.key]}</p>
        </div>
      ))}
    </div>
  );
}

export default function Reports({ data, onSave }: { data: DepartmentDetail; onSave: Save }) {
  const { can, me, department: d } = data;
  const [form, setForm] = useState<{ open: boolean; edit?: Report }>({ open: false });
  const [openId, setOpenId] = useState('');
  if (!data.phase3Ready) return <Notice text="Reports need a one-time setup. Ask your developer to run plcc_departments_phase3.sql in Supabase." />;
  const reports = data.reports || [];

  return (
    <div className="max-w-3xl space-y-5">
      {data.performance ? <PerformanceCard p={data.performance} color={d.color} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#0d1a14]">Reports</h2>
          <p className="text-sm text-gray-500">Monthly and quarterly reports to the Pastors and the Apostle.</p>
        </div>
        {can['reports.submit'] && d.isActive ? (
          <button type="button" onClick={() => setForm({ open: true })} className="min-h-[44px] px-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2" style={{ background: d.color }}>
            <FilePlus2 size={16} aria-hidden /> Write report
          </button>
        ) : null}
      </div>

      {reports.length ? (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm">
              <button type="button" onClick={() => setOpenId(openId === r.id ? '' : r.id)} className="w-full text-left p-4 flex items-center gap-3">
                <span className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${d.color}14`, color: d.color }}><BarChart3 size={20} aria-hidden /></span>
                <span className="flex-1 min-w-0">
                  <span className="block font-black text-[#0d1a14] truncate">{r.title}</span>
                  <span className="block text-xs text-gray-400">By {r.submittedByName} · {new Date(r.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${openId === r.id ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {openId === r.id ? (
                <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                  {r.status === 'RETURNED' && r.reviewNote ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>{r.reviewedByName}:</b> {r.reviewNote}</p> : null}
                  {r.status === 'REVIEWED' ? <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Reviewed by {r.reviewedByName}{r.reviewNote ? `: ${r.reviewNote}` : ''}</p> : null}
                  <ReportBody r={r} />
                  <ReviewActions r={r} data={data} onSave={onSave} onEdit={() => setForm({ open: true, edit: r })} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <span className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: `${d.color}14`, color: d.color }}><BarChart3 size={26} aria-hidden /></span>
          <p className="mt-3 font-black text-[#0d1a14]">No reports yet</p>
          <p className="text-sm text-gray-500 mt-1">{can['reports.submit'] ? 'Write your first monthly report.' : 'Reports from this department will show here.'}</p>
        </div>
      )}
      {me.isOversight ? <p className="text-xs text-gray-400">Review reports from every department at once in Approvals.</p> : null}
      {form.open ? <ReportForm color={d.color} edit={form.edit} onClose={() => setForm({ open: false })} onSave={onSave} /> : null}
    </div>
  );
}

export function ReviewActions({ r, data, onSave, onEdit, departmentId }: { r: Report; data?: DepartmentDetail; onSave: Save; onEdit?: () => void; departmentId?: string }) {
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const isOversight = data ? data.me.isOversight : true;
  const mine = data ? r.submittedBy === data.me_id : false;
  const canEdit = data && data.can['reports.submit'] && r.status !== 'REVIEWED';
  const canReview = isOversight && r.status === 'SUBMITTED' && !mine;
  const run = async (decision: 'REVIEWED' | 'RETURNED') => {
    setBusy(true);
    setErr('');
    try { await onSave({ action: 'report_review', reportId: r.id, decision, note, ...(departmentId ? { id: departmentId } : {}) }, decision === 'REVIEWED' ? 'Marked as reviewed' : 'Returned'); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  if (!canReview && !canEdit) return null;
  return (
    <div className="mt-4 border-t border-gray-50 pt-3">
      {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}
      {returning ? (
        <div>
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="What should be added or changed?" className="w-full rounded-xl border border-gray-200 p-3 text-base" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setReturning(false)} className="min-h-[40px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700">Cancel</button>
            <button type="button" disabled={busy || note.trim().length < 3} onClick={() => void run('RETURNED')} className="min-h-[40px] px-4 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-40">Return</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canReview ? (
            <>
              <button type="button" disabled={busy} onClick={() => void run('REVIEWED')} className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50"><CheckCircle2 size={16} aria-hidden /> Mark reviewed</button>
              <button type="button" disabled={busy} onClick={() => setReturning(true)} className="min-h-[44px] px-4 rounded-xl bg-red-50 text-sm font-bold text-red-700 flex items-center gap-1.5"><RotateCcw size={15} aria-hidden /> Return</button>
            </>
          ) : null}
          {canEdit && onEdit ? <button type="button" onClick={onEdit} className="min-h-[44px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700">{r.status === 'RETURNED' ? 'Update & resubmit' : 'Edit'}</button> : null}
        </div>
      )}
    </div>
  );
}

function ReportForm({ color, edit, onClose, onSave }: { color: string; edit?: Report; onClose: () => void; onSave: Save }) {
  const today = kampalaParts(new Date().toISOString()).date;
  const lastMonth = (() => { const [y, m] = today.split('-').map(Number); const pm = m === 1 ? 12 : m - 1; return `${m === 1 ? y - 1 : y}-${String(pm).padStart(2, '0')}`; })();
  const [periodType, setPeriodType] = useState<ReportType>(edit?.periodType || 'MONTHLY');
  const [month, setMonth] = useState(edit && edit.periodType !== 'SPECIAL' ? edit.periodStart.slice(0, 7) : lastMonth);
  const [special, setSpecial] = useState(edit?.periodType === 'SPECIAL' ? edit.periodStart : today);
  const [title, setTitle] = useState(edit?.periodType === 'SPECIAL' ? edit.title : '');
  const [fields, setFields] = useState(() => Object.fromEntries(SECTIONS.map((s) => [s.key, edit?.[s.key] || ''])) as Record<string, string>);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSave({ action: 'report_submit', reportId: edit?.id, periodType, periodStart: periodType === 'SPECIAL' ? special : `${month}-01`, title, ...fields }, edit ? 'Report resubmitted' : 'Report submitted');
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => !busy && onClose()}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#0d1a14]">{edit ? 'Update report' : 'Write a report'}</h2>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
        </div>
        {edit?.status === 'RETURNED' && edit.reviewNote ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>Requested:</b> {edit.reviewNote}</p> : null}
        <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Report type">
          {(['MONTHLY', 'QUARTERLY', 'SPECIAL'] as ReportType[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={periodType === t} onClick={() => setPeriodType(t)} className={`min-h-[44px] rounded-xl text-sm font-bold border ${periodType === t ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 bg-white'}`} style={periodType === t ? { background: color } : undefined}>
              {t === 'MONTHLY' ? 'Monthly' : t === 'QUARTERLY' ? 'Quarterly' : 'Special'}
            </button>
          ))}
        </div>
        {periodType === 'SPECIAL' ? (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Christmas outreach report" className="min-h-[48px] rounded-xl border border-gray-200 px-3 text-base" aria-label="Title" />
            <input type="date" value={special} onChange={(e) => setSpecial(e.target.value)} className="min-h-[48px] rounded-xl border border-gray-200 px-2 text-sm" aria-label="Date" />
          </div>
        ) : (
          <label className="block mt-3 text-sm font-bold text-gray-700">{periodType === 'MONTHLY' ? 'Month' : 'Any month in the quarter'}
            <input type="month" max={today.slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-base font-normal" />
          </label>
        )}
        {SECTIONS.map((s) => (
          <label key={s.key} className="block mt-3 text-sm font-bold text-gray-700">{s.label} {s.key !== 'summary' ? <span className="font-normal text-gray-400">(optional)</span> : null}
            <textarea required={s.key === 'summary'} maxLength={3000} rows={s.key === 'summary' ? 4 : 3} value={fields[s.key]} onChange={(e) => setFields((f) => ({ ...f, [s.key]: e.target.value }))} placeholder={s.hint} className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-base font-normal" />
          </label>
        ))}
        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        <button type="submit" disabled={busy} className="mt-5 w-full min-h-[48px] rounded-xl text-white font-bold disabled:opacity-50" style={{ background: color }}>{busy ? 'Submitting…' : edit ? 'Resubmit report' : 'Submit report'}</button>
        <p className="mt-2 text-center text-xs text-gray-400">Goes to the Pastors and the Apostle for review.</p>
      </form>
    </div>
  );
}
