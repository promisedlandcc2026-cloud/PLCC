/**
 * Ka Link recordings (#14) smoke — no LiveKit or storage needed.
 * Run: npx tsx scripts/community-phase-ka-link-recording-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRecordingStorageConfig, recordingFilePath, recordingOutcomeFromEgress } from '../api/_utils/kaLinkRecording.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
};

ok('storage settings are required and validated', () => {
  assert.equal(getRecordingStorageConfig({} as any), null);
  assert.equal(getRecordingStorageConfig({ KA_LINK_RECORDING_S3_ENDPOINT: 'http://x', KA_LINK_RECORDING_S3_REGION: 'r', KA_LINK_RECORDING_S3_ACCESS_KEY_ID: 'a', KA_LINK_RECORDING_S3_SECRET_ACCESS_KEY: 's' } as any), null);
  const cfg = getRecordingStorageConfig({ KA_LINK_RECORDING_S3_ENDPOINT: 'https://abc.supabase.co/storage/v1/s3/', KA_LINK_RECORDING_S3_REGION: 'eu-central-1', KA_LINK_RECORDING_S3_ACCESS_KEY_ID: 'a', KA_LINK_RECORDING_S3_SECRET_ACCESS_KEY: 's' } as any);
  assert.equal(cfg?.endpoint, 'https://abc.supabase.co/storage/v1/s3');
  assert.equal(cfg?.bucket, 'ka-link-recordings');
});

ok('file names are dated and safe', () => {
  const p = recordingFilePath('ch-1', new Date(Date.UTC(2026, 10, 19, 0, 3)), 'ab/12..cd');
  assert.equal(p, 'ch-1/2026-11-19_0003_ab12cd.mp4');
});

ok('egress status → recording status (webhook JSON and proto)', () => {
  assert.equal(recordingOutcomeFromEgress({ status: 'EGRESS_ACTIVE' }).status, 'recording');
  assert.equal(recordingOutcomeFromEgress({ status: 2 }).status, 'processing');
  const done = recordingOutcomeFromEgress({ status: 'EGRESS_COMPLETE', fileResults: [{ duration: '3600000000000', size: '5242880' }] });
  assert.deepEqual([done.status, done.durationSeconds, done.sizeBytes], ['ready', 3600, 5242880]);
  assert.equal(recordingOutcomeFromEgress({ status: 4, error: 'boom' }).status, 'failed');
  assert.equal(recordingOutcomeFromEgress({ status: 'EGRESS_COMPLETE', fileResults: [{ duration: BigInt(60e9) }] }).durationSeconds, 60);
});

ok('wiring: endpoint, webhook, migration', () => {
  const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  assert.match(core, /chatType === 'voice-recording'/);
  assert.match(core, /subResource === 'voice-recording'/);
  assert.match(core, /Only Ka Link moderators can manage recordings/);
  const hook = readFileSync(join(root, 'api/livekit-webhook.ts'), 'utf8');
  assert.match(hook, /handleRecordingWebhookEvent/);
  const sql = readFileSync(join(root, 'supabase/migrations/ka_link_recordings.sql'), 'utf8');
  assert.match(sql, /storage\.buckets/);
  assert.match(sql, /public\) VALUES \('ka-link-recordings', 'ka-link-recordings', false\)/);
});

console.log(`\n${passed} checks passed`);
