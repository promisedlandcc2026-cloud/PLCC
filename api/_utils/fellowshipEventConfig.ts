/**
 * Fellowship Event Kit — config for RSVP + gift + consent flows.
 * Cookout remains the default; other events can pass eventId.
 */

import {
  FELLOWSHIP_RSVP_PAYMENT_METHODS,
  type RsvpPaymentMethodPublic,
} from './rsvpGiftPayment.js';

export type FellowshipEventConfig = {
  eventId: string;
  name: string;
  /** Short label for nav / dropdowns */
  shortName: string;
  date: string;
  timeLabel: string;
  location: string;
  startsAtIso: string;
  /** Public RSVP close instant (ISO with offset) */
  rsvpCloseAt: string;
  giftMin: number;
  /** Amount buttons (whole dollars). Omit for the default $min / 2× / 3× / 5× set. */
  giftOptions?: number[];
  /** Line under the amount buttons. Omit for "$min minimum per household…". */
  giftHint?: string;
  /** The contribution is per adult from the home (2 adults = 2× the minimum). */
  giftPerPerson?: boolean;
  tshirtsEnabled: boolean;
  requireAllergyConsent: boolean;
  requireInjuryConsent: boolean;
  /** Max adults living in the household (includes adult children). Guests are separate. */
  maxAdultsFromHome: number;
  /** Public submit button label */
  submitLabel: string;
  /** Optional dinner menu shown next to the allergies field */
  menuItems?: string[];
  /** Thanksgiving-style Pledge vs Pay Now on the public RSVP */
  paymentChoiceEnabled?: boolean;
  /** Send-to details shown when Pay Now is selected */
  paymentMethods?: RsvpPaymentMethodPublic[];
  /**
   * Fund the event's payments are tracked under in PLCC Tithe and DCB.
   * Other events use the event's own name (e.g. "Thanksgiving Dinner 2027").
   */
  fundName?: string;
  /**
   * Names this event's fund had before (newest last). Tithe, DCB and the Vault ledger use
   * them once to find and rename the same fund, so earlier gifts stay with the event.
   */
  formerFundNames?: string[];
};

/** PLCC Grand Family Celebration 2026 dinner menu (allergy reference). */
export const THANKSGIVING_2026_MENU: string[] = [
  'Matooke',
  'Rice pillawo',
  'Posho',
  'Sweet potatoes/Yams',
  'Cassava/Irish',
  'Chapats',
  'Beef stew/sauce',
  'Chicken sauce',
  'Peanut sauce',
  'Bean/peas',
  'Vegetables',
  'Turkey',
  'Pasta salad',
  'Mac & cheese',
  'Corn',
  'Apple Pie',
  'Mandazi',
  'Cake',
];

export const DEFAULT_FELLOWSHIP_EVENT_ID = 'a1b2c3d4-e5f6-4789-a012-202609201400';

/** PLCC Grand Family Celebration 2026 (was "PLCC Thanksgiving Dinner 2026"; renamed Oct 29, 2026). */
// The live calendar event (recreated Oct 26, 2026 and moved to Dec 6). The old built-in id
// a1b2c3d4-…-202611221400 kept bringing back a Nov 22 copy, so it is no longer used.
export const THANKSGIVING_2026_EVENT_ID = '86ac9498-ee56-4c6a-baae-079832b0ea73';

/** Marrieds Dinner 2026 (Sunday, December 27, 4:00 PM). */
// The live calendar event (created Oct 6, 2026). The old built-in Dec 12 copy
// (a1b2c3d4-…-202612121800) was deleted on Nov 1, 2026, so its id is no longer used.
export const MARRIEDS_DINNER_2026_EVENT_ID = '8cd1c63d-e041-423d-bcd0-8c6a6b9c10bf';

