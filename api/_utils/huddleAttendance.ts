/**
 * Community voice huddle attendance — persist join/leave from LiveKit webhooks
 * and serve Pastor/staff rosters (live + history).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { RoomServiceClient } from 'livekit-server-sdk';
import {
  channelIdFromVoiceRoomName,
  getLiveKitServerConfig,
  voiceRoomNameForChannel,
  type LiveKitServerConfig,
} from './livekitVoice.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roles that may view named huddle attendance (plan lock). */
export const HUDDLE_ATTENDANCE_VIEW_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'ADMIN',
  'MINISTRY_LEADER',
]);

export function canViewHuddleAttendance(role: string | null | undefined): boolean {
  return HUDDLE_ATTENDANCE_VIEW_ROLES.has(String(role || '').toUpperCase());
}

export function isHuddleAttendanceWebhookEvent(eventName: string): boolean {
  const e = String(eventName || '').trim();
  return (
    e === 'room_started' ||
    e === 'participant_joined' ||
    e === 'participant_left' ||
    e === 'room_finished'
  );
}

export type HuddleAttendancePerson = {
  identity: string;
  userId: string | null;
  displayName: string;
  joinedAt: string | null;
  leftAt: string | null;
  present: boolean;
};

export type HuddleAttendanceSessionPayload = {
  id: string;
  channelId: string;
  roomName: string;
  roomSid: string | null;
  startedAt: string;
  endedAt: string | null;
  attendeeCount: number;
  attendees: HuddleAttendancePerson[];
};

function asUuidOrNull(v: unknown): string | null {
  const s = String(v || '').trim();
  return UUID_RE.test(s) ? s : null;
}

function displayFromParticipant(p: {
  identity?: string;
  name?: string;
  metadata?: string;
}): string {
  const name = String(p?.name || '').trim();
  if (name) return name;
  const id = String(p?.identity || '').trim();
  if (id && UUID_RE.test(id)) return 'Member';
  return id || 'Participant';
}

