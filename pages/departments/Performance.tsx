import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Gauge, Loader2 } from 'lucide-react';
import { departmentsApi, pct } from '../../lib/departments';
import { DeptIcon } from './DeptIcon';
import { scoreTone } from './Reports';

/** Church-wide department performance for Pastors, the Apostle and admins (Phase 3). */
export default function Performance() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof departmentsApi.performance>>['departments'] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    departmentsApi.performance().then((d) => setRows(d.departments)).catch((e) => setError(e.message));
  }, []);

  const scored = (rows || []).filter((r) => r.performance.score != null);
  const avg = scored.length ? Math.round(scored.reduce((t, r) => t + (r.performance.score || 0), 0) / scored.length) : null;
  const attention = scored.filter((r) => (r.performance.score || 0) < 50).length;
  const noHead = (rows || []).filter((r) => !r.headName).length;

  return (
    <div className="max-w-6xl mx-auto px-4 pb-24 pt-6">
      <button type="button" onClick={() => navigate('/departments')} className="flex items-center gap-2 text-sm font-bold text-gray-500 min-h-[36px]">
        <ArrowLeft size={16} aria-hidden /> All departments
      </button>
      <header className="mt-3">
        <h1 className="flex items-center gap-2 text-3xl font-black text-[#0d1a14]"><Gauge className="text-[#b8862f]" aria-hidden /> Performance</h1>
        <p className="text-gray-500 mt-1">How every department is doing over the last 90 days: attendance, activities carried out and monthly reports.</p>
      </header>

      {error ? <p className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">{error}</p> : null}
      {!rows && !error ? <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" aria-label="Loading" /></div> : null}

      {rows ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Average health" value={avg == null ? '—' : String(avg)} />
            <Tile label="Departments" value={String(rows.length)} />
            <Tile label="Need attention" value={String(attention)} tone={attention ? 'text-red-600' : undefined} />
            <Tile label="Without a Head" value={String(noHead)} tone={noHead ? 'text-amber-600' : undefined} />
          </div>

          {/* Desktop table */}
          <div className="mt-6 hidden md:block overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f7f6f2] text-left text-[#0d1a14]">
                  <th className="px-5 py-3 font-black">Department</th>
                  <th className="px-3 py-3 font-black">Head</th>
                  <th className="px-3 py-3 font-black text-right">People</th>
                  <th className="px-3 py-3 font-black text-right">Attendance</th>
                  <th className="px-3 py-3 font-black text-right">Activities done</th>
                  <th className="px-3 py-3 font-black text-right">Reports</th>
                  <th className="px-3 py-3 font-black text-right">Open req.</th>
                  <th className="px-5 py-3 font-black text-right">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const p = r.performance;
                  const tone = scoreTone(p.score);
                  return (
                    <tr key={r.id} onClick={() => navigate(`/departments/${r.id}?tab=reports`)} className="cursor-pointer hover:bg-[#f7f6f2]/60">
                      <td className="px-5 py-3"><span className="flex items-center gap-2 font-bold text-[#0d1a14]"><span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${r.color}14`, color: r.color }}><DeptIcon name={r.icon} size={16} /></span>{r.name}</span></td>
                      <td className="px-3 py-3 text-gray-600">{r.headName || <span className="text-amber-600 font-bold">None</span>}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{r.memberCount}</td>
                      <td className="px-3 py-3 text-right font-bold">{pct(p.attendanceRate)}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{p.activitiesApproved ? `${p.activitiesCompleted}/${p.activitiesApproved}` : '—'}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{p.reportsSubmitted}/{p.reportsDue}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{p.openRequisitions || '—'}</td>
                      <td className="px-5 py-3 text-right"><span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-black ${tone.bg} ${tone.cls}`}>{p.score ?? '—'} <span className="font-bold">{tone.label}</span></span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="mt-6 space-y-3 md:hidden">
            {rows.map((r) => {
              const p = r.performance;
              const tone = scoreTone(p.score);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => navigate(`/departments/${r.id}?tab=reports`)} className="w-full text-left rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `${r.color}14`, color: r.color }}><DeptIcon name={r.icon} size={20} /></span>
                      <span className="flex-1 min-w-0"><span className="block font-black text-[#0d1a14] truncate">{r.name}</span><span className="block text-xs text-gray-400">{r.headName ? `Head: ${r.headName}` : 'No Head yet'} · {r.memberCount} people</span></span>
                      <span className="text-right"><span className="block text-2xl font-black" style={{ color: p.score == null ? '#9ca3af' : r.color }}>{p.score ?? '—'}</span><span className={`text-[10px] font-bold ${tone.cls}`}>{tone.label}</span></span>
                      <ChevronRight size={16} className="text-gray-300" aria-hidden />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <span className="rounded-xl bg-[#f7f6f2] py-2"><b className="block text-sm text-[#0d1a14]">{pct(p.attendanceRate)}</b>Attendance</span>
                      <span className="rounded-xl bg-[#f7f6f2] py-2"><b className="block text-sm text-[#0d1a14]">{p.activitiesApproved ? `${p.activitiesCompleted}/${p.activitiesApproved}` : '—'}</b>Activities</span>
                      <span className="rounded-xl bg-[#f7f6f2] py-2"><b className="block text-sm text-[#0d1a14]">{p.reportsSubmitted}/{p.reportsDue}</b>Reports</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-gray-400">Health: attendance 40%, activities marked done 30%, monthly reports for the last three months 30%. Parts with no data yet are left out rather than counted as zero.</p>
        </>
      ) : null}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className={`text-2xl font-black ${tone || 'text-[#0d1a14]'}`}>{value}</p>
      <p className="text-xs font-bold text-gray-400">{label}</p>
    </div>
  );
}
