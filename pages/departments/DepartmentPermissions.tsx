import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, Lock, ShieldCheck, SlidersHorizontal, Wallet } from 'lucide-react';
import {
  DEPT_PERMISSIONS,
  DEPT_PERMISSION_LABELS,
  DEPT_ROLES,
  DEPT_ROLE_LABELS,
  departmentsApi,
  type DeptPermission,
  type DeptRole,
} from '../../lib/departments';

/** Church-wide department permissions (admins). The Head always has everything in their department. */
export default function DepartmentPermissions() {
  const navigate = useNavigate();
  const [matrix, setMatrix] = useState<Record<DeptRole, Set<DeptPermission>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const { matrix: m } = await departmentsApi.matrix();
      const out = {} as Record<DeptRole, Set<DeptPermission>>;
      for (const r of DEPT_ROLES) out[r] = new Set(m[r] || []);
      setMatrix(out);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (role: DeptRole, p: DeptPermission) => {
    if (!matrix || role === 'HEAD') return;
    const key = `${role}:${p}`;
    const allowed = !matrix[role].has(p);
    setBusy(key);
    try {
      await departmentsApi.post({ action: 'set_permission', deptRole: role, permission: p, allowed });
      setMatrix((prev) => {
        if (!prev) return prev;
        const next = { ...prev, [role]: new Set(prev[role]) };
        if (allowed) next[role].add(p); else next[role].delete(p);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const roles = DEPT_ROLES;

  return (
    <div className="max-w-6xl mx-auto px-4 pb-24 pt-6">
      <button type="button" onClick={() => navigate('/departments')} className="flex items-center gap-2 text-sm font-bold text-gray-500 min-h-[36px]">
        <ArrowLeft size={16} aria-hidden /> All departments
      </button>
      <header className="mt-3">
        <h1 className="flex items-center gap-2 text-3xl font-black text-[#0d1a14]"><SlidersHorizontal className="text-[#b8862f]" aria-hidden /> Department permissions</h1>
        <p className="text-gray-500 mt-1 max-w-2xl">What each role can do inside its own department. Applies to every department. Changes take effect immediately and are recorded.</p>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Note icon={<ShieldCheck size={16} />} title="Pastors & the Apostle" text="See every department, including money. Approve activities and requisitions." />
        <Note icon={<SlidersHorizontal size={16} />} title="Admins" text="Create departments, appoint Heads, Assistant Heads and Treasurers, and set these permissions." />
        <Note icon={<Wallet size={16} />} title="Finance" text="Sees money for every department to check requisitions against the budget." />
      </div>

      {error ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {!matrix && !error ? (
        <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>
      ) : matrix ? (
        <>
          {/* Desktop: table */}
          <div className="mt-6 hidden md:block overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f7f6f2] text-left">
                  <th className="px-5 py-3 font-black text-[#0d1a14]">Permission</th>
                  {roles.map((r) => <th key={r} className="px-3 py-3 text-center font-black text-[#0d1a14]">{DEPT_ROLE_LABELS[r]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {DEPT_PERMISSIONS.map((p) => (
                  <tr key={p}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1.5 font-bold text-[#0d1a14]">{DEPT_PERMISSION_LABELS[p].label}{DEPT_PERMISSION_LABELS[p].financial ? <Wallet size={13} className="text-[#b8862f]" aria-label="Financial" /> : null}</span>
                      <span className="block text-xs text-gray-400">{DEPT_PERMISSION_LABELS[p].hint}</span>
                    </td>
                    {roles.map((r) => (
                      <td key={r} className="px-3 py-3 text-center">
                        <Toggle on={matrix[r].has(p)} locked={r === 'HEAD'} busy={busy === `${r}:${p}`} onClick={() => void toggle(r, p)} label={`${DEPT_ROLE_LABELS[r]}: ${DEPT_PERMISSION_LABELS[p].label}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: one card per role */}
          <div className="mt-6 space-y-4 md:hidden">
            {roles.map((r) => (
              <section key={r} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
                <h2 className="flex items-center justify-between font-black text-[#0d1a14]">
                  {DEPT_ROLE_LABELS[r]}
                  {r === 'HEAD' ? <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-400"><Lock size={12} /> Always full</span> : null}
                </h2>
                <ul className="mt-2 divide-y divide-gray-50">
                  {DEPT_PERMISSIONS.map((p) => (
                    <li key={p} className="flex items-center gap-3 py-2.5">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-gray-700">{DEPT_PERMISSION_LABELS[p].label}</span>
                        <span className="block text-xs text-gray-400">{DEPT_PERMISSION_LABELS[p].hint}</span>
                      </span>
                      <Toggle on={matrix[r].has(p)} locked={r === 'HEAD'} busy={busy === `${r}:${p}`} onClick={() => void toggle(r, p)} label={`${DEPT_ROLE_LABELS[r]}: ${DEPT_PERMISSION_LABELS[p].label}`} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Note({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-black text-[#0f3d2c]">{icon} {title}</p>
      <p className="mt-1 text-xs text-gray-500">{text}</p>
    </div>
  );
}

function Toggle({ on, locked, busy, onClick, label }: { on: boolean; locked: boolean; busy: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={locked || busy}
      onClick={onClick}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-[#0f3d2c]' : 'bg-gray-200'} ${locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`}>
        {busy ? <Loader2 size={12} className="animate-spin text-gray-400" /> : on ? <Check size={12} className="text-[#0f3d2c]" /> : null}
      </span>
    </button>
  );
}
