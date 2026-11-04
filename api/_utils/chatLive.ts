/**
 * PLCC Chat live updates + phone alerts.
 *
 * Instant messages: chat tables are server-only (RLS, no client policies), so
 * apps can't listen to the database. Instead the Vault broadcasts a tiny
 * "something changed" ping on a Supabase Realtime topic per room. The topic
 * name is an HMAC of the room id, handed out only to people who can open the
 * room (room-info), so others can't guess it. Pings carry ids only — the app
 * then reloads messages through the normal, access-checked API. The same topic
 * carries "typing…" between people in the room.
 *
 * Phone alerts: new messages are pushed (web push, topic 'chat') to the room's
 * people — or everyone with chat alerts on, for open rooms — minus the author
 * and anyone who muted the room.
 */
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pushChatAlert } from './pushAlerts.js';
import { normalizeVisibility } from './communityChatSecurity.js';

const BROADCAST_TIMEOUT_MS = 3_000;

function topicSecret(): string {
  return String(process.env.CHAT_REALTIME_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

/** Unguessable per-room Realtime topic. Empty when the server has no secret. */
export function chatRealtimeTopic(channelId: string, secret = topicSecret()): string {
  if (!secret || !channelId) return '';
  const mac = createHmac('sha256', secret).update(`awc-chat-room:${channelId}`).digest('hex').slice(0, 32);
  return `awc-chat-${mac}`;
}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (input, init) => fetch(input, init);
export function __setChatLiveFetchForTests(fn: Fetch | null) {
  fetchImpl = fn || ((input, init) => fetch(input, init));
}

/** Ping everyone looking at this room ("message" | "deleted"). Never throws. */
export async function broadcastChatEvent(
  channelId: string,
  event: 'message' | 'deleted' | 'read',
  payload: Record<string, string>
): Promise<boolean> {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const topic = chatRealtimeTopic(channelId);
  if (!url || !key || !topic) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BROADCAST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
      signal: ctrl.signal,
    });
    return res.ok;
  } catch (err: any) {
    console.warn('[chat-live] broadcast failed:', err?.message || err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Edits allowed for this long after sending (WhatsApp allows 15 min; members asked for more room). */
export const CHAT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Pure: may this person edit this message now? Authors only, not deleted, within 24 hours. */
export function decideChatEdit(opts: {
  authorId: unknown;
  userId: string;
  createdAt: unknown;
  deletedAt: unknown;
  now?: number;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (!opts.authorId || String(opts.authorId) !== String(opts.userId)) {
    return { ok: false, status: 403, error: 'You can only edit your own messages.' };
  }
  if (opts.deletedAt) return { ok: false, status: 400, error: 'That message was removed.' };
  const sent = new Date(String(opts.createdAt || '')).getTime();
  if (!Number.isFinite(sent) || (opts.now ?? Date.now()) - sent > CHAT_EDIT_WINDOW_MS) {
    return { ok: false, status: 400, error: 'Messages can only be edited within 24 hours.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mutes
// ---------------------------------------------------------------------------

/** Users who muted this room right now (muted_until null = until they unmute). */
export async function mutedUserIds(supabase: SupabaseClient, channelId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('chat_room_mutes')
      .select('user_id, muted_until')
      .eq('channel_id', channelId);
    if (error) return new Set();
    const now = Date.now();
    return new Set(
      (data || [])
        .filter((r: any) => !r.muted_until || new Date(r.muted_until).getTime() > now)
        .map((r: any) => String(r.user_id))
    );
  } catch {
    return new Set();
  }
}

export async function isRoomMuted(supabase: SupabaseClient, channelId: string, userId: string): Promise<boolean> {
  return (await mutedUserIds(supabase, channelId)).has(userId);
}

export async function setRoomMuted(
  supabase: SupabaseClient,
  channelId: string,
  userId: string,
  muted: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (muted) {
    const { error } = await supabase
      .from('chat_room_mutes')
      .upsert({ channel_id: channelId, user_id: userId, muted_until: null }, { onConflict: 'user_id,channel_id' });
    if (error) {
      return {
        ok: false,
        error: /chat_room_mutes/.test(error.message)
          ? 'Run supabase/migrations/chat_live_alerts.sql in the Supabase SQL editor first.'
          : 'Could not mute this chat.',
      };
    }
    return { ok: true };
  }
  await supabase.from('chat_room_mutes').delete().eq('channel_id', channelId).eq('user_id', userId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phone alerts
// ---------------------------------------------------------------------------

function participantIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* not JSON */
    }
  }
  return [];
}

/** Pure: alert text for a new message. */
export function chatAlertFor(opts: {
  channel: { id: string; name?: string | null; visibility?: string | null; type?: string | null };
  authorName: string;
  content: string;
}): { title: string; body: string; url: string; tag: string } {
  const vis = normalizeVisibility(opts.channel as any);
  const author = String(opts.authorName || 'Someone').trim() || 'Someone';
  const text = String(opts.content || '').replace(/\s+/g, ' ').trim() || 'New message';
  const isDm = vis === 'dm';
  return {
    title: isDm ? author : String(opts.channel.name || 'PLCC Chat'),
    body: isDm ? text : `${author}: ${text}`,
    url: `/community/chat/${opts.channel.id}`,
    // One alert per room on the phone; a new message replaces the previous one.
    tag: `chat:${opts.channel.id}`,
  };
}

/** Who should hear about a message in this room. 'everyone' for open rooms. */
export async function chatAlertAudience(
  supabase: SupabaseClient,
  channel: { id: string; participants?: unknown; visibility?: string | null; type?: string | null }
): Promise<{ userIds: string[] } | { everyone: true }> {
  const vis = normalizeVisibility(channel as any);
  if (vis === 'open') return { everyone: true };
  const ids = new Set(participantIds(channel.participants));
  if (vis !== 'dm') {
    const { data } = await supabase.from('chat_room_members').select('user_id').eq('channel_id', channel.id);
    for (const r of data || []) if ((r as any).user_id) ids.add(String((r as any).user_id));
  }
  return { userIds: [...ids] };
}

/** "@everyone" or "@all" as a word in the message. */
export function mentionsEveryone(content: string): boolean {
  return /(^|\s)@(everyone|all)(?![A-Za-z0-9_])/i.test(String(content || ''));
}

/** New message → phone alerts. Never throws. */
export async function alertChatMessage(
  supabase: SupabaseClient,
  opts: {
    channel: { id: string; name?: string | null; participants?: unknown; visibility?: string | null; type?: string | null };
    authorId: string;
    authorName: string;
    content: string;
    /** A room leader wrote @everyone: alert everyone in the room, even people who muted it. */
    everyone?: boolean;
  }
): Promise<void> {
  try {
    const audience = await chatAlertAudience(supabase, opts.channel);
    const skip = opts.everyone ? new Set<string>() : await mutedUserIds(supabase, opts.channel.id);
    skip.add(String(opts.authorId));
    const alert = chatAlertFor(opts);
    if (opts.everyone) alert.title = `📣 ${alert.title}`;
    await pushChatAlert(supabase, audience, skip, alert);
  } catch (err: any) {
    console.warn('[chat-live] alert failed:', err?.message || err);
  }
}
