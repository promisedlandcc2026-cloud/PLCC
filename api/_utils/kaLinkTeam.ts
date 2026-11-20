/**
 * Ka Link team (Phase 3 — Nov 2026).
 *
 *   admin  — the dedicated team that may START the prayer-room Ka Links (#10)
 *   leader — altar leaders and those serving (e.g. Pr. Grace): may join any time
 *            on a reserved seat instead of being sent to the overflow room (#19, #20),
 *            and can tell the moderators "I'm ready" (#18)
 *
 * Admins also get the reserved seat. Stored in public.ka_link_team
 * (supabase/migrations/ka_link_team.sql). If the table is missing or empty,
 * the old start rules apply, so nothing breaks before the team is set up.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * admin  = may start prayer-room Ka Links
 * leader = altar leaders / those serving (Pr. Grace): reserved seat, video, "I'm ready"
 * reader = standing Bible readers: may unmute in every prayer room even while mics
 *          are locked (no video, cannot start rooms); reserved seat
 */
export type KaLinkTeamRole = 'admin' | 'leader' | 'reader';

/** The prayer gatherings whose Ka Links only the admin team may start. */
export const KA_LINK_PRAYER_ROOM_NAMES = [
  'Morning Glory',
  'Lunch Hour',
  'Lunchtime Prayer',
  'Midnight Watch',
  'Midnight Prayer',
  'Upper Room',
  'Intercessors',
  'Intercessor',
];

/** Roles that may manage the team list in Canaan. */
export const KA_LINK_TEAM_MANAGER_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'ADMIN']);

export function canManageKaLinkTeam(role: string | null | undefined): boolean {
  return KA_LINK_TEAM_MANAGER_ROLES.has(String(role || '').toUpperCase());
}

function norm(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Midnight Watch", "PLCC Midnight Watch 🙏", "midnight-watch" → true. */
export function isKaLinkPrayerRoom(channelName: string | null | undefined): boolean {
  const n = norm(String(channelName || ''));
  if (!n) return false;
  return KA_LINK_PRAYER_ROOM_NAMES.some((g) => ` ${n} `.includes(` ${norm(g)} `));
}

export function parseKaLinkTeamRole(raw: unknown): KaLinkTeamRole | null {
  const r = String(raw ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'leader' || r === 'reader' ? r : null;
}

/**
 * Pure start rule for prayer rooms. Super Admins can always start (so the
 * church is never locked out). Until at least one admin is on the team, the
 * existing rule decides.
 */
export function decideKaLinkPrayerRoomStart(opts: {
  isPrayerRoom: boolean;
  existingCanStart: boolean;
  teamRole: KaLinkTeamRole | null;
  teamHasAdmins: boolean;
  role: string | null | undefined;
}): boolean {
  if (!opts.isPrayerRoom || !opts.teamHasAdmins) return opts.existingCanStart;
  if (String(opts.role || '').toUpperCase() === 'SUPER_ADMIN') return true;
  return opts.teamRole === 'admin';
}

function tableMissing(error: any): boolean {
  const msg = String(error?.message || error?.code || '').toLowerCase();
  return msg.includes('ka_link_team') || msg.includes('42p01') || msg.includes('does not exist');
}

export async function fetchKaLinkTeamRole(supabase: SupabaseClient, userId: string): Promise<KaLinkTeamRole | null> {
  try {
    const { data, error } = await supabase
      .from('ka_link_team')
      .select('team_role')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    return parseKaLinkTeamRole((data as any)?.team_role);
  } catch {
    return null;
  }
}

/** Video is for the team's admins and leaders (Pr. Grace) — not Bible readers. */
export function kaLinkTeamMayUseVideo(role: KaLinkTeamRole | null | undefined): boolean {
  return role === 'admin' || role === 'leader';
}

/** User ids of the standing Bible readers (may unmute while mics are locked). */
export async function fetchKaLinkTeamReaderIds(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('ka_link_team').select('user_id').eq('team_role', 'reader');
    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => String(r.user_id || '')).filter(Boolean);
  } catch {
    return [];
  }
}

/** Ka Link team admins + leaders (Pr. Grace): keep their mic when mics are locked. */
export async function fetchKaLinkTeamLeaderIds(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('ka_link_team').select('user_id').in('team_role', ['admin', 'leader']);
    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => String(r.user_id || '')).filter(Boolean);
  } catch {
    return [];
  }
}

export async function kaLinkTeamHasAdmins(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('ka_link_team')
      .select('user_id', { count: 'exact', head: true })
      .eq('team_role', 'admin');
    if (error) return false;
    return (count || 0) > 0;
  } catch {
    return false;
  }
}

/** Who may start this room's Ka Link, with the Phase 3 prayer-room rule applied. */
export async function resolveKaLinkStart(opts: {
  supabase: SupabaseClient;
  channelName: string | null | undefined;
  userId: string;
  role: string | null | undefined;
  existingCanStart: boolean;
}): Promise<{ canStart: boolean; teamRole: KaLinkTeamRole | null; prayerRoom: boolean }> {
  const prayerRoom = isKaLinkPrayerRoom(opts.channelName);
  const teamRole = await fetchKaLinkTeamRole(opts.supabase, opts.userId);
  if (!prayerRoom) return { canStart: opts.existingCanStart, teamRole, prayerRoom };
  const teamHasAdmins = await kaLinkTeamHasAdmins(opts.supabase);
  return {
    canStart: decideKaLinkPrayerRoomStart({
      isPrayerRoom: prayerRoom,
      existingCanStart: opts.existingCanStart,
      teamRole,
      teamHasAdmins,
      role: opts.role,
    }),
    teamRole,
    prayerRoom,
  };
}

export type KaLinkTeamMember = { userId: string; name: string; teamRole: KaLinkTeamRole; addedAt: string | null };

export async function listKaLinkTeam(
  supabase: SupabaseClient
): Promise<{ ok: true; members: KaLinkTeamMember[] } | { ok: false; setupNeeded: boolean; error: string }> {
  const { data, error } = await supabase
    .from('ka_link_team')
    .select('user_id, team_role, created_at')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) {
    return tableMissing(error)
      ? { ok: false, setupNeeded: true, error: 'Run supabase/migrations/ka_link_team.sql in the Supabase SQL editor first.' }
      : { ok: false, setupNeeded: false, error: 'Could not load the Ka Link team.' };
  }
  const rows = (data || []) as Array<{ user_id: string; team_role: string; created_at: string | null }>;
  const ids = rows.map((r) => r.user_id);
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabase.from('users').select('id, name').in('id', ids);
    for (const u of (users || []) as Array<{ id: string; name: string | null }>) names.set(u.id, u.name || 'Member');
  }
  return {
    ok: true,
    members: rows
      .map((r) => ({
        userId: r.user_id,
        name: names.get(r.user_id) || 'Member',
        teamRole: parseKaLinkTeamRole(r.team_role) as KaLinkTeamRole,
        addedAt: r.created_at,
      }))
      .filter((m) => m.teamRole),
  };
}
