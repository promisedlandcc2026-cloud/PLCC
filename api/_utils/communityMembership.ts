/**
 * PLCC Community Phase 2B/3A — room membership sync + manual member management.
 * Uses team_members, member_ministries, users.role — no duplicate membership system.
 * Ministry sync only upserts; it never deletes manual members.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatAccountContact } from './authPhone.js';
import { courtesyName } from '../../lib/courtesyName.js';
import {
  LEADERSHIP_ROOM_ROLES,
  asParticipantIds,
  type ChatChannelRow,
} from './communityChatSecurity.js';

/** Synthetic retired/orphan identities — never eligible for member pickers. */
export function isSyntheticOrphanEmail(email: string | null | undefined): boolean {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  return e.endsWith('@awc-vault.local') || e.startsWith('orphaned+');
}

/** Server picker eligibility: exclude PENDING + synthetic orphans; Auth is NOT required. */
export function isMemberPickerEligibleUser(u: {
  role?: string | null;
  email?: string | null;
}): boolean {
  if (String(u.role || '').toUpperCase() === 'PENDING') return false;
  if (isSyntheticOrphanEmail(u.email)) return false;
  return true;
}

/**
 * Community notification eligibility (open-channel fan-out, huddle starts, etc.).
 * Same rules as member picker: no PENDING, no @awc-vault.local / orphaned+ synthetics.
 * Legitimate real-email invitees without Auth remain eligible.
 */
export function isCommunityNotifyEligibleUser(u: {
  role?: string | null;
  email?: string | null;
}): boolean {
  return isMemberPickerEligibleUser(u);
}

/**
 * Eligible Vault user ids for open-channel Community notifications.
 * Excludes PENDING, synthetic orphans, and optional actor id.
 */
export async function listCommunityNotifyEligibleUserIds(
  supabase: SupabaseClient,
  opts?: { excludeUserId?: string | null }
): Promise<string[]> {
  const exclude = String(opts?.excludeUserId || '').trim();
  const { data, error } = await supabase.from('users').select('id, email, role');
  if (error || !data) {
    if (error) console.error('[CommunityNotify] list users failed:', error.message);
    return [];
  }
  return data
    .filter((u: any) => u?.id && isCommunityNotifyEligibleUser(u))
    .filter((u: any) => !exclude || String(u.id) !== exclude)
    .map((u: any) => String(u.id));
}

/**
 * Filter candidate ids to Community-notify-eligible users (restricted-channel fan-out).
 */
export async function filterCommunityNotifyEligibleUserIds(
  supabase: SupabaseClient,
  userIds: string[],
  opts?: { excludeUserId?: string | null }
): Promise<string[]> {
  const unique = [
    ...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];
  const exclude = String(opts?.excludeUserId || '').trim();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role')
    .in('id', unique);
  if (error || !data) {
    if (error) console.error('[CommunityNotify] filter users failed:', error.message);
    return [];
  }
  return data
    .filter((u: any) => u?.id && isCommunityNotifyEligibleUser(u))
    .filter((u: any) => !exclude || String(u.id) !== exclude)
    .map((u: any) => String(u.id));
}

/**
 * Pure decision for ministry roster sync upsert.
 * Upgrades manual → ministry_sync for roster members; never demotes moderators
 * (creator stays moderator/manual).
 */
export function resolveMinistrySyncUpsert(
  existing: { role?: string | null; source?: string | null } | null
): {
  action: 'insert' | 'upgrade_source' | 'skip_moderator' | 'noop';
  role: 'member' | 'moderator';
  source: 'ministry_sync' | 'manual' | 'role_grant' | 'event';
} {
  if (!existing) {
    return { action: 'insert', role: 'member', source: 'ministry_sync' };
  }
  if (String(existing.role || '').toLowerCase() === 'moderator') {
    const src = String(existing.source || 'manual').toLowerCase();
    const keepSource =
      src === 'ministry_sync' || src === 'role_grant' || src === 'event' || src === 'manual'
        ? (src as 'ministry_sync' | 'manual' | 'role_grant' | 'event')
        : 'manual';
    return { action: 'skip_moderator', role: 'moderator', source: keepSource };
  }
  if (String(existing.source || '').toLowerCase() === 'ministry_sync') {
    return { action: 'noop', role: 'member', source: 'ministry_sync' };
  }
  return { action: 'upgrade_source', role: 'member', source: 'ministry_sync' };
}

