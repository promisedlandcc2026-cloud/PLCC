/**
 * Guards routes that were silently dropped once when api/_utils/core.ts was
 * edited from a stale copy (commit 8ae1250). Run before pushing:
 *   npx tsx scripts/api-route-presence-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');

const required: Array<[string, string]> = [
  ['check-in points: my-points', "=== 'my-points'"],
  ['check-in points: leaderboard', "=== 'points-leaderboard'"],
  ['check-in points: self QR', "=== 'self-qr'"],
  ['check-in points: self check-in', "=== 'self-check-in'"],
  ['check-in points handler', "import('./checkinPointsHandler.js')"],
  ['Daily backup: provider route', "subResource === 'voice-huddle-provider'"],
  ['Daily backup: token route', "subResource === 'voice-daily-token'"],
  ['Daily backup: handler block', "chatType === 'voice-huddle-provider' || chatType === 'voice-daily-token'"],
  ['Daily backup: LIVE counts', 'mergeDailyIntoHuddleStatuses('],
  ['Huddle mic restore route', "subResource === 'voice-mic-restore'"],
  ['Seasonal settings defaults', 'seasonal: {'],
  ['Seasonal settings merge', 'DEFAULT_SYSTEM_SETTINGS.seasonal'],
  ['PLCC Bucks route', "case 'kids-bucks'"],
  ['PLCC Bucks handler', "import('./kidsBucksHandler.js')"],
];

let failed = 0;
for (const [label, needle] of required) {
  if (core.includes(needle)) console.log(`  OK: ${label}`);
  else {
    failed += 1;
    console.error(`  MISSING: ${label}  (${needle})`);
  }
}
if (failed) {
  console.error(`\n${failed} route(s) missing from api/_utils/core.ts`);
  process.exit(1);
}
console.log('\nAll critical API routes present.');
