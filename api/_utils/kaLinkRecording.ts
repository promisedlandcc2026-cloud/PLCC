/**
 * Ka Link recordings (#14 — Nov 2026): record a prayer session (audio only)
 * for later reference, e.g. the Midnight Watch.
 *
 *  - A moderator taps Record → LiveKit Egress mixes the room's audio into one
 *    .mp4 (AAC) file and uploads it to the private Supabase Storage bucket
 *    `ka-link-recordings` through Supabase's S3 connection.
 *  - Everyone in the call sees a REC badge (LiveKit reports it to every client).
 *  - When the recording ends, the LiveKit webhook marks it ready (and the list
 *    endpoint double-checks with LiveKit in case a webhook was missed).
 *  - Members who can open the room can play it back with a short-lived link.
 *
 * Setup (Canaan env vars on Vercel):
 *   KA_LINK_RECORDING_S3_ENDPOINT   https://<project-ref>.supabase.co/storage/v1/s3
 *   KA_LINK_RECORDING_S3_REGION     your Supabase project region, e.g. eu-central-1
 *   KA_LINK_RECORDING_S3_ACCESS_KEY_ID
 *   KA_LINK_RECORDING_S3_SECRET_ACCESS_KEY
 *   KA_LINK_RECORDING_BUCKET        optional, default ka-link-recordings
 * Migration: supabase/migrations/ka_link_recordings.sql
 */
import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk';
import { voiceRoomNameForChannel, type LiveKitServerConfig } from './livekitVoice.js';

export type RecordingStorageConfig = {
  endpoint: string;
  region: string;
  accessKey: string;
  secret: string;
  bucket: string;
};

export function getRecordingStorageConfig(env: NodeJS.ProcessEnv = process.env): RecordingStorageConfig | null {
  const endpoint = String(env.KA_LINK_RECORDING_S3_ENDPOINT || '').trim().replace(/\/+$/, '');
  const region = String(env.KA_LINK_RECORDING_S3_REGION || '').trim();
  const accessKey = String(env.KA_LINK_RECORDING_S3_ACCESS_KEY_ID || '').trim();
  const secret = String(env.KA_LINK_RECORDING_S3_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(env.KA_LINK_RECORDING_BUCKET || 'ka-link-recordings').trim();
  if (!/^https:\/\//.test(endpoint) || !region || !accessKey || !secret || !bucket) return null;
  return { endpoint, region, accessKey, secret, bucket };
}

export const RECORDINGS_NOT_SET_UP =
  'Recording is not set up yet. Add the KA_LINK_RECORDING_S3_* settings in Vercel (see supabase/migrations/ka_link_recordings.sql).';

/** "<channel>/2026-11-19_0003_ab12cd.mp4" — sorted by date inside each room's folder. */
export function recordingFilePath(channelId: string, startedAt: Date, suffix: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = startedAt;
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  const safeSuffix = String(suffix || '').replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'rec';
  return `${channelId}/${stamp}_${safeSuffix}.mp4`;
}

function egressClient(config: LiveKitServerConfig): EgressClient {
  return new EgressClient(config.url.replace(/^ws/i, 'http'), config.apiKey, config.apiSecret);
}

/** Start an audio-only recording of the whole room. */
export async function startKaLinkRecording(
  lk: LiveKitServerConfig,
  storage: RecordingStorageConfig,
  channelId: string,
  filepath: string
): Promise<{ egressId: string }> {
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    disableManifest: true,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: storage.accessKey,
        secret: storage.secret,
        region: storage.region,
        endpoint: storage.endpoint,
        bucket: storage.bucket,
        forcePathStyle: true,
      }),
    },
  });
  const info = await egressClient(lk).startRoomCompositeEgress(voiceRoomNameForChannel(channelId), output, {
    audioOnly: true,
  });
  return { egressId: String(info.egressId || '') };
}

export async function stopKaLinkRecording(lk: LiveKitServerConfig, egressId: string): Promise<void> {
  try {
    await egressClient(lk).stopEgress(egressId);
  } catch (err: any) {
    // Already finished (room ended, or stopped twice) is fine.
    const msg = String(err?.message || err || '').toLowerCase();
    if (!/not found|cannot be stopped|already|ended|complete|failed/.test(msg)) throw err;
  }
}

export type RecordingOutcome = {
  status: 'recording' | 'processing' | 'ready' | 'failed';
  durationSeconds: number | null;
  sizeBytes: number | null;
  error: string | null;
};

const STATUS_NAMES = ['EGRESS_STARTING', 'EGRESS_ACTIVE', 'EGRESS_ENDING', 'EGRESS_COMPLETE', 'EGRESS_FAILED', 'EGRESS_ABORTED', 'EGRESS_LIMIT_REACHED'];

/** LiveKit EgressInfo (proto object or webhook JSON) → our row status. Pure. */
export function recordingOutcomeFromEgress(info: any): RecordingOutcome {
  const raw = info?.status;
  const name = typeof raw === 'number' ? STATUS_NAMES[raw] || '' : String(raw || '');
  const file = Array.isArray(info?.fileResults) && info.fileResults.length ? info.fileResults[0] : info?.file || null;
  const toNum = (v: unknown) => {
    const n = typeof v === 'bigint' ? Number(v) : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const durNs = toNum(file?.duration);
  const durationSeconds = durNs ? Math.round(durNs / 1e9) : null;
  const sizeBytes = toNum(file?.size);
  if (name === 'EGRESS_COMPLETE' || name === 'EGRESS_LIMIT_REACHED') {
    return { status: 'ready', durationSeconds, sizeBytes, error: null };
  }
  if (name === 'EGRESS_FAILED' || name === 'EGRESS_ABORTED') {
    return { status: 'failed', durationSeconds, sizeBytes, error: String(info?.error || name).slice(0, 300) };
  }
  if (name === 'EGRESS_ENDING') return { status: 'processing', durationSeconds, sizeBytes, error: null };
  return { status: 'recording', durationSeconds, sizeBytes, error: null };
}

/** Ask LiveKit how a recording is doing (used when a webhook may have been missed). */
export async function fetchRecordingOutcome(lk: LiveKitServerConfig, egressId: string): Promise<RecordingOutcome | null> {
  try {
    const list = await egressClient(lk).listEgress({ egressId });
    return list && list[0] ? recordingOutcomeFromEgress(list[0]) : null;
  } catch {
    return null;
  }
}

/** Webhook: egress_started / egress_updated / egress_ended → update the row. Never throws. */
export async function handleRecordingWebhookEvent(supabase: any, eventName: string, egressInfo: any): Promise<boolean> {
  if (!/^egress_/.test(eventName) || !egressInfo?.egressId) return false;
  try {
    const outcome = recordingOutcomeFromEgress(egressInfo);
    const patch: Record<string, unknown> = { status: outcome.status };
    if (outcome.durationSeconds) patch.duration_seconds = outcome.durationSeconds;
    if (outcome.sizeBytes) patch.size_bytes = outcome.sizeBytes;
    if (outcome.error) patch.error = outcome.error;
    if (outcome.status === 'ready' || outcome.status === 'failed') patch.ended_at = new Date().toISOString();
    await supabase.from('ka_link_recordings').update(patch).eq('egress_id', String(egressInfo.egressId));
    return true;
  } catch {
    return false;
  }
}

export function isRecordingsTableMissing(error: any): boolean {
  return /ka_link_recordings|42P01|does not exist/i.test(String(error?.message || error?.code || ''));
}
