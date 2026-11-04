/**
 * LIVE badges include huddles that moved to the Daily backup line.
 * Run: npx tsx scripts/huddle-daily-status-smoke.ts
 */
import assert from 'node:assert/strict';
import { mergeDailyIntoHuddleStatuses } from '../api/_utils/huddleProvider.js';

const ids = ['a', 'b', 'c', 'd'];
const merged = mergeDailyIntoHuddleStatuses(
  {
    a: { active: true, participantCount: 3 },
    b: { active: false, participantCount: 0 },
    c: { active: false, participantCount: 0 },
  },
  { b: 2, a: 5 },
  ids
);
assert.deepEqual(merged.a, { active: true, participantCount: 3, provider: 'livekit' }, 'LiveKit wins when its room has people');
assert.deepEqual(merged.b, { active: true, participantCount: 2, provider: 'daily' }, 'Daily-line huddle shows as live');
assert.deepEqual(merged.c, { active: false, participantCount: 0 });
assert.deepEqual(merged.d, { active: false, participantCount: 0 }, 'missing LiveKit entry stays inactive');
assert.deepEqual(mergeDailyIntoHuddleStatuses({}, { d: 1 }, ['d']).d, { active: true, participantCount: 1, provider: 'daily' });
console.log('huddle-daily-status-smoke: ok');
