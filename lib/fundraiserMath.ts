/**
 * Fundraiser calculator — pure functions shared by the Vault API and the page.
 *
 *   Given now      = paid gifts + game/event cash + online gifts (PLCC Tithe)
 *   Promised       = pledges + fun charges (what people owe)
 *   Total raised   = everything received (given now + payments on pledges/charges)
 *   Still owed     = promised − paid toward promises
 *   Goal left      = goal − total raised
 *
 * All amounts are integer cents.
 */

export type FundraiserKind = 'paid' | 'pledge' | 'charge';
export type FundraiserSource = 'member' | 'visitor' | 'game' | 'online';

export type FundraiserEntryLike = {
  id: string;
  kind: FundraiserKind;
  source_type: FundraiserSource;
  member_id?: string | null;
  display_name: string;
  charge_item_id?: string | null;
  charge_label?: string | null;
  quantity?: number | null;
  owed_amount_cents: number;
  received_amount_cents: number;
};

export type FundraiserSummary = {
  givenNowCents: number;
  onlineCents: number;
  gameCents: number;
  pledgedCents: number;
  pledgePaidCents: number;
  chargedCents: number;
  chargePaidCents: number;
  totalRaisedCents: number;
  stillOwedCents: number;
  promisedCents: number;
  /** Everything raised plus everything still owed */
  expectedTotalCents: number;
  goalCents: number | null;
  goalLeftCents: number | null;
  /** Goal left after everyone pays what they owe */
  goalLeftAfterOwedCents: number | null;
  percentRaised: number | null;
  entryCount: number;
  peopleOwingCount: number;
};

export type OwedLine = {
  entryId: string;
  kind: 'pledge' | 'charge';
  label: string;
  owedCents: number;
  paidCents: number;
  leftCents: number;
};

export type PersonBalance = {
  key: string;
  memberId: string | null;
  name: string;
  owedCents: number;
  paidCents: number;
  leftCents: number;
  lines: OwedLine[];
};

export type ChargeBreakdown = {
  key: string;
  label: string;
  count: number;
  quantity: number;
  chargedCents: number;
  paidCents: number;
  leftCents: number;
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x) : 0;
};

export function entryLeftCents(entry: FundraiserEntryLike): number {
  if (entry.kind === 'paid') return 0;
  return Math.max(0, n(entry.owed_amount_cents) - n(entry.received_amount_cents));
}

export function summarizeFundraiser(entries: FundraiserEntryLike[], goalCents?: number | null): FundraiserSummary {
  let givenNow = 0;
  let online = 0;
  let game = 0;
  let pledged = 0;
  let pledgePaid = 0;
  let charged = 0;
  let chargePaid = 0;
  let stillOwed = 0;
  const owing = new Set<string>();

  for (const e of entries) {
    const received = n(e.received_amount_cents);
    const owed = n(e.owed_amount_cents);
    if (e.kind === 'paid') {
      givenNow += received;
      if (e.source_type === 'online') online += received;
      if (e.source_type === 'game') game += received;
    } else if (e.kind === 'pledge') {
      pledged += owed;
      pledgePaid += Math.min(received, owed);
    } else {
      charged += owed;
      chargePaid += Math.min(received, owed);
    }
    const left = entryLeftCents(e);
    if (left > 0) {
      stillOwed += left;
      owing.add(personKey(e));
    }
  }

  const totalRaised = givenNow + pledgePaid + chargePaid;
  const goal = goalCents && goalCents > 0 ? n(goalCents) : null;
  return {
    givenNowCents: givenNow,
    onlineCents: online,
    gameCents: game,
    pledgedCents: pledged,
    pledgePaidCents: pledgePaid,
    chargedCents: charged,
    chargePaidCents: chargePaid,
    totalRaisedCents: totalRaised,
    stillOwedCents: stillOwed,
    promisedCents: pledged + charged,
    expectedTotalCents: totalRaised + stillOwed,
    goalCents: goal,
    goalLeftCents: goal == null ? null : Math.max(0, goal - totalRaised),
    goalLeftAfterOwedCents: goal == null ? null : Math.max(0, goal - totalRaised - stillOwed),
    percentRaised: goal == null ? null : Math.min(100, Math.floor((totalRaised / goal) * 100)),
    entryCount: entries.length,
    peopleOwingCount: owing.size,
  };
}

export function personKey(e: Pick<FundraiserEntryLike, 'member_id' | 'display_name'>): string {
  return e.member_id ? `m:${e.member_id}` : `n:${String(e.display_name || '').trim().toLowerCase()}`;
}

function lineLabel(e: FundraiserEntryLike): string {
  if (e.kind === 'pledge') return 'Pledge';
  const qty = n(e.quantity) || 1;
  const label = String(e.charge_label || 'Charge');
  return qty > 1 ? `${label} × ${qty}` : label;
}

/** Everyone who still owes, biggest balance first, with each pledge/charge listed. */
export function balancesByPerson(entries: FundraiserEntryLike[]): PersonBalance[] {
  const map = new Map<string, PersonBalance>();
  for (const e of entries) {
    if (e.kind === 'paid') continue;
    const key = personKey(e);
    const owed = n(e.owed_amount_cents);
    const paid = Math.min(n(e.received_amount_cents), owed);
    const left = Math.max(0, owed - paid);
    let p = map.get(key);
    if (!p) {
      p = { key, memberId: e.member_id || null, name: e.display_name, owedCents: 0, paidCents: 0, leftCents: 0, lines: [] };
      map.set(key, p);
    }
    p.owedCents += owed;
    p.paidCents += paid;
    p.leftCents += left;
    p.lines.push({ entryId: e.id, kind: e.kind, label: lineLabel(e), owedCents: owed, paidCents: paid, leftCents: left });
  }
  return [...map.values()]
    .filter((p) => p.leftCents > 0)
    .sort((a, b) => b.leftCents - a.leftCents || a.name.localeCompare(b.name));
}

