/**
 * Private calls (WhatsApp-style) between the two people in a direct message.
 *
 * Audio or video, open to every approved member (video too). Each call is its
 * own LiveKit room ("plcc-call-<dm channel id>"), never a prayer room, so the
 * prayer-room webhook, attendance and "Ka Link started" alerts all skip it.
 *
 * Ringing: the caller joins the call room, then the Vault pings the other
 * person on their private call topic (Supabase Realtime, HMAC of their user
 * id, handed only to them) and sends a phone alert. The room's metadata says
 * who is calling and whether it is a video call, so a phone that opens from
 * the alert can still see the call is ringing ("status").
 *
 * Rules: both people must be in the DM, nobody blocked the other, and a member
 * blocked for conduct can't call.
 */
import { createHmac } from 'node:crypto';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { LiveKitServerConfig } from './livekitVoice.js';

export const DM_CALL_ROOM_PREFIX = 'plcc-call-';
/** How long a call rings before the caller's app gives up. */
export const DM_CALL_RING_SECONDS = 45;
/** Empty call rooms close quickly (the room holds nothing worth keeping). */
export const DM_CALL_EMPTY_TIMEOUT_SECONDS = 60;
export const DM_CALL_TOKEN_TTL_SECONDS = 3 * 60 * 60;

