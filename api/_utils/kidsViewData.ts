import { DAY_MS, shiftWeek, weekStartKey } from './kidsWeek.js';
import { computeKidsBadges, type KidsBadge, type KidsLevel } from './kidsBadges.js';

export { weekStartKey };

/**
 * Kids View — read model for one child, built only from existing tables:
 * members (+ kids_theme), attendance_records, child_custody_records,
 * member_point_ledger, guardian_relationships, dependent_digital_cards.
 * Caller must already have verified the child is in the parent's household.
 */

export const KIDS_THEMES = ['soft_garden', 'adventure'] as const;
export type KidsTheme = (typeof KIDS_THEMES)[number];

export function normalizeKidsTheme(v: unknown): KidsTheme | null {
  const s = String(v ?? '').trim().toLowerCase();
  return (KIDS_THEMES as readonly string[]).includes(s) ? (s as KidsTheme) : null;
}

/** Consecutive weeks with a check-in, ending this week (or last week if none yet this week). */
export function weekStreak(weekKeys: Set<string>, now = new Date()): number {
  let cursor = weekStartKey(now);
  if (!weekKeys.has(cursor)) cursor = shiftWeek(cursor, -1);
  let n = 0;
  while (weekKeys.has(cursor) && n < 520) {
    n += 1;
    cursor = shiftWeek(cursor, -1);
  }
  return n;
}

export function ageFromBirthday(birthday: string | null, now = new Date()): number | null {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}/.test(birthday)) return null;
  // 1904 = birthday saved without a year (adults enter month & day only) — age unknown.
  if (birthday.startsWith('1904-')) return null;
  const [y, m, d] = birthday.slice(0, 10).split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age >= 0 && age < 30 ? age : null;
}

/** Select members.kids_theme, tolerating databases where the migration has not run yet. */
export async function readKidsThemes(supabase: any, ids: string[]): Promise<Map<string, KidsTheme>> {
  const out = new Map<string, KidsTheme>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from('members').select('id, kids_theme').in('id', ids);
  if (error) return out;
  for (const row of data || []) {
    const t = normalizeKidsTheme(row.kids_theme);
    if (t) out.set(String(row.id), t);
  }
  return out;
}

export type KidsViewPayload = {
  child: { id: string; firstName: string; name: string; age: number | null; theme: KidsTheme };
  stats: {
    weekStreak: number;
    totalCheckins: number;
    lastCheckinAt: string | null;
    lifetimePoints: number;
    pointsThisWeek: number;
  };
  weeklyPoints: Array<{ weekStart: string; points: number }>;
  card: { qrPayload: string; cardNumber: string | null } | null;
  /** PLCC Bucks wallet — null until the awc_bucks_phase_1 migration has run. */
  bucks: {
    balance: number;
    totalEarned: number;
    onHold?: number;
    outstandingCorrection?: number;
    history: Array<{ id: string; kind: 'award' | 'reversal' | 'redemption' | 'recovery'; amount: number; reasonLabel: string; awardedBy: string; createdAt: string; reversed: boolean }>;
    requests?: Array<{ id: string; prizeName: string; price: number; status: string }>;
    challenge?: { id: string; title: string; verseRef?: string | null; completed?: boolean } | null;
  } | null;
  badges: KidsBadge[];
  level: KidsLevel;
  themeReady: boolean;
};

export async function buildKidsView(
  supabase: any,
  childId: string,
  guardianUserId: string,
  legacyAge: string | null
): Promise<KidsViewPayload | null> {
  const { data: child } = await supabase
    .from('members')
    .select('id, first_name, last_name, birthday')
    .eq('id', childId)
    .maybeSingle();
  if (!child) return null;

  // Separate select so a database without the kids_theme column still loads.
  const themeRes = await supabase.from('members').select('kids_theme').eq('id', childId).maybeSingle();
  const themeReady = !themeRes.error;
  const theme = (themeReady && normalizeKidsTheme(themeRes.data?.kids_theme)) || 'soft_garden';

  const since = new Date(Date.now() - 400 * DAY_MS).toISOString();

  const [att, custody, ledger, guard, card, bucksRes] = await Promise.all([
    supabase
      .from('attendance_records')
      .select('checked_in_at')
      .eq('member_id', childId)
      .gte('checked_in_at', since)
      .order('checked_in_at', { ascending: false })
      .limit(500),
    supabase
      .from('child_custody_records')
      .select('checked_in_at')
      .eq('child_member_id', childId)
      .gte('checked_in_at', since)
      .order('checked_in_at', { ascending: false })
      .limit(500),
    supabase
      .from('member_point_ledger')
      .select('points, created_at')
      .eq('member_id', childId)
      .limit(5000),
    supabase
      .from('guardian_relationships')
      .select('id')
      .eq('guardian_user_id', guardianUserId)
      .eq('child_member_id', childId)
      .eq('status', 'active')
      .eq('can_view_card', true)
      .limit(1),
    supabase
      .from('dependent_digital_cards')
      .select('qr_token, card_number, status')
      .eq('member_id', childId)
      .maybeSingle(),
    supabase.rpc('awc_bucks_wallet', { p_child_member_id: childId, p_limit: 10 }),
  ]);

  const checkins: string[] = [
    ...((att.data || []) as any[]).map((r) => r.checked_in_at),
    ...((custody.data || []) as any[]).map((r) => r.checked_in_at),
  ].filter(Boolean);

  const weekKeys = new Set(checkins.map((iso) => weekStartKey(new Date(iso))));
  const game = computeKidsBadges(checkins, (ledger.data || []) as any[]);
  const lastCheckinAt = [...checkins].sort().pop() || null;

  const thisWeek = weekStartKey(new Date());
  const weekly = new Map<string, number>();
  for (let i = 5; i >= 0; i -= 1) weekly.set(shiftWeek(thisWeek, -i), 0);
  let lifetimePoints = 0;
  for (const row of (ledger.data || []) as any[]) {
    const pts = Number(row.points) || 0;
    lifetimePoints += pts;
    const key = weekStartKey(new Date(row.created_at));
    if (weekly.has(key)) weekly.set(key, (weekly.get(key) || 0) + pts);
  }

  const canViewCard = Array.isArray(guard.data) && guard.data.length > 0;
  const cardRow = card.data;
  const showCard = canViewCard && cardRow && cardRow.status === 'active' && cardRow.qr_token;

  const firstName = String(child.first_name || '').trim() || 'Friend';
  const name = `${child.first_name || ''} ${child.last_name || ''}`.trim() || firstName;
  const legacyNum = legacyAge != null && /^\d{1,2}$/.test(String(legacyAge).trim()) ? Number(legacyAge) : null;

  return {
    child: {
      id: String(child.id),
      firstName,
      name,
      age: ageFromBirthday(child.birthday ? String(child.birthday) : null) ?? legacyNum,
      theme,
    },
    stats: {
      weekStreak: weekStreak(weekKeys),
      totalCheckins: game.uniqueCheckins,
      lastCheckinAt,
      lifetimePoints,
      pointsThisWeek: weekly.get(thisWeek) || 0,
    },
    weeklyPoints: Array.from(weekly, ([weekStart, points]) => ({ weekStart, points })),
    card: showCard ? { qrPayload: String(cardRow.qr_token), cardNumber: cardRow.card_number || null } : null,
    bucks: bucksRes?.error || !bucksRes?.data ? null : (bucksRes.data as KidsViewPayload['bucks']),
    badges: game.badges,
    level: game.level,
    themeReady,
  };
}
