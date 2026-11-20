/**
 * PLCC Community Phase 3B — LiveKit voice huddle helpers (server-side).
 * Secrets never leave the server. Room names are deterministic from channel id.
 */
import { AccessToken, DataPacket_Kind, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { buildLowerHandMetadata } from './voiceHandRaise.js';
import { buildHuddleStageMetadata, parseHuddleStage, type HuddleStage } from './huddleStage.js';
import {
  applyHuddleModAction,
  buildHuddleRoomRolesMetadata,
  emptyHuddleRoomRoles,
  isHuddleSessionModerator,
  mergeHuddleModParticipantMetadata,
  mergeSessionCanModerate,
  parseHuddleRoomRoles,
  type HuddleModAction,
  type HuddleRoomRoles,
} from './huddleModeration.js';

export const VOICE_ROOM_PREFIX = 'awc-channel-';
/** Long enough for a Sunday service + overflow. Client remints before this expires. */
export const VOICE_TOKEN_TTL_SECONDS = 6 * 60 * 60;
/** Keep the room alive through brief ICE renegotiation when someone joins. */
export const VOICE_ROOM_EMPTY_TIMEOUT_SECONDS = 60 * 30; // 30 minutes
export const VOICE_ROOM_DEPARTURE_TIMEOUT_SECONDS = 30;
/** Seats for members. When these are taken, members are offered PLCC Sanctum's overflow room. */
export const VOICE_ROOM_MEMBER_SEATS = 50;
/** Extra seats kept for the Ka Link team and room moderators (Phase 3: Pr. Grace, altar leaders). */
export const VOICE_ROOM_RESERVED_SEATS = 10;
/** LiveKit's hard cap per room = member seats + reserved seats. */
export const VOICE_ROOM_MAX_PARTICIPANTS = VOICE_ROOM_MEMBER_SEATS + VOICE_ROOM_RESERVED_SEATS;

/** PLCC Sanctum's hidden overflow relay joins as `plcc-sanctum-bridge-…`; it is not a person. */
export function countPeople(participants: unknown): number {
  if (!Array.isArray(participants)) return 0;
  return participants.filter((p: any) => !String(p?.identity || '').startsWith('plcc-sanctum-bridge')).length;
}

export type LiveKitServerConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

/** Deterministic LiveKit room name for a Community channel. */
export function voiceRoomNameForChannel(channelId: string): string {
  const id = String(channelId || '').trim();
  if (!id) throw new Error('channelId is required for voice room name');
  return `${VOICE_ROOM_PREFIX}${id}`;
}

/** Extract channel UUID from a room name (or null if not an PLCC channel room). */
export function channelIdFromVoiceRoomName(roomName: string): string | null {
  const name = String(roomName || '');
  if (!name.startsWith(VOICE_ROOM_PREFIX)) return null;
  const id = name.slice(VOICE_ROOM_PREFIX.length).trim();
  return id || null;
}

export function getLiveKitServerConfig(
  env: NodeJS.ProcessEnv = process.env
): LiveKitServerConfig | null {
  const url = String(env.LIVEKIT_URL || env.VITE_LIVEKIT_URL || '').trim();
  const apiKey = String(env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(env.LIVEKIT_API_SECRET || '').trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

/** True when a string looks like a LiveKit API secret (never ship to client bundles). */
export function looksLikeLiveKitSecret(value: unknown): boolean {
  const s = String(value || '');
  return /API[Ss]ecret|sk_|LIVEKIT_API_SECRET/.test(s) && s.length > 8;
}

export type VoiceTokenClaimsInput = {
  /** Canonical authenticated public.users / Auth id — never from client body. */
  userId: string;
  displayName: string;
  channelId: string;
  /** Room admin / mute-others when channel moderator or broad admin. */
  canModerate: boolean;
  /**
   * LiveKit roomAdmin grant. Prefer session host/co-host only once a host exists.
   * Defaults to canModerate when omitted (legacy).
   */
  roomAdmin?: boolean;
  /**
   * False when the moderators locked mics (#8): the member joins without
   * microphone permission and raises a hand to be allowed. Default true.
   */
  allowMicrophone?: boolean;
  /** Ka Link team role (display + "I'm ready" button). Not a permission. */
  kaLinkTeam?: 'admin' | 'leader' | 'reader' | null;
  ttlSeconds?: number;
};

export type VoiceTokenPlan = {
  identity: string;
  name: string;
  roomName: string;
  ttlSeconds: number;
  grant: {
    roomJoin: true;
    room: string;
    /**
     * Members: microphone only (video is for Pr. Grace, the Ka Link team and moderators).
     * Ka Link team: microphone + camera. Moderators and up: unrestricted (screen share,
     * and the waiting-music track, which is neither mic, camera nor screen).
     * A member whose mic is locked can publish nothing (canPublish false).
     */
    canPublish: boolean;
    canPublishSources?: TrackSource[];
    canSubscribe: true;
    canPublishData: true;
    canUpdateOwnMetadata: true;
    roomAdmin: boolean;
  };
};

/** Pure plan for smoke tests — server identity only. */
export function planVoiceAccessToken(input: VoiceTokenClaimsInput): VoiceTokenPlan {
  const userId = String(input.userId || '').trim();
  const channelId = String(input.channelId || '').trim();
  if (!userId) throw new Error('userId is required');
  if (!channelId) throw new Error('channelId is required');
  const roomName = voiceRoomNameForChannel(channelId);
  const ttlSeconds = Math.min(Math.max(input.ttlSeconds ?? VOICE_TOKEN_TTL_SECONDS, 60), 60 * 60 * 6);
  const roomAdmin = input.roomAdmin !== undefined ? Boolean(input.roomAdmin) : Boolean(input.canModerate);
  // Screen sharing is for moderators and up: channel moderators/creator, church leaders, huddle host/co-hosts.
  const canScreenShare = Boolean(input.canModerate) || roomAdmin;
  const allowMicrophone = input.allowMicrophone !== false || canScreenShare;
  // Video only for moderators/hosts and the Ka Link team (Admins, Leaders such as Pr. Grace).
  // (Standing Bible readers are on the team list but get no video.)
  const allowCamera = canScreenShare || input.kaLinkTeam === 'admin' || input.kaLinkTeam === 'leader';
  const restrictSources = !canScreenShare || !allowMicrophone;
  const sources = huddlePublishSources(allowMicrophone, canScreenShare, allowCamera);
  return {
    identity: userId,
    name: String(input.displayName || '').trim() || 'Member',
    roomName,
    ttlSeconds,
    grant: {
      roomJoin: true,
      room: roomName,
      // An empty source list means "everything" to LiveKit, so a member with nothing
      // allowed gets canPublish: false (and a mic-only list kept for later unlocks).
      canPublish: !restrictSources || sources.length > 0,
      ...(restrictSources ? { canPublishSources: sources.length ? sources : [TrackSource.MICROPHONE] } : {}),
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
      roomAdmin,
    },
  };
}

export async function mintLiveKitAccessToken(
  config: LiveKitServerConfig,
  input: VoiceTokenClaimsInput
): Promise<{ token: string; url: string; roomName: string; expiresIn: number }> {
  const plan = planVoiceAccessToken(input);
  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity: plan.identity,
    name: plan.name,
    ttl: plan.ttlSeconds,
    // Shown in the room (gold "Moderator" badge). Display only — permissions stay in the grant.
    attributes: {
      'plcc.role': plan.grant.roomAdmin || input.canModerate ? 'moderator' : 'member',
      ...(input.kaLinkTeam ? { 'plcc.team': input.kaLinkTeam } : {}),
    },
  });
  at.addGrant(plan.grant);
  const token = await at.toJwt();
  return {
    token,
    url: config.url,
    roomName: plan.roomName,
    expiresIn: plan.ttlSeconds,
  };
}

/**
 * Is this Ka Link room at LiveKit's hard cap (VOICE_ROOM_MAX_PARTICIPANTS)? Counts every
 * connection that holds a seat (the hidden PLCC Sanctum relay too), except the member's own
 * identity so a rejoin after a dropped connection is never turned away.
 */
export async function isVoiceRoomFull(
  config: LiveKitServerConfig,
  channelId: string,
  joiningIdentity: string,
  opts: { priority?: boolean } = {}
): Promise<{ full: boolean; seated: number; capacity: number }> {
  // Members fill the member seats; the team and moderators may also use the reserved seats.
  const capacity = opts.priority ? VOICE_ROOM_MAX_PARTICIPANTS : VOICE_ROOM_MEMBER_SEATS;
  const host = config.url.replace(/^ws/i, 'http');
  const svc = new RoomServiceClient(host, config.apiKey, config.apiSecret);
  try {
    const participants = await svc.listParticipants(voiceRoomNameForChannel(channelId));
    const seated = Array.isArray(participants)
      ? participants.filter((p: any) => String(p?.identity || '') !== joiningIdentity).length
      : 0;
    return { full: seated >= capacity, seated, capacity };
  } catch {
    // Room not created yet or LiveKit busy: let LiveKit decide at connect time.
    return { full: false, seated: 0, capacity };
  }
}

export async function listVoiceRoomParticipantCount(
  config: LiveKitServerConfig,
  channelId: string
): Promise<{ roomName: string; active: boolean; participantCount: number }> {
  const roomName = voiceRoomNameForChannel(channelId);
  const host = config.url.replace(/^ws/i, 'http');
  const svc = new RoomServiceClient(host, config.apiKey, config.apiSecret);
  try {
    const participants = await svc.listParticipants(roomName);
    const count = countPeople(participants);
    return { roomName, active: count > 0, participantCount: count };
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    // Room not created yet → inactive huddle
    if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
      return { roomName, active: false, participantCount: 0 };
    }
    throw err;
  }
}

