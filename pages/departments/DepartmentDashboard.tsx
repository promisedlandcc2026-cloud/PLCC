import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  Check,
  ClipboardCheck,
  Crown,
  FileText,
  History,
  Loader2,
  Lock,
  Megaphone,
  Pencil,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  DEPT_ROLES,
  DEPT_ROLE_LABELS,
  LEADER_ASSIGNABLE,
  departmentsApi,
  describeAudit,
  searchPeople,
  type DepartmentDetail,
  type DeptRole,
} from '../../lib/departments';
import { DeptIcon } from './DeptIcon';

type Tab = 'overview' | 'members' | 'activities' | 'attendance' | 'reports' | 'requisitions' | 'communication' | 'audit' | 'settings';

const SOON: Record<string, { title: string; text: string; phase: number }> = {
  activities: { title: 'Activity planning', text: 'Plan activities, send them to a Pastor for approval and notify the department when they are approved.', phase: 2 },
  communication: { title: 'Department announcements', text: 'Post announcements and reminders to everyone in the department.', phase: 2 },
  attendance: { title: 'Attendance', text: 'Record who attended each meeting, rehearsal or activity, and see attendance trends.', phase: 3 },
  reports: { title: 'Reports & performance', text: 'Submit monthly and quarterly reports to leadership and track how the department is doing against its responsibilities.', phase: 3 },
  requisitions: { title: 'Requisitions', text: 'Raise money requests in UGX. Each goes Head → Finance → Pastor, with every step recorded.', phase: 3 },
};

const ROLE_STYLE: Record<DeptRole, string> = {
  HEAD: 'bg-[#b8862f]/15 text-[#7a5c1e]',
  ASSISTANT_HEAD: 'bg-[#0f3d2c]/10 text-[#0f3d2c]',
  SECRETARY: 'bg-sky-50 text-sky-700',
  TREASURER: 'bg-emerald-50 text-emerald-700',
  MEMBER: 'bg-gray-100 text-gray-600',
};

const COLORS = ['#0f3d2c', '#5b3a8c', '#b8862f', '#1f6f5c', '#22577a', '#e07a2f', '#2f80c9', '#b03a6f', '#3d5a40', '#c0392b', '#7a5c1e', '#4a4e69'];

