/**
 * PLCC Ark — rules that decide holds, personal bests and PLCC Bucks.
 * Run: npx tsx scripts/ark-smoke.ts
 * (Full API checks against Postgres were run while building; see supabase/migrations/awc_ark.sql.)
 */
import { readFileSync } from 'node:fs';
import {
  arkDayKey,
  arkWeekStartIso,
  canChangeHideName,
  evaluateArkScore,
  hiddenBoardName,
  leaderboardName,
  parseArkScoreInput,
} from '../api/_utils/arkLogic';

let failed = 0;
const assert = (c: unknown, label: string, d?: unknown) => {
  if (c) console.log(`  OK: ${label}`);
  else { failed++; console.error(`  FAIL: ${label}`, d ?? ''); }
};
const base = { game: 'tetris' as const, holdMultiplier: 3, durationSec: 90, isChild: true, bucksEnabled: true, firstToday: false };

assert(JSON.stringify(evaluateArkScore({ ...base, score: 1000, previousBest: null, firstToday: true }).bucks) === '["ark_first_game"]', 'first ever game: first-of-day only');
assert(JSON.stringify(evaluateArkScore({ ...base, score: 1500, previousBest: 1000 }).bucks) === '["ark_personal_best"]', 'beat best: +5');
assert(evaluateArkScore({ ...base, score: 900, previousBest: 1000 }).bucks.length === 0, 'not a best: nothing');
assert(evaluateArkScore({ ...base, score: 1500, previousBest: 1000, isChild: false }).bucks.length === 0, 'adults never earn');
assert(evaluateArkScore({ ...base, score: 1500, previousBest: 1000, durationSec: 5 }).bucks.length === 0, 'too short: no Bucks');
assert(evaluateArkScore({ ...base, score: 1500, previousBest: 1000, bucksEnabled: false }).bucks.length === 0, 'Bucks off');
assert(hiddenBoardName('Kaden').name === 'Player K.' && hiddenBoardName('Kaden').initials === 'K', 'hidden name: Player K.');
assert(hiddenBoardName('').name === 'Player', 'hidden name without a first name');
const cc = { playerIsSelf: true, playerIsChild: true, userId: 'teen' };
assert(!canChangeHideName({ ...cc, next: false, current: { hideName: true, updatedBy: 'parent' } }), 'teen cannot un-hide a parent choice');
assert(canChangeHideName({ ...cc, next: true, current: null }), 'teen can hide');
assert(canChangeHideName({ ...cc, next: false, current: { hideName: true, updatedBy: 'teen' } }), 'teen can undo their own hide');
assert(canChangeHideName({ playerIsSelf: false, playerIsChild: true, userId: 'parent', next: false, current: { hideName: true, updatedBy: 'x' } }), 'parent can change');
const held = evaluateArkScore({ ...base, score: 4000, previousBest: 1000 });
assert(held.held && !held.newBest && held.bucks.length === 0, 'over 3x best: held, no Bucks');
assert(!evaluateArkScore({ ...base, score: 4000, previousBest: 300 }).held, 'small bests are not compared (beginners improve fast)');
assert(evaluateArkScore({ ...base, game: 'pong', score: 150000, previousBest: null }).held, 'above the game ceiling: held');

assert(parseArkScoreInput({ playerId: 'x', game: 'tetris', score: 1, durationSec: 5 }).ok === false, 'bad player id refused');
assert(parseArkScoreInput({ playerId: '11111111-1111-4111-8111-111111111111', game: 'chess', score: 1, durationSec: 5 }).ok === false, 'unknown game refused');
assert(parseArkScoreInput({ playerId: '11111111-1111-4111-8111-111111111111', game: 'tetris', score: 1.5, durationSec: 5 }).ok === false, 'fractional score refused');
const good = parseArkScoreInput({ playerId: '11111111-1111-4111-8111-111111111111', game: 'tetris', score: 10, durationSec: 30, stats: { lines: 3, evil: 'x', 'bad key': 1 } });
assert(good.ok === true && JSON.stringify((good as any).stats) === '{"lines":3,"durationSec":30}', 'only clean stats kept', good);

assert(leaderboardName('Jerless', 'Mahabir') === 'Jerless M.', 'board names: first + last initial');
assert(leaderboardName('', '') === 'Player', 'no name → Player');

// Church week starts Monday 00:00 New York (same as awc_bucks_week_start)
assert(arkWeekStartIso(new Date('2026-10-21T18:00:00Z')) === '2026-10-19T04:00:00.000Z', 'Wed → Mon midnight EDT');
assert(arkWeekStartIso(new Date('2026-10-19T03:59:00Z')) === '2026-10-12T04:00:00.000Z', 'Sun 11:59pm EDT still last week');
assert(arkWeekStartIso(new Date('2026-11-04T12:00:00Z')) === '2026-11-02T05:00:00.000Z', 'after clocks change → EST');
assert(arkDayKey(new Date('2026-10-22T02:00:00Z')).key === '2026-10-21', 'day key is New York time');

const core = readFileSync('api/_utils/core.ts', 'utf8');
assert(/case 'ark':/.test(core), 'resource=ark routed');
const sql = readFileSync('supabase/migrations/awc_ark.sql', 'utf8');
assert(/awc_ark_award/.test(sql) && /awc_ark_settle_week/.test(sql) && /REVOKE ALL ON TABLE public\.ark_settings/.test(sql), 'migration: functions + lockdown');

if (failed) { console.error(`\n${failed} Ark check(s) failed.`); process.exit(1); }
console.log('\nAWC Ark checks passed.');
