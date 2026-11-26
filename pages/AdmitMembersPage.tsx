import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authedFetch } from '../lib/authedFetch';

/**
 * PLCC ONE "Admit new members" (Nov 26 2026).
 * For Super Admins and anyone with the "Admit new members" right (Settings → Ka Link team).
 * The only thing this page can do is move a new sign-up from Pending to Member.
 */
type Person = { id: string; name: string; contact: string; signedUpAt: string | null; path: 'new' | 'current' | null };

const API = '/api/vault?resource=community&subResource=admissions';

const AdmitMembersPage: React.FC = () => {
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [admitted, setAdmitted] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(API);
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) { setDenied(true); return; }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load new sign-ups.');
      setPeople(Array.isArray(data.people) ? data.people : []);
    } catch (e: any) {
      setError(e?.message || 'Could not load new sign-ups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const admit = async (p: Person) => {
    if (busyId) return;
    setBusyId(p.id);
    setError(null);
    try {
      const res = await authedFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not admit this person.');
      setPeople((prev) => prev.filter((x) => x.id !== p.id));
      setAdmitted((prev) => [p.name, ...prev].slice(0, 5));
    } catch (e: any) {
      setError(e?.message || 'Could not admit this person.');
      if (/already admitted/i.test(String(e?.message))) setPeople((prev) => prev.filter((x) => x.id !== p.id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f3ea] text-[#16251f]">
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-bold text-[#16251f]/70"
        >
          <ArrowLeft size={16} aria-hidden /> PLCC ONE
        </button>
        <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: 'Georgia, serif' }}>Admit new members</h1>
        <p className="mt-1 text-sm text-[#16251f]/70">
          People who signed up and are waiting. Tap <b>Admit</b> to let them in as a member.
        </p>

        {admitted.length ? (
          <p role="status" className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-800">
            Admitted: {admitted.join(', ')}
          </p>
        ) : null}
        {error ? <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p> : null}

        {loading ? (
          <p className="mt-8 flex items-center gap-2 text-sm text-[#16251f]/60">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Loading new sign-ups…
          </p>
        ) : denied ? (
          <p className="mt-8 rounded-2xl bg-white border border-black/5 p-5 text-sm">
            This page is for the Admissions team. Ask a Super Admin to give you the “Admit new members” right.
          </p>
        ) : people.length === 0 ? (
          <p className="mt-8 rounded-2xl bg-white border border-black/5 p-5 text-sm">Nobody is waiting right now. 🙏</p>
        ) : (
          <ul className="mt-6 space-y-3" data-testid="admit-list">
            {people.map((p) => (
              <li key={p.id} className="rounded-2xl bg-white border border-black/5 p-4 flex items-center gap-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{p.name}</p>
                  <p className="text-xs text-[#16251f]/60 truncate">
                    {p.contact}
                    {p.signedUpAt ? ` · signed up ${new Date(p.signedUpAt).toLocaleDateString()}` : ''}
                  </p>
                  {p.path ? (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${p.path === 'new' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {p.path === 'new' ? 'New guest' : 'Current member'}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void admit(p)}
                  disabled={busyId !== null}
                  className="min-h-[44px] px-4 rounded-full bg-[#1f4a3a] text-white font-bold inline-flex items-center gap-2 disabled:opacity-60"
                  aria-label={`Admit ${p.name}`}
                >
                  {busyId === p.id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
                  Admit
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-8 flex items-center gap-2 text-xs text-[#16251f]/50">
          <UserPlus size={14} aria-hidden /> Admitting only makes someone a Member. Staff roles are set by a Super Admin.
        </p>
      </div>
    </div>
  );
};

export default AdmitMembersPage;
