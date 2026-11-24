import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Crown, HandHeart, Loader2, Plus, Radio, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../../App';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

/**
 * Ka Link Team (Phase 3 — Nov 2026)
 *  Admin  — may start the prayer-room Ka Links (Morning Glory, Lunch Hour,
 *           Midnight Watch, Upper Room, Intercessors). #10
 *  Leader — altar leaders and those serving (e.g. Pr. Grace): may join any time
 *           on a reserved seat (never the overflow room) and can tell the
 *           moderators "I'm ready". #18, #19, #20
 *  Bible reader — standing readers: may unmute in every prayer room even while
 *           mics are locked (no video, can't start rooms). #11
 */

type TeamRole = 'admin' | 'leader' | 'reader';
type TeamMember = { userId: string; name: string; teamRole: TeamRole; addedAt: string | null };
type Candidate = { id: string; name: string; role?: string | null; email?: string | null };

const TEAM_URL = '/api/vault?resource=community&subResource=chat&subResource=ka-link-team';
const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'ADMIN']);

const ROLE_INFO: Record<TeamRole, { label: string; blurb: string; Icon: React.ElementType }> = {
  admin: { label: 'Admin', blurb: 'Starts the prayer-room Ka Links', Icon: Crown },
  leader: { label: 'Leader', blurb: 'Joins any time · never overflow · video · "I’m ready" button', Icon: HandHeart },
  reader: { label: 'Bible reader', blurb: 'Can unmute to read in every prayer room, even when mics are locked', Icon: BookOpen },
};

