/**
 * PLCC Ark — pure rules (no database), shared by arkHandler.ts and its tests.
 */

export const ARK_GAMES = ['pong', 'breakout', 'invaders', 'tetris', 'dove'] as const;
export type ArkGame = (typeof ARK_GAMES)[number];

export const ARK_GAME_TITLES: Record<ArkGame, string> = {
  pong: 'Pong Plus',
  breakout: 'Breakout',
  invaders: 'Space Invaders',
  tetris: 'Tetris',
  dove: 'Dove Defender',
};

/** Scores above these are held for a leader to check, whatever the player's history. */
export const ARK_SCORE_CEILING: Record<ArkGame, number> = {
  pong: 100000,
  breakout: 300000,
  invaders: 300000,
  tetris: 2000000,
  dove: 300000,
};

/** A game shorter than this still counts on the board, but earns no PLCC Bucks. */
export const ARK_MIN_SECONDS_FOR_BUCKS = 20;

export function isArkGame(v: unknown): v is ArkGame {
  return typeof v === 'string' && (ARK_GAMES as readonly string[]).includes(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ArkScoreInput = {
  ok: true;
  playerId: string;
  game: ArkGame;
  score: number;
  durationSec: number;
  stats: Record<string, number>;
};

/** Validate what the game sends. Only small whole-number stats are kept. */
export function parseArkScoreInput(body: any): ArkScoreInput | { ok: false; error: string } {
  const playerId = String(body?.playerId || '').trim();
  if (!UUID_RE.test(playerId)) return { ok: false, error: 'Pick who is playing.' };
  const game = String(body?.game || '').trim().toLowerCase();
  if (!isArkGame(game)) return { ok: false, error: 'Pick a game.' };
  const score = Number(body?.score);
  if (!Number.isInteger(score) || score < 0 || score > 5000000) return { ok: false, error: 'That score is not valid.' };
  const durationSec = Math.floor(Number(body?.durationSec));
  if (!Number.isFinite(durationSec) || durationSec < 0 || durationSec > 6 * 3600) {
    return { ok: false, error: 'That game time is not valid.' };
  }
  const stats: Record<string, number> = {};
  const raw = body?.stats && typeof body.stats === 'object' ? body.stats : {};
  for (const [k, v] of Object.entries(raw).slice(0, 8)) {
    if (!/^[a-zA-Z]{1,20}$/.test(k)) continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 1000000) stats[k] = n;
  }
  stats.durationSec = durationSec;
  return { ok: true, playerId, game, score, durationSec, stats };
}

export type ArkBucksReason = 'ark_first_game' | 'ark_personal_best';

/**
 * Decide whether a score is held for a leader, whether it is a new best, and which
 * PLCC Bucks it may earn (the database still applies kids-only and the caps).
 */
export function evaluateArkScore(input: {
  game: ArkGame;
  score: number;
  previousBest: number | null;
  holdMultiplier: number;
  durationSec: number;
  isChild: boolean;
  bucksEnabled: boolean;
  firstToday: boolean;
}): { held: boolean; holdReason: string | null; newBest: boolean; bucks: ArkBucksReason[] } {
  const ceiling = ARK_SCORE_CEILING[input.game];
  let holdReason: string | null = null;
  if (input.score > ceiling) {
    holdReason = `Above the ${ceiling.toLocaleString('en-US')} limit for this game`;
  } else if (
    input.previousBest != null &&
    input.previousBest >= 500 &&
    input.score > input.previousBest * Math.max(1.5, input.holdMultiplier)
  ) {
    holdReason = `Over ${input.holdMultiplier}× their best of ${input.previousBest.toLocaleString('en-US')}`;
  }
  const held = holdReason != null;
  const newBest = !held && input.score > 0 && (input.previousBest == null || input.score > input.previousBest);

  const bucks: ArkBucksReason[] = [];
  if (!held && input.isChild && input.bucksEnabled && input.durationSec >= ARK_MIN_SECONDS_FOR_BUCKS) {
    if (input.firstToday) bucks.push('ark_first_game');
    // A first-ever game sets a best but doesn't earn the personal-best Bucks.
    if (newBest && input.previousBest != null) bucks.push('ark_personal_best');
  }
  return { held, holdReason, newBest, bucks };
}

/** "Jerless Mahabir" → "Jerless M." — boards show first name and last initial only. */
export function leaderboardName(firstName: unknown, lastName: unknown): string {
  const f = String(firstName || '').trim().split(/\s+/)[0] || 'Player';
  const l = String(lastName || '').trim();
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
}

/** A hidden player on the public boards: "Player K." with no last name or photo. */
export function hiddenBoardName(firstName: unknown): { name: string; initials: string } {
  const f = String(firstName || '').trim();
  const initial = f ? f[0].toUpperCase() : '';
  return initial ? { name: `Player ${initial}.`, initials: initial } : { name: 'Player', initials: '?' };
}

/**
 * Who may change "hide my name on the boards". A parent may change it for their child
 * or themself. A child signed in on their own may hide their name, but may not show it
 * again once a parent has hidden it.
 */
export function canChangeHideName(input: {
  playerIsSelf: boolean;
  playerIsChild: boolean;
  next: boolean;
  current: { hideName: boolean; updatedBy: string | null } | null;
  userId: string;
}): boolean {
  if (!(input.playerIsSelf && input.playerIsChild)) return true;
  if (input.next) return true;
  const cur = input.current;
  return !cur || !cur.hideName || cur.updatedBy === input.userId;
}

function easternParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')) % 24,
    min: Number(get('minute')),
    s: Number(get('second')),
    weekday: get('weekday'),
  };
}

/** Midnight (Africa/Kampala) of the given day, as an ISO instant. */
function easternMidnightIso(now: Date, daysBack = 0): string {
  const p = easternParts(now);
  const local = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  const offsetMs = local - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.y, p.m - 1, p.d - daysBack) - offsetMs).toISOString();
}

/** Today's church day: "2026-10-21" and when it started. */
export function arkDayKey(now: Date = new Date()): { key: string; startIso: string } {
  const p = easternParts(now);
  const key = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  return { key, startIso: easternMidnightIso(now) };
}

/** Start of the church week (Monday 00:00 Africa/Kampala), matching awc_bucks_week_start. */
export function arkWeekStartIso(now: Date = new Date()): string {
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const back = Math.max(0, order.indexOf(easternParts(now).weekday));
  return easternMidnightIso(now, back);
}
