import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, Plus, Search, ShieldCheck, SlidersHorizontal, Users, X } from 'lucide-react';
import { DEPT_ROLE_LABELS, departmentsApi, DepartmentsError, type ChurchAccess, type DepartmentSummary } from '../../lib/departments';
import { DeptIcon } from './DeptIcon';

/** PLCC Core Departments directory (Nov 25 2026). */
export default function DepartmentsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<DepartmentSummary[]>([]);
  const [me, setMe] = useState<ChurchAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ msg: string; setup: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [mission, setMission] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await departmentsApi.list();
      setItems(data.departments);
      setMe(data.me);
      setError(null);
    } catch (e) {
      setError({ msg: (e as Error).message, setup: e instanceof DepartmentsError && e.setupNeeded });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mine = items.filter((d) => d.myRole && d.isActive);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((d) => !q || d.name.toLowerCase().includes(q) || d.mission.toLowerCase().includes(q));
  }, [items, query]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const { id } = await departmentsApi.post({ action: 'create', name, mission });
      setCreating(false);
      setName('');
      setMission('');
      if (id) navigate(`/departments/${id}`); else void load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-24 pt-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b8862f]">PLCC Canaan</p>
          <h1 className="text-3xl font-black text-[#0d1a14] mt-1">Departments</h1>
          <p className="text-gray-500 mt-1 max-w-xl">Every ministry, its leaders, its responsibilities and who it reports to.</p>
        </div>
        {me?.isStructureAdmin ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate('/departments/permissions')} className="min-h-[44px] px-4 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 flex items-center gap-2">
              <SlidersHorizontal size={16} aria-hidden /> Permissions
            </button>
            <button type="button" onClick={() => setCreating(true)} className="min-h-[44px] px-4 rounded-xl bg-[#0f3d2c] text-white text-sm font-bold flex items-center gap-2">
              <Plus size={16} aria-hidden /> New department
            </button>
          </div>
        ) : null}
      </header>

      {me?.isOversight ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0f3d2c]/5 px-3 py-1.5 text-xs font-bold text-[#0f3d2c]">
          <ShieldCheck size={14} aria-hidden /> You have oversight of every department
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>
      ) : error ? (
        <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <p className="font-bold text-amber-900">{error.setup ? 'Departments need a one-time setup' : 'Could not load departments'}</p>
          <p className="text-sm text-amber-800 mt-1">{error.msg}</p>
        </div>
      ) : (
        <>
          {mine.length ? (
            <section className="mt-8">
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">My departments</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mine.map((d) => (
                  <button key={d.id} type="button" onClick={() => navigate(`/departments/${d.id}`)} className="text-left rounded-2xl p-4 text-white flex items-center gap-3 shadow-sm active:opacity-90" style={{ background: d.color }}>
                    <span className="h-11 w-11 shrink-0 rounded-xl bg-white/15 flex items-center justify-center"><DeptIcon name={d.icon} size={22} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-black truncate">{d.name}</span>
                      <span className="block text-xs text-white/80">{d.myRole ? DEPT_ROLE_LABELS[d.myRole] : ''}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">All departments <span className="text-gray-400">· {items.filter((d) => d.isActive).length}</span></h2>
              <label className="relative sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search departments" className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm" />
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((d) => (
                <button key={d.id} type="button" onClick={() => navigate(`/departments/${d.id}`)} className={`group text-left rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow ${d.isActive ? '' : 'opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <span className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${d.color}1a`, color: d.color }}><DeptIcon name={d.icon} size={22} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-black text-[#0d1a14] truncate">{d.name}</span>
                        {!d.isActive ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">Archived</span> : null}
                      </span>
                      <span className="mt-1 block text-sm text-gray-500 line-clamp-2">{d.mission || 'No mission written yet.'}</span>
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3 text-xs">
                    <span className="text-gray-500 truncate">{d.head ? <>Head: <b className="text-gray-700">{d.head.name}</b></> : <span className="text-amber-700 font-bold">No head yet</span>}</span>
                    <span className="inline-flex items-center gap-1 text-gray-500 shrink-0"><Users size={13} aria-hidden /> {d.memberCount}</span>
                  </div>
                </button>
              ))}
            </div>
            {!filtered.length ? <p className="mt-6 text-center text-sm text-gray-400">No departments match “{query}”.</p> : null}
          </section>
        </>
      )}

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" onClick={() => !busy && setCreating(false)}>
          <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-[#0d1a14]">New department</h2>
              <button type="button" onClick={() => setCreating(false)} className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
            </div>
            <label className="block mt-4 text-sm font-bold text-gray-700">Name
              <input autoFocus required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hospitality" className="mt-1 w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-base font-normal" />
            </label>
            <label className="block mt-3 text-sm font-bold text-gray-700">Mission <span className="font-normal text-gray-400">(optional)</span>
              <textarea maxLength={600} rows={3} value={mission} onChange={(e) => setMission(e.target.value)} placeholder="What this department exists to do" className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-base font-normal" />
            </label>
            {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
            <p className="mt-3 text-xs text-gray-400">You can add values, responsibilities, leaders and members next.</p>
            <button type="submit" disabled={busy} className="mt-4 w-full min-h-[48px] rounded-xl bg-[#0f3d2c] text-white font-bold disabled:opacity-50">{busy ? 'Creating…' : 'Create department'}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
