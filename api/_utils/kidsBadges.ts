/**
 * Kids View badges + levels — computed, never stored.
 * Inputs are rows the Vault already records (check-ins and the point ledger),
 * so badges can't drift from reality and need no table or admin upkeep.
 * Badges use the LONGEST streak ever, so a missed week never takes one away.
 */
import { weekStartKey } from './kidsWeek.js';

export type BadgeCategory = 'checkins' | 'streak' | 'points' | 'midweek';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export type KidsBadge = {
  id: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  goal: number;
  progress: number; // capped at goal
  earned: boolean;
  earnedAt: string | null; // ISO of the moment the goal was reached
};

export type KidsLevel = {
  level: number;
  title: string;
  points: number;
  levelStart: number;
  nextLevelAt: number | null; // null at max level
};

type Def = { id: string; name: string; description: string; category: BadgeCategory; tier: BadgeTier; goal: number };

export const BADGE_DEFS: Def[] = [
  { id: 'first-checkin', name: 'First Steps', description: 'Check in for the first time', category: 'checkins', tier: 'bronze', goal: 1 },
  { id: 'checkins-5', name: 'Regular', description: 'Check in 5 times', category: 'checkins', tier: 'silver', goal: 5 },
  { id: 'checkins-10', name: 'Faithful Friend', description: 'Check in 10 times', category: 'checkins', tier: 'gold', goal: 10 },
  { id: 'checkins-25', name: 'Pillar', description: 'Check in 25 times', category: 'checkins', tier: 'diamond', goal: 25 },
  { id: 'streak-3', name: 'On Fire', description: 'Check in 3 weeks in a row', category: 'streak', tier: 'bronze', goal: 3 },
  { id: 'streak-6', name: 'Unstoppable', description: 'Check in 6 weeks in a row', category: 'streak', tier: 'silver', goal: 6 },
  { id: 'streak-12', name: 'Iron Will', description: 'Check in 12 weeks in a row', category: 'streak', tier: 'gold', goal: 12 },
  { id: 'streak-26', name: 'Half-Year Hero', description: 'Check in 26 weeks in a row', category: 'streak', tier: 'diamond', goal: 26 },
  { id: 'points-100', name: 'Rising Star', description: 'Earn 100 points', category: 'points', tier: 'bronze', goal: 100 },
  { id: 'points-250', name: 'Gold Star', description: 'Earn 250 points', category: 'points', tier: 'silver', goal: 250 },
  { id: 'points-500', name: 'Superstar', description: 'Earn 500 points', category: 'points', tier: 'gold', goal: 500 },
  { id: 'points-1000', name: 'Legend', description: 'Earn 1,000 points', category: 'points', tier: 'diamond', goal: 1000 },
  { id: 'midweek-3', name: 'Midweek Warrior', description: 'Check in on 3 days that are not Sunday', category: 'midweek', tier: 'silver', goal: 3 },
];

const LEVELS: Array<{ at: number; title: string }> = [
  { at: 0, title: 'Seedling' },
  { at: 50, title: 'Sprout' },
  { at: 150, title: 'Explorer' },
  { at: 300, title: 'Trailblazer' },
  { at: 500, title: 'Champion' },
  { at: 800, title: 'Hero' },
  { at: 1200, title: 'Legend' },
];

export function levelFor(points: number): KidsLevel {
  const pts = Math.max(0, Math.floor(points));
  let i = 0;
  while (i + 1 < LEVELS.length && pts >= LEVELS[i + 1].at) i += 1;
  return {
    level: i + 1,
    title: LEVELS[i].title,
    points: pts,
    levelStart: LEVELS[i].at,
    nextLevelAt: i + 1 < LEVELS.length ? LEVELS[i + 1].at : null,
  };
}

function isSundayET(iso: string): boolean {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Kampala', weekday: 'short' }).format(new Date(iso));
  return wd === 'Sun';
}

/**
 * Same-day duplicates (e.g. scanner + Kids desk) count once, so a single
 * Sunday can't earn two check-ins.
 */
function dedupeByDay(checkins: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' });
  for (const iso of [...checkins].sort()) {
    const day = fmt.format(new Date(iso));
    if (seen.has(day)) continue;
    seen.add(day);
    out.push(iso);
  }
  return out;
}

export function computeKidsBadges(
  checkinsRaw: string[],
  ledger: Array<{ points: number; created_at: string }>
): { badges: KidsBadge[]; level: KidsLevel; longestStreak: number; uniqueCheckins: number } {
  const checkins = dedupeByDay(checkinsRaw.filter(Boolean));

  // Running counts with the timestamp each threshold was crossed.
  const nthCheckin = (n: number) => (checkins.length >= n ? checkins[n - 1] : null);
  const midweek = checkins.filter((iso) => !isSundayET(iso));
  const nthMidweek = (n: number) => (midweek.length >= n ? midweek[n - 1] : null);

  // Longest weekly streak, plus when each length was first reached.
  const weekFirst = new Map<string, string>();
  for (const iso of checkins) {
    const k = weekStartKey(new Date(iso));
    if (!weekFirst.has(k)) weekFirst.set(k, iso);
  }
  const weeks = Array.from(weekFirst.keys()).sort();
  const reachedAt = new Map<number, string>();
  let run = 0;
  let longest = 0;
  for (let i = 0; i < weeks.length; i += 1) {
    const prev = i > 0 ? Date.parse(`${weeks[i - 1]}T00:00:00Z`) : NaN;
    const cur = Date.parse(`${weeks[i]}T00:00:00Z`);
    run = i > 0 && cur - prev === 7 * 86_400_000 ? run + 1 : 1;
    if (!reachedAt.has(run)) reachedAt.set(run, weekFirst.get(weeks[i])!);
    longest = Math.max(longest, run);
  }

  // Points: running total, timestamp each goal was crossed (and stayed crossed).
  const rows = [...ledger].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let total = 0;
  const pointsCrossed = new Map<number, string>();
  const pointGoals = BADGE_DEFS.filter((d) => d.category === 'points').map((d) => d.goal);
  for (const r of rows) {
    total += Number(r.points) || 0;
    for (const g of pointGoals) {
      if (total >= g && !pointsCrossed.has(g)) pointsCrossed.set(g, r.created_at);
      if (total < g) pointsCrossed.delete(g); // corrections below a goal un-cross it
    }
  }
  const lifetime = Math.max(0, total);

  const badges: KidsBadge[] = BADGE_DEFS.map((d) => {
    let have = 0;
    let at: string | null = null;
    if (d.category === 'checkins') {
      have = checkins.length;
      at = nthCheckin(d.goal);
    } else if (d.category === 'midweek') {
      have = midweek.length;
      at = nthMidweek(d.goal);
    } else if (d.category === 'streak') {
      have = longest;
      at = reachedAt.get(d.goal) || null;
    } else {
      have = lifetime;
      at = pointsCrossed.get(d.goal) || null;
    }
    const earned = have >= d.goal;
    return { ...d, progress: Math.min(have, d.goal), earned, earnedAt: earned ? at : null };
  });

  return { badges, level: levelFor(lifetime), longestStreak: longest, uniqueCheckins: checkins.length };
}