export type VoiceHuddleStatusEntry = {
  active: boolean;
  participantCount: number;
};

/**
 * Batch LiveKit room statuses for authorized channel ids.
 * Prefer listParticipants for counts — listRooms.numParticipants is often stale/0
 * while a client is connected, which left other browsers without green LIVE.
 * On LiveKit failure returns empty map so callers omit badges (no false LIVE).
 */
export async function listVoiceHuddleStatusesForChannels(
  config: LiveKitServerConfig,
  channelIds: string[]
): Promise<Record<string, VoiceHuddleStatusEntry>> {
  const ids = [
    ...new Set(
      (channelIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
  const result: Record<string, VoiceHuddleStatusEntry> = {};
  for (const id of ids) {
    result[id] = { active: false, participantCount: 0 };
  }
  if (ids.length === 0) return result;

  const host = config.url.replace(/^ws/i, 'http');
  const svc = new RoomServiceClient(host, config.apiKey, config.apiSecret);

  try {
    await Promise.all(
      ids.map(async (id) => {
        const roomName = voiceRoomNameForChannel(id);
        try {
          const participants = await svc.listParticipants(roomName);
          const count = countPeople(participants);
          result[id] = { active: count > 0, participantCount: count };
        } catch (err: any) {
          const msg = String(err?.message || err || '').toLowerCase();
          if (
            msg.includes('not found') ||
            msg.includes('does not exist') ||
            err?.status === 404
          ) {
            result[id] = { active: false, participantCount: 0 };
            return;
          }
          // Soft-fail one channel — keep others; leave this channel inactive.
          console.warn('[voice-huddle-statuses] listParticipants failed', roomName, err?.message || err);
          result[id] = { active: false, participantCount: 0 };
        }
      })
    );
    return result;
  } catch (err: any) {
    console.warn('[voice-huddle-statuses] batch failed', err?.message || err);
    return {};
  }
}

/** Pure merge helper for smokes: LiveKit room snapshots → status map. */
export function mapRoomsToHuddleStatuses(
  channelIds: string[],
  rooms: { name?: string | null; numParticipants?: number | null }[]
): Record<string, VoiceHuddleStatusEntry> {
  const ids = [
    ...new Set((channelIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  const result: Record<string, VoiceHuddleStatusEntry> = {};
  for (const id of ids) {
    result[id] = { active: false, participantCount: 0 };
  }
  for (const room of rooms || []) {
    const cid = channelIdFromVoiceRoomName(String(room?.name || ''));
    if (!cid || !(cid in result)) continue;
    const count = Math.max(0, Number(room?.numParticipants ?? 0) || 0);
    result[cid] = { active: count > 0, participantCount: count };
  }
  return result;
}

export function formatChannelHuddleBadge(count: number): string {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return '';
  return `LIVE · ${n}`;
}

export function formatHeaderHuddleLabel(opts: {
  participantCount: number;
  inHuddle: boolean;
}): string {
  const n = Math.max(0, Number(opts.participantCount) || 0);
  if (n <= 0) return 'Live Ka Link';
  if (opts.inHuddle) return `In Ka Link · ${n}`;
  return `Ask to Join · ${n}`;
}

export function formatHuddleParticipantAria(count: number): string {
  const n = Math.max(0, Number(count) || 0);
  if (n === 1) return '1 participant in voice Ka Link';
  return `${n} participants in voice Ka Link`;
}

/** Filter channel ids eligible for voice status (non-DM, access already known). */
export function filterVoiceStatusChannelIds(
  channels: { id?: string | null; visibility?: string | null }[]
): string[] {
  const out: string[] = [];
  for (const ch of channels || []) {
    const id = String(ch?.id || '').trim();
    if (!id) continue;
    const vis = String(ch?.visibility || '').toLowerCase();
    if (vis === 'dm') continue;
    out.push(id);
  }
  return out;
}

/** End huddle by deleting the LiveKit room (moderators only at API layer). */
export async function endVoiceRoom(
  config: LiveKitServerConfig,
  channelId: string,
  timeoutMs = 12_000
): Promise<{ roomName: string; ended: boolean }> {
  const roomName = voiceRoomNameForChannel(channelId);
  const host = config.url.replace(/^ws/i, 'http');
  const svc = new RoomServiceClient(host, config.apiKey, config.apiSecret);
  const deletePromise = (async () => {
    try {
      await svc.deleteRoom(roomName);
      return { roomName, ended: true as const };
    } catch (err: any) {
      const msg = String(err?.message || err || '').toLowerCase();
      if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
        return { roomName, ended: true as const };
      }
      throw err;
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      deletePromise,
      new Promise<{ roomName: string; ended: boolean }>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Timed out ending the LiveKit room')),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Moderator-only: clear raised-hand metadata for a participant via LiveKit RoomService.
 * Propagates to all clients through ParticipantMetadataChanged (no DB).
 */
export async function clearParticipantHandRaise(
  config: LiveKitServerConfig,
  channelId: string,
  targetIdentity: string
): Promise<{ roomName: string; identity: string; cleared: boolean }> {
  const identity = String(targetIdentity || '').trim();
  if (!identity) throw new Error('targetIdentity is required');
  const roomName = voiceRoomNameForChannel(channelId);
  const host = config.url.replace(/^ws/i, 'http');
  const svc = new RoomServiceClient(host, config.apiKey, config.apiSecret);

  let existingMeta = '';
  try {
    const p = await svc.getParticipant(roomName, identity);
    existingMeta = String(p?.metadata || '');
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
      return { roomName, identity, cleared: true };
    }
    throw err;
  }

  const metadata = buildLowerHandMetadata(existingMeta);
  await svc.updateParticipant(roomName, identity, { metadata });
  return { roomName, identity, cleared: true };
}

/** True when a LiveKit track source is the participant microphone. */
export function isLiveKitMicrophoneTrackSource(source: unknown): boolean {
  if (source === TrackSource.MICROPHONE || source === 'MICROPHONE') return true;
  if (typeof source === 'number' && source === Number(TrackSource.MICROPHONE)) return true;
  const text = String(source ?? '').trim().toUpperCase();
  return text === 'MICROPHONE' || text.endsWith('_MICROPHONE');
}

const HUDDLE_MUSIC_TRACK_NAME = 'awc-huddle-music';

/**
 * What a huddle member may publish: camera always, microphone unless muted by a
 * moderator, screen share only for moderators and up.
 */
export function huddlePublishSources(
  allowMicrophone: boolean,
  allowScreenShare = false,
  allowCamera = true
): TrackSource[] {
  const sources: TrackSource[] = [];
  if (allowMicrophone) sources.push(TrackSource.MICROPHONE);
  if (allowCamera) sources.push(TrackSource.CAMERA);
  if (allowScreenShare) sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  return sources;
}

/** Whether a member's current LiveKit permission includes the camera (empty list = legacy "everything"). */
export function permissionAllowsCamera(sources: unknown): boolean {
  if (!Array.isArray(sources) || sources.length === 0) return true;
  return sources.some((s) => s === TrackSource.CAMERA || s === 'CAMERA' || Number(s) === Number(TrackSource.CAMERA));
}

/** Whether a member's current LiveKit permission includes screen share (empty list = legacy "everything"). */
export function permissionAllowsScreenShare(sources: unknown): boolean {
  if (!Array.isArray(sources) || sources.length === 0) return true;
  return sources.some(
    (s) => s === TrackSource.SCREEN_SHARE || s === 'SCREEN_SHARE' || Number(s) === Number(TrackSource.SCREEN_SHARE)
  );
}

/**
 * Microphone track sids from a LiveKit participant.tracks list.
 * Accepts proto JSON (source string or number, sid) and skips waiting music / screen audio.
 */
export function selectMicrophoneTrackSids(tracks: unknown): string[] {
  const list = Array.isArray(tracks)
    ? tracks
    : tracks && typeof tracks === 'object'
      ? Object.values(tracks as Record<string, unknown>)
      : [];
  const sids: string[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const track = raw as Record<string, unknown>;
    const sid = String(track.sid || track.trackSid || '').trim();
    if (!sid) continue;
    const name = String(track.name || '').trim();
    if (name === HUDDLE_MUSIC_TRACK_NAME) continue;
    const sourceText = String(track.source ?? '').toUpperCase();
    if (sourceText.includes('SCREEN_SHARE')) continue;
    const mime = String(track.mimeType || track.mime_type || '').toLowerCase();
    const typeText = String(track.type ?? '').toUpperCase();
    const isMic = isLiveKitMicrophoneTrackSource(track.source);
    const isAudio =
      typeText === 'AUDIO' || typeText === '0' || mime.startsWith('audio/');
    if (!isMic && !isAudio) continue;
    sids.push(sid);
  }
  return sids;
}

/** A member may restore only their own microphone publish permission. */
export function microphoneRestoreIsSelf(actorId: string, targetIdentity: string): boolean {
  const actor = String(actorId || '').trim();
  const target = String(targetIdentity || '').trim();
  return Boolean(actor) && actor === target;
}

async function setMicrophonePublishAllowed(
  svc: RoomServiceClient,
  roomName: string,
  identity: string,
  participant: {
    permission?: { canPublishData?: boolean; canSubscribe?: boolean; canUpdateMetadata?: boolean; canPublishSources?: unknown };
  } | null | undefined,
  allowMicrophone: boolean
): Promise<void> {
  const existing = participant?.permission;
  // Muting or unmuting the mic never adds or removes screen-share or camera rights.
  const allowScreenShare = permissionAllowsScreenShare(existing?.canPublishSources);
  const allowCamera = permissionAllowsCamera(existing?.canPublishSources);
  const sources = huddlePublishSources(allowMicrophone, allowScreenShare, allowCamera);
  await svc.updateParticipant(roomName, identity, {
    permission: {
      canSubscribe: existing?.canSubscribe !== false,
      canPublish: sources.length > 0,
      canPublishData: existing?.canPublishData !== false,
      canUpdateMetadata: existing?.canUpdateMetadata !== false,
      // Never send an empty list (LiveKit reads it as "everything").
      canPublishSources: sources.length ? sources : [TrackSource.MICROPHONE],
    },
  });
}

/**
 * Moderator mute/unmute via LiveKit RoomService.
 * Mute only silences the published mic track. It does not remove microphone
 * publish permission, so the member can turn their own mic back on.
 * Unmute restores that permission (repairs a mic locked by an older mute)
 * and unmutes the track.
 */
export async function muteParticipantMicrophoneTracks(
  config: LiveKitServerConfig,
  channelId: string,
  targetIdentity: string,
  muted = true
): Promise<{
  roomName: string;
  identity: string;
  muted: boolean;
  tracksMuted: number;
  participantFound: boolean;
  micPublishRevoked: boolean;
  micPublishRestored: boolean;
}> {
  const identity = String(targetIdentity || '').trim();
  if (!identity) throw new Error('targetIdentity is required');
  const roomName = voiceRoomNameForChannel(channelId);
  const host = config.url.replace(/^ws/i, 'http');
  const svc = new RoomServiceClient(host, config.apiKey, config.apiSecret);

  let participant: Awaited<ReturnType<RoomServiceClient['getParticipant']>>;
  try {
    participant = await svc.getParticipant(roomName, identity);
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
      const listed = await svc.listParticipants(roomName).catch(() => []);
      const found = (listed || []).find((p) => String(p?.identity || '') === identity);
      if (!found) {
        return {
          roomName,
          identity,
          muted: false,
          tracksMuted: 0,
          participantFound: false,
          micPublishRevoked: false,
          micPublishRestored: false,
        };
      }
      participant = found;
    } else {
      throw err;
    }
  }

  const sids = selectMicrophoneTrackSids(participant?.tracks);
  let tracksMuted = 0;
  for (const sid of sids) {
    await svc.mutePublishedTrack(roomName, identity, sid, muted);
    tracksMuted += 1;
  }

  let micPublishRestored = false;
  if (!muted) {
    try {
      await setMicrophonePublishAllowed(svc, roomName, identity, participant, true);
      micPublishRestored = true;
    } catch (err: any) {
      console.warn('[voice-participant-mute] restore', err?.message || err);
    }
  }

  return {
    roomName,
    identity,
    muted: muted ? true : false,
    tracksMuted,
    participantFound: true,
    micPublishRevoked: false,
    micPublishRestored,
  };
}

/** Give this member their microphone publish permission back. Does not open the mic. */
export async function restoreOwnMicrophonePublish(
  config: LiveKitServerConfig,
  channelId: string,
  identity: string
): Promise<{ roomName: string; identity: string; participantFound: boolean; restored: boolean }> {
  const id = String(identity || '').trim();
  if (!id) throw new Error('identity is required');
  const roomName = voiceRoomNameForChannel(channelId);
  const svc = roomServiceClient(config);
  let participant: Awaited<ReturnType<RoomServiceClient['getParticipant']>> | null = null;
  try {
    participant = await svc.getParticipant(roomName, id);
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (!(msg.includes('not found') || msg.includes('does not exist') || err?.status === 404)) {
      throw err;
    }
    const listed = await svc.listParticipants(roomName).catch(() => []);
    participant = (listed || []).find((p) => String(p?.identity || '') === id) || null;
  }
  if (!participant) {
    return { roomName, identity: id, participantFound: false, restored: false };
  }
  await setMicrophonePublishAllowed(svc, roomName, id, participant, true);
  return { roomName, identity: id, participantFound: true, restored: true };
}

export type VoiceAuthDecision =
  | { ok: true; canModerate: boolean }
  | { ok: false; status: number; error: string };

/**
 * Pure authorization decision after channel access is known.
 * A direct conversation can use voice only when the caller already passed channel access and sets allowDm.
 */
export function decideVoiceHuddleAccess(opts: {
  canAccessChannel: boolean;
  visibility: string | null | undefined;
  isChannelModerator: boolean;
  isChannelCreator: boolean;
  isBroadAdmin: boolean;
  allowDm?: boolean;
}): VoiceAuthDecision {
  if (!opts.canAccessChannel) {
    return { ok: false, status: 403, error: 'Forbidden: you cannot access this channel' };
  }
  const vis = String(opts.visibility || '').toLowerCase();
  if (vis === 'dm' && !opts.allowDm) {
    return { ok: false, status: 400, error: 'Voice Ka Links are not available for DMs yet' };
  }
  const canModerate =
    opts.isChannelModerator || opts.isChannelCreator || opts.isBroadAdmin;
  return { ok: true, canModerate };
}

function roomServiceClient(config: LiveKitServerConfig): RoomServiceClient {
  const host = config.url.replace(/^ws/i, 'http');
  return new RoomServiceClient(host, config.apiKey, config.apiSecret);
}

/** Room shape from LiveKit listRooms (subset used for repair decisions). */
export type VoiceRoomTimeoutLike = {
  emptyTimeout?: number | null;
  departureTimeout?: number | null;
  maxParticipants?: number | null;
  numParticipants?: number | null;
};

/**
 * True when an existing room has a dangerous short emptyTimeout
 * (client auto-create often uses 0 — 3rd joiner ICE blip deletes the room).
 */
export function voiceRoomNeedsTimeoutRepair(
  room: VoiceRoomTimeoutLike | null | undefined,
  minEmptyTimeoutSeconds: number = VOICE_ROOM_EMPTY_TIMEOUT_SECONDS
): boolean {
  if (!room) return false;
  const empty = Number(room.emptyTimeout);
  if (!Number.isFinite(empty)) return true;
  // Repair anything far below our 30-minute target (allow small clock skew).
  return empty < Math.max(60, Math.floor(minEmptyTimeoutSeconds * 0.5));
}

/** Only recreate when empty — never delete a room with live participants. */
export function shouldRecreateVoiceRoomForRepair(opts: {
  needsRepair: boolean;
  participantCount: number;
}): boolean {
  return Boolean(opts.needsRepair) && Math.max(0, Number(opts.participantCount) || 0) === 0;
}

function voiceRoomCreateOptions(roomName: string) {
  return {
    name: roomName,
    emptyTimeout: VOICE_ROOM_EMPTY_TIMEOUT_SECONDS,
    departureTimeout: VOICE_ROOM_DEPARTURE_TIMEOUT_SECONDS,
    maxParticipants: VOICE_ROOM_MAX_PARTICIPANTS,
  };
}

/**
 * Ensure the channel voice room exists with a long emptyTimeout.
 * Auto-created rooms from client connect often use emptyTimeout=0, so a brief
 * disconnect while a second participant joins deletes the room and kicks everyone.
 * When a bad empty room already exists, delete + recreate with safe timeouts.
 */
export async function ensureVoiceRoom(
  config: LiveKitServerConfig,
  channelId: string
): Promise<{ roomName: string; created: boolean; repaired: boolean }> {
  const roomName = voiceRoomNameForChannel(channelId);
  const svc = roomServiceClient(config);
  try {
    const rooms = await svc.listRooms([roomName]);
    const existing = (rooms || []).find((r) => String(r?.name || '') === roomName);
    if (existing) {
      const needsRepair = voiceRoomNeedsTimeoutRepair(existing as VoiceRoomTimeoutLike);
      const participantCount = Number(
        (existing as VoiceRoomTimeoutLike).numParticipants ?? 0
      );
      if (
        shouldRecreateVoiceRoomForRepair({
          needsRepair,
          participantCount,
        })
      ) {
        try {
          await svc.deleteRoom(roomName);
        } catch (delErr: any) {
          const delMsg = String(delErr?.message || delErr || '').toLowerCase();
          if (!delMsg.includes('not found') && !delMsg.includes('does not exist')) {
            console.warn('[ensureVoiceRoom] delete for repair failed', roomName, delErr?.message || delErr);
            return { roomName, created: false, repaired: false };
          }
        }
        try {
          await svc.createRoom(voiceRoomCreateOptions(roomName));
          return { roomName, created: true, repaired: true };
        } catch (createErr: any) {
          const msg = String(createErr?.message || createErr || '').toLowerCase();
          if (
            msg.includes('already') ||
            msg.includes('exist') ||
            createErr?.status === 409 ||
            createErr?.code === 'already_exists'
          ) {
            return { roomName, created: false, repaired: false };
          }
          throw createErr;
        }
      }
      if (needsRepair && participantCount > 0) {
        console.warn(
          '[ensureVoiceRoom] short emptyTimeout but room occupied — skip delete',
          roomName,
          { emptyTimeout: (existing as VoiceRoomTimeoutLike).emptyTimeout, participantCount }
        );
      }
      return { roomName, created: false, repaired: false };
    }
  } catch {
    /* list failed — still try create */
  }
  try {
    await svc.createRoom(voiceRoomCreateOptions(roomName));
    return { roomName, created: true, repaired: false };
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    // Concurrent create / already exists
    if (
      msg.includes('already') ||
      msg.includes('exist') ||
      err?.status === 409 ||
      err?.code === 'already_exists'
    ) {
      return { roomName, created: false, repaired: false };
    }
    throw err;
  }
}

/** Read session host/co-host roles from LiveKit room metadata (empty if room missing). */
export async function readHuddleRoomRoles(
  config: LiveKitServerConfig,
  channelId: string
): Promise<{ roomName: string; roles: HuddleRoomRoles; roomExists: boolean; metadata: string }> {
  const roomName = voiceRoomNameForChannel(channelId);
  const svc = roomServiceClient(config);
  try {
    const rooms = await svc.listRooms([roomName]);
    const room = (rooms || []).find((r) => String(r?.name || '') === roomName);
    if (!room) {
      return {
        roomName,
        roles: emptyHuddleRoomRoles(),
        roomExists: false,
        metadata: '',
      };
    }
    const metadata = String((room as { metadata?: string }).metadata || '');
    return {
      roomName,
      roles: parseHuddleRoomRoles(metadata),
      roomExists: true,
      metadata,
    };
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
      return {
        roomName,
        roles: emptyHuddleRoomRoles(),
        roomExists: false,
        metadata: '',
      };
    }
    throw err;
  }
}

export async function writeHuddleRoomRoles(
  config: LiveKitServerConfig,
  channelId: string,
  roles: HuddleRoomRoles,
  existingMetadata?: string
): Promise<{ roomName: string; roles: HuddleRoomRoles }> {
  const roomName = voiceRoomNameForChannel(channelId);
  const svc = roomServiceClient(config);
  let meta = existingMetadata;
  if (meta == null) {
    const current = await readHuddleRoomRoles(config, channelId);
    if (!current.roomExists) {
      // Create empty room so metadata can persist before first client join completes.
      await svc.createRoom({
        name: roomName,
        emptyTimeout: VOICE_ROOM_EMPTY_TIMEOUT_SECONDS,
        departureTimeout: VOICE_ROOM_DEPARTURE_TIMEOUT_SECONDS,
        maxParticipants: VOICE_ROOM_MAX_PARTICIPANTS,
      });
      meta = '';
    } else {
      meta = current.metadata;
    }
  }
  const metadata = buildHuddleRoomRolesMetadata(meta, roles);
  await svc.updateRoomMetadata(roomName, metadata);
  return { roomName, roles: parseHuddleRoomRoles(metadata) };
}

/** Channel canModerate OR session host/co-host from room metadata. */
export async function resolveVoiceCanModerate(
  config: LiveKitServerConfig,
  channelId: string,
  userId: string,
  channelCanModerate: boolean
): Promise<{ canModerate: boolean; roles: HuddleRoomRoles }> {
  const { roles } = await readHuddleRoomRoles(config, channelId);
  return {
    canModerate: mergeSessionCanModerate({
      channelCanModerate,
      roles,
      userId,
    }),
    roles,
  };
}

/**
 * Mark session MOD on participant metadata (preserves hand-raise fields).
 * Mute/end APIs authorize via room roles; metadata drives peer Mod badges.
 * (LiveKit ParticipantPermission has no roomAdmin — that is token-only.)
 */
export async function grantHuddleModParticipant(
  config: LiveKitServerConfig,
  channelId: string,
  targetIdentity: string,
  huddleMod: boolean
): Promise<void> {
  const identity = String(targetIdentity || '').trim();
  if (!identity) return;
  const roomName = voiceRoomNameForChannel(channelId);
  const svc = roomServiceClient(config);
  let existingMeta = '';
  try {
    const p = await svc.getParticipant(roomName, identity);
    existingMeta = String(p?.metadata || '');
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
      return;
    }
    throw err;
  }
  const metadata = mergeHuddleModParticipantMetadata(existingMeta, huddleMod);
  await svc.updateParticipant(roomName, identity, { metadata });
}

export async function applyVoiceHuddleModAction(
  config: LiveKitServerConfig,
  opts: {
    channelId: string;
    actorId: string;
    targetUserId?: string | null;
    action: HuddleModAction;
    channelCanModerate: boolean;
  }
): Promise<
  | { ok: true; roles: HuddleRoomRoles; canModerate: boolean }
  | { ok: false; status: number; error: string }
> {
  const channelId = String(opts.channelId || '').trim();
  const actorId = String(opts.actorId || '').trim();
  const targetUserId = String(opts.targetUserId || '').trim();
  if (!channelId || !actorId) {
    return { ok: false, status: 400, error: 'channelId and actor are required' };
  }

  const current = await readHuddleRoomRoles(config, channelId);
  const actorIsSessionMod = isHuddleSessionModerator(current.roles, actorId);
  const actorMayAct = opts.channelCanModerate || actorIsSessionMod;

  if (opts.action === 'claim') {
    // Empty host seat: any channel member who can join voice may claim (huddle starter).
    // Seat already taken: only channel/session mods may call claim (no-op when host set).
    if (current.roles.hostId && !actorMayAct) {
      return { ok: false, status: 403, error: 'Host already claimed' };
    }
  } else if (!actorMayAct) {
    return { ok: false, status: 403, error: 'Forbidden: only Ka Link moderators can manage MOD' };
  }

  if (opts.action === 'add' || opts.action === 'pass') {
    if (!targetUserId) {
      return { ok: false, status: 400, error: 'targetUserId is required' };
    }
    const svc = roomServiceClient(config);
    try {
      await svc.getParticipant(current.roomName, targetUserId);
    } catch (err: any) {
      const msg = String(err?.message || err || '').toLowerCase();
      if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
        return { ok: false, status: 404, error: 'Target participant is not in the Ka Link' };
      }
      throw err;
    }
  }

  const applied = applyHuddleModAction(current.roles, {
    action: opts.action,
    actorId,
    targetId: targetUserId || null,
  });
  if (applied.ok === false) {
    return { ok: false, status: 400, error: applied.error };
  }

  const written = await writeHuddleRoomRoles(
    config,
    channelId,
    applied.roles,
    current.roomExists ? current.metadata : undefined
  );

  const modIds = new Set<string>();
  if (written.roles.hostId) modIds.add(written.roles.hostId);
  for (const id of written.roles.coHostIds) modIds.add(id);

  if (opts.action === 'add' || opts.action === 'pass') {
    await grantHuddleModParticipant(config, channelId, targetUserId, true);
  }
  if (opts.action === 'claim') {
    await grantHuddleModParticipant(config, channelId, actorId, true);
  }
  // Refresh badges for all known mods (best-effort)
  for (const id of modIds) {
    try {
      await grantHuddleModParticipant(config, channelId, id, true);
    } catch {
      /* participant may have left */
    }
  }

  return {
    ok: true,
    roles: written.roles,
    canModerate: mergeSessionCanModerate({
      channelCanModerate: opts.channelCanModerate,
      roles: written.roles,
      userId: actorId,
    }),
  };
}

export type { HuddleRoomRoles, HuddleModAction };


/* ------------------------------------------------------------------ */
/* Phase 2 moderator tools (Nov 2026): mic lock, lower all hands,      */
/* allow-to-speak, Bible readers, remove / block.                      */
/* ------------------------------------------------------------------ */

function isNotFoundError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('not found') || msg.includes('does not exist') || err?.status === 404;
}

/** Stage rules (mic lock, readers, blocked) for the live room. Empty when no room. */
export async function readHuddleStage(
  config: LiveKitServerConfig,
  channelId: string
): Promise<{ stage: HuddleStage; roles: HuddleRoomRoles; metadata: string; roomExists: boolean }> {
  const current = await readHuddleRoomRoles(config, channelId);
  return {
    stage: parseHuddleStage(current.metadata),
    roles: current.roles,
    metadata: current.metadata,
    roomExists: current.roomExists,
  };
}

export async function writeHuddleStage(
  config: LiveKitServerConfig,
  channelId: string,
  stage: HuddleStage,
  existingMetadata: string
): Promise<HuddleStage> {
  const roomName = voiceRoomNameForChannel(channelId);
  const metadata = buildHuddleStageMetadata(existingMetadata, stage);
  await roomServiceClient(config).updateRoomMetadata(roomName, metadata);
  return parseHuddleStage(metadata);
}

/**
 * Give or take a member's microphone permission.
 * Taking it also silences any open mic. Giving it back does NOT open their mic —
 * they unmute themselves when ready.
 */
export async function setParticipantMicrophoneAllowed(
  config: LiveKitServerConfig,
  channelId: string,
  targetIdentity: string,
  allow: boolean
): Promise<{ participantFound: boolean }> {
  const identity = String(targetIdentity || '').trim();
  if (!identity) throw new Error('targetIdentity is required');
  const roomName = voiceRoomNameForChannel(channelId);
  const svc = roomServiceClient(config);
  let participant: Awaited<ReturnType<RoomServiceClient['getParticipant']>> | null = null;
  try {
    participant = await svc.getParticipant(roomName, identity);
  } catch (err: any) {
    if (!isNotFoundError(err)) throw err;
    return { participantFound: false };
  }
  if (!allow) {
    for (const sid of selectMicrophoneTrackSids(participant?.tracks)) {
      try {
        await svc.mutePublishedTrack(roomName, identity, sid, true);
      } catch {
        /* track may be gone */
      }
    }
  }
  await setMicrophonePublishAllowed(svc, roomName, identity, participant, allow);
  return { participantFound: true };
}

/**
 * Lock or unlock everyone's mic at once. People in `exemptIds` (host, co-hosts,
 * channel moderators, Bible readers) keep their mic.
 */
export async function applyHuddleMicLock(
  config: LiveKitServerConfig,
  channelId: string,
  locked: boolean,
  exemptIds: Set<string>
): Promise<{ changed: number }> {
  const roomName = voiceRoomNameForChannel(channelId);
  const svc = roomServiceClient(config);
  const participants = await svc.listParticipants(roomName).catch(() => []);
  let changed = 0;
  for (const p of participants || []) {
    const identity = String(p?.identity || '');
    if (!identity || identity.startsWith('plcc-sanctum-bridge') || exemptIds.has(identity)) continue;
    try {
      if (locked) {
        for (const sid of selectMicrophoneTrackSids(p?.tracks)) {
          await svc.mutePublishedTrack(roomName, identity, sid, true).catch(() => undefined);
        }
      }
      await setMicrophonePublishAllowed(svc, roomName, identity, p, !locked);
      changed += 1;
    } catch (err: any) {
      console.warn('[huddle mic lock]', identity, err?.message || err);
    }
  }
  return { changed };
}

/** Lower every raised hand in the room (#7). */
export async function lowerAllHuddleHands(
  config: LiveKitServerConfig,
  channelId: string
): Promise<{ lowered: number }> {
  const roomName = voiceRoomNameForChannel(channelId);
  const svc = roomServiceClient(config);
  const participants = await svc.listParticipants(roomName).catch(() => []);
  let lowered = 0;
  for (const p of participants || []) {
    const meta = String(p?.metadata || '');
    let raised = false;
    try {
      raised = Boolean(JSON.parse(meta || '{}')?.handRaised);
    } catch {
      raised = false;
    }
    if (!raised) continue;
    try {
      await svc.updateParticipant(roomName, String(p.identity), { metadata: buildLowerHandMetadata(meta) });
      lowered += 1;
    } catch (err: any) {
      if (!isNotFoundError(err)) console.warn('[huddle lower all]', err?.message || err);
    }
  }
  return { lowered };
}

/** Take someone out of the live Ka Link (#16). */
export async function removeHuddleParticipant(
  config: LiveKitServerConfig,
  channelId: string,
  targetIdentity: string
): Promise<{ removed: boolean }> {
  const identity = String(targetIdentity || '').trim();
  if (!identity) throw new Error('targetIdentity is required');
  try {
    await roomServiceClient(config).removeParticipant(voiceRoomNameForChannel(channelId), identity);
    return { removed: true };
  } catch (err: any) {
    if (isNotFoundError(err)) return { removed: false };
    throw err;
  }
}

/** Topic the apps listen on for a moderator's warning / block notice (member conduct, Nov 19 2026). */
export const HUDDLE_CONDUCT_TOPIC = 'plcc.conduct';

/** Send a warning or block notice to one person in a live Ka Link. Fail-soft. */
export async function sendHuddleConductNotice(
  config: LiveKitServerConfig,
  channelId: string,
  identity: string,
  notice: { t: 'warn' | 'block'; reason?: string | null; by?: string | null }
): Promise<boolean> {
  try {
    const data = new TextEncoder().encode(JSON.stringify({ v: 1, ...notice }));
    await roomServiceClient(config).sendData(voiceRoomNameForChannel(channelId), data, DataPacket_Kind.RELIABLE, {
      destinationIdentities: [identity],
      topic: HUDDLE_CONDUCT_TOPIC,
    });
    return true;
  } catch (err: any) {
    if (!isNotFoundError(err)) console.warn('[conduct notice]', err?.message || err);
    return false;
  }
}

/** Take a blocked member out of every live Ka Link (they may be in more than one). */
export async function removeFromAllHuddles(config: LiveKitServerConfig, identity: string): Promise<number> {
  const svc = roomServiceClient(config);
  let removed = 0;
  try {
    const rooms = await svc.listRooms();
    for (const room of rooms || []) {
      if (!channelIdFromVoiceRoomName(String(room.name || ''))) continue;
      try {
        await svc.removeParticipant(String(room.name), identity);
        removed += 1;
      } catch (err: any) {
        if (!isNotFoundError(err)) console.warn('[conduct remove]', err?.message || err);
      }
    }
  } catch (err: any) {
    console.warn('[conduct remove] list rooms failed', err?.message || err);
  }
  return removed;
}
