/**
 * PLCC Community Phase 2A/2B — chat authorization helpers.
 * Identity is always public.users (Auth-linked). No duplicate Community users.
 *
 * Phase 2B: visibility-aware access, room membership, accessible channel listing.
 * Phase 2A invariants preserved: never trust client user_id; leadership never open.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { courtesyName } from '../../lib/courtesyName.js';

/** Roles allowed to create Community channels (Phase 3A — not broadened). */
export const CHAT_CHANNEL_CREATE_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'ADMIN',
  'ADMIN_STAFF',
  'FIRST_LADY',
  'SECRETARY',
  'ASST_SECRETARY',
  'MINISTRY_LEADER',
]);

/**
 * Church-wide leadership/admin roles (not ministry-scoped).
 * May create/manage ministry rooms for any ministry.
 */
export const BROAD_CHAT_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'ADMIN',
  'ADMIN_STAFF',
  'FIRST_LADY',
  'SECRETARY',
  'ASST_SECRETARY',
]);

/** Roles granted access to leadership rooms via role_grant sync. */
export const LEADERSHIP_ROOM_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'ADMIN',
  'ADMIN_STAFF',
  'FIRST_LADY',
  'SECRETARY',
  'ASST_SECRETARY',
  'MINISTRY_LEADER',
]);

export type ChannelCreateKind = 'open' | 'private' | 'ministry';

export type ChatChannelRow = {
  id: string;
  name?: string | null;
  type?: string | null;
  participants?: string[] | null;
  created_by?: string | null;
  description?: string | null;
  slug?: string | null;
  visibility?: string | null;
  ministry_id?: string | null;
  team_id?: string | null;
  event_id?: string | null;
  is_announcement?: boolean | null;
  pinned_message_id?: string | null;
  allowed_roles?: string[] | null;
};

export function asParticipantIds(participants: unknown): string[] {
  if (!Array.isArray(participants)) return [];
  return participants.map((p) => String(p)).filter(Boolean);
}

export function normalizeVisibility(channel: ChatChannelRow | null | undefined): string {
  const v = String(channel?.visibility || '').toLowerCase().trim();
  if (v) return v;
  const type = String(channel?.type || 'public').toLowerCase();
  if (type === 'public') return 'open';
  if (type === 'private' && String(channel?.name || '').startsWith('DM_')) return 'dm';
  if (type === 'private' || type === 'group') return 'ministry';
  return 'open';
}

/** Membership-gated visibilities (Phase 3A private + existing restricted rooms). */
const MEMBERSHIP_GATED_VIS = new Set(['private', 'ministry', 'dm', 'event']);

/** Open / legacy public: any authenticated Vault user. Never private/leadership. */
export function isOpenChannel(channel: ChatChannelRow | null | undefined): boolean {
  if (!channel) return false;
  const vis = normalizeVisibility(channel);
  if (vis === 'open') return true;
  if (vis === 'private' || vis === 'leadership' || MEMBERSHIP_GATED_VIS.has(vis)) return false;
  const type = String(channel.type || '').toLowerCase();
  return type === 'public' && !['private', 'ministry', 'dm', 'event', 'leadership'].includes(vis);
}

export function isDmChannel(channel: ChatChannelRow | null | undefined): boolean {
  if (!channel) return false;
  const vis = normalizeVisibility(channel);
  return vis === 'dm' || (String(channel.type) === 'private' && String(channel.name || '').startsWith('DM_'));
}

export function isLeadershipChannel(channel: ChatChannelRow | null | undefined): boolean {
  return normalizeVisibility(channel) === 'leadership';
}

/** Rooms that must not use generic Manage Members (DMs + leadership system rooms). */
export function isManageMembersBlockedChannel(channel: ChatChannelRow | null | undefined): boolean {
  return isDmChannel(channel) || isLeadershipChannel(channel);
}

