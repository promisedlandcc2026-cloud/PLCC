/**
 * Emergency entry passes for the prayer rooms (Nov 27, 2026 outage).
 *
 * Each time a member opens Ka Link (while Canaan is healthy) they receive a signed,
 * 24-hour pass for every prayer room they may join. If the database later goes down,
 * Ka Link sends the saved pass to voice-token-fallback, which opens the LiveKit room
 * without touching the database. Same rules as normal joining: only rooms the member
 * can access; only people allowed to start a prayer room may open an empty one.
 */
import { signHuddleFallbackPass } from './huddleFallbackPass.js';
import { decideKaLinkPrayerRoomStart, isKaLinkPrayerRoom, type KaLinkTeamRole } from './kaLinkTeam.js';

export const KA_LINK_PASS_TTL_SECONDS = 24 * 60 * 60;
export const KA_LINK_PASS_MAX_ROOMS = 12;

export type PrayerRoomPass = { channelId: string; name: string; pass: string };

export function buildPrayerRoomPasses(opts: {
  channels: Array<{ id?: unknown; name?: unknown }>;
  userId: string;
  displayName: string;
  role: string | null | undefined;
  /** Broad chat admin (Super Admin / Pastor / Admin) or standing Ka Link Mod. */
  moderator: boolean;
  teamRole: KaLinkTeamRole | null;
  teamHasAdmins: boolean;
  secret: string;
  nowSeconds?: number;
}): PrayerRoomPass[] {
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const canStart = decideKaLinkPrayerRoomStart({
    isPrayerRoom: true,
    existingCanStart: opts.moderator,
    teamRole: opts.teamRole,
    teamHasAdmins: opts.teamHasAdmins,
    role: opts.role,
  });
  const out: PrayerRoomPass[] = [];
  for (const ch of opts.channels) {
    const id = String(ch?.id || '');
    const name = String(ch?.name || '');
    if (!id || !isKaLinkPrayerRoom(name)) continue;
    const pass = signHuddleFallbackPass(
      {
        userId: opts.userId,
        channelId: id,
        displayName: opts.displayName,
        canModerate: opts.moderator,
        channelCanModerate: opts.moderator,
        canStart,
        exp: now + KA_LINK_PASS_TTL_SECONDS,
      },
      opts.secret,
      now
    );
    if (pass) out.push({ channelId: id, name, pass });
    if (out.length >= KA_LINK_PASS_MAX_ROOMS) break;
  }
  return out;
}
