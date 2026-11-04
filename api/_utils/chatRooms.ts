/**
 * PLCC Chat set 4: announcement-only rooms, pinned messages, message search.
 *
 * "Room leaders" = the people who can start a room's Live Huddle
 * (huddleStartPolicy): church-wide leaders, the room's moderators and creator,
 * and a Ministry Leader in their own ministry's room. The same people may post
 * in an announcement-only room and pin messages. In a direct message either
 * person may pin.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_PINS_PER_ROOM = 5;
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_RESULTS = 50;

export const ANNOUNCE_ONLY_ERROR = 'Only leaders can send messages in this announcements room.';

/** Pure: may this person post here? */
export function decideCanPost(opts: { announceOnly: boolean; isRoomLeader: boolean }): boolean {
  return !opts.announceOnly || opts.isRoomLeader;
}

export function isAnnounceOnly(channel: { announce_only?: unknown } | null | undefined): boolean {
  return Boolean(channel && (channel as any).announce_only === true);
}

/** Escape LIKE wildcards so a search for "100%" means the text "100%". */
export function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Pure: clean a search phrase; null when too short. */
export function cleanSearchQuery(raw: unknown): string | null {
  const q = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return q.length >= SEARCH_MIN_CHARS ? q : null;
}

export type PinnedRow = { id: string; content: string; user_name: string | null; pinned_at: string; created_at: string };

export async function listPinnedMessages(supabase: SupabaseClient, channelId: string): Promise<PinnedRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, content, user_name, pinned_at, created_at')
    .eq('channel_id', channelId)
    .not('pinned_at', 'is', null)
    .is('deleted_at', null)
    .order('pinned_at', { ascending: false })
    .limit(MAX_PINS_PER_ROOM);
  if (error) return []; // column missing until the migration runs
  return (data || []) as PinnedRow[];
}

/** Pin / unpin. When the room already has 5 pins, the oldest pin drops off (WhatsApp-style). */
export async function setMessagePinned(
  supabase: SupabaseClient,
  opts: { channelId: string; messageId: string; userId: string; pinned: boolean }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!opts.pinned) {
    const { error } = await supabase
      .from('chat_messages')
      .update({ pinned_at: null, pinned_by: null })
      .eq('id', opts.messageId)
      .eq('channel_id', opts.channelId);
    if (error) return { ok: false, status: 503, error: setupError(error.message) };
    return { ok: true };
  }
  const current = await listPinnedMessages(supabase, opts.channelId);
  if (current.length >= MAX_PINS_PER_ROOM && !current.some((p) => p.id === opts.messageId)) {
    const oldest = current[current.length - 1];
    await supabase.from('chat_messages').update({ pinned_at: null, pinned_by: null }).eq('id', oldest.id);
  }
  const { error } = await supabase
    .from('chat_messages')
    .update({ pinned_at: new Date().toISOString(), pinned_by: opts.userId })
    .eq('id', opts.messageId)
    .eq('channel_id', opts.channelId);
  if (error) return { ok: false, status: 503, error: setupError(error.message) };
  return { ok: true };
}

function setupError(message: string): string {
  return /pinned_at|announce_only|column/i.test(message)
    ? 'Run supabase/migrations/chat_groups_announce_pins.sql in the Supabase SQL editor first.'
    : 'Could not update that message.';
}

// ---------------------------------------------------------------------------
// Archive (per person): hides a chat until someone else posts in it again.
// ---------------------------------------------------------------------------

export type ArchivedRow = { channelId: string; archivedAt: string };

/** Pure: archived chats that got a newer message from someone else come back. */
export function splitArchives(
  rows: Array<{ channel_id: string; archived_at: string }>,
  latestOtherByChannel: Map<string, string>
): { keep: ArchivedRow[]; revive: string[] } {
  const keep: ArchivedRow[] = [];
  const revive: string[] = [];
  for (const r of rows) {
    const latest = latestOtherByChannel.get(String(r.channel_id));
    if (latest && Date.parse(latest) > Date.parse(r.archived_at)) revive.push(String(r.channel_id));
    else keep.push({ channelId: String(r.channel_id), archivedAt: r.archived_at });
  }
  return { keep, revive };
}

export async function listArchivedChats(supabase: SupabaseClient, userId: string): Promise<ArchivedRow[]> {
  const { data: rows, error } = await supabase
    .from('chat_archives')
    .select('channel_id, archived_at')
    .eq('user_id', userId)
    .limit(500);
  if (error || !rows?.length) return [];
  const ids = rows.map((r: any) => String(r.channel_id));
  const { data: recent } = await supabase
    .from('chat_messages')
    .select('channel_id, created_at')
    .in('channel_id', ids)
    .neq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  const latest = new Map<string, string>();
  for (const m of recent || []) if (!latest.has(String((m as any).channel_id))) latest.set(String((m as any).channel_id), (m as any).created_at);
  const { keep, revive } = splitArchives(rows as any, latest);
  if (revive.length) await supabase.from('chat_archives').delete().eq('user_id', userId).in('channel_id', revive);
  return keep;
}

export async function setChatArchived(
  supabase: SupabaseClient,
  userId: string,
  channelId: string,
  archived: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!archived) {
    await supabase.from('chat_archives').delete().eq('user_id', userId).eq('channel_id', channelId);
    return { ok: true };
  }
  const { error } = await supabase
    .from('chat_archives')
    .upsert({ user_id: userId, channel_id: channelId, archived_at: new Date().toISOString() }, { onConflict: 'user_id,channel_id' });
  if (error) {
    return {
      ok: false,
      error: /chat_archives/.test(error.message)
        ? 'Run supabase/migrations/chat_archive_everyone.sql in the Supabase SQL editor first.'
        : 'Could not archive this chat.',
    };
  }
  return { ok: true };
}

export type SearchHit = {
  id: string;
  channel_id: string;
  content: string;
  user_name: string | null;
  created_at: string;
};

/** Text search over messages in the given rooms (caller has already checked access). */
export async function searchMessages(
  supabase: SupabaseClient,
  channelIds: string[],
  q: string
): Promise<SearchHit[]> {
  if (!channelIds.length) return [];
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, channel_id, content, user_name, created_at')
    .in('channel_id', channelIds.slice(0, 500))
    .is('deleted_at', null)
    .ilike('content', `%${escapeLike(q)}%`)
    .order('created_at', { ascending: false })
    .limit(SEARCH_MAX_RESULTS);
  if (error) {
    console.warn('[chat-search]', error.message);
    return [];
  }
  return (data || []) as SearchHit[];
}