export type DmCallAction = 'inbox' | 'ring' | 'join' | 'decline' | 'end' | 'status';
export type DmCallCommand = { action: DmCallAction; channelId: string | null; video: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dmCallRoomName(channelId: string): string {
  const id = String(channelId || '').trim();
  if (!UUID_RE.test(id)) throw new Error('channelId is required for a call room');
  return `${DM_CALL_ROOM_PREFIX}${id}`;
}

function topicSecret(): string {
  return String(process.env.CHAT_REALTIME_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

/** Unguessable per-person topic for incoming calls. Empty when the server has no secret. */
export function callInboxTopic(userId: string, secret = topicSecret()): string {
  if (!secret || !userId) return '';
  const mac = createHmac('sha256', secret).update(`plcc-call-inbox:${userId}`).digest('hex').slice(0, 32);
  return `plcc-call-${mac}`;
}

/** Pure: validate what the app sent. */
export function parseDmCallCommand(raw: unknown): { ok: true; cmd: DmCallCommand } | { ok: false; error: string } {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const action = String(b?.action || '') as DmCallAction;
  if (!['inbox', 'ring', 'join', 'decline', 'end', 'status'].includes(action)) {
    return { ok: false, error: 'That call request was not valid.' };
  }
  if (action === 'inbox') return { ok: true, cmd: { action, channelId: null, video: false } };
  const channelId = String(b?.channelId || '').trim();
  if (!UUID_RE.test(channelId)) return { ok: false, error: 'Pick the chat first.' };
  return { ok: true, cmd: { action, channelId, video: action === 'ring' && b?.video === true } };
}

export type DmCallMeta = { callerId: string; callerName: string; video: boolean; startedAt: number };

export function buildDmCallMetadata(meta: DmCallMeta): string {
  return JSON.stringify({ plccCall: 1, ...meta });
}

export function parseDmCallMetadata(raw: unknown): DmCallMeta | null {
  try {
    const m = JSON.parse(String(raw || ''));
    if (!m || m.plccCall !== 1 || !m.callerId) return null;
    return {
      callerId: String(m.callerId),
      callerName: String(m.callerName || 'Someone'),
      video: m.video === true,
      startedAt: Number(m.startedAt) || 0,
    };
  } catch {
    return null;
  }
}

/** Pure: the join pass. Both people may use mic and camera (video calls are for everyone). */
export function planDmCallToken(input: { userId: string; displayName: string; channelId: string }) {
  const roomName = dmCallRoomName(input.channelId);
  return {
    identity: String(input.userId),
    name: String(input.displayName || '').trim() || 'Member',
    roomName,
    ttlSeconds: DM_CALL_TOKEN_TTL_SECONDS,
    grant: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA],
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
      roomAdmin: false,
    },
  };
}

/** Pure: phone alert for an incoming call. */
export function dmCallAlertFor(opts: { callerName: string; channelId: string; video: boolean }) {
  const who = String(opts.callerName || 'Someone').trim() || 'Someone';
  return {
    title: opts.video ? `🎥 ${who} is video calling you` : `📞 ${who} is calling you`,
    body: 'Tap to answer.',
    url: `/community/chat/${opts.channelId}?call=answer`,
    tag: `call:${opts.channelId}`,
  };
}

/** Pure: the note left in the chat ("Voice call" / "Video call"), like WhatsApp's call bubbles. */
export function dmCallNote(video: boolean): string {
  return video ? '🎥 Video call' : '📞 Voice call';
}

/** Pure: is the call still ringing for me (caller there, me not yet)? */
export function decideDmCallStatus(opts: {
  meta: DmCallMeta | null;
  participantIds: string[];
  userId: string;
}): { active: boolean; ringing: boolean; video: boolean; callerId: string | null; callerName: string | null } {
  const ids = opts.participantIds.map(String);
  const meta = opts.meta;
  if (!meta || !ids.length) return { active: false, ringing: false, video: false, callerId: null, callerName: null };
  const callerHere = ids.includes(meta.callerId);
  const meHere = ids.includes(opts.userId);
  const ringing =
    callerHere &&
    meta.callerId !== opts.userId &&
    !meHere &&
    ids.length === 1 &&
    (!meta.startedAt || Date.now() - meta.startedAt < (DM_CALL_RING_SECONDS + 15) * 1000);
  return { active: true, ringing, video: meta.video, callerId: meta.callerId, callerName: meta.callerName };
}

export type DmCallContext = {
  userId: string;
  displayName: string;
  lk: LiveKitServerConfig | null;
  /** DM access check: the channel, or why not. */
  loadChannel: (channelId: string) => Promise<{ ok: true; channel: any } | { ok: false; status: number; error: string }>;
  partnerOf: (channel: any, userId: string) => string | null;
  blockStatus: (partnerId: string) => Promise<'none' | 'i_blocked' | 'blocked_me'>;
  memberBlocked: () => Promise<boolean>;
  broadcast: (topic: string, event: string, payload: Record<string, string>) => Promise<unknown>;
  push: (userIds: string[], msg: { title: string; body: string; url: string; tag: string }) => Promise<unknown>;
  postNote: (channelId: string, content: string) => Promise<unknown>;
  /** Fire-and-forget work that runs after the reply. */
  later: (p: Promise<unknown>) => void;
  /** Tests swap LiveKit out. */
  rooms?: DmCallRooms;
};

export type DmCallRooms = {
  create: (name: string, metadata: string) => Promise<void>;
  read: (name: string) => Promise<{ metadata: string; participantIds: string[] } | null>;
  remove: (name: string) => Promise<void>;
  mint: (plan: ReturnType<typeof planDmCallToken>) => Promise<string>;
};

export function liveKitDmCallRooms(lk: LiveKitServerConfig): DmCallRooms {
  const svc = new RoomServiceClient(lk.url.replace(/^ws/i, 'http'), lk.apiKey, lk.apiSecret);
  return {
    create: async (name, metadata) => {
      await svc.createRoom({
        name,
        emptyTimeout: DM_CALL_EMPTY_TIMEOUT_SECONDS,
        departureTimeout: 20,
        maxParticipants: 4,
        metadata,
      });
      // createRoom keeps an existing room's metadata; set it so a new ring is current.
      await svc.updateRoomMetadata(name, metadata).catch(() => {});
    },
    read: async (name) => {
      const rooms = await svc.listRooms([name]).catch(() => []);
      const room = Array.isArray(rooms) ? rooms.find((r: any) => r?.name === name) : null;
      if (!room) return null;
      const people = await svc.listParticipants(name).catch(() => []);
      return {
        metadata: String((room as any).metadata || ''),
        participantIds: (Array.isArray(people) ? people : []).map((p: any) => String(p?.identity || '')).filter(Boolean),
      };
    },
    remove: async (name) => {
      await svc.deleteRoom(name).catch(() => {});
    },
    mint: async (plan) => {
      const at = new AccessToken(lk.apiKey, lk.apiSecret, { identity: plan.identity, name: plan.name, ttl: plan.ttlSeconds });
      at.addGrant(plan.grant);
      return at.toJwt();
    },
  };
}

type Reply = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string, code?: string): Reply => ({ status, body: { ok: false, error, ...(code ? { code } : {}) } });

