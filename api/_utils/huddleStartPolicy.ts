/**
 * Live Huddle start policy (PLCC Chat / Connect / Vault share this service).
 *
 * Starting = opening a huddle in a room where nobody is on the call yet.
 * Joining  = entering a huddle that is already live.
 *
 * Who may START a room's huddle:
 *   - Church-wide leaders (BROAD_CHAT_ADMIN_ROLES: Super Admin, Pastor, Admin, …)
 *   - That room's moderators and its creator (any role — e.g. the member who
 *     leads the overnight prayer calls, or the Intercessors head)
 *   - A Ministry Leader, only for a ministry room of a ministry they belong to
 *   - Either person in a direct (DM) call
 *
 * Everyone else who can see the room may JOIN once it is live, but cannot start it.
 * Always decided on the server; hiding a Start button is never enough.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBroadChatAdmin, normalizeVisibility, userCanAccessMinistryScope } from './communityChatSecurity.js';
import { countDailyRoomParticipants, getDailyApiKey } from './dailyVoice.js';
import { getLiveKitServerConfig, listVoiceRoomParticipantCount } from './livekitVoice.js';

export const HUDDLE_START_FORBIDDEN_CODE = 'huddle_start_forbidden';
export const HUDDLE_START_FORBIDDEN_MESSAGE =
  "This huddle hasn't started yet. A leader or room moderator will start it — you can join as soon as it's live.";
export const HUDDLE_LIVE_UNKNOWN_MESSAGE =
  "Couldn't check whether this huddle is live. Please try again in a moment.";

export type HuddleStartReason =
  | 'dm'
  | 'broad_admin'
  | 'room_moderator'
  | 'room_creator'
  | 'ministry_leader'
  | 'none';

export type HuddleStartInput = {
  visibility: string | null | undefined;
  role: string | null | undefined;
  isChannelModerator: boolean;
  isChannelCreator: boolean;
  /** MINISTRY_LEADER who belongs to this ministry room's ministry. */
  isMinistryLeaderInScope: boolean;
};

/** Pure decision: may this person open an empty huddle in this room? */
export function decideHuddleStart(input: HuddleStartInput): { canStart: boolean; reason: HuddleStartReason } {
  const vis = String(input.visibility || '').toLowerCase();
  if (vis === 'dm') return { canStart: true, reason: 'dm' };
  if (isBroadChatAdmin(input.role)) return { canStart: true, reason: 'broad_admin' };
  if (input.isChannelModerator) return { canStart: true, reason: 'room_moderator' };
  if (input.isChannelCreator) return { canStart: true, reason: 'room_creator' };
  if (
    String(input.role || '').toUpperCase() === 'MINISTRY_LEADER' &&
    vis === 'ministry' &&
    input.isMinistryLeaderInScope
  ) {
    return { canStart: true, reason: 'ministry_leader' };
  }
  return { canStart: false, reason: 'none' };
}

export type HuddleEntryDecision =
  | { ok: true; mode: 'join' | 'start' }
  | { ok: false; status: number; code: string; error: string };

/**
 * Pure gate combining liveness and start permission.
 * isLive === null means we could not tell; starters may still proceed,
 * everyone else is asked to retry (never silently allowed to start).
 */
export function decideHuddleEntry(opts: { isLive: boolean | null; canStart: boolean }): HuddleEntryDecision {
  if (opts.isLive === true) return { ok: true, mode: 'join' };
  if (opts.canStart) return { ok: true, mode: 'start' };
  if (opts.isLive === null) {
    return { ok: false, status: 503, code: 'huddle_live_unknown', error: HUDDLE_LIVE_UNKNOWN_MESSAGE };
  }
  return { ok: false, status: 403, code: HUDDLE_START_FORBIDDEN_CODE, error: HUDDLE_START_FORBIDDEN_MESSAGE };
}

/** Live if anyone is on either line. null only when every available line failed to answer. */
export function combineHuddleOccupancy(counts: Array<number | null>): boolean | null {
  let anyKnown = false;
  for (const c of counts) {
    if (c === null || c === undefined) continue;
    anyKnown = true;
    if (c > 0) return true;
  }
  return anyKnown ? false : null;
}

/**
 * Is anyone on this room's huddle right now (LiveKit or the Daily backup line)?
 * Must run BEFORE ensureVoiceRoom so an empty room isn't mistaken for a live one.
 */
export async function readHuddleIsLive(channelId: string): Promise<boolean | null> {
  const counts: Array<number | null> = [];
  const lk = getLiveKitServerConfig();
  if (lk) {
    try {
      counts.push((await listVoiceRoomParticipantCount(lk, channelId)).participantCount);
    } catch {
      counts.push(null);
    }
  }
  const dailyKey = getDailyApiKey();
  if (dailyKey) {
    counts.push(await countDailyRoomParticipants(dailyKey, channelId).catch(() => null));
  }
  return combineHuddleOccupancy(counts);
}

export type HuddleAuditAction =
  | 'Live Huddle started'
  | 'Live Huddle start denied'
  | 'Live Huddle ended for everyone'
  | 'Live Huddle end denied';

/**
 * Audit a huddle lifecycle event. Never records call content. Never throws —
 * a failed audit write must not block someone joining a prayer call.
 */
export async function logHuddleAudit(opts: {
  action: HuddleAuditAction;
  userId: string;
  channelId: string;
  details?: Record<string, unknown>;
  req?: any;
}): Promise<void> {
  try {
    const { getAudit } = await import('./deps.js');
    const logAudit = await getAudit();
    await logAudit({
      userId: opts.userId,
      action: opts.action,
      details: opts.details || null,
      resourceType: 'chat_channel',
      resourceId: opts.channelId,
      severity: opts.action.endsWith('denied') ? 'warning' : 'info',
      req: opts.req,
    });
  } catch (e) {
    console.warn('[huddle-audit]', (e as any)?.message || e);
  }
}

/** Server-side: load what decideHuddleStart needs for this user + room. */
export async function resolveHuddleStartPermission(opts: {
  supabase: SupabaseClient;
  channel: { id: string; created_by?: string | null; ministry_id?: string | null } & Record<string, any>;
  userId: string;
  role: string | null | undefined;
  /** chat_room_members.role for this user, if already fetched. */
  membershipRole?: string | null;
}): Promise<{ canStart: boolean; reason: HuddleStartReason }> {
  const { supabase, channel, userId, role } = opts;
  let membershipRole = opts.membershipRole;
  if (membershipRole === undefined) {
    const { data } = await supabase
      .from('chat_room_members')
      .select('role')
      .eq('channel_id', channel.id)
      .eq('user_id', userId)
      .maybeSingle();
    membershipRole = (data as any)?.role ?? null;
  }
  const visibility = normalizeVisibility(channel as any);
  let isMinistryLeaderInScope = false;
  if (
    String(role || '').toUpperCase() === 'MINISTRY_LEADER' &&
    visibility === 'ministry' &&
    channel.ministry_id
  ) {
    isMinistryLeaderInScope = await userCanAccessMinistryScope(
      supabase,
      userId,
      String(channel.ministry_id),
      role
    );
  }
  return decideHuddleStart({
    visibility,
    role,
    isChannelModerator: String(membershipRole || '').toLowerCase() === 'moderator',
    isChannelCreator: String(channel.created_by || '') === String(userId),
    isMinistryLeaderInScope,
  });
}
