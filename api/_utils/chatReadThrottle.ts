/**
 * Brakes for chat "read" traffic (✓✓ / "Seen by").
 *
 * Nov 27, 2026 outage: in a busy Ka Link room every new message made every member
 * mark the room read; each mark broadcast "read"; each broadcast made every member
 * re-fetch the room's read receipts. 50 people ≈ 2,500 database reads per message,
 * which saturated the database and timed out every Canaan API call (503/504).
 *
 * These per-instance brakes absorb bursts on the server side; Ka Link also
 * debounces on the phone. Short TTLs keep "Seen by" fresh within seconds.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchChannel } from './communityChatSecurity.js';

const CHANNEL_TTL_MS = 5_000;
const RECEIPTS_TTL_MS = 8_000;
const READ_BROADCAST_GAP_MS = 4_000;
const MAX_ENTRIES = 2_000;

type Entry<T> = { at: number; value: T };
const channels = new Map<string, Entry<any>>();
const channelInflight = new Map<string, Promise<any>>();
const receipts = new Map<string, Entry<ReceiptRow[]>>();
const receiptsInflight = new Map<string, Promise<ReceiptRow[]>>();
const lastReadBroadcast = new Map<string, number>();

export type ReceiptRow = { userId: string; name: string; lastReadAt: string };

function trim<T>(map: Map<string, T>) {
  if (map.size <= MAX_ENTRIES) return;
  const drop = map.size - MAX_ENTRIES;
  let i = 0;
  for (const key of map.keys()) {
    if (i++ >= drop) break;
    map.delete(key);
  }
}

/** Channel row for read paths only (mark-read, read-receipts). */
export async function fetchChannelForRead(supabase: SupabaseClient, channelId: string, now = Date.now()) {
  const hit = channels.get(channelId);
  if (hit && now - hit.at < CHANNEL_TTL_MS) return hit.value;
  const pending = channelInflight.get(channelId);
  if (pending) return pending;
  const p = fetchChannel(supabase, channelId)
    .then((row) => {
      if (row) {
        channels.set(channelId, { at: Date.now(), value: row });
        trim(channels);
      }
      return row;
    })
    .finally(() => channelInflight.delete(channelId));
  channelInflight.set(channelId, p);
  return p;
}

/** Broadcast "read" for a room at most once every few seconds. */
export function shouldBroadcastRead(channelId: string, now = Date.now()): boolean {
  const last = lastReadBroadcast.get(channelId);
  if (last !== undefined && now - last < READ_BROADCAST_GAP_MS) return false;
  lastReadBroadcast.set(channelId, now);
  trim(lastReadBroadcast);
  return true;
}

/** Everyone's read position in a room (cached briefly; callers drop themselves). */
export async function roomReceipts(supabase: SupabaseClient, channelId: string, now = Date.now()): Promise<ReceiptRow[]> {
  const hit = receipts.get(channelId);
  if (hit && now - hit.at < RECEIPTS_TTL_MS) return hit.value;
  const pending = receiptsInflight.get(channelId);
  if (pending) return pending;
  const p = (async () => {
    const { data: rows, error } = await supabase
      .from('chat_read_status')
      .select('user_id, last_read_at')
      .eq('channel_id', channelId)
      .order('last_read_at', { ascending: false })
      .limit(301);
    if (error) throw error;
    const ids = (rows || []).map((r: any) => r.user_id).filter(Boolean);
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', ids);
      for (const u of users || []) names.set(String((u as any).id), String((u as any).name || 'Member'));
    }
    const value = (rows || []).map((r: any) => ({
      userId: String(r.user_id),
      name: names.get(String(r.user_id)) || 'Member',
      lastReadAt: r.last_read_at,
    }));
    receipts.set(channelId, { at: Date.now(), value });
    trim(receipts);
    return value;
  })().finally(() => receiptsInflight.delete(channelId));
  receiptsInflight.set(channelId, p);
  return p;
}

export function __resetChatReadThrottle() {
  channels.clear();
  channelInflight.clear();
  receipts.clear();
  receiptsInflight.clear();
  lastReadBroadcast.clear();
}
