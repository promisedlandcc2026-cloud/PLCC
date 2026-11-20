import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Loader2, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../../App';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

/**
 * Sign-in Problems (Phase 4 — Nov 2026, #17): who is failing to sign in to
 * Ka Link and the other PLCC apps, the reason, and what to do about it.
 */

type ReasonRow = {
  reason: string;
  label: string;
  fix: string;
  count: number;
  simple?: string;
  emoji?: string;
  fixer?: 'member' | 'leader' | 'developer' | 'wait';
  steps?: string[];
};

/** Who fixes it — a coloured tag so it's clear at a glance. */
const FIXER: Record<string, { text: string; className: string }> = {
  member: { text: 'They can fix this', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  leader: { text: 'A leader fixes this', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  wait: { text: 'Just wait and try again', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  developer: { text: 'Tell the developer', className: 'bg-red-50 text-red-800 border-red-200' },
};

/** "+10 772…" / "+1 0772…": a Ugandan number saved with the USA (+1) code. */
function wrongCountryHint(identifier: string | null | undefined): string | null {
  const id = String(identifier || '').replace(/\s/g, '');
  return /^\+10\d/.test(id) ? 'This number was typed with the USA flag (+1) instead of Uganda (+256). Ask them to tap the flag and pick Uganda 🇺🇬.' : null;
}
type Group = {
  key: string;
  name: string | null;
  identifier: string | null;
  app: string;
  method: string;
  reasons: ReasonRow[];
  attempts: number;
  lastAt: string;
  lastDetail: string | null;
  lastDevice: string | null;
};

const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'ADMIN']);
const APP_LABELS: Record<string, string> = { 'ka-link': 'Ka Link', canaan: 'Canaan', tribes: 'Tribes' };
const METHOD_LABELS: Record<string, string> = { phone: 'Mobile number', email: 'Email', session: 'Signed in', code: 'Text code' };

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function device(ua: string | null): string | null {
  if (!ua) return null;
  if (/iPhone|iPad/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS/i.test(ua)) return 'Mac';
  return 'Other';
}

const SignInProblemsPage: React.FC = () => {
  const { userRole } = useNav();
  const navigate = useNavigate();
  const mayView = MANAGER_ROLES.has(String(userRole || '').toUpperCase());
  const [days, setDays] = useState(7);
  const [groups, setGroups] = useState<Group[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vault?resource=sign-in-failures&days=${days}`, { headers: await getAuthHeaders() });
      const data = await parseApiJson<any>(res);
      if (!res.ok || data?.ok !== true) {
        setSetupNeeded(Boolean(data?.setupNeeded));
        throw new Error(data?.error || 'Could not load sign-in problems.');
      }
      setSetupNeeded(false);
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setTotal(Number(data.total) || 0);
    } catch (e: any) {
      setError(e?.message || 'Could not load sign-in problems.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (mayView) void load();
    else setLoading(false);
  }, [load, mayView]);

  if (!mayView) {
    return (
      <div className="max-w-xl mx-auto pt-16 px-4 text-center">
        <ShieldAlert className="mx-auto text-burgundy mb-4" size={36} />
        <h1 className="text-2xl font-black text-[#0d1a14]">Sign-in Problems</h1>
        <p className="text-gray-500 mt-2 font-medium">Only the Pastor, Admins and Super Admins can see this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-6 space-y-5">
      <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-sm font-bold text-gray-500">
        <ArrowLeft size={16} aria-hidden /> Back
      </button>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-[#0d1a14]">
            <KeyRound className="text-burgundy" aria-hidden /> Sign-in Problems
          </h1>
          <p className="text-gray-500 mt-1">Who had trouble getting in, what happened, and how to fix it.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-[44px] min-w-[44px] rounded-2xl bg-white border border-black/10 flex items-center justify-center"
          aria-label="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden />
        </button>
      </header>

      <div className="flex gap-2" role="radiogroup" aria-label="Time range">
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={days === d}
            onClick={() => setDays(d)}
            className={`min-h-[40px] px-4 rounded-2xl text-sm font-bold border ${
              days === d ? 'bg-burgundy text-white border-burgundy' : 'bg-white text-gray-700 border-black/10'
            }`}
          >
            {d === 1 ? 'Today' : `${d} days`}
          </button>
        ))}
      </div>

      {setupNeeded ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          The sign-in log isn’t set up yet. Run <code>supabase/migrations/sign_in_failures.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      ) : null}
      {error && !setupNeeded ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : !error ? (
        groups.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No sign-in problems in this period. 🙏</p>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              {groups.length} {groups.length === 1 ? 'person' : 'people'} · {total} failed attempt{total === 1 ? '' : 's'}
            </p>
            <ul className="space-y-3">
              {groups.map((g) => (
                <li key={g.key} className="bg-white rounded-3xl border border-black/5 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-[#0d1a14] truncate">{g.name || g.identifier || 'Unknown person'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[g.name ? g.identifier : null, METHOD_LABELS[g.method] || g.method, APP_LABELS[g.app] || g.app, device(g.lastDevice)]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-gray-400 shrink-0">{ago(g.lastAt)}</span>
                  </div>
                  {wrongCountryHint(g.identifier) ? (
                    <p className="mt-3 rounded-2xl bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900">
                      🌍 {wrongCountryHint(g.identifier)}
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-3">
                    {g.reasons.map((r) => {
                      const who = FIXER[r.fixer || ''] || null;
                      return (
                        <li key={r.reason} className="rounded-2xl bg-gray-50 px-4 py-3" data-testid="sign-in-problem">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-2xl leading-none" aria-hidden>{r.emoji || '⚠️'}</span>
                            <p className="text-base font-black text-[#0d1a14]">{r.label}</p>
                            {r.count > 1 ? <span className="text-xs font-bold text-gray-500">{r.count} times</span> : null}
                            {who ? (
                              <span className={`ml-auto rounded-full border px-2.5 py-1 text-xs font-bold ${who.className}`}>{who.text}</span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm text-gray-800">
                            <span className="font-bold">What happened: </span>
                            {r.simple || r.label}
                          </p>
                          <div className="mt-2">
                            <p className="text-sm font-bold text-gray-800">How to fix it:</p>
                            {r.steps?.length ? (
                              <ol className="mt-1 space-y-1 text-sm text-gray-700 list-decimal pl-5">
                                {r.steps.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ol>
                            ) : (
                              <p className="mt-1 text-sm text-gray-700">{r.fix}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {g.lastDetail ? (
                    <details className="mt-2 text-xs text-gray-500">
                      <summary className="cursor-pointer min-h-[32px] flex items-center gap-1 font-semibold">
                        <Smartphone size={12} aria-hidden /> For the developer
                      </summary>
                      <p className="mt-1 break-words rounded-xl bg-gray-50 px-3 py-2 font-mono text-[12px] text-gray-600">{g.lastDetail}</p>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </div>
  );
};

export default SignInProblemsPage;
