/**
 * Member conduct (Nov 19 2026): warn, then block, an unruly member.
 *
 *   A moderator warns first (in a call, on a chat message, or on a Tribes post).
 *   Only a member warned in the last WARN_VALID_DAYS days can be blocked. A block
 *   removes them from every live Ka Link and stops them joining calls, sending chat
 *   messages and posting/commenting on Tribes — until a leader unblocks them in
 *   Canaan → Blocked members.
 *
 *   POST community/member-conduct { action: warn|block|unblock, targetUserId, reason?, place?, channelId?, postId?, app? }
 *   GET  community/member-conduct ?targetUserId=… — status for the moderator's buttons
 *   GET  community/member-conduct ?can=1          — { canModerate } (show the buttons on Tribes posts)
 *   GET  community/member-conduct ?list=1         — leaders: blocked members + recent warnings
 *
 * Who may warn/block: Canaan admins (broad chat admin roles), Ka Link team admins and
 * leaders, the room's moderators/creator (or the call's co-host), and for Tribes posts
 * anyone who moderates a room. Leaders and moderators themselves can't be warned/blocked.
 * Who may unblock / see the list: Super Admin, Pastor, Admin, Ka Link team admins and leaders.
 */
import { fetchPlccRights } from './plccRights.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBroadChatAdmin } from './communityChatSecurity.js';

export const WARN_VALID_DAYS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACES = new Set(['call', 'chat', 'post', 'canaan']);
const UNBLOCK_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'ADMIN']);

export const MEMBER_BLOCKED_CODE = 'member_blocked';
export const MEMBER_BLOCKED_MESSAGE =
  'Church leaders have blocked your account from calls, chat and posts after a warning. Please speak to a pastor to have it lifted.';

export type ConductAction = 'warn' | 'block' | 'unblock';

export type ConductCommand = {
  action: ConductAction;
  targetUserId: string;
  reason: string | null;
  place: 'call' | 'chat' | 'post' | 'canaan';
  channelId: string | null;
  postId: string | null;
  app: string | null;
};

export function parseConductCommand(body: any): { ok: true; cmd: ConductCommand } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request' };
  const action = String(body.action || '');
  if (action !== 'warn' && action !== 'block' && action !== 'unblock') return { ok: false, error: 'Unknown action' };
  const target = String(body.targetUserId || '').trim();
  if (!UUID_RE.test(target)) return { ok: false, error: 'Pick the member first' };
  const place = PLACES.has(String(body.place)) ? (String(body.place) as ConductCommand['place']) : 'canaan';
  const cid = String(body.channelId || '').trim();
  const reason = String(body.reason ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) || null;
  const postId = String(body.postId ?? '').trim().slice(0, 64) || null;
  const app = String(body.app ?? '').trim();
  return {
    ok: true,
    cmd: {
      action,
      targetUserId: target,
      reason,
      place,
      channelId: UUID_RE.test(cid) ? cid : null,
      postId,
      app: app === 'tribes' || app === 'ka-link' ? app : null,
    },
  };
}

export type ConductStatus = {
  blocked: boolean;
  blockedAt: string | null;
  blockReason: string | null;
  /** Latest warning that still counts (after the last unblock, within WARN_VALID_DAYS). */
  warnedAt: string | null;
  warnReason: string | null;
  warnings: number;
};

/** Pure: does the log allow a block now? */
export function warningStillCounts(
  log: Array<{ action: string; created_at: string; reason?: string | null }>,
  now = Date.now()
): { at: string; reason: string | null } | null {
  const sorted = [...log].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  for (const row of sorted) {
    if (row.action === 'unblock') return null;
    if (row.action === 'warn') {
      const age = now - new Date(row.created_at).getTime();
      return age <= WARN_VALID_DAYS * 86400_000 ? { at: row.created_at, reason: row.reason ?? null } : null;
    }
  }
  return null;
}