export const FELLOWSHIP_EVENTS: Record<string, FellowshipEventConfig> = {
  [DEFAULT_FELLOWSHIP_EVENT_ID]: {
    eventId: DEFAULT_FELLOWSHIP_EVENT_ID,
    name: 'Fellowship Cookout',
    shortName: 'Cookout',
    date: '2026-09-20',
    timeLabel: '2:00 PM – 6:00 PM',
    location: 'Church grounds',
    startsAtIso: '2026-09-20T18:00:00+00',
    rsvpCloseAt: '2026-09-07T00:00:00-04:00',
    giftMin: 20,
    tshirtsEnabled: true,
    requireAllergyConsent: true,
    requireInjuryConsent: true,
    maxAdultsFromHome: 2,
    submitLabel: 'Sign up for cookout',
    paymentChoiceEnabled: false,
    fundName: 'Fellowship Cookout 2026',
  },
  [THANKSGIVING_2026_EVENT_ID]: {
    eventId: THANKSGIVING_2026_EVENT_ID,
    name: 'PLCC GRAND FAMILY CELEBRATION 2026',
    shortName: 'Grand Family Celebration',
    // Moved from Nov 22 to Sun Dec 6, 2026, starting at noon.
    date: '2026-12-06',
    timeLabel: '12:00 PM – 7:00 PM',
    location: '2nd Floor Sanctuary',
    startsAtIso: '2026-12-06T17:00:00+00',
    rsvpCloseAt: '2026-12-04T23:59:00-05:00',
    giftMin: 20,
    tshirtsEnabled: false,
    requireAllergyConsent: true,
    requireInjuryConsent: true,
    maxAdultsFromHome: 8,
    submitLabel: 'Sign Up For Grand Family Celebration',
    menuItems: THANKSGIVING_2026_MENU,
    paymentChoiceEnabled: true,
    paymentMethods: FELLOWSHIP_RSVP_PAYMENT_METHODS,
    fundName: 'PLCC GRAND FAMILY CELEBRATION 2026',
    formerFundNames: ['Join us at PLCC Table of Thanksgiving 2026', 'PLCC THANKSGIVING DINNER 2026'],
  },
  [MARRIEDS_DINNER_2026_EVENT_ID]: {
    eventId: MARRIEDS_DINNER_2026_EVENT_ID,
    name: 'Marrieds Dinner 2026',
    shortName: 'Marrieds Dinner',
    // Moved from Sat Dec 12 to Sun Dec 27, 2026, 4:00 PM – 8:00 PM.
    date: '2026-12-27',
    timeLabel: '4:00 PM – 8:00 PM',
    location: '2nd Floor Sanctuary',
    startsAtIso: '2026-12-27T21:00:00+00',
    // Signups close a week before, like the Dec 12 date did.
    rsvpCloseAt: '2026-12-20T23:59:00-05:00',
    giftMin: 100,
    giftOptions: [100],
    giftHint: '$100 per person (required).',
    giftPerPerson: true,
    tshirtsEnabled: false,
    requireAllergyConsent: true,
    requireInjuryConsent: true,
    maxAdultsFromHome: 2,
    submitLabel: 'Sign Up For Marrieds Dinner',
    paymentChoiceEnabled: true,
    paymentMethods: FELLOWSHIP_RSVP_PAYMENT_METHODS,
    fundName: 'Marrieds Dinner 2026',
  },
};

/**
 * Clean a fund name the same way PLCC Tithe does (plain text, 2–60 characters),
 * so the Give link, Tithe and DCB all use the exact same name.
 */
export function cleanEventFundName(raw: unknown): string | null {
  const name = String(raw ?? '')
    .replace(/[^\p{L}\p{N} '&.,:()\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return name.length >= 2 ? name : null;
}

/**
 * The fund an event's RSVP payments go to in PLCC Tithe and DCB: the event's own name
 * (e.g. "Thanksgiving Dinner 2026"), or the kit's fundName for the built-in events.
 */
export function eventFundName(eventId: string | null | undefined, eventName: string | null | undefined): string | null {
  const kit = FELLOWSHIP_EVENTS[String(eventId || '').trim()];
  return cleanEventFundName(kit?.fundName) || cleanEventFundName(eventName);
}

/**
 * The event's earlier fund names: the built-in event's old names, plus (after a rename in the
 * calendar) the fund name the event had before. Used once to find and rename the same fund.
 */
export function eventFundPreviousNames(
  eventId: string | null | undefined,
  previousEventName?: string | null
): string[] {
  const kit = FELLOWSHIP_EVENTS[String(eventId || '').trim()];
  // A built-in event's fund name is fixed in its kit, so only its listed old names count;
  // any other event's fund is named after the event, so its old event name is its old fund name.
  const raw = kit ? kit.formerFundNames || [] : [previousEventName];
  const current = eventFundName(eventId, kit ? kit.name : null)?.toLowerCase() || '';
  const seen = new Set<string>();
  return raw
    .map((n) => cleanEventFundName(n))
    .filter((n): n is string => {
      if (!n) return false;
      const k = n.toLowerCase();
      if (k === current || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function getFellowshipEventConfig(eventId?: string | null): FellowshipEventConfig {
  const id = (eventId || '').trim() || DEFAULT_FELLOWSHIP_EVENT_ID;
  return FELLOWSHIP_EVENTS[id] || FELLOWSHIP_EVENTS[DEFAULT_FELLOWSHIP_EVENT_ID];
}

/** All fellowship RSVP events, oldest date first. */
export function listFellowshipEvents(): FellowshipEventConfig[] {
  return Object.values(FELLOWSHIP_EVENTS).sort((a, b) => a.date.localeCompare(b.date));
}

export function isFellowshipRsvpClosed(
  config: FellowshipEventConfig,
  nowMs: number = Date.now()
): boolean {
  return nowMs >= Date.parse(config.rsvpCloseAt);
}
