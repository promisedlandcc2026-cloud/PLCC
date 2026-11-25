import React, { useMemo, useState } from 'react';
import { CalendarCheck, Check, ChevronRight, Minus, Pencil, Trash2, UserCheck, X } from 'lucide-react';
import { kampalaParts, pct, type AttStatus, type AttendanceSession, type DepartmentDetail } from '../../lib/departments';
import { Notice } from './Activities';

/** Department attendance (Phase 3, Nov 25 2026). Excused does not count against anyone. */

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const STATUS: Record<AttStatus, { label: string; cls: string }> = {
  PRESENT: { label: 'Present', cls: 'bg-emerald-600 text-white' },
  ABSENT: { label: 'Absent', cls: 'bg-red-500 text-white' },
  EXCUSED: { label: 'Excused', cls: 'bg-amber-400 text-white' },
};

type Save = (b: Record<string, unknown>, done?: string) => Promise<void>;

export default function Attendance({ data, onSave }: { data: DepartmentDetail; onSave: Save }) {
  const { can, department: d } = data;
  const [taking, setTaking] = useState<{ open: boolean; edit?: AttendanceSession }>({ open: false });
  if (!data.phase3Ready) return <Notice text="Attendance needs a one-time setup. Ask your developer to run plcc_departments_phase3.sql in Supabase." />;

  const sessions = data.attendance || [];
  const totals = sessions.reduce((t, s) => ({ p: t.p + s.present, a: t.a + s.absent }), { p: 0, a: 0 });
  const overall = totals.p + totals.a ? totals.p / (totals.p + totals.a) : null;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#0d1a14]">Attendance</h2>
          <p className="text-sm text-gray-500">Who came to meetings, rehearsals and activities.</p>
        </div>
        {can['attendance.record'] && d.isActive ? (
          <button type="button" onClick={() => setTaking({ open: true })} className="min-h-[44px] px-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2" style={{ background: d.color }}>
            <UserCheck size={16} aria-hidden /> Take attendance
          </button>
        ) : null}
      </div>

      {data.myAttendance ? (
        <section className="mt-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-[#0d1a14]">My attendance</h3>
            <span className="text-2xl font-black" style={{ color: d.color }}>{pct(data.myAttendance.rate)}</span>
          </div>
          {data.myAttendance.sessions.length ? (
            <ul className="mt-3 divide-y divide-gray-50">
              {data.myAttendance.sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block font-bold text-gray-700 truncate">{s.title}</span><span className="text-xs text-gray-400">{fmtDate(s.heldOn)}</span></span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-gray-400">No attendance recorded for you yet.</p>}
        </section>
      ) : null}

      {data.attendance ? (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="Sessions" value={String(sessions.length)} />
            <Stat label="Attendance" value={pct(overall)} color={d.color} />
            <Stat label="Last" value={sessions[0] ? new Date(`${sessions[0].heldOn}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—'} />
          </div>
          {sessions.length ? (
            <ul className="mt-4 space-y-2">
              {sessions.map((s) => {
                const counted = s.present + s.absent;
                const rate = counted ? s.present / counted : null;
                return (
                  <li key={s.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex-1 min-w-0">
                        <span className="block font-black text-[#0d1a14] truncate">{s.title}</span>
                        <span className="block text-xs text-gray-400">{fmtDate(s.heldOn)} · recorded by {s.recordedByName}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-lg font-black" style={{ color: d.color }}>{pct(rate)}</span>
                        <span className="block text-[11px] text-gray-400">{s.present} present · {s.absent} absent{s.excused ? ` · ${s.excused} excused` : ''}</span>
                      </span>
                      {can['attendance.record'] && s.marks ? (
                        <button type="button" onClick={() => setTaking({ open: true, edit: s })} className="h-10 w-10 shrink-0 rounded-xl bg-gray-50 text-gray-500 flex items-center justify-center" aria-label={`Edit ${s.title}`}><ChevronRight size={18} /></button>
                      ) : null}
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden flex" aria-hidden>
                      <span style={{ width: `${(s.present / Math.max(1, s.present + s.absent + s.excused)) * 100}%`, background: d.color }} />
                      <span className="bg-amber-300" style={{ width: `${(s.excused / Math.max(1, s.present + s.absent + s.excused)) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
              <span className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: `${d.color}14`, color: d.color }}><CalendarCheck size={26} aria-hidden /></span>
              <p className="mt-3 font-black text-[#0d1a14]">No attendance recorded yet</p>
              <p className="text-sm text-gray-500 mt-1">{can['attendance.record'] ? 'Tap Take attendance after your next meeting.' : 'Your leaders record attendance here.'}</p>
            </div>
          )}
        </>
      ) : null}

      {taking.open ? <TakeAttendance data={data} edit={taking.edit} onClose={() => setTaking({ open: false })} onSave={onSave} /> : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4">
      <p className="text-xl sm:text-2xl font-black" style={{ color: color || '#0d1a14' }}>{value}</p>
      <p className="text-[11px] sm:text-xs font-bold text-gray-400">{label}</p>
    </div>
  );
}

function TakeAttendance({ data, edit, onClose, onSave }: { data: DepartmentDetail; edit?: AttendanceSession; onClose: () => void; onSave: Save }) {
  const d = data.department;
  const people = data.members || data.leadership;
  const used = new Set((data.attendance || []).map((s) => s.activityId).filter(Boolean));
  const activities = (data.activities || [])
    .filter((a) => (a.status === 'APPROVED' || a.status === 'COMPLETED') && +new Date(a.startsAt) <= Date.now() + 864e5 && (!used.has(a.id) || a.id === edit?.activityId))
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt))
    .slice(0, 10);
  const today = kampalaParts(new Date().toISOString()).date;
  const [activityId, setActivityId] = useState(edit?.activityId || '');
  const [title, setTitle] = useState(edit?.title || '');
  const [heldOn, setHeldOn] = useState(edit?.heldOn || today);
  const [marks, setMarks] = useState<Record<string, AttStatus | undefined>>(() => Object.fromEntries((edit?.marks || []).map((m) => [m.userId, m.status])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const counts = useMemo(() => {
    const v = Object.values(marks);
    return { p: v.filter((x) => x === 'PRESENT').length, a: v.filter((x) => x === 'ABSENT').length, e: v.filter((x) => x === 'EXCUSED').length };
  }, [marks]);

  const pickActivity = (id: string) => {
    setActivityId(id);
    const a = activities.find((x) => x.id === id);
    if (a) { setTitle(a.title); setHeldOn(kampalaParts(a.startsAt).date); }
  };
  const setAll = (s: AttStatus) => setMarks(Object.fromEntries(people.map((p) => [p.userId, s])));
  const cycle = (uid: string, s: AttStatus) => setMarks((m) => ({ ...m, [uid]: m[uid] === s ? undefined : s }));

  const save = async () => {
    const list = Object.entries(marks).filter(([, s]) => s).map(([userId, status]) => ({ userId, status }));
    setBusy(true);
    setErr('');
    try {
      await onSave({ action: 'attendance_save', sessionId: edit?.id, activityId: activityId || null, title, heldOn, marks: list }, edit ? 'Attendance updated' : 'Attendance saved');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[94vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white">
        <div className="p-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-[#0d1a14]">{edit ? 'Edit attendance' : 'Take attendance'}</h2>
            <button type="button" onClick={onClose} className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
          </div>
          {activities.length ? (
            <label className="block mt-3 text-xs font-bold text-gray-500">For an activity
              <select value={activityId} onChange={(e) => pickActivity(e.target.value)} className="mt-1 w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700">
                <option value="">Another meeting…</option>
                {activities.map((a) => <option key={a.id} value={a.id}>{a.title} · {new Date(a.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Kampala' })}</option>)}
              </select>
            </label>
          ) : null}
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Sunday rehearsal" className="min-h-[44px] rounded-xl border border-gray-200 px-3 text-base" aria-label="Meeting name" />
            <input type="date" max={today} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} className="min-h-[44px] w-full rounded-xl border border-gray-200 px-3 text-base" aria-label="Date" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-gray-500">{counts.p} present · {counts.a} absent · {counts.e} excused · {people.length - counts.p - counts.a - counts.e} not marked</span>
            <span className="flex gap-1">
              <button type="button" onClick={() => setAll('PRESENT')} className="min-h-[36px] px-3 rounded-lg bg-emerald-50 font-bold text-emerald-700 whitespace-nowrap">All present</button>
              <button type="button" onClick={() => setMarks({})} className="min-h-[36px] px-3 rounded-lg bg-gray-100 font-bold text-gray-600">Clear</button>
            </span>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto px-5 divide-y divide-gray-50">
          {people.map((p) => (
            <li key={p.userId} className="flex items-center gap-2 py-2.5">
              <span className="flex-1 min-w-0 font-bold text-sm text-[#0d1a14] truncate">{p.name}</span>
              {(['PRESENT', 'ABSENT', 'EXCUSED'] as AttStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => cycle(p.userId, s)}
                  aria-pressed={marks[p.userId] === s}
                  aria-label={`${p.name}: ${STATUS[s].label}`}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center font-black text-xs transition-colors ${marks[p.userId] === s ? STATUS[s].cls : 'bg-gray-50 text-gray-400'}`}
                >
                  {s === 'PRESENT' ? <Check size={16} /> : s === 'ABSENT' ? <X size={16} /> : <Minus size={16} />}
                </button>
              ))}
            </li>
          ))}
        </ul>
        <div className="p-5 pt-3 border-t border-gray-100 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <p className="mb-2 flex justify-center gap-4 text-[11px] text-gray-400"><span className="inline-flex items-center gap-1"><Check size={12} /> Present</span><span className="inline-flex items-center gap-1"><X size={12} /> Absent</span><span className="inline-flex items-center gap-1"><Minus size={12} /> Excused</span></p>
          {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}
          <div className="flex gap-2">
            {edit ? (
              <button type="button" disabled={busy} onClick={async () => { if (!window.confirm('Delete this attendance record?')) return; setBusy(true); try { await onSave({ action: 'attendance_delete', sessionId: edit.id }, 'Deleted'); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); } }} className="min-h-[48px] w-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center" aria-label="Delete"><Trash2 size={18} /></button>
            ) : null}
            <button type="button" disabled={busy || counts.p + counts.a + counts.e === 0} onClick={() => void save()} className="flex-1 min-h-[48px] rounded-xl text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: d.color }}>
              {edit ? <Pencil size={16} /> : <UserCheck size={16} />} {busy ? 'Saving…' : edit ? 'Save changes' : 'Save attendance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
