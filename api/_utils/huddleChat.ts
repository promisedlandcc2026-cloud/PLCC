/**
 * Phase 3E — Live Huddle ephemeral chat helpers (pure; UI + smokes).
 * Transport: LiveKit publishData / DataReceived on the existing huddle room.
 * No DB / no history — session-local only.
 * Phase 3F: router also discriminates huddle_reaction (exclusive with chat/mute).
 */

import {
  HUDDLE_REACTION_TOPIC,
  HUDDLE_REACTION_TYPE,
  hydrateHuddleReactionEvent,
  parseHuddleReactionWirePayload,
  type HuddleReactionEvent,
} from './huddleReaction.js';

export const HUDDLE_CHAT_TYPE = 'huddle_chat' as const;
export const HUDDLE_CHAT_SCHEMA_VERSION = 1 as const;
export const HUDDLE_CHAT_MAX_LENGTH = 500;
export const HUDDLE_CHAT_DEFAULT_OPEN = false;
/** Optional LiveKit data topic for huddle chat (publish + filter). */
export const HUDDLE_CHAT_TOPIC = 'awc.huddle.chat';

/** livekit-client ^2.22.3 RoomEvent.DataReceived argument shape. */
export type HuddleDataReceivedArgs = {
  payload: Uint8Array;
  participant?: { identity: string; name?: string } | null;
  kind?: number | string | null;
  topic?: string | null;
};

/**
 * Model RoomEvent.DataReceived args from livekit-client 2.22.3:
 * (payload, participant?, kind?, topic?, encryptionType?)
 */
export function parseHuddleDataReceivedArgs(
  payload: Uint8Array,
  participant?: { identity: string; name?: string } | null,
  kind?: number | string | null,
  topic?: string | null
): HuddleDataReceivedArgs {
  return {
    payload,
    participant: participant || null,
    kind: kind ?? null,
    topic: topic ?? null,
  };
}

/** Copy bytes before TextDecoder — Safari-safe for exotic TypedArray views. */
export function copyDataPayloadBytes(payload: Uint8Array | ArrayBuffer): Uint8Array {
  const src = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

export function peekDataPacketType(payload: Uint8Array | ArrayBuffer): string | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(copyDataPayloadBytes(payload)));
    return typeof (parsed as { type?: unknown })?.type === 'string'
      ? String((parsed as { type: string }).type)
      : null;
  } catch {
    return null;
  }
}

/**
 * Sender for huddle_chat MUST come from RoomEvent.DataReceived's RemoteParticipant.
 * If participant is missing, return null — never guess from roster / payload.
 */
export function resolveHuddleDataSender(opts: {
  participant?: { identity: string; name?: string } | null;
}): { identity: string; name: string } | null {
  const identity = String(opts.participant?.identity || '').trim();
  if (!identity) return null;
  const name = String(opts.participant?.name || '').trim();
  return {
    identity,
    name: name || 'Member',
  };
}

export type HuddleDataRoute =
  | { route: 'huddle_chat'; message: HuddleChatMessage; decodeOk: true }
  | { route: 'huddle_reaction'; reaction: HuddleReactionEvent; decodeOk: true }
  | { route: 'ignore'; reason: string };

/** Wire payload only — never trust senderId / isModerator from clients. */
export type HuddleChatWirePayload = {
  type: typeof HUDDLE_CHAT_TYPE;
  v: typeof HUDDLE_CHAT_SCHEMA_VERSION;
  id: string;
  text: string;
  sentAt: number;
};

export type HuddleChatMessage = {
  id: string;
  text: string;
  sentAt: number;
  /** Authenticated LiveKit participant identity (server-minted token). */
  senderIdentity: string;
  /** Display name from LiveKit participant (token name), not payload. */
  senderName: string;
  isLocal: boolean;
  /**
   * Moderator badge: only when derived from server-known local canModerate
   * for the local sender. Remote payload flags are ignored.
   */
  showModeratorBadge: boolean;
};

export function createHuddleChatId(
  randomUUID: () => string = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
): string {
  return randomUUID();
}

export function normalizeHuddleChatText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

export function validateHuddleChatText(raw: unknown): {
  ok: boolean;
  text: string;
  reason?: 'empty' | 'too_long';
} {
  const text = normalizeHuddleChatText(raw);
  if (!text) return { ok: false, text: '', reason: 'empty' };
  if (text.length > HUDDLE_CHAT_MAX_LENGTH) {
    return { ok: false, text, reason: 'too_long' };
  }
  return { ok: true, text };
}

