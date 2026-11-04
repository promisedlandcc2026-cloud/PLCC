/**
 * LiveKit signed webhook — huddle-start notifications + attendance persistence.
 * Route: POST /api/livekit-webhook
 *
 * Verifies Authorization JWT + body sha256 via WebhookReceiver.
 * LIVEKIT_API_SECRET never leaves the server.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { WebhookReceiver } from 'livekit-server-sdk';
import { getSupabaseAdmin } from './_utils/auth.js';
import { getLiveKitServerConfig } from './_utils/livekitVoice.js';
import {
  notifyHuddleStartedFromRoom,
  shouldNotifyForLiveKitEvent,
} from './_utils/livekitHuddleNotify.js';
import {
  handleHuddleAttendanceWebhookEvent,
  isHuddleAttendanceWebhookEvent,
} from './_utils/huddleAttendance.js';

/** Preserve raw body for signature verification (Vercel Node). */
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: VercelRequest & { rawBody?: string }): Promise<string> {
  if (typeof req.rawBody === 'string' && req.rawBody.length > 0) return req.rawBody;
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve());
    req.on('error', reject);
  });
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');

  // Last resort (dev/misconfig): re-stringify parsed JSON — signature may fail.
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return '';
}

function authHeader(req: VercelRequest): string | undefined {
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (Array.isArray(h)) return h[0];
  return h ? String(h) : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const lk = getLiveKitServerConfig();
  if (!lk) {
    console.error('[livekit-webhook] LiveKit not configured');
    return res.status(503).json({ ok: false, error: 'Voice huddles are not configured' });
  }

  let rawBody = '';
  try {
    rawBody = await readRawBody(req as VercelRequest & { rawBody?: string });
  } catch (err: any) {
    console.error('[livekit-webhook] raw body read failed', err?.message || err);
    return res.status(400).json({ ok: false, error: 'Invalid body' });
  }

  if (!rawBody) {
    return res.status(400).json({ ok: false, error: 'Empty body' });
  }

  const receiver = new WebhookReceiver(lk.apiKey, lk.apiSecret);
  let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
  try {
    event = await receiver.receive(rawBody, authHeader(req));
  } catch (err: any) {
    console.warn('[livekit-webhook] signature verification failed', err?.message || err);
    return res.status(401).json({ ok: false, error: 'Unauthorized webhook' });
  }

  const eventName = String((event as any)?.event || '');
  const room = (event as any)?.room;
  const roomName = String(room?.name || '');
  const roomSid = String(room?.sid || '');
  const participant = (event as any)?.participant || null;

  const wantsNotify = shouldNotifyForLiveKitEvent(eventName);
  const wantsAttendance = isHuddleAttendanceWebhookEvent(eventName);

  if (!wantsNotify && !wantsAttendance) {
    return res.status(200).json({ ok: true, ignored: true, event: eventName });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('[livekit-webhook] Supabase admin missing');
    return res.status(200).json({ ok: true, notified: false, attendance: false, reason: 'no_supabase' });
  }

  let attendanceResult: { ok: boolean; handled: boolean; reason?: string } | null = null;
  if (wantsAttendance) {
    attendanceResult = await handleHuddleAttendanceWebhookEvent({
      supabase,
      eventName,
      roomName,
      roomSid,
      participant: participant
        ? { identity: participant.identity, name: participant.name }
        : null,
    });
  }

  if (!wantsNotify) {
    return res.status(200).json({
      ok: true,
      event: eventName,
      notified: false,
      attendance: attendanceResult,
    });
  }

  // Notification failures must not fail the webhook hard — LiveKit already created the room.
  try {
    const result = await notifyHuddleStartedFromRoom({
      supabase,
      roomName,
      roomSid,
      liveKitConfig: lk,
    });

    return res.status(200).json({
      ok: true,
      event: eventName,
      notified: result.ok && !result.skipped,
      attendance: attendanceResult,
      ...result,
    });
  } catch (err: any) {
    console.error('[livekit-webhook] notify path failed', err?.message || err);
    return res.status(200).json({
      ok: true,
      notified: false,
      attendance: attendanceResult,
      reason: 'notify_error',
    });
  }
}
