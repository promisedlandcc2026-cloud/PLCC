/**
 * Short-lived permission to open a LiveKit huddle when Supabase cannot be reached.
 * Issued only after a successful Vault check. The signature uses the LiveKit API
 * secret, which never leaves the server.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isHuddleSessionModerator } from './huddleModeration.js';
import {
  applyVoiceHuddleModAction,
  ensureVoiceRoom,
  getLiveKitServerConfig,
  mintLiveKitAccessToken,
  resolveVoiceCanModerate,
} from './livekitVoice.js';
import { decideHuddleEntry, readHuddleIsLive } from './huddleStartPolicy.js';

export const HUDDLE_FALLBACK_TTL_SECONDS = 12 * 60 * 60;

export type HuddleFallbackClaims = {
  userId: string;
  channelId: string;
  displayName: string;
  canModerate: boolean;
  channelCanModerate: boolean;
  /** May open an empty huddle. Passes issued before this field existed read as false (join only). */
  canStart: boolean;
  exp: number;
};

function b64url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(value: string): Buffer {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function signPayload(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

export function signHuddleFallbackPass(
  input: Omit<HuddleFallbackClaims, 'exp' | 'canStart'> & { exp?: number; canStart?: boolean },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): string | null {
  const userId = String(input.userId || '').trim();
  const channelId = String(input.channelId || '').trim();
  const key = String(secret || '').trim();
  if (!userId || !channelId || !key) return null;
  const claims: HuddleFallbackClaims = {
    userId,
    channelId,
    displayName: String(input.displayName || '').trim().slice(0, 80) || 'Member',
    canModerate: Boolean(input.canModerate),
    channelCanModerate: Boolean(input.channelCanModerate),
    canStart: input.canStart === true,
    exp: input.exp ?? nowSeconds + HUDDLE_FALLBACK_TTL_SECONDS,
  };
  const payload = b64url(JSON.stringify(claims));
  return `${payload}.${signPayload(payload, key)}`;
}

export function verifyHuddleFallbackPass(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): HuddleFallbackClaims | null {
  const key = String(secret || '').trim();
  const raw = String(token || '').trim();
  const dot = raw.indexOf('.');
  if (!key || dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signPayload(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(fromB64url(payload).toString('utf8')) as HuddleFallbackClaims;
    const userId = String(parsed?.userId || '').trim();
    const channelId = String(parsed?.channelId || '').trim();
    const exp = Number(parsed?.exp);
    if (!userId || !channelId || !Number.isFinite(exp) || exp <= nowSeconds) return null;
    return {
      userId,
      channelId,
      displayName: String(parsed.displayName || '').trim().slice(0, 80) || 'Member',
      canModerate: Boolean(parsed.canModerate),
      channelCanModerate: Boolean(parsed.channelCanModerate),
      canStart: (parsed as any).canStart === true,
      exp,
    };
  } catch {
    return null;
  }
}

/** Mint a LiveKit token from a previously saved pass. Does not call Supabase. */
export async function handleVoiceTokenFallback(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const lk = getLiveKitServerConfig();
  if (!lk) {
    return res.status(503).json({ ok: false, error: 'Voice huddles are not configured yet', configured: false });
  }
  const channelId = String(req.body?.channelId || req.body?.channel_id || '').trim();
  const claims = verifyHuddleFallbackPass(String(req.body?.fallbackPass || ''), lk.apiSecret);
  if (!claims || claims.channelId !== channelId) {
    return res.status(401).json({
      ok: false,
      error: 'Saved huddle permission expired. Try again after the church database is back.',
    });
  }

  // Outage path must not bypass the start rule: a join-only pass can't open an empty room.
  const entry = decideHuddleEntry({ isLive: await readHuddleIsLive(channelId), canStart: claims.canStart });
  if (entry.ok === false) {
    return res.status(entry.status).json({ ok: false, code: entry.code, error: entry.error, canStart: false });
  }

  try {
    await ensureVoiceRoom(lk, channelId);
    let session = await resolveVoiceCanModerate(lk, channelId, claims.userId, claims.channelCanModerate);
    if (!session.roles.hostId) {
      const claimed = await applyVoiceHuddleModAction(lk, {
        channelId,
        actorId: claims.userId,
        action: 'claim',
        channelCanModerate: claims.channelCanModerate,
      });
      if (claimed.ok) {
        session = { canModerate: claimed.canModerate, roles: claimed.roles };
      }
    }
    const canModerate = session.canModerate;
    const minted = await mintLiveKitAccessToken(lk, {
      userId: claims.userId,
      displayName: claims.displayName,
      channelId,
      canModerate,
      roomAdmin: isHuddleSessionModerator(session.roles, claims.userId),
    });
    return res.status(200).json({
      ok: true,
      fallback: true,
      token: minted.token,
      url: minted.url,
      roomName: minted.roomName,
      expiresIn: minted.expiresIn,
      canModerate,
      canStart: claims.canStart,
      channelCanModerate: claims.channelCanModerate,
      hostId: session.roles.hostId,
      coHostIds: session.roles.coHostIds,
      channelId,
    });
  } catch (err: any) {
    console.warn('[voice-token-fallback]', err?.message || err);
    return res.status(502).json({ ok: false, error: 'Could not open the huddle while the church database is down.' });
  }
}
