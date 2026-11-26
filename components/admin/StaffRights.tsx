import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Crown, Loader2, Mic, Radio, UserPlus } from 'lucide-react';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

/**
 * PLCC ONE rights inside Staff & Roles (Nov 26 2026).
 * The role dropdown gives Full rights (Super Admin) and Admin. These chips give the rest:
 * Mod · Recording · Admit new members · Bible Reader. Same data as Settings → Ka Link team.
 */
const TEAM_URL = '/api/vault?resource=community&subResource=chat&subResource=ka-link-team';

export type RightKey = 'ka_link_moderator' | 'ka_link_recording' | 'admissions';
type Rights = { kaLinkModerator: boolean; kaLinkRecording: boolean; admissions: boolean };
type TeamRole = 'admin' | 'leader' | 'reader';

type ChipKey = RightKey | 'admin' | 'reader';

export const RIGHT_CHIPS: { key: ChipKey; field?: keyof Rights; label: string; blurb: string; Icon: React.ElementType }[] = [
  { key: 'ka_link_moderator', field: 'kaLinkModerator', label: 'Mod', blurb: 'Mute/unmute, hands, mic lock, remove in every Ka Link', Icon: Mic },
  { key: 'ka_link_recording', field: 'kaLinkRecording', label: 'Recording', blurb: 'Shows the Record button', Icon: Radio },
  { key: 'admissions', field: 'admissions', label: 'Admit new members', blurb: 'Lets new sign-ups in as Members. Nothing else', Icon: UserPlus },
  { key: 'admin', label: 'Ka Link Admin', blurb: 'The moderators who start the prayer-room Ka Links (give Mod too)', Icon: Crown },
  { key: 'reader', label: 'Bible Reader', blurb: 'Unmute and mute to read, even when mics are locked; Bible in Ka Link', Icon: BookOpen },
];

export function useStaffRights(enabled: boolean) {
  const [rights, setRights] = useState<Record<string, Rights>>({});
  const [team, setTeam] = useState<Record<string, TeamRole>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(TEAM_URL, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body) });
    const data = await parseApiJson<any>(res);
    if (!res.ok || data?.ok !== true) throw new Error(data?.error || 'Something went wrong. Please try again.');
    return data;
  }, []);

  const applyRights = (members: any[]) => {
    const next: Record<string, Rights> = {};
    for (const m of members || []) if (m?.userId) next[m.userId] = m.rights;
    setRights(next);
  };
  const applyTeam = (members: any[]) => {
    const next: Record<string, TeamRole> = {};
    for (const m of members || []) if (m?.userId) next[m.userId] = m.teamRole;
    setTeam(next);
  };

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all([post({ action: 'rights-list' }), post({ action: 'list' })])
      .then(([r, t]) => {
        if (!alive) return;
        applyRights(r.members);
        applyTeam(t.members);
      })
      .catch((e) => alive && setError(e?.message || 'Could not load PLCC ONE rights.'))
      .finally(() => alive && setReady(true));
    return () => { alive = false; };
  }, [enabled, post]);

  const toggle = useCallback(async (userId: string, key: ChipKey) => {
    const k = `${userId}:${key}`;
    setBusyKey(k);
    setError(null);
    try {
      if (key === 'reader' || key === 'admin') {
        // One Ka Link team seat per person: Ka Link Admin and Bible Reader replace each other.
        const on = team[userId] === key;
        const data = on ? await post({ action: 'remove', userId }) : await post({ action: 'add', userId, teamRole: key });
        applyTeam(data.members);
      } else {
        const field = RIGHT_CHIPS.find((c) => c.key === key)!.field!;
        const value = !(rights[userId]?.[field] === true);
        const data = await post({ action: 'rights-set', userId, right: key, value });
        applyRights(data.members);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not save that right.');
    } finally {
      setBusyKey(null);
    }
  }, [post, rights, team]);

  return { rights, team, busyKey, error, ready, toggle };
}

