import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Circle, CheckCircle2, Crown, Loader2, Mic, Radio, UserPlus } from 'lucide-react';
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
    <div className="mt-2 flex flex-wrap gap-1.5" data-testid="staff-rights">
      {RIGHT_CHIPS.map(({ key, field, label, blurb, Icon }) => {
        // A Leader seat (Ps Grace, Apostle) is changed on the Ka Link team page, not here.
        const isTeam = key === 'reader' || key === 'admin';
        const locked = isTeam && teamRole === 'leader';
        const on = isTeam ? teamRole === key : state.rights[userId]?.[field as keyof Rights] === true;
        const busy = state.busyKey === `${userId}:${key}`;
        return (
          <button
            key={key}
            type="button"
            disabled={!state.ready || busy || locked || state.busyKey !== null}
            onClick={() => void state.toggle(userId, key)}
            title={locked ? `Ka Link ${teamRole} (change it in Ka Link team)` : blurb}
            aria-pressed={on}
            aria-label={`${label} for ${name}: ${on ? 'on' : 'off'}`}
            className={`min-h-[32px] px-2.5 rounded-full border text-[11px] font-bold inline-flex items-center gap-1 transition-colors disabled:opacity-60 ${
              on ? 'bg-[#0d1a14] border-[#0d1a14] text-amber-100' : 'bg-white border-gray-200 text-gray-500 hover:border-[#0d1a14]'
            }`}
          >
            {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : on ? <CheckCircle2 size={12} aria-hidden /> : <Circle size={12} aria-hidden />}
            <Icon size={12} aria-hidden /> {label}
          </button>
        );
      })}
      {teamRole === 'leader' ? (
        <span className="min-h-[32px] px-2.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 inline-flex items-center">
          Ka Link Leader
        </span>
      ) : null}
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
