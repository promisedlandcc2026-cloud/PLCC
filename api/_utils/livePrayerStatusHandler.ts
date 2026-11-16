import { getSupabaseAdmin } from './auth.js';
import { normalizeVisibility } from './communityChatSecurity.js';
import { getLiveKitServerConfig, listVoiceHuddleStatusesForChannels } from './livekitVoice.js';
import { countDailyRoomParticipantsForChannels, getDailyApiKey } from './dailyVoice.js';
import { mergeDailyIntoHuddleStatuses } from './huddleProvider.js';

/**
 * GET /api/vault?resource=live-prayer — public, no sign-in.
 * Answers only "is a prayer huddle live in an open room right now?" so the church
 * website can show its "Live now" dot. No room names, people or counts leave here,
 * and private, ministry and direct-message rooms are never checked.
 */
export async function handleLivePrayerStatus(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  // Short shared cache: the website asks often; LiveKit is asked at most every ~20s.
  res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40');

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(200).json({ ok: true, live: false });
  try {
    const { data } = await supabase.from('chat_channels').select('id, name, type, visibility').limit(500);
    const openIds = (data || [])
      .filter((c: any) => normalizeVisibility(c) === 'open')
      .map((c: any) => String(c.id));
    if (!openIds.length) return res.status(200).json({ ok: true, live: false });

    const daily = await countDailyRoomParticipantsForChannels(getDailyApiKey(), openIds).catch(() => ({} as Record<string, number>));
    const lk = getLiveKitServerConfig();
    const liveKit = lk ? await listVoiceHuddleStatusesForChannels(lk, openIds).catch(() => ({})) : {};
    const merged = mergeDailyIntoHuddleStatuses(liveKit, daily, openIds);
    const live = Object.values(merged).some((s: any) => s?.active && Number(s?.participantCount) > 0);
    return res.status(200).json({ ok: true, live });
  } catch (err: any) {
    console.warn('[live-prayer] status failed', err?.message || err);
    return res.status(200).json({ ok: true, live: false });
  }
}
