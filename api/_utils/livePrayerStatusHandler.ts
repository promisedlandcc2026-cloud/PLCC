import { getSupabaseAdmin } from './auth.js';
import { normalizeVisibility } from './communityChatSecurity.js';
import { getLiveKitServerConfig, listVoiceHuddleStatusesForChannels } from './livekitVoice.js';
import { countDailyRoomParticipantsForChannels, getDailyApiKey } from './dailyVoice.js';
import { mergeDailyIntoHuddleStatuses } from './huddleProvider.js';

/**
 * GET /api/vault?resource=live-prayer — public, no sign-in.
 * Answers "is a prayer huddle live in an open room right now?" so the church
 * website can show its "Live now" dot. With &rooms=1 it also lists the open
 * (everyone) rooms by name with live yes/no, for the website's Huddles page.
 * Private, ministry and direct-message rooms are never checked or listed, and
 * no people or headcounts leave here.
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
    const open = (data || []).filter((c: any) => normalizeVisibility(c) === 'open');
    const openIds = open.map((c: any) => String(c.id));
    const wantRooms = String(req.query?.rooms || '') === '1';
    if (!openIds.length) return res.status(200).json({ ok: true, live: false, ...(wantRooms ? { rooms: [] } : {}) });

    const daily = await countDailyRoomParticipantsForChannels(getDailyApiKey(), openIds).catch(() => ({} as Record<string, number>));
    const lk = getLiveKitServerConfig();
    const liveKit = lk ? await listVoiceHuddleStatusesForChannels(lk, openIds).catch(() => ({})) : {};
    const merged = mergeDailyIntoHuddleStatuses(liveKit, daily, openIds);
    const isLive = (id: string) => Boolean((merged as any)[id]?.active) && Number((merged as any)[id]?.participantCount) > 0;
    const live = openIds.some(isLive);
    if (!wantRooms) return res.status(200).json({ ok: true, live });
    const rooms = open
      .map((c: any) => ({ id: String(c.id), name: String(c.name || '').trim(), live: isLive(String(c.id)) }))
      .filter((r: any) => r.name)
      .sort((a: any, b: any) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name));
    return res.status(200).json({ ok: true, live, rooms });
  } catch (err: any) {
    console.warn('[live-prayer] status failed', err?.message || err);
    return res.status(200).json({ ok: true, live: false });
  }
}
