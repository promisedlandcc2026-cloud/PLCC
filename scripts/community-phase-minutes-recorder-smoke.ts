/**
 * Meeting Minutes recorder / PDF helpers smoke.
 * Run: npx tsx scripts/community-phase-minutes-recorder-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extensionForAudioMime,
  formatMinutesTranscriptAsNotes,
  formatRecorderDuration,
  huddleMinutesPrefill,
  MINUTES_AUDIO_BUCKET,
  MINUTES_MAX_AUDIO_BYTES,
  MINUTES_MAX_RECORD_SECONDS,
  parseAudioDataUrl,
  pickMinutesRecorderMimeType,
  summarizeTranscript,
  joinTranscriptChunks,
  minutesChunkCount,
} from '../api/_utils/minutesRecorder.js';
import { minutesPdfFilename } from '../api/_utils/minutesPdf.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('\nMinutes recorder smoke');

assert(pickMinutesRecorderMimeType(() => true) === 'audio/webm;codecs=opus', 'prefers opus when supported');
assert(pickMinutesRecorderMimeType(() => false) === 'audio/webm', 'falls back to webm');
assert(extensionForAudioMime('audio/mp4') === 'm4a', 'mp4 extension');
assert(formatRecorderDuration(125) === '2:05', 'duration format');
assert(summarizeTranscript('First sentence. Second one.', 40) === 'First sentence.', 'summary first sentence');
assert(
  formatMinutesTranscriptAsNotes('Hello church').includes('Hello church'),
  'notes wrap transcript'
);
assert(huddleMinutesPrefill({ channelName: '#Worship' }).title === 'Worship Live Huddle', 'huddle title');
assert(MINUTES_AUDIO_BUCKET === 'minutes-audio', 'bucket name');
assert(MINUTES_MAX_RECORD_SECONDS >= 3600, 'hour-long recording cap');
assert(minutesChunkCount(3600) === 12, '1 hour is 12 five-minute chunks');
assert(joinTranscriptChunks(['Hello.', '  Amen  ']) === 'Hello.\n\nAmen', 'join chunks');
const parsed = parseAudioDataUrl('data:audio/webm;base64,AAAA');
assert(parsed?.mimeType === 'audio/webm' && parsed.base64 === 'AAAA', 'parse data URL');
assert(minutesPdfFilename('Sunday Board', '2026-09-21').includes('sunday-board'), 'pdf filename slug');

const ui = read('pages/communication/MinutesManager.tsx');
const rec = read('components/Minutes/MinutesRecorder.tsx');
const view = read('pages/communication/MinutesView.tsx');
const huddle = read('components/Community/VoiceHuddle.tsx');
const core = read('api/_utils/core.ts');
const mig = read('supabase/migrations/minutes_recorder_audio.sql');

assert(/MinutesRecorder/.test(ui), 'manager mounts recorder');
assert(/typed_signature/.test(ui) && /secretary_signature/.test(ui), 'secretary hand + typed sign');
assert(/Typed legal name/.test(view), 'view typed name');
assert(/subResource=pdf/.test(view), 'download PDF');
assert(/huddle: '1'/.test(huddle) && /communication\/minutes/.test(huddle), 'post-huddle minutes prompt');
assert(/data-huddle-minutes-control/.test(huddle), 'during-huddle Minutes control');
assert(/Record during the huddle/.test(huddle), 'during-huddle recorder copy');
assert(/Open Meeting Minutes to review/.test(huddle) || /Open Meeting Minutes to type/.test(huddle), 'end huddle opens minutes not start recorder');
assert(/onClose\(\)/.test(huddle) && /Always dismiss after End/.test(huddle), 'end huddle closes modal after minutes prompt');
assert(/prev === 'ended'/.test(huddle) && /Never clobber 'ended'/.test(huddle), 'status poll preserves ended (no Ready flash)');
assert(/audio-upload-url/.test(core) && /transcribe-stored/.test(core), 'chunked upload + stored transcribe');
assert(/MINUTES_CHUNK_SECONDS/.test(rec), 'recorder uses chunk timer');
assert(/subResource === 'pdf'/.test(core), 'pdf API');
assert(/attachments: pdfBuffer/.test(core), 'email PDF attachment');
assert(/minutes-audio/.test(mig), 'storage bucket migration');

console.log('\nAll minutes recorder smoke tests passed.');