export async function isMemberBlocked(supabase: SupabaseClient, userId: string | null | undefined): Promise<boolean> {
  if (!userId || !UUID_RE.test(String(userId))) return false;
  try {
    const { data, error } = await supabase.from('member_blocks').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) return false; // table not set up yet: never lock anyone out by mistake
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function readConductStatus(supabase: SupabaseClient, userId: string): Promise<ConductStatus> {
  const [{ data: block }, { data: log }] = await Promise.all([
    supabase.from('member_blocks').select('blocked_at, reason').eq('user_id', userId).maybeSingle(),
    supabase
      .from('member_conduct_log')
      .select('action, reason, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  const rows = (log || []) as Array<{ action: string; reason: string | null; created_at: string }>;
  const warn = warningStillCounts(rows);
  return {
    blocked: Boolean(block),
    blockedAt: (block as any)?.blocked_at || null,
    blockReason: (block as any)?.reason || null,
    warnedAt: warn?.at || null,
    warnReason: warn?.reason || null,
    warnings: rows.filter((r) => r.action === 'warn').length,
  };
}

async function teamRole(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('ka_link_team').select('team_role').eq('user_id', userId).maybeSingle();
    return (data as any)?.team_role || null;
  } catch {
    return null;
  }
}

/** PLCC ONE "Mod" right: standing moderator in every Ka Link. */
async function standingModerator(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await fetchPlccRights(supabase, userId)).kaLinkModerator;
}

async function roomModerator(supabase: SupabaseClient, userId: string, channelId: string | null): Promise<boolean> {
  if (channelId) {
    const [{ data: m }, { data: ch }] = await Promise.all([
      supabase.from('chat_room_members').select('role').eq('channel_id', channelId).eq('user_id', userId).maybeSingle(),
      supabase.from('chat_channels').select('created_by').eq('id', channelId).maybeSingle(),
    ]);
    return String((m as any)?.role || '').toLowerCase() === 'moderator' || String((ch as any)?.created_by || '') === userId;
  }
  const { data } = await supabase
    .from('chat_room_members')
    .select('channel_id')
    .eq('user_id', userId)
    .eq('role', 'moderator')
    .limit(1);
  return Boolean(data && data.length);
}

/** May this person warn / block? (sessionModerator = co-host of the live call) */
export async function canModerateConduct(
  supabase: SupabaseClient,
  actor: { id: string; role?: string | null },
  ctx: { channelId?: string | null; sessionModerator?: boolean } = {}
): Promise<boolean> {
  if (isBroadChatAdmin(actor.role)) return true;
  if (ctx.sessionModerator) return true;
  const team = await teamRole(supabase, actor.id);
  if (team === 'admin' || team === 'leader') return true;
  if (await standingModerator(supabase, actor.id)) return true;
  return roomModerator(supabase, actor.id, ctx.channelId ?? null);
}

/** May this person see Blocked members and lift a block? */
export async function canUnblock(supabase: SupabaseClient, actor: { id: string; role?: string | null }): Promise<boolean> {
  if (UNBLOCK_ROLES.has(String(actor.role || '').toUpperCase())) return true;
  const team = await teamRole(supabase, actor.id);
  return team === 'admin' || team === 'leader';
}

/** Leaders and moderators can't be warned or blocked. */
async function isProtected(supabase: SupabaseClient, userId: string, channelId: string | null): Promise<boolean> {
  const { data: u } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  if (isBroadChatAdmin((u as any)?.role)) return true;
  const team = await teamRole(supabase, userId);
  if (team === 'admin' || team === 'leader') return true;
  if (await standingModerator(supabase, userId)) return true;
  return channelId ? roomModerator(supabase, userId, channelId) : false;
}

export type ConductEffects = {
  /** Live call: tell them / take them out. */
  sendNotice?: (channelId: string, identity: string, notice: { t: 'warn' | 'block'; reason?: string | null; by?: string | null }) => Promise<boolean>;
  removeEverywhere?: (identity: string) => Promise<number>;
  notify?: (userId: string, payload: { type: string; title: string; body: string; link?: string }) => Promise<void>;
  audit?: (row: { userId: string; action: string; details: Record<string, unknown>; resourceType: string; resourceId?: string; severity: 'info' | 'warning' | 'critical' }) => Promise<void>;
};

export async function applyConduct(
  supabase: SupabaseClient,
  actor: { id: string; role?: string | null; name?: string | null },
  cmd: ConductCommand,
  effects: ConductEffects & { sessionModerator?: boolean } = {}
): Promise<{ ok: true; status: ConductStatus } | { ok: false; status: number; error: string }> {
  if (cmd.targetUserId === actor.id) return { ok: false, status: 400, error: "You can't do that to yourself." };
  if (cmd.action === 'unblock') {
    if (!(await canUnblock(supabase, actor))) return { ok: false, status: 403, error: 'Only a pastor or admin can lift a block.' };
  } else {
    if (!(await canModerateConduct(supabase, actor, { channelId: cmd.channelId, sessionModerator: effects.sessionModerator }))) {
      return { ok: false, status: 403, error: 'Only moderators and church leaders can do that.' };
    }
    if (await isProtected(supabase, cmd.targetUserId, cmd.channelId)) {
      return { ok: false, status: 400, error: "You can't warn or block a leader or moderator." };
    }
  }

  const before = await readConductStatus(supabase, cmd.targetUserId);
  if (cmd.action === 'block') {
    if (before.blocked) return { ok: true, status: before };
    if (!before.warnedAt) return { ok: false, status: 409, error: 'Give them a warning first. You can block them if they keep going.' };
  }
  if (cmd.action === 'unblock' && !before.blocked) return { ok: true, status: before };

  const logRow = {
    user_id: cmd.targetUserId,
    action: cmd.action,
    reason: cmd.reason,
    place: cmd.place,
    channel_id: cmd.channelId,
    post_id: cmd.postId,
    app: cmd.app,
    by_user: actor.id,
  };
  const { error: logErr } = await supabase.from('member_conduct_log').insert([logRow]);
  if (logErr) {
    console.error('[member-conduct] log', logErr.message);
    return { ok: false, status: 503, error: 'Warnings and blocks are not set up yet. Ask the developer to run the setup.' };
  }
  if (cmd.action === 'block') {
    const { error } = await supabase
      .from('member_blocks')
      .upsert([{ user_id: cmd.targetUserId, reason: cmd.reason || before.warnReason, blocked_by: actor.id, blocked_at: new Date().toISOString() }]);
    if (error) return { ok: false, status: 503, error: 'Could not save the block. Please try again.' };
  } else if (cmd.action === 'unblock') {
    const { error } = await supabase.from('member_blocks').delete().eq('user_id', cmd.targetUserId);
    if (error) return { ok: false, status: 503, error: 'Could not lift the block. Please try again.' };
  }

  // Tell them, and take them out (best effort — the block itself is already saved).
  const why = cmd.reason ? ` Reason: ${cmd.reason}` : '';
  try {
    if (cmd.action === 'warn') {
      if (cmd.channelId && effects.sendNotice) await effects.sendNotice(cmd.channelId, cmd.targetUserId, { t: 'warn', reason: cmd.reason });
      await effects.notify?.(cmd.targetUserId, {
        type: 'system',
        title: 'A warning from church leaders',
        body: `Please keep calls, chat and posts respectful.${why} If it continues, your account will be blocked.`,
      });
    } else if (cmd.action === 'block') {
      if (cmd.channelId && effects.sendNotice) await effects.sendNotice(cmd.channelId, cmd.targetUserId, { t: 'block', reason: cmd.reason });
      await effects.removeEverywhere?.(cmd.targetUserId);
      await effects.notify?.(cmd.targetUserId, {
        type: 'system',
        title: 'Your account has been blocked',
        body: `${MEMBER_BLOCKED_MESSAGE}${why}`,
      });
    } else {
      await effects.notify?.(cmd.targetUserId, {
        type: 'system',
        title: 'Your account is unblocked',
        body: 'You can join calls, chat and post again. Thank you for keeping PLCC respectful.',
      });
    }
    // Logged under the member (so Issues → People shows it on their timeline), with who did it.
    await effects.audit?.({
      userId: cmd.targetUserId,
      action: `Member ${cmd.action}`,
      details: { byUserId: actor.id, byName: actor.name || null, reason: cmd.reason, place: cmd.place, app: cmd.app, postId: cmd.postId },
      resourceType: 'member_conduct',
      resourceId: cmd.channelId || undefined,
      severity: cmd.action === 'block' ? 'warning' : 'info',
    });
  } catch (err: any) {
    console.warn('[member-conduct] follow-up', err?.message || err);
  }
  return { ok: true, status: await readConductStatus(supabase, cmd.targetUserId) };
}

export type BlockedListEntry = {
  userId: string;
  name: string;
  blockedAt: string | null;
  reason: string | null;
  blockedBy: string | null;
};

export async function listConduct(
  supabase: SupabaseClient
): Promise<{ blocked: BlockedListEntry[]; recent: Array<{ at: string; action: string; name: string; by: string | null; reason: string | null; place: string | null }> }> {
  const [{ data: blocks }, { data: log }] = await Promise.all([
    supabase.from('member_blocks').select('user_id, reason, blocked_by, blocked_at').order('blocked_at', { ascending: false }).limit(500),
    supabase
      .from('member_conduct_log')
      .select('user_id, action, reason, place, by_user, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const ids = new Set<string>();
  (blocks || []).forEach((b: any) => {
    ids.add(b.user_id);
    if (b.blocked_by) ids.add(b.blocked_by);
  });
  (log || []).forEach((l: any) => {
    ids.add(l.user_id);
    if (l.by_user) ids.add(l.by_user);
  });
  const names = new Map<string, string>();
  if (ids.size) {
    const { data: users } = await supabase.from('users').select('id, name, email').in('id', [...ids]);
    (users || []).forEach((u: any) => names.set(u.id, String(u.name || u.email || 'Member').trim() || 'Member'));
  }
  return {
    blocked: (blocks || []).map((b: any) => ({
      userId: b.user_id,
      name: names.get(b.user_id) || 'Member',
      blockedAt: b.blocked_at,
      reason: b.reason || null,
      blockedBy: b.blocked_by ? names.get(b.blocked_by) || null : null,
    })),
    recent: (log || []).map((l: any) => ({
      at: l.created_at,
      action: l.action,
      name: names.get(l.user_id) || 'Member',
      by: l.by_user ? names.get(l.by_user) || null : null,
      reason: l.reason || null,
      place: l.place || null,
    })),
  };
}
