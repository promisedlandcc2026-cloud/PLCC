/**
 * Family Huddle — LiveKit rooms keyed by household id (not chat channel).
 * Secrets never leave the server. Room: awc-family-{householdId}
 */
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import {
  getLiveKitServerConfig,
  type LiveKitServerConfig,
  VOICE_ROOM_DEPARTURE_TIMEOUT_SECONDS,
  VOICE_ROOM_EMPTY_TIMEOUT_SECONDS,
  VOICE_ROOM_MAX_PARTICIPANTS,
  VOICE_TOKEN_TTL_SECONDS,
} from './livekitVoice.js';

export const FAMILY_VOICE_ROOM_PREFIX = 'awc-family-';
/** Family rooms stay smaller than community channels. */
export const FAMILY_VOICE_MAX_PARTICIPANTS = 16;

export function voiceRoomNameForHousehold(householdId: string): string {
  const id = String(householdId || '').trim();
  if (!id) throw new Error('householdId is required for family voice room name');
  return `${FAMILY_VOICE_ROOM_PREFIX}${id}`;
}

export function householdIdFromFamilyVoiceRoomName(roomName: string): string | null {
  const name = String(roomName || '');
  if (!name.startsWith(FAMILY_VOICE_ROOM_PREFIX)) return null;
  const id = name.slice(FAMILY_VOICE_ROOM_PREFIX.length).trim();
  return id || null;
}

function roomServiceClient(config: LiveKitServerConfig): RoomServiceClient {
  const host = config.url.replace(/^ws/i, 'http');
  return new RoomServiceClient(host, config.apiKey, config.apiSecret);
}

export async function ensureFamilyVoiceRoom(
  config: LiveKitServerConfig,
  householdId: string
): Promise<{ roomName: string; created: boolean }> {
  const roomName = voiceRoomNameForHousehold(householdId);
  const svc = roomServiceClient(config);
  try {
    const rooms = await svc.listRooms([roomName]);
    const exists = (rooms || []).some((r) => String(r?.name || '') === roomName);
    if (exists) return { roomName, created: false };
  } catch {
    /* try create */
  }
  try {
    await svc.createRoom({
      name: roomName,
      emptyTimeout: VOICE_ROOM_EMPTY_TIMEOUT_SECONDS,
      departureTimeout: VOICE_ROOM_DEPARTURE_TIMEOUT_SECONDS,
      maxParticipants: FAMILY_VOICE_MAX_PARTICIPANTS,
    });
    return { roomName, created: true };
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('already exists') || msg.includes('conflict')) {
      return { roomName, created: false };
    }
    throw err;
  }
}

export async function listFamilyVoiceStatus(
  config: LiveKitServerConfig,
  householdId: string
): Promise<{ roomName: string; active: boolean; participantCount: number }> {
  const roomName = voiceRoomNameForHousehold(householdId);
  const svc = roomServiceClient(config);
  try {
    const participants = await svc.listParticipants(roomName);
    const count = Array.isArray(participants) ? participants.length : 0;
    return { roomName, active: count > 0, participantCount: count };
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
      return { roomName, active: false, participantCount: 0 };
    }
    throw err;
  }
}

export async function endFamilyVoiceRoom(
  config: LiveKitServerConfig,
  householdId: string,
  timeoutMs = 12_000
): Promise<{ roomName: string; ended: boolean }> {
  const roomName = voiceRoomNameForHousehold(householdId);
  const svc = roomServiceClient(config);
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
          () => reject(new Error('Timed out ending the family LiveKit room')),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type FamilyVoiceTokenInput = {
  identity: string;
  displayName: string;
  householdId: string;
  /** Household adults can end for everyone. */
  canModerate: boolean;
  ttlSeconds?: number;
};

export function planFamilyVoiceAccessToken(input: FamilyVoiceTokenInput) {
  const identity = String(input.identity || '').trim();
  const householdId = String(input.householdId || '').trim();
  if (!identity) throw new Error('identity is required');
  if (!householdId) throw new Error('householdId is required');
  const roomName = voiceRoomNameForHousehold(householdId);
  const ttlSeconds = Math.min(
    Math.max(input.ttlSeconds ?? VOICE_TOKEN_TTL_SECONDS, 60),
    60 * 60 * 6
  );
  return {
    identity,
    name: String(input.displayName || '').trim() || 'Family',
    roomName,
    ttlSeconds,
    grant: {
      roomJoin: true as const,
      room: roomName,
      canPublish: true as const,
      canSubscribe: true as const,
      canPublishData: true as const,
      canUpdateOwnMetadata: true as const,
      roomAdmin: Boolean(input.canModerate),
    },
  };
}

export async function mintFamilyVoiceAccessToken(
  config: LiveKitServerConfig,
  input: FamilyVoiceTokenInput
): Promise<{ token: string; url: string; roomName: string; expiresIn: number }> {
  const plan = planFamilyVoiceAccessToken(input);
  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity: plan.identity,
    name: plan.name,
    ttl: plan.ttlSeconds,
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

export { getLiveKitServerConfig };