/** System / protected rooms that must not be deleted from Community Chat. */
export function isProtectedCommunityChannel(channel: ChatChannelRow | null | undefined): boolean {
  if (!channel) return true;
  if (isDmChannel(channel) || isLeadershipChannel(channel)) return true;
  if (Boolean((channel as any).is_announcement)) return true;
  const slug = String((channel as any).slug || '')
    .toLowerCase()
    .trim();
  if (slug === 'leadership-briefing') return true;
  return false;
}

/**
 * Who may permanently delete a Community channel (open / private / ministry).
 * DMs, leadership, and announcement/system rooms are never deletable here.
 */
export function canDeleteCommunityChannelSync(
  channel: ChatChannelRow | null | undefined,
  userId: string,
  opts?: { userRole?: string | null }
): boolean {
  if (!channel || !userId) return false;
  if (isProtectedCommunityChannel(channel)) return false;

  const role = String(opts?.userRole || '').toUpperCase();
  if (isBroadChatAdmin(role)) return true;
  if (String(channel.created_by || '') === userId) return true;
  return false;
}

/**
 * Prefer chat_room_members; fall back to participants uuid[].
 */
export async function isRoomMember(
  supabase: SupabaseClient,
  channelId: string,
  userId: string
): Promise<boolean> {
  if (!channelId || !userId) return false;

  const { data: row } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (row?.id) return true;

  const channel = await fetchChannel(supabase, channelId);
  if (!channel) return false;
  return asParticipantIds(channel.participants).includes(userId);
}

/**
 * Sync check when membership is already known (listing).
 * Leadership is NEVER treated as open.
 * Private is NEVER treated as open — membership only.
 */
export function canAccessChannelSync(
  channel: ChatChannelRow | null | undefined,
  userId: string,
  opts?: {
    isMember?: boolean;
    userRole?: string | null;
  }
): boolean {
  if (!channel || !userId) return false;

  const vis = normalizeVisibility(channel);
  const type = String(channel.type || 'public').toLowerCase();
  const inParticipants = asParticipantIds(channel.participants).includes(userId);
  const isMember = opts?.isMember === true || inParticipants;

  if (vis === 'leadership') {
    if (isMember) return true;
    const allowed = Array.isArray(channel.allowed_roles) ? channel.allowed_roles : [];
    const role = String(opts?.userRole || '').toUpperCase();
    if (role && allowed.some((r) => String(r).toUpperCase() === role)) return true;
    // Role-grant path: leadership roles may access even before membership sync lands
    if (role && LEADERSHIP_ROOM_ROLES.has(role)) return true;
    return false;
  }

  // Invite-only private: membership required (no role shortcut)
  if (vis === 'private') {
    return isMember;
  }

  if (
    vis === 'open' ||
    (type === 'public' && !['private', 'ministry', 'dm', 'event', 'leadership'].includes(vis))
  ) {
    return true;
  }

  return isMember;
}

/**
 * Async access check used by message/reaction/attachment routes.
 */
export async function canAccessChannel(
  channel: ChatChannelRow | null | undefined,
  userId: string,
  opts?: { supabase?: SupabaseClient; userRole?: string | null }
): Promise<boolean> {
  if (!channel || !userId) return false;

  const vis = normalizeVisibility(channel);
  if (vis === 'open') return true;
  if (vis === 'private') {
    // Private is never open — always resolve membership
    let isMember = asParticipantIds(channel.participants).includes(userId);
    if (!isMember && opts?.supabase) {
      isMember = await isRoomMember(opts.supabase, channel.id, userId);
    }
    return canAccessChannelSync(channel, userId, {
      isMember,
      userRole: opts?.userRole,
    });
  }
  if (!channel.visibility && String(channel.type || 'public').toLowerCase() === 'public') {
    return true;
  }

  let isMember = asParticipantIds(channel.participants).includes(userId);
  if (!isMember && opts?.supabase) {
    isMember = await isRoomMember(opts.supabase, channel.id, userId);
  }

  return canAccessChannelSync(channel, userId, {
    isMember,
    userRole: opts?.userRole,
  });
}

export async function fetchChannel(
  supabase: SupabaseClient,
  channelId: string
): Promise<ChatChannelRow | null> {
  if (!channelId) return null;
  const { data, error } = await supabase.from('chat_channels').select('*').eq('id', channelId).maybeSingle();
  if (error || !data) return null;
  return data as ChatChannelRow;
}

