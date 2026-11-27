/**
 * Shared room lookup for "mark read" (unread counts).
 *
 * Nov 27, 2026 outage: busy Ka Link rooms flooded the database with "Seen by" (✓✓)
 * traffic. "Seen by" has since been removed entirely. What remains: every member
 * marks a room read as messages arrive, and each of those needs the room row — so
 * the row is shared for a few seconds (and concurrent lookups share one query).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchChannel } from './communityChatSecurity.js';

const CHANNEL_TTL_MS = 5_000;
const MAX_ENTRIES = 2_000;

type Entry<T> = { at: number; value: T };
const channels = new Map<string, Entry<any>>();
const channelInflight = new Map<string, Promise<any>>();

function trim<T>(map: Map<string, T>) {
  if (map.size <= MAX_ENTRIES) return;
  const drop = map.size - MAX_ENTRIES;
  let i = 0;
  for (const key of map.keys()) {
    if (i++ >= drop) break;
    map.delete(key);
  }
}

/** Channel row for mark-read only (never for permission changes). */
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

export function __resetChatReadThrottle() {
  channels.clear();
  channelInflight.clear();
}
