import React, { useEffect, useState } from 'react';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';

type Candidate = { id: string; name: string; email: string | null; eligibility: string; onRoster: boolean };

const ELIG_LABEL: Record<string, string> = {
  eligible: 'Eligible',
  ineligible: 'Not eligible',
  suspended: 'Suspended',
  not_verified: 'Not verified yet',
};

/** Staff: search a person with a Vault account and put them on this opportunity's roster. */
export const AddServeVolunteer: React.FC<{ opportunityId: string; onAdded: () => void }> = ({ opportunityId, onAdded }) => {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setPeople([]);
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/vault?resource=events&subResource=serve-signups&opportunityId=${encodeURIComponent(opportunityId)}&candidates=${encodeURIComponent(term)}`,
          { headers }
        );
        const data = await res.json().catch(() => ({}));
        if (alive) setPeople(res.ok && data.ok ? data.people || [] : []);
      } catch {
        if (alive) setPeople([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, opportunityId]);

  const add = async (p: Candidate) => {
    setBusy(p.id);
    setNote(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=serve-signups', {
        method: 'POST',
        headers,
        body: JSON.stringify({ opportunityId, userId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setNote({ tone: 'err', text: data.error || 'Could not add them.' });
        return;
      }
      setNote({ tone: 'ok', text: `${p.name} was added and confirmed.` });
      setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, onRoster: true } : x)));
      onAdded();
    } catch {
      setNote({ tone: 'err', text: 'Could not add them. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
      <label className="block text-xs font-black uppercase tracking-wider text-gray-500" htmlFor={`add-vol-${opportunityId}`}>
        Add volunteer
      </label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          id={`add-vol-${opportunityId}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email"
          className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/20"
        />
        {searching ? (
          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" aria-hidden />
        ) : null}
      </div>
      {people.length ? (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
          {people.map((p) => {
            const eligible = p.eligibility === 'eligible';
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{p.name}</div>
                  <div className="text-xs truncate">
                    <span className={eligible ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                      {ELIG_LABEL[p.eligibility] || p.eligibility}
                    </span>
                    {p.email ? <span className="text-gray-500"> · {p.email}</span> : null}
                  </div>
                </div>
                {p.onRoster ? (
                  <span className="text-xs font-bold text-gray-500">On roster</span>
                ) : (
                  <button
                    type="button"
                    disabled={!eligible || Boolean(busy)}
                    onClick={() => void add(p)}
                    title={eligible ? 'Add to roster' : 'Mark them Eligible in People → Members first'}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0d1a14] text-white text-xs font-bold disabled:opacity-40"
                  >
                    {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : q.trim().length >= 2 && !searching ? (
        <p className="text-xs text-gray-500">No one found. They need a Vault account to be added.</p>
      ) : null}
      {people.some((p) => p.eligibility !== 'eligible' && !p.onRoster) ? (
        <p className="text-xs text-gray-500">
          People who aren’t verified can’t be added. Open them in <span className="font-semibold">People → Members</span> and set
          Serve eligibility first.
        </p>
      ) : null}
      {note ? (
        <p className={`text-sm font-semibold ${note.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`} role="status">
          {note.text}
        </p>
      ) : null}
    </div>
  );
};
