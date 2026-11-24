/**
 * PLCC ONE permission rights (Nov 24 2026).
 *
 * Standing rights that sit on top of public.users.role and public.ka_link_team:
 *   ka_link_moderator — "Mod": moderate every Ka Link (mute/unmute, hands, mic lock,
 *                       warn/remove/block) and gets a reserved seat.
 *   ka_link_recording — "Recording button": start/stop Ka Link recordings.
 *   admissions        — "Admissions": stored now; what it unlocks is confirmed separately.
 *
 * Full rights = users.role SUPER_ADMIN. "Back end rights" = users.role ADMIN.
 * Stored in public.plcc_rights (supabase/migrations/plcc_rights.sql). Server-only.
 * If the table is missing, every check falls back to the old behaviour.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type PlccRights = {
  kaLinkModerator: boolean;
  kaLinkRecording: boolean;
  admissions: boolean;
};

export const NO_PLCC_RIGHTS: PlccRights = { kaLinkModerator: false, kaLinkRecording: false, admissions: false };

export type PlccRightKey = 'ka_link_moderator' | 'ka_link_recording' | 'admissions';
export const PLCC_RIGHT_KEYS: PlccRightKey[] = ['ka_link_moderator', 'ka_link_recording', 'admissions'];

export function rowToPlccRights(row: any): PlccRights {
  if (!row || typeof row !== 'object') return { ...NO_PLCC_RIGHTS };
  return {
    kaLinkModerator: row.ka_link_moderator === true,
    kaLinkRecording: row.ka_link_recording === true,
    admissions: row.admissions === true,
  };
}

export async function fetchPlccRights(supabase: SupabaseClient, userId: string): Promise<PlccRights> {
  try {
    const { data, error } = await supabase
      .from('plcc_rights')
      .select('ka_link_moderator, ka_link_recording, admissions')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { ...NO_PLCC_RIGHTS };
    return rowToPlccRights(data);
  } catch {
    return { ...NO_PLCC_RIGHTS };
  }
}

/** True once anyone holds the recording right; until then any moderator may record (old rule). */
export async function recordingRightInUse(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('plcc_rights')
      .select('user_id', { count: 'exact', head: true })
      .eq('ka_link_recording', true);
    if (error) return false;
    return (count || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Pure recording rule. Super Admins (full rights) can always record; everyone
 * else must already be a Ka Link moderator for this room. Once the recording right is
 * handed out, only its holders (and Super Admins) may start/stop/delete.
 */
export function decideKaLinkRecording(opts: {
  canModerate: boolean;
  role: string | null | undefined;
  hasRecordingRight: boolean;
  recordingRightInUse: boolean;
}): boolean {
  if (String(opts.role || '').toUpperCase() === 'SUPER_ADMIN') return true;
  if (!opts.canModerate) return false;
  return opts.hasRecordingRight || !opts.recordingRightInUse;
}

export async function resolveKaLinkCanRecord(
  supabase: SupabaseClient,
  opts: { userId: string; role: string | null | undefined; canModerate: boolean; rights?: PlccRights }
): Promise<boolean> {
  const rights = opts.rights || (await fetchPlccRights(supabase, opts.userId));
  return decideKaLinkRecording({
    canModerate: opts.canModerate,
    role: opts.role,
    hasRecordingRight: rights.kaLinkRecording,
    recordingRightInUse: await recordingRightInUse(supabase),
  });
}

export type PlccRightsMember = {
  userId: string;
  name: string;
  role: string | null;
  rights: PlccRights;
  updatedAt: string | null;
};

export async function listPlccRights(
  supabase: SupabaseClient
): Promise<{ ok: true; members: PlccRightsMember[] } | { ok: false; setupNeeded: boolean; error: string }> {
  const { data, error } = await supabase
    .from('plcc_rights')
    .select('user_id, ka_link_moderator, ka_link_recording, admissions, updated_at')
    .order('updated_at', { ascending: true })
    .limit(500);
  if (error) {
    const msg = String(error.message || error.code || '').toLowerCase();
    const missing = msg.includes('plcc_rights') || msg.includes('42p01') || msg.includes('does not exist');
    return missing
      ? { ok: false, setupNeeded: true, error: 'Run supabase/migrations/plcc_rights.sql in the Supabase SQL editor first.' }
      : { ok: false, setupNeeded: false, error: 'Could not load PLCC ONE rights.' };
  }
  const rows = (data || []) as any[];
  const ids = rows.map((r) => r.user_id);
  const users = new Map<string, { name: string; role: string | null }>();
  if (ids.length) {
    const { data: us } = await supabase.from('users').select('id, name, role').in('id', ids);
    for (const u of (us || []) as any[]) users.set(u.id, { name: u.name || 'Member', role: u.role || null });
  }
  return {
    ok: true,
    members: rows
      .map((r) => ({
        userId: r.user_id,
        name: users.get(r.user_id)?.name || 'Member',
        role: users.get(r.user_id)?.role || null,
        rights: rowToPlccRights(r),
        updatedAt: r.updated_at || null,
      }))
      .filter((m) => m.rights.kaLinkModerator || m.rights.kaLinkRecording || m.rights.admissions),
  };
}

/** Parse { userId, right, value } from the Canaan page. */
export function parsePlccRightChange(body: any): { ok: true; userId: string; right: PlccRightKey; value: boolean } | { ok: false; error: string } {
  const userId = String(body?.userId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, error: 'Choose a member.' };
  const right = String(body?.right || '').trim() as PlccRightKey;
  if (!PLCC_RIGHT_KEYS.includes(right)) return { ok: false, error: 'Unknown right.' };
  return { ok: true, userId, right, value: body?.value === true };
}

export async function setPlccRight(
  supabase: SupabaseClient,
  change: { userId: string; right: PlccRightKey; value: boolean; actorId: string }
): Promise<{ ok: true; rights: PlccRights } | { ok: false; error: string }> {
  const { data: existing } = await supabase
    .from('plcc_rights')
    .select('ka_link_moderator, ka_link_recording, admissions')
    .eq('user_id', change.userId)
    .maybeSingle();
  const next: Record<string, unknown> = {
    ka_link_moderator: (existing as any)?.ka_link_moderator === true,
    ka_link_recording: (existing as any)?.ka_link_recording === true,
    admissions: (existing as any)?.admissions === true,
  };
  next[change.right] = change.value;
  const { error } = await supabase.from('plcc_rights').upsert(
    { user_id: change.userId, ...next, updated_by: change.actorId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) return { ok: false, error: 'Could not save that right.' };
  return { ok: true, rights: rowToPlccRights(next) };
}