/**
 * Server-side channel listing — never returns rooms the user cannot access.
 * DMs are excluded (opened via dm-channel).
 */
export async function listAccessibleChannels(
  supabase: SupabaseClient,
  userId: string,
  userRole?: string | null
): Promise<ChatChannelRow[]> {
  if (!userId) return [];

  const { data: memberRows } = await supabase
    .from('chat_room_members')
    .select('channel_id')
    .eq('user_id', userId);
  const memberChannelIds = new Set((memberRows || []).map((r: any) => r.channel_id).filter(Boolean));

  const { data: channels, error } = await supabase
    .from('chat_channels')
    .select('*')
    .order('created_at', { ascending: true });
  if (error || !channels) return [];

  return (channels as ChatChannelRow[]).filter((c) => {
    const vis = normalizeVisibility(c);
    if (vis === 'dm' || (String(c.type) === 'private' && String(c.name || '').startsWith('DM_'))) {
      return false;
    }
    const isMember =
      memberChannelIds.has(c.id) || asParticipantIds(c.participants).includes(userId);
    return canAccessChannelSync(c, userId, { isMember, userRole });
  });
}

/**
 * Resolve avatar_url for message authors from users, then members (same id or email).
 * Does not write avatars onto chat_messages.
 */
async function spokenNameByUserId(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const spoken = new Map<string, string>();
  if (!userIds.length) return spoken;
  const { data: links, error } = await supabase
    .from('user_member_links')
    .select('user_id, member_id')
    .in('user_id', userIds)
    .eq('status', 'verified');
  if (error || !Array.isArray(links) || !links.length) return spoken;
  const memberIds = [...new Set(links.map((row: { member_id?: string }) => String(row.member_id || '')).filter(Boolean))];
  let members = await supabase
    .from('members')
    .select('id, first_name, last_name, preferred_name, birthday, address_as')
    .in('id', memberIds);
  if (members.error && /address_as/i.test(String(members.error.message || ''))) {
    members = await supabase
      .from('members')
      .select('id, first_name, last_name, preferred_name, birthday')
      .in('id', memberIds);
  }
  if (members.error || !Array.isArray(members.data)) return spoken;
  const { data: household } = await supabase
    .from('household_members')
    .select('member_id, relationship_type')
    .in('member_id', memberIds)
    .eq('status', 'active');
  const minor = new Set(
    (household || [])
      .filter((row: { relationship_type?: string }) =>
        ['child', 'dependent', 'youth'].includes(String(row.relationship_type || '').toLowerCase())
      )
      .map((row: { member_id?: string }) => String(row.member_id || ''))
  );
  const byMember = new Map((members.data || []).map((row: { id?: string }) => [String(row.id), row]));
  for (const link of links) {
    const row = byMember.get(String(link.member_id)) as {
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      preferred_name?: string | null;
      birthday?: string | null;
      address_as?: string | null;
    } | undefined;
    if (!row) continue;
    const legal = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    const next = courtesyName({
      firstName: row.first_name,
      lastName: row.last_name,
      preferredName: row.preferred_name,
      addressAs: row.address_as,
      birthday: row.birthday,
      minor: minor.has(String(row.id)),
    });
    if (next && next !== (legal || 'Member')) spoken.set(String(link.user_id), next);
  }
  return spoken;
}

