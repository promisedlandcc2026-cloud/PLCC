/**
 * Daily.co audio rooms for community huddles when LiveKit is out of quota.
 * DAILY_API_KEY stays on the server. The browser only receives a room URL and token.
 */

export const DAILY_API_BASE = 'https://api.daily.co/v1';
export const DAILY_ROOM_PREFIX = 'awc-vault-';
export const DAILY_TOKEN_TTL_SECONDS = 6 * 60 * 60;

/** Shown to members. The Daily response is logged separately and never includes the API key. */
export const DAILY_CLIENT_ERROR = 'Backup huddle audio is unavailable right now.';

export class DailyApiError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(DAILY_CLIENT_ERROR);
    this.name = 'DailyApiError';
    this.detail = detail;
  }
}

export function getDailyApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.DAILY_API_KEY || '').trim();
}

export function dailyRoomNameForChannel(channelId: string): string {
  const id = String(channelId || '').trim().toLowerCase();
  if (!id) throw new Error('channelId is required for a Daily room');
  const safe = id.replace(/[^a-z0-9-]/g, '');
  if (!safe) throw new Error('channelId is required for a Daily room');
  return `${DAILY_ROOM_PREFIX}${safe}`;
}

type DailyJson = Record<string, any>;

async function dailyRequest(
  apiKey: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ status: number; data: DailyJson }> {
  const res = await fetch(`${DAILY_API_BASE}${path}`, {
    method: init?.method || 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as DailyJson;
  return { status: res.status, data };
}

function roomAlreadyExists(data: DailyJson): boolean {
  const text = `${data?.error || ''} ${data?.info || ''}`.toLowerCase();
  return text.includes('already exists') || text.includes('already-exists');
}

function dailyDetail(status: number, data: DailyJson): string {
  const error = String(data?.error || '').replace(/\s+/g, ' ').trim();
  const info = String(data?.info || '').replace(/\s+/g, ' ').trim();
  const body = [error, info].filter(Boolean).join(' — ');
  const detail = body ? `Daily ${status}: ${body}` : `Daily ${status}`;
  const key = getDailyApiKey();
  return key ? detail.split(key).join('[redacted]') : detail;
}

function throwDaily(status: number, data: DailyJson): never {
  const detail = dailyDetail(status, data);
  console.warn('[daily-voice]', detail);
  throw new DailyApiError(detail);
}

export async function ensureDailyAudioRoom(
  apiKey: string,
  channelId: string
): Promise<{ name: string; url: string }> {
  const name = dailyRoomNameForChannel(channelId);
  const properties = {
    start_video_off: true,
    start_audio_off: false,
  };
  const created = await dailyRequest(apiKey, '/rooms', {
    method: 'POST',
    body: { name, privacy: 'private', properties },
  });
  if (created.status >= 200 && created.status < 300 && created.data?.url) {
    return { name, url: String(created.data.url) };
  }
  if (roomAlreadyExists(created.data)) {
    const existing = await dailyRequest(apiKey, `/rooms/${encodeURIComponent(name)}`);
    if (existing.status >= 200 && existing.status < 300 && existing.data?.url) {
      return { name, url: String(existing.data.url) };
    }
    throwDaily(existing.status, existing.data);
  }
  throwDaily(created.status, created.data);
}

export async function mintDailyMeetingToken(
  apiKey: string,
  channelId: string,
  displayName: string
): Promise<{ token: string; url: string; roomName: string; expiresIn: number }> {
  const room = await ensureDailyAudioRoom(apiKey, channelId);
  const exp = Math.floor(Date.now() / 1000) + DAILY_TOKEN_TTL_SECONDS;
  const minted = await dailyRequest(apiKey, '/meeting-tokens', {
    method: 'POST',
    body: {
      properties: {
        room_name: room.name,
        user_name: String(displayName || '').trim() || 'Member',
        exp,
        start_video_off: true,
        start_audio_off: false,
      },
    },
  });
  if (minted.status < 200 || minted.status >= 300 || !minted.data?.token) {
    throwDaily(minted.status, minted.data);
  }
  return {
    token: String(minted.data.token),
    url: room.url,
    roomName: room.name,
    expiresIn: DAILY_TOKEN_TTL_SECONDS,
  };
}

/**
 * Ongoing Daily (backup line) participants for many channels in one /presence
 * call. Channels with nobody in their Daily room are left out. Empty when Daily
 * is not configured or cannot be read, so callers can merge safely.
 */
export async function countDailyRoomParticipantsForChannels(
  apiKey: string,
  channelIds: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!apiKey || !channelIds.length) return out;
  try {
    const { status, data } = await dailyRequest(apiKey, '/presence');
    if (status < 200 || status >= 300 || !data || typeof data !== 'object') return out;
    for (const id of channelIds) {
      let name = '';
      try {
        name = dailyRoomNameForChannel(id);
      } catch {
        continue;
      }
      const people = (data as Record<string, any>)[name]?.participants;
      const count = Array.isArray(people) ? people.length : 0;
      if (count > 0) out[id] = count;
    }
  } catch {
    /* backup line unreadable — LiveKit status still stands */
  }
  return out;
}

/** Ongoing Daily participants, or null when the API cannot be read. */
export async function countDailyRoomParticipants(
  apiKey: string,
  channelId: string
): Promise<number | null> {
  if (!apiKey) return null;
  let name = '';
  try {
    name = dailyRoomNameForChannel(channelId);
  } catch {
    return null;
  }
  try {
    const { status, data } = await dailyRequest(apiKey, '/presence');
    if (status < 200 || status >= 300) return null;
    const meeting = data?.[name];
    if (!meeting) return 0;
    const people = meeting.participants;
    return Array.isArray(people) ? people.length : 0;
  } catch {
    return null;
  }
}
