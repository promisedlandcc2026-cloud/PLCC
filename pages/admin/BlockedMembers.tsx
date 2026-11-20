import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, ShieldBan, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

/**
 * Blocked members (Nov 19 2026). Moderators warn an unruly member first; if it
 * continues they block them (Ka Link and Tribes: calls, chat, posts). A block
 * stays until a pastor / admin / Ka Link team leader lifts it here.
 */

type Blocked = { userId: string; name: string; blockedAt: string | null; reason: string | null; blockedBy: string | null };
type Recent = { at: string; action: 'warn' | 'block' | 'unblock'; name: string; by: string | null; reason: string | null; place: string | null };

const URL_BASE = '/api/vault?resource=community&subResource=chat&subResource=member-conduct';
const PLACE: Record<string, string> = { call: 'in a call', chat: 'in chat', post: 'on a Tribes post', canaan: 'in Canaan' };
const ACTION: Record<Recent['action'], string> = { warn: 'Warned', block: 'Blocked', unblock: 'Unblocked' };

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const BlockedMembersPage: React.FC = () => {
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${URL_BASE}&list=1`, { headers: await getAuthHeaders() });
      const data = await parseApiJson<any>(res);
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || 'Could not load blocked members.');
      setBlocked(Array.isArray(data.blocked) ? data.blocked : []);
      setRecent(Array.isArray(data.recent) ? data.recent : []);
    } catch (e: any) {
      setError(e?.message || 'Could not load blocked members. If this is new, the setup SQL may not have been run yet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (m: Blocked) => {
    if (!window.confirm(`Unblock ${m.name}? They can join calls, chat and post again.`)) return;
    setBusyId(m.userId);
    setError(null);
    try {
      const res = await fetch(URL_BASE, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'unblock', targetUserId: m.userId, place: 'canaan' }),
      });
      const data = await parseApiJson<any>(res);
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || 'Could not unblock. Please try again.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not unblock. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (denied) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <ShieldBan className="mx-auto text-burgundy mb-4" size={36} />
        <h1 className="text-2xl font-black text-[#0d1a14]">Blocked members</h1>
        <p className="text-gray-500 mt-2 font-medium">Only the Pastor, Admins and the Ka Link team leaders can see this.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-6 space-y-5">
      <button type="button" onClick={() => navigate('/more')} className="flex items-center gap-2 text-sm font-bold text-gray-500">
        <ArrowLeft size={16} aria-hidden /> Back
      </button>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-[#0d1a14]">
            <ShieldBan className="text-burgundy" aria-hidden /> Blocked members
          </h1>
          <p className="text-gray-500 mt-1">
            Moderators warn first. If someone keeps going, they're blocked from Ka Link and Tribes calls, chat and posts until you unblock them here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-[44px] min-w-[44px] rounded-xl bg-white border border-black/5 flex items-center justify-center"
          aria-label="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {error ? (
        <p className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium" role="alert">
          {error}
        </p>
      ) : null}

      <section className="bg-white rounded-3xl border border-black/5 p-5 shadow-sm">
        <h2 className="text-lg font-black text-[#0d1a14]">
          Blocked now <span className="text-sm font-bold text-gray-400">({blocked.length})</span>
        </h2>
        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </p>
        ) : blocked.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Nobody is blocked.</p>
        ) : (
          <ul className="mt-4 divide-y divide-black/5">
            {blocked.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-3" data-testid="blocked-member">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#0d1a14] truncate">{m.name}</p>
                  <p className="text-sm text-gray-500">
                    {when(m.blockedAt)}
                    {m.blockedBy ? ` · by ${m.blockedBy}` : ''}
                    {m.reason ? ` · "${m.reason}"` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void unblock(m)}
                  disabled={busyId === m.userId}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {busyId === m.userId ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-black/5 p-5 shadow-sm">
        <h2 className="text-lg font-black text-[#0d1a14]">Recent warnings and blocks</h2>
        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">{loading ? 'Loading…' : 'Nothing yet.'}</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="py-2.5 text-sm">
                <span className={`font-bold ${r.action === 'block' ? 'text-red-700' : r.action === 'warn' ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {ACTION[r.action] || r.action}
                </span>{' '}
                <span className="font-bold text-[#0d1a14]">{r.name}</span>
                {r.place ? <span className="text-gray-500"> {PLACE[r.place] || ''}</span> : null}
                {r.by ? <span className="text-gray-500"> · by {r.by}</span> : null}
                {r.reason ? <span className="text-gray-600"> · "{r.reason}"</span> : null}
                <span className="block text-gray-400">{when(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default BlockedMembersPage;