export default function DepartmentDashboard() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DepartmentDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await departmentsApi.get(id));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2500);
  };

  const save = async (body: Record<string, unknown>, done = 'Saved') => {
    await departmentsApi.post({ id, ...body });
    await load();
    flash(done);
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <BackLink onClick={() => navigate('/departments')} />
        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">{error}</div>
      </div>
    );
  }
  if (!data) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>;

  const { department: d, can, me } = data;
  const tabs: { key: Tab; label: string; icon: React.ReactNode; show: boolean; soon?: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: <FileText size={16} />, show: true },
    { key: 'members', label: 'Members', icon: <Users size={16} />, show: can['members.view'] },
    { key: 'activities', label: 'Activities', icon: <CalendarDays size={16} />, show: data.amIMember || me.isOversight, soon: true },
    { key: 'attendance', label: 'Attendance', icon: <CalendarCheck size={16} />, show: data.amIMember || me.isOversight, soon: true },
    { key: 'reports', label: 'Reports', icon: <BarChart3 size={16} />, show: can['reports.submit'] || me.isOversight, soon: true },
    { key: 'requisitions', label: 'Requisitions', icon: <Wallet size={16} />, show: can['finance.view'], soon: true },
    { key: 'communication', label: 'Announcements', icon: <Megaphone size={16} />, show: data.amIMember || me.isOversight, soon: true },
    { key: 'audit', label: 'Audit trail', icon: <History size={16} />, show: can['audit.view'] },
    { key: 'settings', label: 'Settings', icon: <Settings2 size={16} />, show: me.isStructureAdmin },
  ];
  const visible = tabs.filter((t) => t.show);
  const head = data.leadership.find((l) => l.deptRole === 'HEAD');

  return (
    <div className="pb-24">
      {/* Hero */}
      <div className="text-white" style={{ background: `linear-gradient(135deg, ${d.color}, ${d.color}cc)` }}>
        <div className="max-w-6xl mx-auto px-4 pt-5 pb-6">
          <BackLink onClick={() => navigate('/departments')} light />
          <div className="mt-4 flex items-start gap-4">
            <span className="h-14 w-14 shrink-0 rounded-2xl bg-white/15 flex items-center justify-center"><DeptIcon name={d.icon} size={28} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black">{d.name}</h1>
                {!d.isActive ? <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">Archived</span> : null}
              </div>
              <p className="mt-1 text-white/85 max-w-2xl text-sm sm:text-base">{d.mission || 'No mission written yet.'}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                {data.myRole ? <span className="rounded-full bg-white px-3 py-1" style={{ color: d.color }}>You: {DEPT_ROLE_LABELS[data.myRole]}</span> : null}
                {me.isOversight ? <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1"><ShieldCheck size={13} /> Oversight</span> : null}
                <span className="rounded-full bg-white/15 px-3 py-1">{head ? `Head: ${head.name}` : 'No head yet'}</span>
                <span className="rounded-full bg-white/15 px-3 py-1">{data.memberCount} {data.memberCount === 1 ? 'person' : 'people'}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-2 overflow-x-auto no-scrollbar">
          <nav className="flex gap-1 min-w-max" aria-label="Department sections">
            {visible.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-t-xl text-sm font-bold transition-colors ${tab === t.key ? 'bg-[#f7f6f2] text-[#0d1a14]' : 'text-white/80 hover:text-white'}`}
                aria-current={tab === t.key ? 'page' : undefined}
              >
                {t.icon} {t.label}
                {t.soon ? <span className={`ml-0.5 rounded px-1 text-[9px] uppercase ${tab === t.key ? 'bg-gray-200 text-gray-500' : 'bg-white/15'}`}>Soon</span> : null}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6">
        {tab === 'overview' ? <Overview data={data} onSave={save} /> : null}
        {tab === 'members' ? <Members data={data} onSave={save} /> : null}
        {tab === 'audit' ? <Audit data={data} /> : null}
        {tab === 'settings' ? <SettingsTab data={data} onSave={save} /> : null}
        {SOON[tab] ? <ComingSoon {...SOON[tab]} financial={tab === 'requisitions'} /> : null}
      </div>

      {toast ? (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-[#0d1a14] px-5 py-3 text-sm font-bold text-white shadow-lg flex items-center gap-2">
          <Check size={16} aria-hidden /> {toast}
        </div>
      ) : null}
    </div>
  );
}

function BackLink({ onClick, light }: { onClick: () => void; light?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2 text-sm font-bold min-h-[36px] ${light ? 'text-white/85' : 'text-gray-500'}`}>
      <ArrowLeft size={16} aria-hidden /> All departments
    </button>
  );
}

function Card({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-black text-[#0d1a14]">{icon} {title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-[36px] px-3 rounded-lg bg-gray-50 text-xs font-bold text-gray-600 flex items-center gap-1.5">
      <Pencil size={13} aria-hidden /> Edit
    </button>
  );
}

/** Edit a list as one item per line. */
function ListEditor({ initial, placeholder, onCancel, onSave }: { initial: string[]; placeholder: string; onCancel: () => void; onSave: (v: string[]) => Promise<void> }) {
  const [text, setText] = useState(initial.join('\n'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.max(4, initial.length + 1)} placeholder={placeholder} className="w-full rounded-xl border border-gray-200 p-3 text-base" />
      <p className="text-xs text-gray-400 mt-1">One per line · up to 15</p>
      {err ? <p className="text-sm text-red-600 mt-1">{err}</p> : null}
      <div className="mt-3 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="min-h-[40px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700">Cancel</button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try { await onSave(text.split('\n').map((s) => s.trim()).filter(Boolean)); } catch (e) { setErr((e as Error).message); setBusy(false); }
          }}
          className="min-h-[40px] px-4 rounded-xl bg-[#0f3d2c] text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Overview({ data, onSave }: { data: DepartmentDetail; onSave: (b: Record<string, unknown>, done?: string) => Promise<void> }) {
  const { department: d, can } = data;
  const [editing, setEditing] = useState<'' | 'mission' | 'coreValues' | 'responsibilities' | 'accountability'>('');
  const [mission, setMission] = useState(d.mission);
  const [busy, setBusy] = useState(false);
  const edit = (k: typeof editing) => (can['profile.edit'] ? <EditButton onClick={() => setEditing(k)} /> : null);
  const empty = (t: string) => <p className="text-sm text-gray-400">{t}</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5 min-w-0">
        <Card title="Mission" icon={<FileText size={18} className="text-[#b8862f]" />} action={editing !== 'mission' ? edit('mission') : null}>
          {editing === 'mission' ? (
            <div>
              <textarea value={mission} onChange={(e) => setMission(e.target.value)} maxLength={600} rows={3} className="w-full rounded-xl border border-gray-200 p-3 text-base" />
              <div className="mt-3 flex gap-2 justify-end">
                <button type="button" onClick={() => { setMission(d.mission); setEditing(''); }} className="min-h-[40px] px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-700">Cancel</button>
                <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSave({ action: 'update', mission }); setEditing(''); } finally { setBusy(false); } }} className="min-h-[40px] px-4 rounded-xl bg-[#0f3d2c] text-sm font-bold text-white disabled:opacity-50">Save</button>
              </div>
            </div>
          ) : d.mission ? <p className="text-gray-700 leading-relaxed">{d.mission}</p> : empty('No mission written yet.')}
        </Card>

        <Card title="Responsibilities" icon={<ClipboardCheck size={18} className="text-[#b8862f]" />} action={editing !== 'responsibilities' ? edit('responsibilities') : null}>
          {editing === 'responsibilities' ? (
            <ListEditor initial={d.responsibilities} placeholder="What this department is responsible for" onCancel={() => setEditing('')} onSave={async (v) => { await onSave({ action: 'update', responsibilities: v }); setEditing(''); }} />
          ) : d.responsibilities.length ? (
            <ol className="space-y-2.5">
              {d.responsibilities.map((r, i) => (
                <li key={i} className="flex gap-3 text-gray-700">
                  <span className="h-6 w-6 shrink-0 rounded-full text-xs font-black flex items-center justify-center text-white" style={{ background: d.color }}>{i + 1}</span>
                  <span className="pt-0.5">{r}</span>
                </li>
              ))}
            </ol>
          ) : empty('No responsibilities listed yet.')}
        </Card>

        <Card title="Accountability" icon={<ShieldCheck size={18} className="text-[#b8862f]" />} action={editing !== 'accountability' ? edit('accountability') : null}>
          {editing === 'accountability' ? (
            <ListEditor initial={d.accountability} placeholder="What this department must report or keep" onCancel={() => setEditing('')} onSave={async (v) => { await onSave({ action: 'update', accountability: v }); setEditing(''); }} />
          ) : d.accountability.length ? (
            <ul className="space-y-2.5">
              {d.accountability.map((r, i) => (
                <li key={i} className="flex gap-3 text-gray-700">
                  <Check size={18} className="shrink-0 mt-0.5 text-emerald-600" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : empty('No accountability requirements yet.')}
          <p className="mt-4 rounded-xl bg-[#f7f6f2] px-3 py-2 text-xs text-gray-500">Reports to: the Pastors and the Apostle.</p>
        </Card>
      </div>

      <div className="space-y-5 min-w-0">
        <Card title="Core values" icon={<Crown size={18} className="text-[#b8862f]" />} action={editing !== 'coreValues' ? edit('coreValues') : null}>
          {editing === 'coreValues' ? (
            <ListEditor initial={d.coreValues} placeholder="e.g. Faithfulness" onCancel={() => setEditing('')} onSave={async (v) => { await onSave({ action: 'update', coreValues: v }); setEditing(''); }} />
          ) : d.coreValues.length ? (
            <div className="flex flex-wrap gap-2">
              {d.coreValues.map((v, i) => (
                <span key={i} className="rounded-full px-3 py-1.5 text-sm font-bold" style={{ background: `${d.color}14`, color: d.color }}>{v}</span>
              ))}
            </div>
          ) : empty('No core values yet.')}
        </Card>

        <Card title="Leadership" icon={<Users size={18} className="text-[#b8862f]" />}>
          {data.leadership.length ? (
            <ul className="divide-y divide-gray-50">
              {data.leadership.map((l) => (
                <li key={l.userId} className="flex items-center gap-3 py-2.5">
                  <Avatar name={l.name} color={d.color} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-sm text-[#0d1a14] truncate">{l.name}</span>
                    {l.title ? <span className="block text-xs text-gray-400 truncate">{l.title}</span> : null}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${ROLE_STYLE[l.deptRole]}`}>{DEPT_ROLE_LABELS[l.deptRole]}</span>
                </li>
              ))}
            </ul>
          ) : empty(data.me.isStructureAdmin ? 'No leaders yet. Add a Head in the Members tab.' : 'No leaders assigned yet.')}
        </Card>

        {!data.can['finance.view'] && data.amIMember ? (
          <p className="flex items-start gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-xs text-gray-500">
            <Lock size={14} className="shrink-0 mt-0.5" aria-hidden /> Money matters (requisitions and budgets) are visible to the Head, Treasurer, Finance and Pastors only.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  return <span className="h-9 w-9 shrink-0 rounded-full text-xs font-black flex items-center justify-center text-white" style={{ background: color }}>{initials || '?'}</span>;
}

function Members({ data, onSave }: { data: DepartmentDetail; onSave: (b: Record<string, unknown>, done?: string) => Promise<void> }) {
  const { can, me, department: d } = data;
  const members = data.members || [];
  const assignable: readonly DeptRole[] = me.isStructureAdmin ? DEPT_ROLES : LEADER_ASSIGNABLE;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [newRole, setNewRole] = useState<DeptRole>('MEMBER');
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [filter, setFilter] = useState('');
  const inDept = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchPeople(query)); } finally { setSearching(false); }
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const act = async (userId: string, body: Record<string, unknown>, done: string) => {
    setBusyId(userId);
    setErr('');
    try { await onSave({ userId, ...body }, done); } catch (e) { setErr((e as Error).message); } finally { setBusyId(''); }
  };

  const shown = members.filter((m) => !filter || m.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card title={`People · ${members.length}`} icon={<Users size={18} className="text-[#b8862f]" />}>
        {members.length > 8 ? (
          <label className="relative block mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a person" className="w-full min-h-[44px] rounded-xl border border-gray-200 pl-9 pr-3 text-sm" />
          </label>
        ) : null}
        {err ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}
        {shown.length ? (
          <ul className="divide-y divide-gray-50">
            {shown.map((m) => {
              const editable = can['members.manage'] && (me.isStructureAdmin || (LEADER_ASSIGNABLE.includes(m.deptRole)));
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={m.name} color={d.color} />
                  <span className="flex-1 min-w-[8rem]">
                    <span className="block font-bold text-sm text-[#0d1a14] truncate">{m.name}</span>
                    <span className="block text-xs text-gray-400">Joined {new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                  </span>
                  {editable ? (
                    <>
                      <select
                        value={m.deptRole}
                        disabled={busyId === m.userId}
                        onChange={(e) => void act(m.userId, { action: 'set_member', deptRole: e.target.value, title: m.title }, 'Role updated')}
                        className="min-h-[40px] rounded-xl border border-gray-200 bg-white px-2 text-sm font-bold text-gray-700"
                        aria-label={`Role for ${m.name}`}
                      >
                        {assignable.map((r) => <option key={r} value={r}>{DEPT_ROLE_LABELS[r]}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === m.userId}
                        onClick={() => { if (window.confirm(`Remove ${m.name} from ${d.name}?`)) void act(m.userId, { action: 'remove_member' }, 'Removed'); }}
                        className="min-h-[40px] min-w-[40px] rounded-xl bg-red-50 text-red-600 flex items-center justify-center disabled:opacity-50"
                        aria-label={`Remove ${m.name}`}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </>
                  ) : (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ROLE_STYLE[m.deptRole]}`}>{DEPT_ROLE_LABELS[m.deptRole]}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-gray-400">{members.length ? 'No one matches.' : 'No one in this department yet.'}</p>}
      </Card>

      {can['members.manage'] ? (
        <Card title="Add people" icon={<UserPlus size={18} className="text-[#b8862f]" />}>
          <label className="block text-xs font-bold text-gray-500">Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as DeptRole)} className="mt-1 w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700">
              {assignable.map((r) => <option key={r} value={r}>{DEPT_ROLE_LABELS[r]}</option>)}
            </select>
          </label>
          <label className="relative block mt-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" className="w-full min-h-[44px] rounded-xl border border-gray-200 pl-9 pr-9 text-sm" />
            {searching ? <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" aria-hidden /> : null}
          </label>
          <ul className="mt-2 divide-y divide-gray-50">
            {results.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 min-w-0 font-bold text-sm text-[#0d1a14] truncate">{p.name}</span>
                {inDept.has(p.id) ? (
                  <span className="text-xs font-bold text-gray-400">Already in</span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void act(p.id, { action: 'set_member', deptRole: newRole }, `${p.name} added`).then(() => setQuery(''))}
                    className="min-h-[40px] px-3 rounded-xl bg-[#0f3d2c] text-xs font-bold text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!me.isStructureAdmin ? <p className="mt-3 text-xs text-gray-400">Heads, Assistant Heads and Treasurers are appointed by an admin.</p> : null}
          {me.isStructureAdmin ? <p className="mt-3 text-xs text-gray-400">Naming a new Head moves the current Head to Assistant Head.</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

function Audit({ data }: { data: DepartmentDetail }) {
  const names = new Map((data.members || data.leadership).map((m) => [m.userId, m.name]));
  const nameOf = (uid: string) => names.get(uid) || 'a former member';
  const rows = data.audit || [];
  return (
    <Card title="Audit trail" icon={<History size={18} className="text-[#b8862f]" />}>
      {rows.length ? (
        <ol className="relative border-l-2 border-gray-100 ml-2 space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="pl-4 relative">
              <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-[#b8862f]" aria-hidden />
              <p className="text-sm text-gray-700"><b className="text-[#0d1a14]">{r.actor}</b> {describeAudit(r, nameOf)}</p>
              <p className="text-xs text-gray-400">{new Date(r.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-gray-400">No changes recorded yet.</p>}
      <p className="mt-4 text-xs text-gray-400">Every change to this department is recorded here and cannot be edited.</p>
    </Card>
  );
}

function SettingsTab({ data, onSave }: { data: DepartmentDetail; onSave: (b: Record<string, unknown>, done?: string) => Promise<void> }) {
  const d = data.department;
  const [name, setName] = useState(d.name);
  const [color, setColor] = useState(d.color);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setErr('');
    try { await onSave({ action: 'update', ...body }, done); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-xl space-y-5">
      <Card title="Name & colour" icon={<Settings2 size={18} className="text-[#b8862f]" />}>
        <label className="block text-sm font-bold text-gray-700">Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1 w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-base font-normal" />
        </label>
        <p className="mt-4 text-sm font-bold text-gray-700">Colour</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={`h-10 w-10 rounded-full flex items-center justify-center ring-offset-2 ${color === c ? 'ring-2 ring-[#0d1a14]' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`}>
              {color === c ? <Check size={16} className="text-white" aria-hidden /> : null}
            </button>
          ))}
        </div>
        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        <button type="button" disabled={busy || (name === d.name && color === d.color)} onClick={() => void run({ ...(name !== d.name ? { name } : {}), ...(color !== d.color ? { color } : {}) }, 'Saved')} className="mt-4 min-h-[44px] px-5 rounded-xl bg-[#0f3d2c] text-sm font-bold text-white disabled:opacity-40">Save</button>
      </Card>
      <Card title={d.isActive ? 'Archive department' : 'Restore department'} icon={<Lock size={18} className="text-[#b8862f]" />}>
        <p className="text-sm text-gray-500">{d.isActive ? 'Archiving hides the department from members. Its people and history are kept and it can be restored.' : 'Restoring makes the department visible to members again.'}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => { if (!d.isActive || window.confirm(`Archive ${d.name}?`)) void run({ isActive: !d.isActive }, d.isActive ? 'Archived' : 'Restored'); }}
          className={`mt-4 min-h-[44px] px-5 rounded-xl text-sm font-bold disabled:opacity-40 ${d.isActive ? 'bg-red-50 text-red-700' : 'bg-[#0f3d2c] text-white'}`}
        >
          {d.isActive ? 'Archive' : 'Restore'}
        </button>
      </Card>
    </div>
  );
}

function ComingSoon({ title, text, phase, financial }: { title: string; text: string; phase: number; financial?: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center max-w-xl mx-auto">
      <span className="mx-auto h-14 w-14 rounded-2xl bg-[#b8862f]/10 text-[#b8862f] flex items-center justify-center">{financial ? <Wallet size={26} /> : <CalendarDays size={26} />}</span>
      <h2 className="mt-4 text-xl font-black text-[#0d1a14]">{title}</h2>
      <p className="mt-2 text-sm text-gray-500">{text}</p>
      <p className="mt-4 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">Coming in Phase {phase}</p>
    </div>
  );
}