/**
 * Plan ministry create memberships: sync roster first; extras are selected ids
 * not already on the roster (and not the creator).
 */
export function planMinistryChannelCreateMemberships(opts: {
  creatorId: string;
  selectedMemberIds: string[];
  rosterUserIds: string[];
}): { creatorId: string; syncRosterIds: string[]; manualExtraIds: string[] } {
  const creatorId = String(opts.creatorId || '').trim();
  const roster = [
    ...new Set(
      (opts.rosterUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)
    ),
  ];
  const selected = [
    ...new Set(
      (opts.selectedMemberIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => id && id !== creatorId)
    ),
  ];
  const rosterSet = new Set(roster);
  return {
    creatorId,
    syncRosterIds: roster,
    manualExtraIds: selected.filter((id) => !rosterSet.has(id)),
  };
}

/** Classify existing ministry channel members without mutating. */
export function classifyMinistryChannelMemberships(opts: {
  createdBy?: string | null;
  memberUserIds: string[];
  rosterUserIds: string[];
}): {
  creatorId: string | null;
  rosterMemberIds: string[];
  manualExtraIds: string[];
  counts: { creator: number; roster: number; manualExtras: number; totalMembers: number };
} {
  const creatorId = String(opts.createdBy || '').trim() || null;
  const rosterSet = new Set(
    (opts.rosterUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)
  );
  const members = [
    ...new Set((opts.memberUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  const rosterMemberIds: string[] = [];
  const manualExtraIds: string[] = [];
  for (const id of members) {
    if (creatorId && id === creatorId) continue;
    if (rosterSet.has(id)) rosterMemberIds.push(id);
    else manualExtraIds.push(id);
  }
  const creatorPresent = Boolean(creatorId && members.includes(creatorId));
  return {
    creatorId,
    rosterMemberIds,
    manualExtraIds,
    counts: {
      creator: creatorPresent ? 1 : 0,
      roster: rosterMemberIds.length,
      manualExtras: manualExtraIds.length,
      totalMembers: members.length,
    },
  };
}

export async function upsertMember(
  supabase: SupabaseClient,
  channelId: string,
  userId: string,
  source: 'manual' | 'ministry_sync' | 'role_grant' | 'event',
  role: 'member' | 'moderator' = 'member',
  opts?: { forceRole?: boolean; upgradeMinistrySyncSource?: boolean }
): Promise<void> {
  if (!channelId || !userId) return;

  // Scoped source upgrade: only for verified ministry roster sync paths.
  if (opts?.upgradeMinistrySyncSource && source === 'ministry_sync') {
    const { data: existing } = await supabase
      .from('chat_room_members')
      .select('id, role, source')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .maybeSingle();
    const decision = resolveMinistrySyncUpsert(existing || null);
    if (decision.action === 'skip_moderator' || decision.action === 'noop') return;
    if (decision.action === 'upgrade_source' && existing?.id) {
      const { error } = await supabase
        .from('chat_room_members')
        .update({ source: 'ministry_sync', role: decision.role })
        .eq('id', existing.id);
      if (error) console.warn('[chat_room_members] ministry sync upgrade failed:', error.message);
      return;
    }
    const { error } = await supabase.from('chat_room_members').insert({
      channel_id: channelId,
      user_id: userId,
      role: 'member',
      source: 'ministry_sync',
      joined_at: new Date().toISOString(),
    });
    if (error) console.warn('[chat_room_members] ministry sync insert failed:', error.message);
    return;
  }

  const row = {
    channel_id: channelId,
    user_id: userId,
    role,
    source,
    joined_at: new Date().toISOString(),
  };
  if (opts?.forceRole) {
    const { error } = await supabase.from('chat_room_members').upsert(row, {
      onConflict: 'channel_id,user_id',
    });
    if (error) console.warn('[chat_room_members] upsert failed:', error.message);
    return;
  }
  const { error } = await supabase.from('chat_room_members').upsert(row, {
    onConflict: 'channel_id,user_id',
    ignoreDuplicates: true,
  });
  if (error) {
    console.warn('[chat_room_members] upsert failed:', error.message);
  }
}

/** Ensure exactly two DM members and keep participants array in sync. */
export async function ensureDmMembership(
  supabase: SupabaseClient,
  channelId: string,
  userA: string,
  userB: string
): Promise<void> {
  await upsertMember(supabase, channelId, userA, 'manual');
  await upsertMember(supabase, channelId, userB, 'manual');
  const { error } = await supabase
    .from('chat_channels')
    .update({
      participants: [userA, userB],
      visibility: 'dm',
      type: 'private',
    })
    .eq('id', channelId);
  if (error) console.warn('[dm membership] channel update failed:', error.message);
}

/** Grant leadership-room access from users.role. */
export async function syncLeadershipMemberships(
  supabase: SupabaseClient,
  userId?: string | null
): Promise<{ granted: number }> {
  let granted = 0;

  const { data: leadershipChannels } = await supabase
    .from('chat_channels')
    .select('id, slug, visibility')
    .eq('visibility', 'leadership');

  const channels = leadershipChannels || [];
  if (channels.length === 0) return { granted: 0 };

  let query = supabase.from('users').select('id, role');
  if (userId) query = query.eq('id', userId);
  const { data: users } = await query;

  for (const u of users || []) {
    const role = String(u.role || '').toUpperCase();
    if (!LEADERSHIP_ROOM_ROLES.has(role)) continue;
    for (const ch of channels) {
      await upsertMember(supabase, ch.id, u.id, 'role_grant');
      granted += 1;
    }
  }

  return { granted };
}

/**
 * Map ministry membership → ministry chat rooms.
 * Sources: member_ministries (member_id ≈ users.id) and team_members → teams.ministry_id.
 * Never deletes existing rows (manual members are preserved).
 */
export async function syncMinistryMemberships(
  supabase: SupabaseClient,
  userId?: string | null
): Promise<{ granted: number }> {
  let granted = 0;

  const { data: ministryChannels } = await supabase
    .from('chat_channels')
    .select('id, ministry_id, visibility')
    .eq('visibility', 'ministry')
    .not('ministry_id', 'is', null);

  const channels = (ministryChannels || []).filter((c: any) => c.ministry_id);
  if (channels.length === 0) return { granted: 0 };

  const ministryToChannels = new Map<string, string[]>();
  for (const c of channels) {
    const mid = String(c.ministry_id);
    const list = ministryToChannels.get(mid) || [];
    list.push(c.id);
    ministryToChannels.set(mid, list);
  }

  // Direct member_ministries
  let mmQuery = supabase.from('member_ministries').select('member_id, ministry_id');
  if (userId) mmQuery = mmQuery.eq('member_id', userId);
  const { data: mmRows } = await mmQuery;

  for (const row of mmRows || []) {
    const channelIds = ministryToChannels.get(String(row.ministry_id)) || [];
    for (const cid of channelIds) {
      await upsertMember(supabase, cid, row.member_id, 'ministry_sync', 'member', {
        upgradeMinistrySyncSource: true,
      });
      granted += 1;
    }
  }

  // team_members → teams.ministry_id
  let tmQuery = supabase.from('team_members').select('member_id, user_id, team_id');
  if (userId) {
    tmQuery = tmQuery.or(`user_id.eq.${userId},member_id.eq.${userId}`);
  }
  const { data: tmRows } = await tmQuery;
  if (!tmRows?.length) return { granted };

  const teamIds = [...new Set(tmRows.map((r: any) => r.team_id).filter(Boolean))];
  const { data: teams } = await supabase
    .from('teams')
    .select('id, ministry_id')
    .in('id', teamIds)
    .not('ministry_id', 'is', null);

  const teamMinistry = new Map<string, string>();
  (teams || []).forEach((t: any) => {
    if (t.ministry_id) teamMinistry.set(t.id, t.ministry_id);
  });

  for (const row of tmRows) {
    const ministryId = teamMinistry.get(row.team_id);
    if (!ministryId) continue;
    const uid = row.user_id || row.member_id;
    if (!uid) continue;
    if (userId && uid !== userId && row.member_id !== userId) continue;
    const channelIds = ministryToChannels.get(String(ministryId)) || [];
    for (const cid of channelIds) {
      await upsertMember(supabase, cid, uid, 'ministry_sync', 'member', {
        upgradeMinistrySyncSource: true,
      });
      granted += 1;
    }
  }

  return { granted };
}

/** Run leadership + ministry sync for one user (or all when userId omitted). */
export async function syncRoomMembershipsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ leadership: number; ministry: number }> {
  const leadership = await syncLeadershipMemberships(supabase, userId);
  const ministry = await syncMinistryMemberships(supabase, userId);
  return { leadership: leadership.granted, ministry: ministry.granted };
}

export async function syncAllRoomMemberships(
  supabase: SupabaseClient
): Promise<{ leadership: number; ministry: number }> {
  const leadership = await syncLeadershipMemberships(supabase, null);
  const ministry = await syncMinistryMemberships(supabase, null);
  return { leadership: leadership.granted, ministry: ministry.granted };
}

/** Collect verified ministry roster user ids (member_ministries + team_members). */
export async function listMinistryRosterUserIds(
  supabase: SupabaseClient,
  ministryId: string
): Promise<string[]> {
  const mid = String(ministryId || '').trim();
  if (!mid) return [];
  const ids = new Set<string>();

  const { data: mmRows } = await supabase
    .from('member_ministries')
    .select('member_id')
    .eq('ministry_id', mid);
  for (const row of mmRows || []) {
    if (row.member_id) ids.add(String(row.member_id));
  }

  const { data: teams } = await supabase.from('teams').select('id').eq('ministry_id', mid);
  const teamIds = (teams || []).map((t: any) => t.id).filter(Boolean);
  if (teamIds.length > 0) {
    const { data: tmRows } = await supabase
      .from('team_members')
      .select('member_id, user_id')
      .in('team_id', teamIds);
    for (const row of tmRows || []) {
      const uid = row.user_id || row.member_id;
      if (uid) ids.add(String(uid));
    }
  }

  return [...ids];
}

/**
 * Sync ministry memberships for one channel's ministry_id only.
 * Upgrades verified roster rows to source=ministry_sync; never demotes moderators;
 * never deletes manual extras.
 */
export async function syncMinistryMembershipsForChannel(
  supabase: SupabaseClient,
  channel: ChatChannelRow
): Promise<number> {
  const ministryId = String(channel.ministry_id || '');
  if (!ministryId || !channel.id) return 0;
  if (String(channel.visibility || '').toLowerCase() !== 'ministry') return 0;

  const rosterIds = await listMinistryRosterUserIds(supabase, ministryId);
  let granted = 0;
  for (const uid of rosterIds) {
    await upsertMember(supabase, channel.id, uid, 'ministry_sync', 'member', {
      upgradeMinistrySyncSource: true,
    });
    granted += 1;
  }
  return granted;
}

export type ChannelMemberRow = {
  id: string;
  channel_id: string;
  user_id: string;
  role: string;
  source: string;
  joined_at?: string | null;
  name: string;
  user_role: string | null;
  avatar_url: string | null;
  ministries: string[];
  is_creator: boolean;
};

async function enrichUsersWithMinistries(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, { name: string; role: string | null; avatar_url: string | null; ministries: string[] }>> {
  const map = new Map<
    string,
    { name: string; role: string | null; avatar_url: string | null; ministries: string[] }
  >();
  if (userIds.length === 0) return map;

  const { data: users } = await supabase
    .from('users')
    .select('id, name, role, avatar_url')
    .in('id', userIds);
  (users || []).forEach((u: any) => {
    map.set(u.id, {
      name: u.name || 'Member',
      role: u.role || null,
      avatar_url: u.avatar_url || null,
      ministries: [],
    });
  });

  const { data: mm } = await supabase
    .from('member_ministries')
    .select('member_id, ministry_id')
    .in('member_id', userIds);
  const ministryIds = [...new Set((mm || []).map((r: any) => r.ministry_id).filter(Boolean))];
  const ministryNames = new Map<string, string>();
  if (ministryIds.length > 0) {
    const { data: ministries } = await supabase.from('ministries').select('id, name').in('id', ministryIds);
    (ministries || []).forEach((m: any) => ministryNames.set(m.id, m.name || 'Ministry'));
  }
  (mm || []).forEach((r: any) => {
    const entry = map.get(r.member_id);
    if (!entry) return;
    const label = ministryNames.get(r.ministry_id);
    if (label && !entry.ministries.includes(label)) entry.ministries.push(label);
  });

  return map;
}

export async function listChannelMembers(
  supabase: SupabaseClient,
  channel: ChatChannelRow
): Promise<ChannelMemberRow[]> {
  const { data: rows, error } = await supabase
    .from('chat_room_members')
    .select('id, channel_id, user_id, role, source, joined_at')
    .eq('channel_id', channel.id)
    .order('joined_at', { ascending: true });
  if (error) throw error;

  const memberRows = rows || [];
  const userIds = [...new Set(memberRows.map((r: any) => r.user_id).filter(Boolean))];
  const enriched = await enrichUsersWithMinistries(supabase, userIds);
  const creatorId = String(channel.created_by || '');

  return memberRows.map((r: any) => {
    const u = enriched.get(r.user_id);
    return {
      id: r.id,
      channel_id: r.channel_id,
      user_id: r.user_id,
      role: r.role || 'member',
      source: r.source || 'manual',
      joined_at: r.joined_at || null,
      name: u?.name || 'Member',
      user_role: u?.role || null,
      avatar_url: u?.avatar_url || null,
      ministries: u?.ministries || [],
      is_creator: Boolean(creatorId && creatorId === r.user_id),
    };
  });
}

/**
 * Add manual members; returns count added/ensured.
 * Skips PENDING + synthetic orphan emails.
 * Uses ignoreDuplicates for member role so existing ministry_sync / moderator rows are preserved.
 */
export async function addManualMembers(
  supabase: SupabaseClient,
  channelId: string,
  userIds: string[],
  role: 'member' | 'moderator' = 'member'
): Promise<{ added: number; userIds: string[] }> {
  const unique = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!channelId || unique.length === 0) return { added: 0, userIds: [] };

  const { data: users } = await supabase
    .from('users')
    .select('id, role, email')
    .in('id', unique);
  const valid = (users || [])
    .filter((u: any) => isMemberPickerEligibleUser(u))
    .map((u: any) => String(u.id));
  for (const uid of valid) {
    await upsertMember(supabase, channelId, uid, 'manual', role, { forceRole: role === 'moderator' });
  }

  // Keep participants array in sync when present (legacy fallback)
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('id, participants')
    .eq('id', channelId)
    .maybeSingle();
  if (channel) {
    const parts = new Set(asParticipantIds(channel.participants));
    valid.forEach((id) => parts.add(id));
    await supabase
      .from('chat_channels')
      .update({ participants: [...parts] })
      .eq('id', channelId);
  }

  return { added: valid.length, userIds: valid };
}

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Pure remove policy (no DB) — used by removeChannelMember + smoke tests.
 * Ministry-synced members on ministry channels cannot be removed via Manage Members.
 */
export function evaluateRemoveChannelMemberPolicy(opts: {
  channel: ChatChannelRow;
  targetUserId: string;
  members: Array<{ user_id: string; role?: string | null; source?: string | null }>;
}): RemoveMemberResult {
  const target = String(opts.targetUserId || '').trim();
  if (!target) return { ok: false, error: 'userId is required', status: 400 };

  const creatorId = String(opts.channel.created_by || '');
  if (creatorId && creatorId === target) {
    return { ok: false, error: 'Cannot remove the channel owner/creator', status: 403 };
  }

  const rows = opts.members || [];
  const targetRow = rows.find((r) => r.user_id === target);
  if (!targetRow) return { ok: false, error: 'Member not found in channel', status: 404 };

  const vis = String(opts.channel.visibility || '').toLowerCase();
  const source = String(targetRow.source || 'manual').toLowerCase();
  if (vis === 'ministry' && source === 'ministry_sync') {
    return {
      ok: false,
      error: 'This member is managed by ministry membership.',
      status: 403,
    };
  }

  const moderatorsAfter = rows.filter((r) => {
    if (r.user_id === target) return false;
    if (String(r.role || '').toLowerCase() === 'moderator') return true;
    if (creatorId && r.user_id === creatorId) return true;
    return false;
  });

  if (moderatorsAfter.length === 0) {
    return {
      ok: false,
      error: 'Cannot remove the last channel moderator',
      status: 400,
    };
  }

  return { ok: true };
}

/**
 * Remove a room member with Phase 3A protections:
 * - cannot remove created_by
 * - cannot remove ministry_sync on ministry channels
 * - cannot leave channel with zero moderators (creator counts as required moderator seat)
 */
export async function removeChannelMember(
  supabase: SupabaseClient,
  channel: ChatChannelRow,
  targetUserId: string
): Promise<RemoveMemberResult> {
  const { data: members } = await supabase
    .from('chat_room_members')
    .select('user_id, role, source')
    .eq('channel_id', channel.id);

  const policy = evaluateRemoveChannelMemberPolicy({
    channel,
    targetUserId,
    members: members || [],
  });
  if (policy.ok === false) return policy;

  const target = String(targetUserId || '').trim();
  const { error } = await supabase
    .from('chat_room_members')
    .delete()
    .eq('channel_id', channel.id)
    .eq('user_id', target);
  if (error) return { ok: false, error: error.message, status: 500 };

  const parts = asParticipantIds(channel.participants).filter((id) => id !== target);
  await supabase.from('chat_channels').update({ participants: parts }).eq('id', channel.id);

  return { ok: true };
}

/** Ensure creator is a moderator member (server-side, cannot be omitted by client). */
export async function ensureCreatorModerator(
  supabase: SupabaseClient,
  channelId: string,
  creatorId: string
): Promise<void> {
  if (!channelId || !creatorId) return;
  await upsertMember(supabase, channelId, creatorId, 'manual', 'moderator', { forceRole: true });
}

export type MemberPickerRow = {
  id: string;
  name: string;
  role: string | null;
  avatar_url: string | null;
  /** Present for Feed mention disambiguation; not required by Chat pickers. */
  email?: string | null;
  ministries: string[];
};

/**
 * Pure picker selection — excludes PENDING, synthetic orphans, current members, and self.
 * Mirrors server listMemberPickerCandidates filtering for smoke tests.
 * Auth presence is NOT required (invitees with real email stay eligible).
 */
export function selectAddablePickerCandidates<
  T extends { id: string; name?: string | null; role?: string | null; email?: string | null },
>(
  users: T[],
  opts: {
    excludeMemberIds?: string[];
    excludeUserId?: string | null;
    query?: string | null;
    limit?: number;
  }
): T[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const exclude = new Set(
    [...(opts.excludeMemberIds || []), opts.excludeUserId || '']
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  const q = String(opts.query || '')
    .trim()
    .toLowerCase();

  const filtered = (users || []).filter((u) => {
    if (!u?.id || exclude.has(u.id)) return false;
    if (!isMemberPickerEligibleUser(u)) return false;
    if (q) {
      const name = String(u.name || '').toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return filtered.slice(0, limit);
}

export async function listMemberPickerCandidates(
  supabase: SupabaseClient,
  opts: {
    excludeUserId?: string;
    query?: string;
    limit?: number;
    /** When set, exclude all current chat_room_members for this channel (server-side). */
    excludeChannelId?: string;
  }
): Promise<MemberPickerRow[]> {
  // Over-fetch then filter synthetics so limit still returns enough eligible users.
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const fetchLimit = Math.min(limit * 3, 150);
  const q = String(opts.query || '').trim();

  const excludeIds = new Set<string>();
  if (opts.excludeUserId) excludeIds.add(String(opts.excludeUserId));

  if (opts.excludeChannelId) {
    const { data: memberRows } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('channel_id', opts.excludeChannelId);
    (memberRows || []).forEach((r: any) => {
      if (r.user_id) excludeIds.add(String(r.user_id));
    });
  }

  let query = supabase
    .from('users')
    .select('id, name, role, avatar_url, email')
    .neq('role', 'PENDING')
    .order('name', { ascending: true })
    .limit(fetchLimit);

  if (q) {
    const safe = q.replace(/[%_\\]/g, '\\$&');
    query = query.ilike('name', `%${safe}%`);
  }

  // Exclude current members + caller server-side before returning (PostgREST `not.in`)
  const excludeList = [...excludeIds].filter(Boolean);
  if (excludeList.length > 0) {
    // Format: ("id1","id2") — quoted UUIDs for PostgREST
    const inList = `(${excludeList.map((id) => `"${id}"`).join(',')})`;
    query = query.not('id', 'in', inList);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const eligible = data.filter((u: any) => isMemberPickerEligibleUser(u)).slice(0, limit);

  const enriched = await enrichUsersWithMinistries(
    supabase,
    eligible.map((u: any) => u.id)
  );

  return eligible.map((u: any) => {
    const e = enriched.get(u.id);
    return {
      id: u.id,
      name: e?.name || u.name || 'Member',
      role: e?.role || u.role || null,
      avatar_url: e?.avatar_url || u.avatar_url || null,
      email: u.email || null,
      ministries: e?.ministries || [],
    };
  });
}

export type CommunityMentorRow = {
  id: string;
  name: string | null;
  role: string | null;
  avatar_url: string | null;
  email: string | null;
  memberName: string | null;
  displayName: string;
};

/** Prefer login name, then linked Members name, then email/phone contact. */
export function resolveCommunityMentorDisplayName(opts: {
  name?: string | null;
  memberName?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const name = String(opts.name || '').trim();
  if (name) return name;
  const memberName = String(opts.memberName || '').trim();
  if (memberName) return memberName;
  const contact = formatAccountContact(opts.email, opts.phone);
  if (contact) return contact;
  return 'Unnamed';
}

/**
 * Chat right-rail Community Members list — login accounts with readable labels.
 * Excludes PENDING + synthetic orphan emails.
 * Falls back when `users.phone` is missing (add_phone_to_users.sql not applied).
 */
export async function listCommunityMentors(
  supabase: SupabaseClient,
  excludeUserId?: string | null
): Promise<CommunityMentorRow[]> {
  try {
    let data: any[] | null = null;
    let withPhone = true;
    {
      const first = await supabase
        .from('users')
        .select('id, name, role, avatar_url, email, phone')
        .neq('role', 'PENDING')
        .order('name', { ascending: true });
      if (first.error && /column.*phone|phone.*does not exist/i.test(String(first.error.message || ''))) {
        withPhone = false;
        const retry = await supabase
          .from('users')
          .select('id, name, role, avatar_url, email')
          .neq('role', 'PENDING')
          .order('name', { ascending: true });
        if (retry.error) {
          console.error('[listCommunityMentors] users select failed:', retry.error.message);
          return [];
        }
        data = retry.data;
      } else if (first.error) {
        console.error('[listCommunityMentors] users select failed:', first.error.message);
        return [];
      } else {
        data = first.data;
      }
    }
    if (!data?.length) return [];

    const exclude = String(excludeUserId || '').trim();
    const users = data.filter(
      (u: any) =>
        String(u.id) !== exclude && isMemberPickerEligibleUser({ role: u.role, email: u.email })
    );
    if (users.length === 0) return [];

    const userIds = users.map((u: any) => String(u.id));
    const memberNameByUser = new Map<string, string>();

    // Chunk .in() to avoid PostgREST URL limits on large directories.
    const links: any[] = [];
    for (let i = 0; i < userIds.length; i += 80) {
      const slice = userIds.slice(i, i + 80);
      const { data: batch, error: linkErr } = await supabase
        .from('user_member_links')
        .select('user_id, member_id, status')
        .in('user_id', slice)
        .eq('status', 'verified');
      if (linkErr) {
        console.warn('[listCommunityMentors] user_member_links:', linkErr.message);
        break;
      }
      if (batch?.length) links.push(...batch);
    }

    const memberIds = [
      ...new Set(links.map((l: any) => String(l.member_id || '').trim()).filter(Boolean)),
    ];
    const memberNameById = new Map<string, string>();
    const memberRows: Array<{
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      preferred_name?: string | null;
      birthday?: string | null;
      address_as?: string | null;
    }> = [];
    for (let i = 0; i < memberIds.length; i += 80) {
      const slice = memberIds.slice(i, i + 80);
      let members = await supabase
        .from('members')
        .select('id, first_name, last_name, preferred_name, birthday, address_as')
        .in('id', slice);
      if (members.error && /address_as/i.test(String(members.error.message || ''))) {
        members = await supabase.from('members').select('id, first_name, last_name').in('id', slice);
      }
      (members.data || []).forEach((m: any) => memberRows.push(m));
    }
    const householdRows: Array<{ member_id?: string; relationship_type?: string }> = [];
    for (let i = 0; i < memberIds.length; i += 80) {
      const slice = memberIds.slice(i, i + 80);
      const { data } = await supabase
        .from('household_members')
        .select('member_id, relationship_type')
        .in('member_id', slice)
        .eq('status', 'active');
      if (data?.length) householdRows.push(...data);
    }
    const minor = new Set(
      householdRows
        .filter((row) => ['child', 'dependent', 'youth'].includes(String(row.relationship_type || '').toLowerCase()))
        .map((row) => String(row.member_id || ''))
    );
    memberRows.forEach((m) => {
      const legal = `${String(m.first_name || '').trim()} ${String(m.last_name || '').trim()}`.trim();
      const spoken = courtesyName({
        firstName: m.first_name,
        lastName: m.last_name,
        preferredName: m.preferred_name,
        addressAs: m.address_as,
        birthday: m.birthday,
        minor: minor.has(String(m.id)),
      });
      const label = spoken && spoken !== (legal || 'Member') ? spoken : legal;
      if (label) memberNameById.set(String(m.id), label);
    });
    links.forEach((l: any) => {
      const uid = String(l.user_id || '');
      const mid = String(l.member_id || '');
      const label = memberNameById.get(mid);
      if (uid && label && !memberNameByUser.has(uid)) {
        memberNameByUser.set(uid, label);
      }
    });

    const rows: CommunityMentorRow[] = users.map((u: any) => {
      const memberName = memberNameByUser.get(String(u.id)) || null;
      const name = String(u.name || '').trim() || null;
      const titled = memberName && /^(Brother|Sister|Pastor|First Lady)\s/.test(memberName) ? memberName : '';
      return {
        id: String(u.id),
        name,
        role: u.role || null,
        avatar_url: u.avatar_url || null,
        email: u.email || null,
        memberName,
        displayName: titled || resolveCommunityMentorDisplayName({
          name,
          memberName,
          email: u.email,
          phone: withPhone ? u.phone : null,
        }),
      };
    });

    rows.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
    );
    return rows;
  } catch (err: any) {
    console.error('[listCommunityMentors]', err?.message || err);
    return [];
  }
}