export async function enrichMessagesWithAvatars(
  supabase: SupabaseClient,
  messages: any[]
): Promise<any[]> {
  if (!messages?.length) return messages || [];

  const userIds = [
    ...new Set(
      messages
        .map((m) => m.user_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 10)
    ),
  ];

  if (userIds.length === 0) {
    return messages.map((m) => ({ ...m, avatar_url: m.avatar_url ?? null }));
  }

  const { data: users } = await supabase
    .from('users')
    .select('id, name, email, avatar_url')
    .in('id', userIds);

  const byUserId = new Map<string, { name?: string | null; email?: string | null; avatar_url?: string | null }>();
  (users || []).forEach((u: any) => byUserId.set(u.id, u));
  const spoken = await spokenNameByUserId(supabase, userIds);

  const missingAvatarIds = userIds.filter((id) => !byUserId.get(id)?.avatar_url);
  const emails = [
    ...new Set(
      missingAvatarIds
        .map((id) => (byUserId.get(id)?.email || '').toLowerCase().trim())
        .filter(Boolean)
    ),
  ];

  const memberAvatarByUserId = new Map<string, string>();
  const memberAvatarByEmail = new Map<string, string>();

  if (missingAvatarIds.length > 0 || emails.length > 0) {
    const { data: byId } = await supabase
      .from('members')
      .select('id, email, avatar_url')
      .in('id', missingAvatarIds);
    (byId || []).forEach((m: any) => {
      if (m.avatar_url) memberAvatarByUserId.set(m.id, m.avatar_url);
    });

    if (emails.length > 0) {
      const { data: byEmail } = await supabase
        .from('members')
        .select('id, email, avatar_url')
        .in('email', emails);
      (byEmail || []).forEach((m: any) => {
        const em = String(m.email || '')
          .toLowerCase()
          .trim();
        if (em && m.avatar_url) memberAvatarByEmail.set(em, m.avatar_url);
      });
    }
  }

  return messages.map((m) => {
    const uid = m.user_id as string | null;
    if (!uid) return { ...m, avatar_url: null };
    const u = byUserId.get(uid);
    const fromUser = u?.avatar_url || null;
    const fromMemberId = memberAvatarByUserId.get(uid) || null;
    const fromMemberEmail = u?.email
      ? memberAvatarByEmail.get(String(u.email).toLowerCase().trim()) || null
      : null;
    return {
      ...m,
      avatar_url: fromUser || fromMemberId || fromMemberEmail || null,
      display_name: spoken.get(uid) || u?.name || m.user_name || null,
    };
  });
}

/** Upsert chat_read_status for the authenticated user + channel. Non-fatal on failure. */
export async function upsertChatReadStatus(
  supabase: SupabaseClient,
  userId: string,
  channelId: string,
  lastReadAt: string = new Date().toISOString()
): Promise<void> {
  if (!userId || !channelId) return;
  try {
    const { error } = await supabase.from('chat_read_status').upsert(
      {
        user_id: userId,
        channel_id: channelId,
        last_read_at: lastReadAt,
      },
      { onConflict: 'user_id,channel_id' }
    );
    if (error) console.warn('[chat_read_status] upsert failed:', error.message);
  } catch (e: any) {
    console.warn('[chat_read_status] upsert error:', e?.message || e);
  }
}

/**
 * Unread count across accessible channels + DMs.
 * Soft-deleted messages excluded when deleted_at is set.
 */