/** Totals per fun charge ("Coming in late: 14 × $20 = $280"). */
export function chargeBreakdown(entries: FundraiserEntryLike[]): ChargeBreakdown[] {
  const map = new Map<string, ChargeBreakdown>();
  for (const e of entries) {
    if (e.kind !== 'charge') continue;
    const label = String(e.charge_label || 'Charge');
    const key = e.charge_item_id || `label:${label.toLowerCase()}`;
    const owed = n(e.owed_amount_cents);
    const paid = Math.min(n(e.received_amount_cents), owed);
    let row = map.get(key);
    if (!row) {
      row = { key, label, count: 0, quantity: 0, chargedCents: 0, paidCents: 0, leftCents: 0 };
      map.set(key, row);
    }
    row.count += 1;
    row.quantity += n(e.quantity) || 1;
    row.chargedCents += owed;
    row.paidCents += paid;
    row.leftCents += owed - paid;
  }
  return [...map.values()].sort((a, b) => b.chargedCents - a.chargedCents);
}

export function formatCents(cents: number | null | undefined): string {
  const v = n(cents) / 100;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** "$1,234.50" / "1234.5" / "20" → cents; NaN when not a valid amount. */
export function dollarsToCents(input: string | number | null | undefined): number {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : NaN;
  const cleaned = String(input ?? '').replace(/[$,\s]/g, '');
  if (!cleaned || !/^\d*(\.\d{0,2})?$/.test(cleaned)) return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? Math.round(v * 100) : NaN;
}

export const FUNDRAISER_PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

export function paymentMethodLabel(value: string | null | undefined): string {
  return FUNDRAISER_PAYMENT_METHODS.find((m) => m.value === value)?.label || (value ? String(value) : '');
}

export function isPaymentMethod(value: unknown): boolean {
  return FUNDRAISER_PAYMENT_METHODS.some((m) => m.value === value);
}

// ---------------------------------------------------------------------------
// Applying a payment to someone's open pledges and fun charges
// ---------------------------------------------------------------------------

export type OpenItem = { entryId: string; leftCents: number };

/**
 * Split a payment across open items in the order given (oldest first).
 * Whatever is left after every item is paid in full is returned as `remainderCents`
 * and is kept as a separate gift.
 */
export function allocatePayment(items: OpenItem[], amountCents: number): {
  allocations: Array<{ entryId: string; amountCents: number }>;
  remainderCents: number;
} {
  let left = Math.max(0, Math.round(Number(amountCents) || 0));
  const allocations: Array<{ entryId: string; amountCents: number }> = [];
  for (const item of items) {
    if (left <= 0) break;
    const room = Math.max(0, Math.round(item.leftCents));
    if (room <= 0) continue;
    const take = Math.min(room, left);
    allocations.push({ entryId: item.entryId, amountCents: take });
    left -= take;
  }
  return { allocations, remainderCents: left };
}

// ---------------------------------------------------------------------------
// "Pay my balance" — a link to PLCC Tithe that Tithe hands back with the gift
// ---------------------------------------------------------------------------

export const AWC_TITHE_GIVE_URL = 'https://plcc-tithe.vercel.app/';

/** frm:<fundraiser>.<member> for members; fre:<fundraiser>.<entry> for visitors. */
export function fundraiserBalanceRef(fundraiserId: string, person: { memberId: string | null; firstEntryId: string }): string {
  return person.memberId ? `frm:${fundraiserId}.${person.memberId}` : `fre:${fundraiserId}.${person.firstEntryId}`;
}

export function parseFundraiserBalanceRef(ref: unknown): { kind: 'member' | 'entry'; fundraiserId: string; id: string } | null {
  const m = /^fr([me]):([0-9a-f-]{36})\.([0-9a-f-]{36})$/i.exec(String(ref || '').trim());
  if (!m) return null;
  return { kind: m[1].toLowerCase() === 'm' ? 'member' : 'entry', fundraiserId: m[2].toLowerCase(), id: m[3].toLowerCase() };
}

export function buildFundraiserPayLink(input: {
  fundraiserId: string;
  fundraiserTitle: string;
  titheFundId: string;
  person: Pick<PersonBalance, 'memberId' | 'leftCents' | 'lines'>;
}): string | null {
  const firstEntryId = input.person.lines.find((l) => l.leftCents > 0)?.entryId;
  if (!input.titheFundId || !firstEntryId || input.person.leftCents <= 0) return null;
  const params = new URLSearchParams();
  params.set('amount', (input.person.leftCents / 100).toFixed(2));
  params.set('ref', fundraiserBalanceRef(input.fundraiserId, { memberId: input.person.memberId, firstEntryId }));
  params.set('for', `${input.fundraiserTitle} balance`.slice(0, 60));
  params.set('fund', input.titheFundId);
  params.set('from', 'vault-fundraiser');
  return `${AWC_TITHE_GIVE_URL}?${params.toString()}`;
}
