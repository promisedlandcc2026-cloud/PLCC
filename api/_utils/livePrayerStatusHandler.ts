import { getSupabaseAdmin } from './auth.js';
import { normalizeVisibility } from './communityChatSecurity.js';
import { getLiveKitServerConfig, listVoiceHuddleStatusesForChannels, VOICE_ROOM_MAX_PARTICIPANTS } from './livekitVoice.js';
import { countDailyRoomParticipantsForChannels, getDailyApiKey } from './dailyVoice.js';
import { mergeDailyIntoHuddleStatuses } from './huddleProvider.js';
import { timingSafeEqual } from 'node:crypto';

const ROOM_CAPACITY = VOICE_ROOM_MAX_PARTICIPANTS;

/**
 * PLCC Sanctum's server sends this key (env SANCTUM_SERVICE_KEY, same value on both sides)
 * to get headcounts for its signed-in moderators. Never sent from a browser.
 */
function isSanctumService(req: any): boolean {
  const expected = String(process.env.SANCTUM_SERVICE_KEY || '').trim();
  const given = String(req.headers?.['x-sanctum-key'] || '').trim();
  if (expected.length < 24 || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/vault?resource=live-prayer — public, no sign-in.
 * Answers "is a prayer huddle live in an open room right now?" so the church
 * website can show its "Live now" dot. With &rooms=1 it also lists the open
 * (everyone) rooms by name with live yes/no, for the website's Huddles page.
 * Private, ministry and direct-message rooms are never checked or listed, and
 * no people or headcounts leave here — except to PLCC Sanctum's server, which
 * proves itself with the x-sanctum-key header and then gets a count per room.
 */
export async function handleLivePrayerStatus(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  const withCounts = isSanctumService(req);
  // Short shared cache: the website asks often; LiveKit is asked at most every ~20s.
  // Headcount answers are never cached where anyone else could read them.
  res.setHeader('Vary', 'x-sanctum-key');
  res.setHeader(
    'Cache-Control',
    withCounts ? 'private, no-store' : 'public, s-maxage=20, stale-while-revalidate=40'
  );

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(200).json({ ok: true, live: false });
  try {
    const { data } = await supabase.from('chat_channels').select('id, name, type, visibility').limit(500);
    const open = (data || []).filter((c: any) => normalizeVisibility(c) === 'open');
    const openIds = open.map((c: any) => String(c.id));
    const wantRooms = withCounts || String(req.query?.rooms || '') === '1';
    if (!openIds.length) return res.status(200).json({ ok: true, live: false, ...(wantRooms ? { rooms: [] } : {}) });

    const daily = await countDailyRoomParticipantsForChannels(getDailyApiKey(), openIds).catch(() => ({} as Record<string, number>));
    const lk = getLiveKitServerConfig();
    const liveKit = lk ? await listVoiceHuddleStatusesForChannels(lk, openIds).catch(() => ({})) : {};
    const merged = mergeDailyIntoHuddleStatuses(liveKit, daily, openIds);
    const countOf = (id: string) => Math.max(0, Number((merged as any)[id]?.participantCount) || 0);
    const isLive = (id: string) => Boolean((merged as any)[id]?.active) && countOf(id) > 0;
    const live = openIds.some(isLive);
    if (!wantRooms) return res.status(200).json({ ok: true, live });
    const rooms = open
      .map((c: any) => ({
        id: String(c.id),
        name: String(c.name || '').trim(),
        live: isLive(String(c.id)),
        ...(withCounts ? { count: countOf(String(c.id)), capacity: ROOM_CAPACITY } : {}),
      }))
      .filter((r: any) => r.name)
      .sort((a: any, b: any) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name));
    return res.status(200).json({ ok: true, live, rooms });
  } catch (err: any) {
    console.warn('[live-prayer] status failed', err?.message || err);
    return res.status(200).json({ ok: true, live: false });
  }
}