const KaLinkTeamPage: React.FC = () => {
  const { userRole } = useNav();
  const navigate = useNavigate();
  const mayManage = MANAGER_ROLES.has(String(userRole || '').toUpperCase());

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [addRole, setAddRole] = useState<TeamRole>('leader');

  const call = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(TEAM_URL, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body) });
      const data = await parseApiJson<any>(res);
      if (!res.ok || data?.ok !== true) {
        setSetupNeeded(Boolean(data?.setupNeeded));
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }
      setSetupNeeded(false);
      setMembers(Array.isArray(data.members) ? data.members : []);
      return true;
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mayManage) void call({ action: 'list' });
    else setLoading(false);
  }, [call, mayManage]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/vault?resource=community&subResource=chat&subResource=member-picker&q=${encodeURIComponent(q)}`,
          { headers: await getAuthHeaders() }
        );
        const data = await parseApiJson<any>(res);
        setResults(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  if (!mayManage) {
    return (
      <div className="max-w-xl mx-auto pt-16 px-4 text-center">
        <ShieldAlert className="mx-auto text-burgundy mb-4" size={36} />
        <h1 className="text-2xl font-black text-[#0d1a14]">Ka Link Team</h1>
        <p className="text-gray-500 mt-2 font-medium">Only the Pastor, Admins and Super Admins can manage the Ka Link team.</p>
      </div>
    );
  }

  const onTeam = new Set(members.map((m) => m.userId));
  const admins = members.filter((m) => m.teamRole === 'admin');
  const leaders = members.filter((m) => m.teamRole === 'leader');
  const readers = members.filter((m) => m.teamRole === 'reader');

  const section = (role: TeamRole, list: TeamMember[]) => {
    const { label, blurb, Icon } = ROLE_INFO[role];
    return (
      <section className="bg-white rounded-3xl border border-black/5 p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-black text-[#0d1a14]">
          <Icon size={20} className="text-burgundy" aria-hidden /> {label}s
          <span className="text-sm font-bold text-gray-400">({list.length})</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">{blurb}</p>
        {list.length === 0 ? (
          <p className="text-sm text-gray-400 mt-4">
            {role === 'admin'
              ? 'No admins yet. Until you add one, the prayer rooms keep the old start rules.'
              : role === 'reader'
                ? 'No Bible readers yet.'
                : 'No leaders yet.'}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-black/5">
            {list.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-3">
                <span className="flex-1 min-w-0 font-bold text-[#0d1a14] truncate">{m.name}</span>
                {role !== 'reader' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void call({ action: 'add', userId: m.userId, teamRole: role === 'admin' ? 'leader' : 'admin' })}
                    className="min-h-[40px] px-3 rounded-xl bg-gray-100 text-xs font-bold text-gray-700 disabled:opacity-50"
                  >
                    Make {role === 'admin' ? 'Leader' : 'Admin'}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.name} from the Ka Link team?`)) void call({ action: 'remove', userId: m.userId });
                  }}
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-red-50 text-red-600 flex items-center justify-center disabled:opacity-50"
                  aria-label={`Remove ${m.name}`}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-6 space-y-5">
      <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-sm font-bold text-gray-500">
        <ArrowLeft size={16} aria-hidden /> Back
      </button>
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black text-[#0d1a14]">
          <Radio className="text-burgundy" aria-hidden /> Ka Link Team
        </h1>
        <p className="text-gray-500 mt-1">
          Who starts the prayer-room Ka Links, and who always gets a seat. Super Admins can always start.
        </p>
      </header>

      {setupNeeded ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          The Ka Link team table isn’t set up yet. Run <code>supabase/migrations/ka_link_team.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      ) : null}
      {error && !setupNeeded ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <section className="bg-white rounded-3xl border border-black/5 p-5 shadow-sm">
        <h2 className="text-lg font-black text-[#0d1a14]">Add someone</h2>
        <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Team role">
          {(['leader', 'reader', 'admin'] as TeamRole[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={addRole === r}
              onClick={() => setAddRole(r)}
              className={`flex-1 min-h-[44px] rounded-2xl text-sm font-bold border ${
                addRole === r ? 'bg-burgundy text-white border-burgundy' : 'bg-white text-gray-700 border-black/10'
              }`}
            >
              {ROLE_INFO[r].label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-2xl border border-black/10 px-3 min-h-[48px]">
          <Search size={18} className="text-gray-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name…"
            className="flex-1 bg-transparent outline-none text-sm"
            aria-label="Search members"
          />
          {searching ? <Loader2 size={16} className="animate-spin text-gray-400" aria-hidden /> : null}
        </label>
        {results.length > 0 ? (
          <ul className="mt-2 divide-y divide-black/5">
            {results.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-sm text-[#0d1a14] truncate">{c.name}</span>
                  {c.role ? <span className="block text-xs text-gray-400">{String(c.role).replace(/_/g, ' ').toLowerCase()}</span> : null}
                </span>
                {onTeam.has(c.id) ? (
                  <span className="text-xs font-bold text-gray-400">On the team</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (await call({ action: 'add', userId: c.id, teamRole: addRole })) {
                        setQuery('');
                        setResults([]);
                      }
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-burgundy text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    <Plus size={14} aria-hidden /> Add as {ROLE_INFO[addRole].label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading the team…
        </p>
      ) : (
        <>
          {section('admin', admins)}
          {section('leader', leaders)}
          {section('reader', readers)}
        </>
      )}

      <PlccRightsPanel />
    </div>
  );
};

/* ── PLCC ONE rights (Nov 24 2026): Mod · Recording button · Admissions ── */

type RightKey = 'ka_link_moderator' | 'ka_link_recording' | 'admissions';
type Rights = { kaLinkModerator: boolean; kaLinkRecording: boolean; admissions: boolean };
type RightsMember = { userId: string; name: string; role: string | null; rights: Rights };

const RIGHTS: { key: RightKey; field: keyof Rights; label: string; blurb: string }[] = [
  { key: 'ka_link_moderator', field: 'kaLinkModerator', label: 'Mod', blurb: 'Moderates every Ka Link: mute/unmute, hands, mic lock, remove' },
  { key: 'ka_link_recording', field: 'kaLinkRecording', label: 'Recording', blurb: 'Shows the Record button. Once anyone has it, only these people (and Super Admins) can record' },
  { key: 'admissions', field: 'admissions', label: 'Admissions', blurb: 'Admissions team' },
];

const PlccRightsPanel: React.FC = () => {
  const [members, setMembers] = useState<RightsMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [addRight, setAddRight] = useState<RightKey>('ka_link_moderator');

  const call = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(TEAM_URL, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body) });
      const data = await parseApiJson<any>(res);
      if (!res.ok || data?.ok !== true) {
        setSetupNeeded(Boolean(data?.setupNeeded));
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }
      setSetupNeeded(false);
      setMembers(Array.isArray(data.members) ? data.members : []);
      return true;
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void call({ action: 'rights-list' });
  }, [call]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/vault?resource=community&subResource=chat&subResource=member-picker&q=${encodeURIComponent(q)}`,
          { headers: await getAuthHeaders() }
        );
        const data = await parseApiJson<any>(res);
        setResults(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const setRight = (userId: string, right: RightKey, value: boolean) => call({ action: 'rights-set', userId, right, value });

  return (
    <section className="bg-white rounded-3xl border border-black/5 p-5 shadow-sm" data-testid="plcc-rights">
      <h2 className="flex items-center gap-2 text-lg font-black text-[#0d1a14]">
        <ShieldAlert size={20} className="text-burgundy" aria-hidden /> PLCC ONE rights
      </h2>
      <p className="text-sm text-gray-500 mt-1">
        Full rights = Super Admin, Back end = Admin (set in Staff &amp; Roles). Mod, Recording and Admissions are set here.
      </p>
      {setupNeeded ? (
        <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          Run <code>supabase/migrations/plcc_rights.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      ) : null}
      {error && !setupNeeded ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}

      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Right to give">
        {RIGHTS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={addRight === r.key}
            onClick={() => setAddRight(r.key)}
            className={`flex-1 min-h-[44px] rounded-2xl text-sm font-bold border ${
              addRight === r.key ? 'bg-burgundy text-white border-burgundy' : 'bg-white text-gray-700 border-black/10'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-400">{RIGHTS.find((r) => r.key === addRight)?.blurb}</p>
      <label className="mt-2 flex items-center gap-2 rounded-2xl border border-black/10 px-3 min-h-[48px]">
        <Search size={18} className="text-gray-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members by name…"
          className="flex-1 bg-transparent outline-none text-sm"
          aria-label="Search members for PLCC ONE rights"
        />
      </label>
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-black/5">
          {results.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <span className="flex-1 min-w-0 font-bold text-sm text-[#0d1a14] truncate">{c.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await setRight(c.id, addRight, true)) {
                    setQuery('');
                    setResults([]);
                  }
                }}
                className="min-h-[40px] px-3 rounded-xl bg-burgundy text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Plus size={14} aria-hidden /> Give {RIGHTS.find((r) => r.key === addRight)?.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : members.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">Nobody has these rights yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-black/5">
          {members.map((m) => (
            <li key={m.userId} className="py-3">
              <span className="block font-bold text-[#0d1a14] truncate">
                {m.name}
                {m.role ? <span className="ml-2 text-xs font-semibold text-gray-400">{m.role.replace(/_/g, ' ').toLowerCase()}</span> : null}
              </span>
              <span className="mt-2 flex flex-wrap gap-2">
                {RIGHTS.map((r) => {
                  const on = m.rights[r.field];
                  return (
                    <button
                      key={r.key}
                      type="button"
                      disabled={busy}
                      aria-pressed={on}
                      onClick={() => void setRight(m.userId, r.key, !on)}
                      className={`min-h-[36px] px-3 rounded-xl text-xs font-bold border disabled:opacity-50 ${
                        on ? 'bg-burgundy text-white border-burgundy' : 'bg-white text-gray-500 border-black/10'
                      }`}
                    >
                      {on ? '✓ ' : ''}{r.label}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default KaLinkTeamPage;
