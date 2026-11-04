/**
 * Households list v2 — clean-up suggestions.
 * Pure helpers: duplicate grouping, name tidying, completeness.
 */

export type CleanupHousehold = {
  id: string;
  name: string;
  memberCount: number;
  address: string;
  phone: string;
  headMemberId: string;
  createdAt: string;
};

const SMALL_WORDS = new Set(['of', 'the', 'and', 'de', 'da', 'du']);

/** Key used to spot the same family entered twice ("Hiire", "Hiire family", "The Hiire Household"). */
export function householdKey(name: string): string {
  let n = String(name || '').toLowerCase().trim();
  n = n.replace(/^the\s+/, '');
  n = n.replace(/\s+(family|household|home|house)$/, '');
  return n.replace(/[^a-z]/g, '');
}

function needsFix(word: string): boolean {
  const letters = word.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return false;
  if (letters === letters.toLowerCase()) return true;
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true;
  if (letters[0] === letters[0].toLowerCase()) return true;
  const rest = letters.slice(1);
  const upperInRest = rest.replace(/[^A-Z]/g, '').length;
  // "MuSOKE" → fix; "McDonald" / "DeShawn" → leave alone
  return upperInRest >= 2 && upperInRest * 2 > rest.length;
}

function titleSegment(seg: string): string {
  if (!seg) return seg;
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
}

/** "kasibante Family" → "Kasibante Family", "MuSOKE Family" → "Musoke Family", "of the cross Family" → "Of the Cross Family". */
export function tidyHouseholdName(name: string): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      if (!needsFix(w)) return w;
      return w
        .split(/([-'’])/)
        .map((part) => (/^[-'’]$/.test(part) ? part : titleSegment(part)))
        .join('');
    })
    .join(' ');
}

export function householdCompleteness(h: CleanupHousehold): number {
  return (
    (h.memberCount > 0 ? 1 : 0) +
    (h.headMemberId ? 1 : 0) +
    (h.address ? 1 : 0) +
    (h.phone ? 1 : 0)
  );
}

/** Best household to keep in a duplicate group: most members, then most details, then already-tidy name, then oldest. */
export function pickKeeper<T extends CleanupHousehold>(group: T[]): T {
  return [...group].sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    const cb = householdCompleteness(b);
    const ca = householdCompleteness(a);
    if (cb !== ca) return cb - ca;
    const ta = tidyHouseholdName(a.name) === a.name ? 0 : 1;
    const tb = tidyHouseholdName(b.name) === b.name ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  })[0];
}

/** Groups of 2+ households that look like the same family, largest group first. */
export function findDuplicateGroups<T extends CleanupHousehold>(list: T[]): T[][] {
  const byKey = new Map<string, T[]>();
  for (const h of list) {
    const key = householdKey(h.name);
    if (!key) continue;
    const arr = byKey.get(key) || [];
    arr.push(h);
    byKey.set(key, arr);
  }
  return Array.from(byKey.values())
    .filter((g) => g.length > 1)
    .map((g) => {
      const keeper = pickKeeper(g);
      return [keeper, ...g.filter((h) => h.id !== keeper.id).sort((a, b) => b.memberCount - a.memberCount)];
    })
    .sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name));
}

export type NameFix = { id: string; from: string; to: string };

/** Names worth tidying. Skips any whose tidy form would clash with another household (merge those instead). */
export function findNameFixes(list: CleanupHousehold[]): NameFix[] {
  const taken = new Map<string, string[]>();
  for (const h of list) {
    const k = h.name.trim().toLowerCase();
    taken.set(k, [...(taken.get(k) || []), h.id]);
  }
  const fixes: NameFix[] = [];
  for (const h of list) {
    const to = tidyHouseholdName(h.name);
    if (!to || to === h.name) continue;
    const owners = taken.get(to.toLowerCase()) || [];
    if (owners.some((id) => id !== h.id)) continue;
    fixes.push({ id: h.id, from: h.name, to });
  }
  return fixes.sort((a, b) => a.from.localeCompare(b.from));
}