/** Per-channel unread map + total. Prefers chat_read_status; optional clientSince is a floor only. */
export async function countUnreadByChannel(
  supabase: SupabaseClient,
  userId: string,
  clientSince?: string | null,
  userRole?: string | null
): Promise<{ total: number; byChannel: Record<string, number> }> {
  const fallbackSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let clientFloor: string | null = null;
  if (clientSince) {
    const t = Date.parse(clientSince);
    if (!Number.isNaN(t)) clientFloor = new Date(t).toISOString();
  }

  const accessible = await listAccessibleChannels(supabase, userId, userRole);

  const { data: dmMemberRows } = await supabase
    .from('chat_room_members')
    .select('channel_id')
    .eq('user_id', userId);
  const memberIds = [...new Set((dmMemberRows || []).map((r: any) => r.channel_id).filter(Boolean))];

  let dmChannels: ChatChannelRow[] = [];
  if (memberIds.length > 0) {
    const { data: dms } = await supabase.from('chat_channels').select('*').in('id', memberIds);
    dmChannels = ((dms || []) as ChatChannelRow[]).filter((c) => {
      const vis = normalizeVisibility(c);
      return vis === 'dm' || String(c.name || '').startsWith('DM_');
    });
  }

  const { data: legacyDms } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('type', 'private')
    .like('name', 'DM_%')
    .contains('participants', [userId]);

  const byId = new Map<string, ChatChannelRow>();
  [...accessible, ...dmChannels, ...((legacyDms || []) as ChatChannelRow[])].forEach((c) => {
    if (c?.id) byId.set(c.id, c);
  });

  const channelIds = [...byId.keys()];
  const byChannel: Record<string, number> = {};
  if (channelIds.length === 0) return { total: 0, byChannel };

  const { data: readRows } = await supabase
    .from('chat_read_status')
    .select('channel_id, last_read_at')
    .eq('user_id', userId)
    .in('channel_id', channelIds);

  const readByChannel = new Map<string, string>();
  (readRows || []).forEach((r: any) => {
    if (r.channel_id && r.last_read_at) readByChannel.set(r.channel_id, r.last_read_at);
  });

  let total = 0;
  for (const channelId of channelIds) {
    const channelRead = readByChannel.get(channelId);
    // DB read cursor is authoritative when present; otherwise fallback / client floor
    const times: number[] = [Date.parse(fallbackSince)];
    if (channelRead) times.push(Date.parse(channelRead));
    else if (clientFloor) times.push(Date.parse(clientFloor));
    const valid = times.filter((t) => !Number.isNaN(t));
    const cursor = new Date(Math.max(...valid)).toISOString();

    const { count, error } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .neq('user_id', userId)
      .gt('created_at', cursor)
      .is('deleted_at', null);

    const n = !error ? count || 0 : 0;
    if (n > 0) byChannel[channelId] = n;
    total += n;
  }

  return { total, byChannel };
}

export async function countUnreadForUser(
  supabase: SupabaseClient,
  userId: string,
  clientSince?: string | null,
  userRole?: string | null
): Promise<number> {
  const { total } = await countUnreadByChannel(supabase, userId, clientSince, userRole);
  return total;
}

export type MentionCandidate = {
  id: string;
  name: string;
  role: string | null;
  avatar_url: string | null;
};

/**
 * Collect user ids who may be mentioned in a channel (channel access = mention eligibility).
 * Open: all non-PENDING (resolved via users query). Restricted: members + role grants.
 */
export async function resolveMentionEligibleUserIds(
  supabase: SupabaseClient,
  channel: ChatChannelRow,
  excludeUserId: string
): Promise<'open' | string[]> {
  if (isOpenChannel(channel) && !isDmChannel(channel)) {
    return 'open';
  }

  const ids = new Set<string>(asParticipantIds(channel.participants));
  const { data: memberRows } = await supabase
    .from('chat_room_members')
    .select('user_id')
    .eq('channel_id', channel.id);
  (memberRows || []).forEach((r: any) => {
    if (r.user_id) ids.add(String(r.user_id));
  });

  const vis = normalizeVisibility(channel);
  if (vis === 'leadership') {
    const { data: users } = await supabase.from('users').select('id, role').neq('role', 'PENDING');
    for (const u of users || []) {
      const uid = String(u.id);
      if (!uid || uid === excludeUserId) continue;
      if (
        canAccessChannelSync(channel, uid, {
          isMember: ids.has(uid),
          userRole: u.role,
        })
      ) {
        ids.add(uid);
      }
    }
  }

  ids.delete(excludeUserId);
  return [...ids];
}

/** Whether a user may be @mentioned / notified for this channel. */
export async function canMentionUserInChannel(
  supabase: SupabaseClient,
  channel: ChatChannelRow,
  targetUserId: string,
  targetRole?: string | null
): Promise<boolean> {
  if (!targetUserId) return false;
  if (String(targetRole || '').toUpperCase() === 'PENDING') return false;
  return canAccessChannel(channel, targetUserId, {
    supabase,
    userRole: targetRole,
  });
}

/**
 * Drop mention targets who cannot access the channel (no notify / no mention row).
 */
