/**
 * Phase 3B.2 — huddle-start notifications from LiveKit room_started.
 * Fail-soft: never throws to callers; never blocks the voice call path.
 * Idempotency: unique (user_id, type, source_id) + conflict-safe inserts (not SELECT-then-INSERT).
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchChannel,
  isDmChannel,
  isOpenChannel,
  resolveMentionEligibleUserIds,
} from './communityChatSecurity.js';
import {
  filterCommunityNotifyEligibleUserIds,
  listCommunityNotifyEligibleUserIds,
} from './communityMembership.js';
import {
  channelIdFromVoiceRoomName,
  getLiveKitServerConfig,
  type LiveKitServerConfig,
} from './livekitVoice.js';
import { notifyHuddleStartedUsers } from './notify.js';
import { RoomServiceClient } from 'livekit-server-sdk';

/** Fixed namespace for RFC 4122 UUID v5 huddle session source_ids. */
export const AWC_HUDDLE_SOURCE_NAMESPACE = '7c3e9a12-5b4f-4d8e-9a21-0f6d8c4b2e17';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(String(uuid).replace(/-/g, ''), 'hex');
}

/** Deterministic UUID v5 from a name + namespace (no extra deps). */
export function uuidV5FromName(
  name: string,
  namespace: string = AWC_HUDDLE_SOURCE_NAMESPACE
): string {
  const ns = uuidToBytes(namespace);
  if (ns.length !== 16) throw new Error('invalid UUID namespace');
  const hash = createHash('sha1').update(ns).update(String(name), 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** source_id for one LiveKit room session (new sid after room_finished → new notify). */
export function huddleNotificationSourceId(roomSid: string): string {
  const sid = String(roomSid || '').trim();
  if (!sid) throw new Error('roomSid is required');
  return uuidV5FromName(`awc-huddle:${sid}`);
}

/** Only room_started creates a start notification (not joins #2/#3, mute, hand raise, etc.). */
export function shouldNotifyForLiveKitEvent(eventName: string): boolean {
  return String(eventName || '').trim() === 'room_started';
}

export function formatHuddleStartedTitle(): string {
  return 'Voice Huddle Started';
}

export function formatHuddleStartedBody(channelName: string): string {
  const raw = String(channelName || 'channel').trim() || 'channel';
  const label = raw.startsWith('#') ? raw.slice(1) : raw;
  return `A Voice Huddle has started in #${label}.`;
}

export function huddleStartedLink(channelId: string): string {
  return `/community/chat?channel=${encodeURIComponent(String(channelId || '').trim())}`;
}

/** Pure room-name gate used by webhook + smokes (no DB). */
export function resolveHuddleNotifyChannelId(roomName: string): string | null {
  const channelId = channelIdFromVoiceRoomName(String(roomName || '').trim());
  if (!channelId || !UUID_RE.test(channelId)) return null;
  return channelId;
}

export type HuddleStartedNotifyResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  channelId?: string;
  sourceId?: string;
  recipientHint?: string;
  attempted?: number;
  inserted?: number;
  conflicts?: number;
};

async function resolveInitiatorUserId(
  config: LiveKitServerConfig,
  roomName: string
): Promise<string | null> {
  try {
    const host = config.url.replace(/^ws/i, 'http');
    const svc = new RoomServiceClient(host, config.apiKey, config.apiSecret);
    const participants = await svc.listParticipants(roomName);
    if (!Array.isArray(participants) || participants.length === 0) return null;
    const sorted = [...participants].sort(
      (a: any, b: any) => Number(a?.joinedAt || 0) - Number(b?.joinedAt || 0)
    );
    const identity = String((sorted[0] as any)?.identity || '').trim();
    return identity && UUID_RE.test(identity) ? identity : null;
  } catch (err: any) {
    console.warn('[huddle-notify] listParticipants failed', err?.message || err);
    return null;
  }
}

/**
 * Resolve ACL-filtered Community-eligible recipients for a huddle-start notify.
 * Open: listCommunityNotifyEligibleUserIds. Restricted: mention ACL ∩ Community eligibility.
 */
export async function resolveHuddleNotifyRecipientIds(
  supabase: SupabaseClient,
  channel: Parameters<typeof isOpenChannel>[0],
  initiatorUserId: string | null
): Promise<{ ids: string[]; hint: string }> {
  if (!channel || isDmChannel(channel)) {
    return { ids: [], hint: 'dm_excluded' };
  }

  if (isOpenChannel(channel)) {
    const ids = await listCommunityNotifyEligibleUserIds(supabase, {
      excludeUserId: initiatorUserId,
    });
    return { ids, hint: `open_eligible_${ids.length}` };
  }

  const eligible = await resolveMentionEligibleUserIds(
    supabase,
    channel as any,
    initiatorUserId || '00000000-0000-0000-0000-000000000000'
  );
  const rawIds = eligible === 'open' ? [] : eligible;
  const ids = await filterCommunityNotifyEligibleUserIds(supabase, rawIds, {
    excludeUserId: initiatorUserId,
  });
  return { ids, hint: `restricted_eligible_${ids.length}` };
}

/**
 * Handle LiveKit room_started → one ACL-filtered community_huddle_started fan-out.
 * Race-safe via unique index + conflict-ignored inserts (source_id = UUID v5(room.sid)).
 */
export async function notifyHuddleStartedFromRoom(opts: {
  supabase: SupabaseClient;
  roomName: string;
  roomSid: string;
  liveKitConfig?: LiveKitServerConfig | null;
}): Promise<HuddleStartedNotifyResult> {
  try {
    const roomName = String(opts.roomName || '').trim();
    const roomSid = String(opts.roomSid || '').trim();
    if (!roomName || !roomSid) {
      return { ok: true, skipped: true, reason: 'missing_room' };
    }

    const channelId = resolveHuddleNotifyChannelId(roomName);
    if (!channelId) {
      return { ok: true, skipped: true, reason: 'not_awc_channel_room' };
    }

    const sourceId = huddleNotificationSourceId(roomSid);

    const channel = await fetchChannel(opts.supabase, channelId);
    if (!channel) {
      return { ok: true, skipped: true, reason: 'channel_not_found', channelId, sourceId };
    }
    if (isDmChannel(channel)) {
      return { ok: true, skipped: true, reason: 'dm_excluded', channelId, sourceId };
    }

    const lk = opts.liveKitConfig ?? getLiveKitServerConfig();
    const initiatorUserId = lk ? await resolveInitiatorUserId(lk, roomName) : null;

    const { ids, hint } = await resolveHuddleNotifyRecipientIds(
      opts.supabase,
      channel,
      initiatorUserId
    );

    if (ids.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: 'no_recipients',
        channelId,
        sourceId,
        recipientHint: hint,
      };
    }

    const stats = await notifyHuddleStartedUsers(opts.supabase, ids, {
      title: formatHuddleStartedTitle(),
      body: formatHuddleStartedBody(String(channel.name || 'channel')),
      link: huddleStartedLink(channelId),
      sourceId,
    });

    return {
      ok: true,
      channelId,
      sourceId,
      recipientHint: hint,
      attempted: stats.attempted,
      inserted: stats.inserted,
      conflicts: stats.conflicts,
      skipped: stats.inserted === 0 && stats.conflicts > 0,
      reason: stats.inserted === 0 && stats.conflicts > 0 ? 'already_notified' : undefined,
    };
  } catch (err: any) {
    console.error('[huddle-notify] failed', err?.message || err);
    return { ok: false, reason: err?.message || 'notify_failed' };
  }
}