async function findOpenSession(
  supabase: SupabaseClient,
  channelId: string,
  roomSid?: string | null
): Promise<any | null> {
  const sid = String(roomSid || '').trim();
  if (sid) {
    const { data } = await supabase
      .from('community_huddle_sessions')
      .select('*')
      .eq('room_sid', sid)
      .maybeSingle();
    if (data) return data;
  }
  const { data: open } = await supabase
    .from('community_huddle_sessions')
    .select('*')
    .eq('channel_id', channelId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return open || null;
}

export async function ensureHuddleSession(opts: {
  supabase: SupabaseClient;
  channelId: string;
  roomName: string;
  roomSid?: string | null;
  startedAt?: string | null;
}): Promise<{ session: any | null; created: boolean; error?: string }> {
  const channelId = String(opts.channelId || '').trim();
  const roomName = String(opts.roomName || '').trim() || voiceRoomNameForChannel(channelId);
  const roomSid = String(opts.roomSid || '').trim() || null;
  if (!channelId || !UUID_RE.test(channelId)) {
    return { session: null, created: false, error: 'invalid_channel' };
  }

  const existing = await findOpenSession(opts.supabase, channelId, roomSid);
  if (existing) {
    if (roomSid && !existing.room_sid) {
      await opts.supabase
        .from('community_huddle_sessions')
        .update({ room_sid: roomSid })
        .eq('id', existing.id);
      return { session: { ...existing, room_sid: roomSid }, created: false };
    }
    return { session: existing, created: false };
  }

  const row = {
    channel_id: channelId,
    room_name: roomName,
    room_sid: roomSid,
    started_at: opts.startedAt || new Date().toISOString(),
  };
  const { data, error } = await opts.supabase
    .from('community_huddle_sessions')
    .insert([row])
    .select('*')
    .single();
  if (error) {
    // Unique race on room_sid
    if (roomSid) {
      const again = await findOpenSession(opts.supabase, channelId, roomSid);
      if (again) return { session: again, created: false };
    }
    console.warn('[huddle-attendance] ensure session failed', error.message || error);
    return { session: null, created: false, error: error.message };
  }
  return { session: data, created: true };
}

export async function recordParticipantJoined(opts: {
  supabase: SupabaseClient;
  channelId: string;
  roomName: string;
  roomSid?: string | null;
  identity: string;
  displayName?: string | null;
  joinedAt?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const identity = String(opts.identity || '').trim();
  if (!identity) return { ok: false, reason: 'missing_identity' };

  const ensured = await ensureHuddleSession({
    supabase: opts.supabase,
    channelId: opts.channelId,
    roomName: opts.roomName,
    roomSid: opts.roomSid,
  });
  if (!ensured.session) return { ok: false, reason: ensured.error || 'no_session' };

  const userId = asUuidOrNull(identity);
  const displayName =
    String(opts.displayName || '').trim() ||
    (userId ? 'Member' : identity) ||
    'Participant';
  const joinedAt = opts.joinedAt || new Date().toISOString();

  const { error } = await opts.supabase.from('community_huddle_attendance').upsert(
    {
      session_id: ensured.session.id,
      identity,
      user_id: userId,
      display_name: displayName,
      joined_at: joinedAt,
      left_at: null,
    },
    { onConflict: 'session_id,identity' }
  );
  if (error) {
    console.warn('[huddle-attendance] join upsert failed', error.message || error);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

export async function recordParticipantLeft(opts: {
  supabase: SupabaseClient;
  channelId: string;
  roomSid?: string | null;
  identity: string;
  leftAt?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const identity = String(opts.identity || '').trim();
  if (!identity) return { ok: false, reason: 'missing_identity' };

  const session = await findOpenSession(opts.supabase, opts.channelId, opts.roomSid);
  if (!session) return { ok: false, reason: 'no_open_session' };

  const { error } = await opts.supabase
    .from('community_huddle_attendance')
    .update({ left_at: opts.leftAt || new Date().toISOString() })
    .eq('session_id', session.id)
    .eq('identity', identity)
    .is('left_at', null);
  if (error) {
    console.warn('[huddle-attendance] leave update failed', error.message || error);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

export async function endHuddleSession(opts: {
  supabase: SupabaseClient;
  channelId: string;
  roomSid?: string | null;
  endedAt?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const session = await findOpenSession(opts.supabase, opts.channelId, opts.roomSid);
  if (!session) return { ok: true, reason: 'already_ended' };

  const endedAt = opts.endedAt || new Date().toISOString();
  const { error } = await opts.supabase
    .from('community_huddle_sessions')
    .update({ ended_at: endedAt })
    .eq('id', session.id);
  if (error) {
    console.warn('[huddle-attendance] end session failed', error.message || error);
    return { ok: false, reason: error.message };
  }

  await opts.supabase
    .from('community_huddle_attendance')
    .update({ left_at: endedAt })
    .eq('session_id', session.id)
    .is('left_at', null);

  return { ok: true };
}

/**
 * Handle LiveKit webhook events for attendance persistence.
 * Fail-soft: never throws.
 */
export async function handleHuddleAttendanceWebhookEvent(opts: {
  supabase: SupabaseClient;
  eventName: string;
  roomName: string;
  roomSid?: string | null;
  participant?: { identity?: string; name?: string } | null;
}): Promise<{ ok: boolean; handled: boolean; reason?: string }> {
  try {
    const eventName = String(opts.eventName || '').trim();
    if (!isHuddleAttendanceWebhookEvent(eventName)) {
      return { ok: true, handled: false, reason: 'ignored_event' };
    }
    const channelId = channelIdFromVoiceRoomName(opts.roomName);
    if (!channelId || !UUID_RE.test(channelId)) {
      return { ok: true, handled: false, reason: 'not_voice_room' };
    }

    if (eventName === 'room_started') {
      const r = await ensureHuddleSession({
        supabase: opts.supabase,
        channelId,
        roomName: opts.roomName,
        roomSid: opts.roomSid,
      });
      return { ok: Boolean(r.session), handled: true, reason: r.error };
    }

    if (eventName === 'room_finished') {
      const r = await endHuddleSession({
        supabase: opts.supabase,
        channelId,
        roomSid: opts.roomSid,
      });
      return { ok: r.ok, handled: true, reason: r.reason };
    }

    const identity = String(opts.participant?.identity || '').trim();
    if (!identity) return { ok: true, handled: false, reason: 'no_participant' };

    if (eventName === 'participant_joined') {
      const r = await recordParticipantJoined({
        supabase: opts.supabase,
        channelId,
        roomName: opts.roomName,
        roomSid: opts.roomSid,
        identity,
        displayName: opts.participant?.name,
      });
      return { ok: r.ok, handled: true, reason: r.reason };
    }

    if (eventName === 'participant_left') {
      const r = await recordParticipantLeft({
        supabase: opts.supabase,
        channelId,
        roomSid: opts.roomSid,
        identity,
      });
      return { ok: r.ok, handled: true, reason: r.reason };
    }

    return { ok: true, handled: false };
  } catch (err: any) {
    console.error('[huddle-attendance] webhook handler failed', err?.message || err);
    return { ok: false, handled: true, reason: 'exception' };
  }
}

async function listLiveParticipants(
  config: LiveKitServerConfig,
  channelId: string
): Promise<HuddleAttendancePerson[]> {
  const roomName = voiceRoomNameForChannel(channelId);
  const host = config.url.replace(/^ws/i, 'http');
  const svc = new RoomServiceClient(host, config.apiKey, config.apiSecret);
  try {
    const participants = await svc.listParticipants(roomName);
    if (!Array.isArray(participants)) return [];
    return participants.map((p: any) => {
      const identity = String(p?.identity || '').trim();
      return {
        identity,
        userId: asUuidOrNull(identity),
        displayName: displayFromParticipant(p),
        joinedAt: p?.joinedAt
          ? new Date(Number(p.joinedAt) * (Number(p.joinedAt) < 1e12 ? 1000 : 1)).toISOString()
          : null,
        leftAt: null,
        present: true,
      };
    });
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404) {
      return [];
    }
    console.warn('[huddle-attendance] list live failed', err?.message || err);
    return [];
  }
}

function mapAttendanceRows(rows: any[]): HuddleAttendancePerson[] {
  return (rows || []).map((r) => ({
    identity: String(r.identity || ''),
    userId: r.user_id ? String(r.user_id) : null,
    displayName: String(r.display_name || 'Participant'),
    joinedAt: r.joined_at ? String(r.joined_at) : null,
    leftAt: r.left_at ? String(r.left_at) : null,
    present: !r.left_at,
  }));
}

async function loadSessionAttendees(
  supabase: SupabaseClient,
  sessionId: string
): Promise<HuddleAttendancePerson[]> {
  const { data, error } = await supabase
    .from('community_huddle_attendance')
    .select('identity, user_id, display_name, joined_at, left_at')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true });
  if (error) {
    console.warn('[huddle-attendance] load attendees failed', error.message || error);
    return [];
  }
  return mapAttendanceRows(data || []);
}

export async function getHuddleAttendanceForChannel(opts: {
  supabase: SupabaseClient;
  channelId: string;
  historyLimit?: number;
}): Promise<{
  ok: true;
  channelId: string;
  live: HuddleAttendancePerson[];
  currentSession: HuddleAttendanceSessionPayload | null;
  history: HuddleAttendanceSessionPayload[];
}> {
  const channelId = String(opts.channelId || '').trim();
  const historyLimit = Math.min(20, Math.max(1, Number(opts.historyLimit) || 10));
  const lk = getLiveKitServerConfig();
  const live = lk ? await listLiveParticipants(lk, channelId) : [];

  const open = await findOpenSession(opts.supabase, channelId, null);
  let currentSession: HuddleAttendanceSessionPayload | null = null;
  if (open) {
    const attendees = await loadSessionAttendees(opts.supabase, open.id);
    currentSession = {
      id: open.id,
      channelId,
      roomName: String(open.room_name || voiceRoomNameForChannel(channelId)),
      roomSid: open.room_sid || null,
      startedAt: String(open.started_at),
      endedAt: open.ended_at || null,
      attendeeCount: attendees.length,
      attendees,
    };
  }

  const { data: closed } = await opts.supabase
    .from('community_huddle_sessions')
    .select('id, channel_id, room_name, room_sid, started_at, ended_at')
    .eq('channel_id', channelId)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(historyLimit);

  const history: HuddleAttendanceSessionPayload[] = [];
  for (const s of closed || []) {
    const attendees = await loadSessionAttendees(opts.supabase, s.id);
    history.push({
      id: s.id,
      channelId,
      roomName: String(s.room_name || ''),
      roomSid: s.room_sid || null,
      startedAt: String(s.started_at),
      endedAt: s.ended_at || null,
      attendeeCount: attendees.length,
      attendees,
    });
  }

  return {
    ok: true,
    channelId,
    live,
    currentSession,
    history,
  };
}
