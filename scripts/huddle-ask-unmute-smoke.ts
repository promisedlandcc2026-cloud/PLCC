/**
 * Nov 20 2026: "Unmute their mic" showed "Chat is temporarily unavailable" — LiveKit refuses to
 * switch on someone else's microphone, and Canaan answered 500. Now unmute unlocks their mic,
 * tries, and if refused asks them ("A moderator asked you to unmute"). Run: npx tsx scripts/huddle-ask-unmute-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lk = readFileSync(join(root, 'api/_utils/livekitVoice.ts'), 'utf8');
const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
assert.match(lk, /await setMicrophonePublishAllowed\(svc, roomName, identity, participant, true\);\s*micPublishRestored = true;/, 'unlocks the mic first');
assert.match(lk, /let refused = sids\.length === 0;/, 'no mic track yet also asks');
assert.match(lk, /unmuteRequested = await sendHuddleConductNotice\(config, channelId, identity, \{ t: 'ask-unmute' \}\);/, 'asks them');
assert.match(lk, /t: 'warn' \| 'block' \| 'ask-unmute'/);
assert.ok(!/error: 'Could not mute participant'/.test(core), 'no bare 500');
assert.match(core, /return res\.status\(503\)\.json\(\{\s*ok: false,\s*error: wantMutedLabel\(req\)/);
console.log('ok - unmute asks instead of failing (5 checks)');