export function buildHuddleChatWirePayload(input: {
  id: string;
  text: string;
  sentAt?: number;
}): HuddleChatWirePayload | null {
  const checked = validateHuddleChatText(input.text);
  if (!checked.ok) return null;
  const id = String(input.id || '').trim();
  if (!id) return null;
  return {
    type: HUDDLE_CHAT_TYPE,
    v: HUDDLE_CHAT_SCHEMA_VERSION,
    id,
    text: checked.text,
    sentAt: Number(input.sentAt) || Date.now(),
  };
}

export function encodeHuddleChatPayload(payload: HuddleChatWirePayload): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  // Copy into a fresh ArrayBuffer-backed view for LiveKit publishData typings.
  return new Uint8Array(encoded);
}

export function parseHuddleChatWirePayload(raw: unknown): HuddleChatWirePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== HUDDLE_CHAT_TYPE) return null;
  if (Number(o.v) !== HUDDLE_CHAT_SCHEMA_VERSION) return null;
  const id = String(o.id || '').trim();
  if (!id || id.length > 80) return null;
  const checked = validateHuddleChatText(o.text);
  if (!checked.ok) return null;
  const sentAt = Number(o.sentAt);
  if (!Number.isFinite(sentAt) || sentAt <= 0) return null;
  return {
    type: HUDDLE_CHAT_TYPE,
    v: HUDDLE_CHAT_SCHEMA_VERSION,
    id,
    text: checked.text,
    sentAt,
  };
}

/**
 * Build a rendered message using LiveKit participant identity/name —
 * never from payload sender fields.
 */
export function hydrateHuddleChatMessage(opts: {
  payload: HuddleChatWirePayload;
  senderIdentity: string;
  senderName: string;
  localIdentity: string;
  localCanModerate: boolean;
}): HuddleChatMessage | null {
  const identity = String(opts.senderIdentity || '').trim();
  if (!identity) return null;
  const isLocal = identity === String(opts.localIdentity || '').trim();
  return {
    id: opts.payload.id,
    text: opts.payload.text,
    sentAt: opts.payload.sentAt,
    senderIdentity: identity,
    senderName: String(opts.senderName || '').trim() || (isLocal ? 'You' : 'Member'),
    isLocal,
    showModeratorBadge: isLocal && Boolean(opts.localCanModerate),
  };
}

