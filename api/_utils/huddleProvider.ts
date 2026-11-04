/**
 * One huddle provider per community channel.
 * The first successful join writes the row. A LiveKit 429 may switch to Daily
 * only when that LiveKit room is empty.
 */
import { countDailyRoomParticipants, getDailyApiKey } from './dailyVoice.js';
import { getLiveKitServerConfig, listVoiceRoomParticipantCount } from './livekitVoice.js';

export const HUDDLE_PROVIDER_TTL_MS = 30 * 60 * 1000;
export const HUDDLE_PROVIDER_SETUP_ERROR =
  'Run supabase/migrations/huddle_provider.sql in the Supabase SQL editor, then start the huddle again.';

export type HuddleProviderName = 'livekit' | 'daily';

export function providerIsFresh(setAt: string | null | undefined, now = Date.now()): boolean {
  if (!setAt) return false;
  const t = new Date(setAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < HUDDLE_PROVIDER_TTL_MS;
}

export function missingProviderColumn(error: { message?: string } | null | undefined): boolean {
  return /huddle_provider/i.test(String(error?.message || ''));
}

type ChannelProviderRow = {
  huddle_provider?: string | null;
  huddle_provider_set_at?: string | null;
};

function asProvider(value: unknown): HuddleProviderName | null {
  const name = String(value || '').trim().toLowerCase();
  if (name === 'livekit' || name === 'daily') return name;
  return null;
}

async function readProviderRow(
  supabase: any,
  channelId: string
): Promise<{ row: ChannelProviderRow | null; missing: boolean }> {
  const { data, error } = await supabase
    .from('chat_channels')
    .select('huddle_provider, huddle_provider_set_at')
    .eq('id', channelId)
    .maybeSingle();
  if (error && missingProviderColumn(error)) return { row: null, missing: true };
  if (error) throw error;
  return { row: (data as ChannelProviderRow) || null, missing: false };
}

async function writeProvider(
  supabase: any,
  channelId: string,
  provider: HuddleProviderName | null
): Promise<{ missing: boolean }> {
  const { error } = await supabase
    .from('chat_channels')
    .update({
      huddle_provider: provider,
      huddle_provider_set_at: provider ? new Date().toISOString() : null,
    })
    .eq('id', channelId);
  if (error && missingProviderColumn(error)) return { missing: true };
  if (error) throw error;
  return { missing: false };
}

async function occupantCount(
  provider: HuddleProviderName,
  channelId: string
): Promise<number | null> {
  if (provider === 'livekit') {
    const lk = getLiveKitServerConfig();
    if (!lk) return null;
    try {
      const status = await listVoiceRoomParticipantCount(lk, channelId);
      return status.participantCount;
    } catch {
      return null;
    }
  }
  return countDailyRoomParticipants(getDailyApiKey(), channelId);
}

export async function resolveHuddleProvider(
  supabase: any,
  channelId: string
): Promise<{ provider: HuddleProviderName | null; needsSetup?: boolean }> {
  const { row, missing } = await readProviderRow(supabase, channelId);
  if (missing) return { provider: null, needsSetup: true };
  const provider = asProvider(row?.huddle_provider);
  if (!provider) return { provider: null };
  if (providerIsFresh(row?.huddle_provider_set_at)) return { provider };
  const count = await occupantCount(provider, channelId);
  if (count === null || count > 0) {
    if (count && count > 0) await writeProvider(supabase, channelId, provider);
    return { provider };
  }
  await writeProvider(supabase, channelId, null);
  return { provider: null };
}

export async function claimHuddleProvider(
  supabase: any,
  channelId: string,
  provider: HuddleProviderName
): Promise<
  | { ok: true; provider: HuddleProviderName }
  | { ok: false; status: number; error: string; provider?: HuddleProviderName; occupied?: boolean }
> {
  const { row, missing } = await readProviderRow(supabase, channelId);
  if (missing) return { ok: false, status: 503, error: HUDDLE_PROVIDER_SETUP_ERROR };
  const current = asProvider(row?.huddle_provider);
  const fresh = providerIsFresh(row?.huddle_provider_set_at);

  if (provider === 'livekit') {
    if (current === 'daily') {
      const count = fresh ? 1 : await occupantCount('daily', channelId);
      if (count === null || count > 0) {
        return {
          ok: false,
          status: 409,
          provider: 'daily',
          error: 'This huddle is already open on the backup audio line.',
        };
      }
    }
    const wrote = await writeProvider(supabase, channelId, 'livekit');
    if (wrote.missing) return { ok: false, status: 503, error: HUDDLE_PROVIDER_SETUP_ERROR };
    return { ok: true, provider: 'livekit' };
  }

  if (current === 'livekit') {
    const count = await occupantCount('livekit', channelId);
    if (count === null || count > 0) {
      return {
        ok: false,
        status: 409,
        provider: 'livekit',
        occupied: true,
        error:
          'This huddle is already on LiveKit, and LiveKit is not accepting anyone else right now.',
      };
    }
  }
  if (current === 'daily' && fresh) return { ok: true, provider: 'daily' };
  const wrote = await writeProvider(supabase, channelId, 'daily');
  if (wrote.missing) return { ok: false, status: 503, error: HUDDLE_PROVIDER_SETUP_ERROR };
  return { ok: true, provider: 'daily' };
}

export type HuddleStatusEntry = {
  active: boolean;
  participantCount: number;
  provider?: HuddleProviderName;
};

/**
 * A huddle that fell back to the Daily backup line has nobody in its LiveKit
 * room, so LiveKit-only status showed it as not live (no LIVE badge in Vault or
 * Connect). Merge Daily occupancy in: Daily wins only where LiveKit is empty.
 */
export function mergeDailyIntoHuddleStatuses(
  liveKit: Record<string, HuddleStatusEntry>,
  daily: Record<string, number>,
  channelIds: string[]
): Record<string, HuddleStatusEntry> {
  const out: Record<string, HuddleStatusEntry> = {};
  for (const id of channelIds) {
    const lk = liveKit[id] || { active: false, participantCount: 0 };
    const backup = daily[id] || 0;
    if (lk.active || backup <= 0) {
      out[id] = lk.active ? { ...lk, provider: 'livekit' } : { active: false, participantCount: 0 };
    } else {
      out[id] = { active: true, participantCount: backup, provider: 'daily' };
    }
  }
  return out;
}
