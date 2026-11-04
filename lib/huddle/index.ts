import { fetchWithTimeout } from '../api';
import { leaveDailyAudio } from './daily';
import type { HuddleProviderName, HuddleUser } from './types';

const QUOTA_KEY = 'livekit_quota_exceeded';
const QUOTA_TTL_MS = 30 * 60 * 1000;

type HeaderSource = HeadersInit | (() => Promise<HeadersInit>);

let activeLeave: (() => Promise<void>) | null = null;

export function registerHuddleLeave(leave: (() => Promise<void>) | null) {
  activeLeave = leave;
}

export async function leaveHuddle(): Promise<void> {
  const leave = activeLeave;
  activeLeave = null;
  if (leave) await leave();
}

export function rememberLiveKitQuota() {
  try {
    sessionStorage.setItem(QUOTA_KEY, String(Date.now()));
  } catch {
    /* private browsing */
  }
}

export function liveKitQuotaIsFresh(now = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(QUOTA_KEY);
    const stamp = Number(raw || '');
    if (!Number.isFinite(stamp) || stamp <= 0) return false;
    if (now - stamp > QUOTA_TTL_MS) {
      sessionStorage.removeItem(QUOTA_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function headersFrom(source: HeaderSource): Promise<HeadersInit> {
  return typeof source === 'function' ? source() : source;
}

async function postJson(path: string, body: Record<string, unknown>, headers: HeadersInit) {
  const res = await fetchWithTimeout(
    path,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    20_000
  );
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function readChannelHuddleProvider(
  channelId: string,
  source: HeaderSource
): Promise<{ provider: HuddleProviderName | null; needsSetup?: boolean }> {
  const headers = await headersFrom(source);
  const { res, data } = await postJson(
    '/api/vault?resource=community&subResource=chat&subResource=voice-huddle-provider',
    { channelId },
    headers
  );
  if (!res.ok) return { provider: null };
  const provider = data?.provider === 'daily' || data?.provider === 'livekit' ? data.provider : null;
  return { provider, needsSetup: Boolean(data?.needsSetup) };
}

export async function claimChannelHuddleProvider(
  channelId: string,
  provider: HuddleProviderName,
  source: HeaderSource
): Promise<{ ok: true; provider: HuddleProviderName } | { ok: false; error: string; occupied?: boolean; provider?: HuddleProviderName }> {
  const headers = await headersFrom(source);
  const { res, data } = await postJson(
    '/api/vault?resource=community&subResource=chat&subResource=voice-huddle-provider',
    { channelId, provider },
    headers
  );
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error || 'Could not save the huddle line.',
      occupied: Boolean(data?.occupied),
      provider: data?.provider === 'daily' || data?.provider === 'livekit' ? data.provider : undefined,
    };
  }
  return { ok: true, provider };
}

export async function fetchDailyHuddle(
  channelId: string,
  source: HeaderSource
): Promise<{ token: string; url: string } | { error: string; occupied?: boolean }> {
  const headers = await headersFrom(source);
  const { res, data } = await postJson(
    '/api/vault?resource=community&subResource=chat&subResource=voice-daily-token',
    { channelId },
    headers
  );
  if (!res.ok || !data?.token || !data?.url) {
    return {
      error: data?.error || 'Could not open backup huddle audio.',
      occupied: Boolean(data?.occupied),
    };
  }
  return { token: String(data.token), url: String(data.url) };
}

/**
 * Decide the shared line for this channel, and fetch Daily credentials when
 * the channel is already on Daily or LiveKit quota was just exhausted.
 */
export async function joinHuddle(
  channelId: string,
  _user: HuddleUser,
  source: HeaderSource
): Promise<
  | { provider: 'livekit' }
  | { provider: 'daily'; token: string; url: string }
  | { provider: 'blocked'; error: string }
> {
  const resolved = await readChannelHuddleProvider(channelId, source);
  const useDaily = resolved.provider === 'daily' || (resolved.provider === null && liveKitQuotaIsFresh());
  if (!useDaily) return { provider: 'livekit' };
  const daily = await fetchDailyHuddle(channelId, source);
  if ('error' in daily) return { provider: 'blocked', error: daily.error };
  return { provider: 'daily', token: daily.token, url: daily.url };
}

export { leaveDailyAudio };