export async function filterEligibleMentionIds(
  supabase: SupabaseClient,
  channel: ChatChannelRow,
  mentionIds: string[],
  excludeUserId: string
): Promise<string[]> {
  const unique = [
    ...new Set(
      (mentionIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => id && id !== excludeUserId)
    ),
  ];
  if (unique.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, role')
    .in('id', unique)
    .neq('role', 'PENDING');

  const out: string[] = [];
  for (const u of users || []) {
    const ok = await canMentionUserInChannel(supabase, channel, u.id, u.role);
    if (ok) out.push(u.id);
  }
  return out;
}

/**
 * Typeahead mention candidates for a channel the caller already can access.
 */
export async function listMentionCandidatesForChannel(
  supabase: SupabaseClient,
  channel: ChatChannelRow,
  opts: {
    excludeUserId: string;
    query?: string | null;
    limit?: number;
  }
): Promise<MentionCandidate[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);
  const q = String(opts.query || '').trim();
  const eligible = await resolveMentionEligibleUserIds(supabase, channel, opts.excludeUserId);

  let query = supabase
    .from('users')
    .select('id, name, role, avatar_url')
    .neq('role', 'PENDING')
    .neq('id', opts.excludeUserId)
    .order('name', { ascending: true })
    .limit(limit);

  if (eligible !== 'open') {
    if (eligible.length === 0) return [];
    query = query.in('id', eligible);
  }

  if (q) {
    // Escape LIKE wildcards from user input
    const safe = q.replace(/[%_\\]/g, '\\$&');
    query = query.ilike('name', `%${safe}%`);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((u: any) => ({
    id: u.id,
    name: u.name || 'Member',
    role: u.role || null,
    avatar_url: u.avatar_url || null,
  }));
}

export function slugifyChannelName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Whether the role may create Community channels at all (unchanged Phase 2B set). */
export function canCreateCommunityChannels(userRole: string | null | undefined): boolean {
  return CHAT_CHANNEL_CREATE_ROLES.has(String(userRole || '').toUpperCase());
}

export function isBroadChatAdmin(userRole: string | null | undefined): boolean {
  return BROAD_CHAT_ADMIN_ROLES.has(String(userRole || '').toUpperCase());
}

/** Phase 4E.1 — client body fields that attempt to spoof Vault AI on the human message path. */
export function isClientVaultAiSpoofAttempt(body: {
  isAi?: unknown;
  is_ai?: unknown;
  userName?: unknown;
  user_name?: unknown;
} | null | undefined): boolean {
  if (!body || typeof body !== 'object') return false;
  if (body.isAi === true || body.is_ai === true) return true;
  const name = String(body.userName ?? body.user_name ?? '')
    .trim()
    .toLowerCase();
  return name === 'vault ai';
}

/**
 * Phase 4E.1 — human chat display names must not collide with Vault AI presentation.
 * Auth identity remains user_id; only the stored display label is sanitized.
 */
export function sanitizeHumanChatDisplayName(displayName: string | null | undefined): string {
  const name = String(displayName || '').trim();
  if (!name) return 'Member';
  if (name.toLowerCase() === 'vault ai') return 'Member';
  return name;
}

/** True when a stored message row should render as Vault AI (server-authored only). */
export function isVaultAiChatMessage(row: {
  user_id?: string | null;
  user_name?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.user_id != null && String(row.user_id).trim() !== '') return false;
  return String(row.user_name || '').trim() === 'Vault AI';
}

/**
 * Sync-friendly manage-members gate (no DB).
 * DMs / leadership rooms are blocked from generic Manage Members.
 */
export function canManageChannelMembersSync(
  channel: ChatChannelRow | null | undefined,
  userId: string,
  opts?: {
    userRole?: string | null;
    membershipRole?: string | null;
    isCreator?: boolean;
  }
): boolean {
  if (!channel || !userId) return false;
  if (isManageMembersBlockedChannel(channel)) return false;

  const role = String(opts?.userRole || '').toUpperCase();
  if (isBroadChatAdmin(role)) return true;

  const creatorId = String(channel.created_by || '');
  if (creatorId && creatorId === userId) return true;
  if (opts?.isCreator === true) return true;

  const memRole = String(opts?.membershipRole || '').toLowerCase();
  if (memRole === 'moderator') return true;

  // Ministry leaders managing their ministry room: caller must also pass ministry scope check
  if (role === 'MINISTRY_LEADER' && normalizeVisibility(channel) === 'ministry' && channel.ministry_id) {
    return true; // scope verified separately with DB
  }

  return false;
}

/**
 * Async manage-members authorization. Enforces ministry scope for MINISTRY_LEADER.
 */
export async function canManageChannelMembers(
  supabase: SupabaseClient,
  channel: ChatChannelRow | null | undefined,
  userId: string,
  userRole?: string | null
): Promise<boolean> {
  if (!channel || !userId) return false;
  if (isManageMembersBlockedChannel(channel)) return false;

  const role = String(userRole || '').toUpperCase();
  if (isBroadChatAdmin(role)) return true;
  if (String(channel.created_by || '') === userId) return true;

  const { data: mem } = await supabase
    .from('chat_room_members')
    .select('role')
    .eq('channel_id', channel.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (String(mem?.role || '').toLowerCase() === 'moderator') return true;

  if (role === 'MINISTRY_LEADER' && normalizeVisibility(channel) === 'ministry' && channel.ministry_id) {
    const allowed = await userCanAccessMinistryScope(supabase, userId, String(channel.ministry_id));
    return allowed;
  }

  return false;
}

/**
 * Ministry scope for MINISTRY_LEADER (and membership checks).
 * Broad admins always pass. Sources: member_ministries + team_members→teams.ministry_id.
 */
export async function userCanAccessMinistryScope(
  supabase: SupabaseClient,
  userId: string,
  ministryId: string,
  userRole?: string | null
): Promise<boolean> {
  if (!userId || !ministryId) return false;
  if (isBroadChatAdmin(userRole)) return true;

  const { data: mm } = await supabase
    .from('member_ministries')
    .select('id')
    .eq('member_id', userId)
    .eq('ministry_id', ministryId)
    .maybeSingle();
  if (mm?.id) return true;

  const { data: teams } = await supabase
    .from('teams')
    .select('id')
    .eq('ministry_id', ministryId);
  const teamIds = (teams || []).map((t: any) => t.id).filter(Boolean);
  if (teamIds.length === 0) return false;

  const { data: tm } = await supabase
    .from('team_members')
    .select('id')
    .or(`user_id.eq.${userId},member_id.eq.${userId}`)
    .in('team_id', teamIds)
    .limit(1);
  return (tm || []).length > 0;
}

/** Ministries the user may attach when creating ministry channels. */
export async function listAuthorizedMinistryIds(
  supabase: SupabaseClient,
  userId: string,
  userRole?: string | null
): Promise<'all' | string[]> {
  if (isBroadChatAdmin(userRole)) return 'all';

  const ids = new Set<string>();
  const { data: mm } = await supabase
    .from('member_ministries')
    .select('ministry_id')
    .eq('member_id', userId);
  (mm || []).forEach((r: any) => {
    if (r.ministry_id) ids.add(String(r.ministry_id));
  });

  const { data: tmRows } = await supabase
    .from('team_members')
    .select('team_id, user_id, member_id')
    .or(`user_id.eq.${userId},member_id.eq.${userId}`);
  const teamIds = [...new Set((tmRows || []).map((r: any) => r.team_id).filter(Boolean))];
  if (teamIds.length > 0) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id, ministry_id')
      .in('id', teamIds)
      .not('ministry_id', 'is', null);
    (teams || []).forEach((t: any) => {
      if (t.ministry_id) ids.add(String(t.ministry_id));
    });
  }

  return [...ids];
}

export function parseChannelCreateKind(raw: unknown): ChannelCreateKind | null {
  const v = String(raw || '')
    .toLowerCase()
    .trim();
  if (v === 'open' || v === 'public') return 'open';
  if (v === 'private') return 'private';
  if (v === 'ministry' || v === 'ministry_team' || v === 'team') return 'ministry';
  return null;
}
