/**
 * PLCC Community — Huddle + Supabase reliability smoke (no live media required).
 * Run: npx tsx scripts/community-phase-huddle-reliability-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shouldRecreateVoiceRoomForRepair,
  voiceRoomNeedsTimeoutRepair,
  VOICE_ROOM_EMPTY_TIMEOUT_SECONDS,
} from '../api/_utils/livekitVoice.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('Huddle reliability smoke — room timeout repair');

assert(VOICE_ROOM_EMPTY_TIMEOUT_SECONDS >= 60 * 30, 'emptyTimeout target ≥ 30 minutes');
assert(voiceRoomNeedsTimeoutRepair({ emptyTimeout: 0 }) === true, 'emptyTimeout 0 needs repair');
assert(voiceRoomNeedsTimeoutRepair({ emptyTimeout: 10 }) === true, 'short emptyTimeout needs repair');
assert(
  voiceRoomNeedsTimeoutRepair({ emptyTimeout: VOICE_ROOM_EMPTY_TIMEOUT_SECONDS }) === false,
  'healthy emptyTimeout does not need repair'
);
assert(
  voiceRoomNeedsTimeoutRepair({ emptyTimeout: undefined }) === true,
  'missing emptyTimeout needs repair'
);
assert(
  shouldRecreateVoiceRoomForRepair({ needsRepair: true, participantCount: 0 }) === true,
  'recreate when empty + needs repair'
);
assert(
  shouldRecreateVoiceRoomForRepair({ needsRepair: true, participantCount: 3 }) === false,
  'never delete occupied room for repair'
);
assert(
  shouldRecreateVoiceRoomForRepair({ needsRepair: false, participantCount: 0 }) === false,
  'no recreate when healthy'
);

const voiceSrc = read('api/_utils/livekitVoice.ts');
assert(/voiceRoomNeedsTimeoutRepair/.test(voiceSrc), 'helper exported in livekitVoice');
assert(/shouldRecreateVoiceRoomForRepair/.test(voiceSrc), 'recreate gate exported');
assert(/deleteRoom\(roomName\)/.test(voiceSrc), 'ensureVoiceRoom can delete bad empty rooms');
assert(/repaired:\s*true/.test(voiceSrc), 'ensureVoiceRoom reports repaired');

console.log('\nHuddle reliability smoke — status UX + safe JSON');

const ui = read('components/Community/VoiceHuddle.tsx');
assert(/25_000|25000/.test(ui), 'voice-huddle-status timeout raised above 8s');
assert(
  /Status check is slow \(database busy\)\. You can still Start or Join Huddle\./.test(ui),
  'status timeout soft warning keeps Start/Join available'
);
assert(
  /setConn\(\(prev\) =>[\s\S]*'idle'/.test(ui.split('voice-huddle-status')[1] || ui),
  'status failure returns to idle (Ready), not hard Unavailable'
);
assert(/Join with mic first|leave camera off/.test(ui), 'mic-first guidance for multi-join');

const apiSrc = read('lib/api.ts');
assert(/export async function parseApiJson/.test(apiSrc), 'parseApiJson helper exported');
assert(
  /API_BUSY_RETRY_MESSAGE[\s\S]*database busy/i.test(apiSrc),
  'busy retry message constant'
);
assert(/An error occurred/i.test(apiSrc), 'detects plain-text An error occurred bodies');

const adminSrc = read('pages/admin/AdminUsers.tsx');
assert(/parseApiJson/.test(adminSrc), 'Staff Roles uses parseApiJson');
assert(!/await res\.json\(\)/.test(adminSrc), 'Staff Roles no longer uses bare res.json()');

const devSetup = read('DEV_SETUP.md');
assert(/t4g\.nano/i.test(devSetup), 'DEV_SETUP documents nano upgrade requirement');
assert(/Micro|Small/i.test(devSetup), 'DEV_SETUP recommends Micro/Small tier');

console.log('\nAll huddle reliability smoke tests passed.');