export async function handleDmCall(cmd: DmCallCommand, ctx: DmCallContext): Promise<Reply> {
  if (cmd.action === 'inbox') {
    const topic = callInboxTopic(ctx.userId);
    return { status: 200, body: { ok: true, topic: topic || null, ringSeconds: DM_CALL_RING_SECONDS } };
  }
  if (!ctx.lk) return fail(503, 'Calls are not available right now.');
  const rooms = ctx.rooms || liveKitDmCallRooms(ctx.lk);
  const channelId = String(cmd.channelId);
  const gate = await ctx.loadChannel(channelId);
  if (gate.ok === false) return fail(gate.status, gate.error);
  const partnerId = ctx.partnerOf(gate.channel, ctx.userId);
  if (!partnerId) return fail(400, 'Calls are only for private chats.');
  const roomName = dmCallRoomName(channelId);
  const partnerTopic = callInboxTopic(partnerId);
  const myTopic = callInboxTopic(ctx.userId);

  if (cmd.action === 'decline' || cmd.action === 'end') {
    const reason = cmd.action === 'decline' ? 'declined' : 'ended';
    const payload = { channelId, by: ctx.userId, reason };
    if (partnerTopic) ctx.later(ctx.broadcast(partnerTopic, 'ended', payload));
    // My other phones stop ringing too.
    if (myTopic) ctx.later(ctx.broadcast(myTopic, 'ended', payload));
    if (cmd.action === 'end') await rooms.remove(roomName);
    return { status: 200, body: { ok: true, channelId, reason } };
  }

  if (cmd.action === 'status') {
    const room = await rooms.read(roomName);
    const status = decideDmCallStatus({
      meta: room ? parseDmCallMetadata(room.metadata) : null,
      participantIds: room?.participantIds || [],
      userId: ctx.userId,
    });
    return { status: 200, body: { ok: true, channelId, ...status } };
  }

  // ring / join need a working pass.
  if (await ctx.memberBlocked()) return fail(403, 'You can’t make calls right now. A leader paused your account.', 'member_blocked');
  const block = await ctx.blockStatus(partnerId);
  if (block === 'i_blocked') return fail(403, 'You blocked this person. Unblock them to call.', 'call_blocked');
  if (block === 'blocked_me') return fail(403, 'You can’t call this person.', 'call_blocked');

  const plan = planDmCallToken({ userId: ctx.userId, displayName: ctx.displayName, channelId });

  if (cmd.action === 'join') {
    const room = await rooms.read(roomName);
    const meta = room ? parseDmCallMetadata(room.metadata) : null;
    if (!room || !meta || !room.participantIds.length) return fail(410, 'This call has ended.', 'call_ended');
    const token = await rooms.mint(plan);
    // Stop my other phones ringing.
    if (myTopic) ctx.later(ctx.broadcast(myTopic, 'answered', { channelId }));
    return {
      status: 200,
      body: { ok: true, token, url: ctx.lk.url, roomName, channelId, partnerId, video: meta.video, callerId: meta.callerId },
    };
  }

  // ring
  const meta: DmCallMeta = { callerId: ctx.userId, callerName: ctx.displayName, video: cmd.video, startedAt: Date.now() };
  const existing = await rooms.read(roomName);
  const existingMeta = existing ? parseDmCallMetadata(existing.metadata) : null;
  if (existing && existingMeta && existing.participantIds.includes(partnerId) && existingMeta.callerId === partnerId) {
    // They are calling me right now: answer theirs instead of ringing back over it.
    return fail(409, 'They are calling you right now.', 'call_incoming');
  }
  await rooms.create(roomName, buildDmCallMetadata(meta));
  const token = await rooms.mint(plan);
  if (partnerTopic) {
    ctx.later(
      ctx.broadcast(partnerTopic, 'ring', {
        channelId,
        callerId: ctx.userId,
        callerName: ctx.displayName,
        video: cmd.video ? '1' : '0',
      })
    );
  }
  ctx.later(ctx.push([partnerId], dmCallAlertFor({ callerName: ctx.displayName, channelId, video: cmd.video })));
  ctx.later(ctx.postNote(channelId, dmCallNote(cmd.video)));
  return {
    status: 200,
    body: { ok: true, token, url: ctx.lk.url, roomName, channelId, partnerId, video: cmd.video, ringSeconds: DM_CALL_RING_SECONDS },
  };
}