/** Decode DataReceived bytes → chat message (or null if not chat / invalid). */
export function decodeIncomingHuddleChat(opts: {
  bytes: Uint8Array | ArrayBuffer;
  senderIdentity: string;
  senderName: string;
  localIdentity: string;
  localCanModerate: boolean;
}): HuddleChatMessage | null {
  let parsed: unknown;
  try {
    const bytes =
      opts.bytes instanceof Uint8Array ? opts.bytes : new Uint8Array(opts.bytes);
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  const payload = parseHuddleChatWirePayload(parsed);
  if (!payload) return null;
  return hydrateHuddleChatMessage({
    payload,
    senderIdentity: opts.senderIdentity,
    senderName: opts.senderName,
    localIdentity: opts.localIdentity,
    localCanModerate: opts.localCanModerate,
  });
}

/**
 * Shared DataReceived router — keeps huddle_chat and huddle_reaction mutually exclusive.
 * Sender identity comes ONLY from LiveKit participant callback — never payload/roster.
 * Raise Hand stays on LiveKit participant metadata and is NOT routed here.
 * Phase 4E.1: forged `mod_mute` data packets are ignored — mute is server-mediated only.
 */
export function routeHuddleDataPacket(opts: {
  payload: Uint8Array | ArrayBuffer;
  participant?: { identity: string; name?: string } | null;
  localIdentity: string;
  localCanModerate: boolean;
  topic?: string | null;
}): HuddleDataRoute {
  const bytes = copyDataPayloadBytes(opts.payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { route: 'ignore', reason: 'json_parse' };
  }

  const type = String((parsed as { type?: unknown })?.type || '');

  // Untrusted peer mute packets must never have authority (Phase 4E.1).
  if (type === 'mod_mute') {
    return { route: 'ignore', reason: 'mod_mute_untrusted' };
  }

  if (type === HUDDLE_CHAT_TYPE) {
    // Topic is optional; if present and wrong, ignore (forward-compat).
    if (opts.topic && opts.topic !== HUDDLE_CHAT_TOPIC) {
      return { route: 'ignore', reason: 'wrong_topic' };
    }
    const sender = resolveHuddleDataSender({ participant: opts.participant });
    if (!sender) {
      return { route: 'ignore', reason: 'missing_sender' };
    }
    const wire = parseHuddleChatWirePayload(parsed);
    if (!wire) {
      return { route: 'ignore', reason: 'chat_validate' };
    }
    const message = hydrateHuddleChatMessage({
      payload: wire,
      senderIdentity: sender.identity,
      senderName: sender.name,
      localIdentity: opts.localIdentity,
      localCanModerate: opts.localCanModerate,
    });
    if (!message) {
      return { route: 'ignore', reason: 'chat_hydrate' };
    }
    return { route: 'huddle_chat', message, decodeOk: true };
  }

  if (type === HUDDLE_REACTION_TYPE) {
    // Topic is optional; if present and wrong, ignore (forward-compat).
    if (opts.topic && opts.topic !== HUDDLE_REACTION_TOPIC) {
      return { route: 'ignore', reason: 'wrong_topic' };
    }
    const sender = resolveHuddleDataSender({ participant: opts.participant });
    if (!sender) {
      return { route: 'ignore', reason: 'missing_sender' };
    }
    const wire = parseHuddleReactionWirePayload(parsed);
    if (!wire) {
      return { route: 'ignore', reason: 'reaction_validate' };
    }
    const reaction = hydrateHuddleReactionEvent({
      payload: wire,
      senderIdentity: sender.identity,
      senderName: sender.name,
      localIdentity: opts.localIdentity,
    });
    if (!reaction) {
      return { route: 'ignore', reason: 'reaction_hydrate' };
    }
    return { route: 'huddle_reaction', reaction, decodeOk: true };
  }

  return { route: 'ignore', reason: type ? `unknown_type:${type}` : 'no_type' };
}

/** Deduplicate by id (reconnect / double-deliver). */
export function appendHuddleChatMessage(
  prev: HuddleChatMessage[],
  next: HuddleChatMessage,
  maxMessages = 200
): HuddleChatMessage[] {
  if (prev.some((m) => m.id === next.id)) return prev;
  const merged = [...prev, next];
  if (merged.length <= maxMessages) return merged;
  return merged.slice(merged.length - maxMessages);
}

export function removeHuddleChatMessageLocal(
  prev: HuddleChatMessage[],
  messageId: string
): HuddleChatMessage[] {
  const id = String(messageId || '').trim();
  if (!id) return prev;
  return prev.filter((m) => m.id !== id);
}

/**
 * Unread: remote messages while panel closed.
 * Own messages never increment unread.
 */
export function nextHuddleChatUnread(opts: {
  chatOpen: boolean;
  isLocalMessage: boolean;
  prevUnread: number;
}): number {
  if (opts.chatOpen) return 0;
  if (opts.isLocalMessage) return opts.prevUnread;
  return Math.min(99, (opts.prevUnread || 0) + 1);
}

export function clearHuddleChatUnread(): number {
  return 0;
}

export function formatHuddleChatTime(
  sentAt: number,
  now: number = Date.now()
): string {
  const d = new Date(sentAt);
  if (!Number.isFinite(d.getTime())) return '';
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

/** Participant count ignores chat traffic. */
export function huddleCountIgnoresChat(
  roomParticipantCount: number,
  _messageCount: number
): number {
  return Math.max(0, Number(roomParticipantCount) || 0);
}

/**
 * Cross-participant delete over publishData is NOT safe:
 * roomAdmin is a token grant, not a remote ParticipantPermission peers can verify.
 * Phase 3E supports local-only dismiss for server-derived moderators.
 */
export function canSafelyBroadcastHuddleChatDelete(): boolean {
  return false;
}

export function canLocallyDismissHuddleChatMessage(opts: {
  localCanModerate: boolean;
}): boolean {
  return Boolean(opts.localCanModerate);
}

/** Near-bottom threshold for auto-scroll (px). */
export const HUDDLE_CHAT_NEAR_BOTTOM_PX = 80;

export function shouldAutoScrollHuddleChat(opts: {
  distanceFromBottom: number;
  nearBottomPx?: number;
}): boolean {
  const threshold = opts.nearBottomPx ?? HUDDLE_CHAT_NEAR_BOTTOM_PX;
  return opts.distanceFromBottom <= threshold;
}
