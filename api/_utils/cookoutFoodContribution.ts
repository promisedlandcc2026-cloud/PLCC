/** Cookout food gift: minimum $20, in $5 steps ($20, $25, $30…). */

export const COOKOUT_FOOD_CONTRIBUTION_MIN = 20;
export const COOKOUT_FOOD_CONTRIBUTION_STEP = 5;
export const COOKOUT_FOOD_CONTRIBUTION_MAX = 500;

export const COOKOUT_FOOD_CONTRIBUTION_OPTIONS: number[] = (() => {
  const list: number[] = [];
  for (
    let n = COOKOUT_FOOD_CONTRIBUTION_MIN;
    n <= COOKOUT_FOOD_CONTRIBUTION_MAX;
    n += COOKOUT_FOOD_CONTRIBUTION_STEP
  ) {
    list.push(n);
  }
  return list;
})();

export const COOKOUT_FOOD_CONTRIBUTION_HINT =
  'Choose $20 or more ($20, $25, $30…). Amounts under $20 are not allowed.';

export function parseCookoutFoodContribution(
  raw: unknown
): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: false, error: COOKOUT_FOOD_CONTRIBUTION_HINT };
  }
  const cleaned = String(raw).trim().replace(/^\$/, '').replace(/,/g, '');
  if (cleaned === '' || /^optional$/i.test(cleaned)) {
    return { ok: false, error: COOKOUT_FOOD_CONTRIBUTION_HINT };
  }
  const a = Number(cleaned);
  if (!Number.isFinite(a)) {
    return { ok: false, error: COOKOUT_FOOD_CONTRIBUTION_HINT };
  }
  const cents = Math.round(a * 100);
  if (
    a < COOKOUT_FOOD_CONTRIBUTION_MIN ||
    a > COOKOUT_FOOD_CONTRIBUTION_MAX ||
    cents % (COOKOUT_FOOD_CONTRIBUTION_STEP * 100) !== 0
  ) {
    return { ok: false, error: COOKOUT_FOOD_CONTRIBUTION_HINT };
  }
  return { ok: true, value: cents / 100 };
}

/**
 * An event RSVP contribution: whole dollars from the event's minimum up to $1,000.
 * (Events with payments set up in the Vault choose their own minimum and amount buttons.)
 */
export function parseRsvpContribution(
  raw: unknown,
  min: number = COOKOUT_FOOD_CONTRIBUTION_MIN,
): { ok: true; value: number } | { ok: false; error: string } {
  const floor = Math.max(1, Math.floor(Number(min) || COOKOUT_FOOD_CONTRIBUTION_MIN));
  const error = `Choose $${floor} or more for your contribution.`;
  const cleaned = String(raw ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!cleaned) return { ok: false, error };
  const a = Number(cleaned);
  if (!Number.isFinite(a) || a < floor || a > 1000 || Math.round(a * 100) % 100 !== 0) {
    return { ok: false, error: a > 1000 ? 'Contributions online are limited to $1,000.' : error };
  }
  return { ok: true, value: Math.round(a) };
}

/** Amount buttons for an event: its own list, else $20 / $40 / $60 / $100 from the minimum. */
export function rsvpGiftOptions(min: number, options?: unknown): number[] {
  const floor = Math.max(1, Math.floor(Number(min) || COOKOUT_FOOD_CONTRIBUTION_MIN));
  const list = Array.isArray(options)
    ? options.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n >= floor && n <= 1000)
    : [];
  const unique = Array.from(new Set(list)).sort((a, b) => a - b).slice(0, 6);
  if (unique.length) return unique;
  return [floor, floor * 2, floor * 3, floor * 5].filter((n) => n <= 1000);
}