export const StaffRightsChips: React.FC<{
  userId: string;
  name: string;
  state: ReturnType<typeof useStaffRights>;
}> = ({ userId, name, state }) => {
  const teamRole = state.team[userId];
  return (
    <div className="mt-3 grid gap-1 sm:grid-cols-2 rounded-xl bg-[#FAFAF8] ring-1 ring-black/[0.05] p-2" data-testid="staff-rights">
      {RIGHT_CHIPS.map(({ key, field, label, blurb, Icon }) => {
        // A Leader seat (Ps Grace, Apostle) is changed on the Ka Link team page, not here.
        const isTeam = key === 'reader' || key === 'admin';
        if (isTeam && teamRole === 'leader') return null;
        const on = isTeam ? teamRole === key : state.rights[userId]?.[field as keyof Rights] === true;
        const busy = state.busyKey === `${userId}:${key}`;
        return (
          <button
            key={key}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={!state.ready || state.busyKey !== null}
            onClick={() => void state.toggle(userId, key)}
            aria-label={`${label} for ${name}`}
            className="min-h-[52px] w-full text-left px-3 py-2 rounded-lg hover:bg-white flex items-center gap-3 disabled:opacity-60 transition-colors"
          >
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? 'bg-[#0d1a14] text-amber-100' : 'bg-white ring-1 ring-black/10 text-gray-400'}`}>
              <Icon size={15} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#0d1a14]">{label}</span>
              <span className="block text-[11px] leading-snug text-gray-500">{blurb}</span>
            </span>
            <span aria-hidden className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-emerald-600' : 'bg-gray-300'}`}>
              {busy ? (
                <Loader2 size={14} className="absolute inset-0 m-auto animate-spin text-white" />
              ) : (
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/** What every right means, shown once at the top of Staff & Roles. */
export const StaffRightsGuide: React.FC = () => (
  <details className="bg-white border border-black/[0.06] rounded-2xl p-4 sm:p-5 shadow-sm" data-testid="staff-rights-guide">
    <summary className="cursor-pointer font-semibold text-[#0d1a14]">PLCC ONE rights: what each one means</summary>
    <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
      <li><b>Full rights</b>: choose <b>Super Admin</b> in the role list. Everything, including Staff &amp; Roles.</li>
      <li><b>Canaan Admin</b> (back end): choose <b>Admin</b> in the role list. Church admin tools; can delete chat messages. No Staff &amp; Roles. Not the same as Ka Link Admin.</li>
      {RIGHT_CHIPS.map((c) => (
        <li key={c.key}><b>{c.label}</b>: {c.blurb}. Tap the chip under a person to turn it on or off.</li>
      ))}
      <li><b>PA</b>: set in “Pastor’s assistants” on this page (manages a pastor’s diary).</li>
    </ul>
  </details>
);

/** True when this person has any PLCC ONE right or Ka Link team seat. */
export function hasAnyStaffRight(state: ReturnType<typeof useStaffRights>, userId: string): boolean {
  const r = state.rights[userId];
  return Boolean(state.team[userId] || r?.kaLinkModerator || r?.kaLinkRecording || r?.admissions);
}

/** Read-only badges for the rights someone already has (Nov 26 2026 cleanup). */
export const StaffRightBadges: React.FC<{ userId: string; state: ReturnType<typeof useStaffRights> }> = ({ userId, state }) => {
  const r = state.rights[userId];
  const teamRole = state.team[userId];
  const on = RIGHT_CHIPS.filter((c) =>
    c.key === 'admin' || c.key === 'reader' ? teamRole === c.key : r?.[c.field as keyof Rights] === true,
  );
  if (!on.length && teamRole !== 'leader') return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {teamRole === 'leader' ? (
        <span className="h-6 px-2 rounded-md bg-amber-50 text-amber-800 ring-1 ring-amber-200 text-[11px] font-semibold inline-flex items-center gap-1">
          <Crown size={11} aria-hidden /> Ka Link Leader
        </span>
      ) : null}
      {on.map(({ key, label, Icon }) => (
        <span key={key} className="h-6 px-2 rounded-md bg-[#0d1a14]/[0.05] text-[#0d1a14] ring-1 ring-[#0d1a14]/10 text-[11px] font-semibold inline-flex items-center gap-1">
          <Icon size={11} aria-hidden /> {label}
        </span>
      ))}
    </div>
  );
};
