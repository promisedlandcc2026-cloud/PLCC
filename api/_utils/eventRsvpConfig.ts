/**
 * DB-backed RSVP signup config for calendar events.
 * Fellowship kit remains an overlay for known Cookout / Thanksgiving IDs.
 */

import {
  COOKOUT_FOOD_CONTRIBUTION_MIN,
  rsvpGiftOptions,
} from './cookoutFoodContribution.js';
import {
  DEFAULT_FELLOWSHIP_EVENT_ID,
  FELLOWSHIP_EVENTS,
  MARRIEDS_DINNER_2026_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
  eventFundName,
  getFellowshipEventConfig,
  type FellowshipEventConfig,
} from './fellowshipEventConfig.js';
import { FELLOWSHIP_RSVP_PAYMENT_METHODS, type RsvpPaymentMethodPublic } from './rsvpGiftPayment.js';

export type RsvpTemplate = 'simple' | 'fellowship';

export type EventRsvpRuntimeConfig = {
  eventId: string;
  name: string;
  shortName: string;
  date: string;
  timeLabel: string;
  location: string;
  template: RsvpTemplate;
  rsvpCloseAt: string;
  closed: boolean;
  giftMin: number;
  tshirtsEnabled: boolean;
  maxAdultsFromHome: number;
  submitLabel: string;
  menuItems?: string[];
  requireAllergyConsent: boolean;
  requireInjuryConsent: boolean;
  paymentChoiceEnabled: boolean;
  paymentMethods: RsvpPaymentMethodPublic[];
  /** Amount buttons on the RSVP (whole dollars, each at least giftMin). */
  giftOptions: number[];
  /** Line under the amount buttons (null = the default "minimum per household" note). */
  giftHint: string | null;
  /** Contribution is per adult from the home (Me and my spouse = 2× the minimum). */
  giftPerPerson: boolean;
  /** Members may pledge (pay later / at the event) instead of paying now. */
  allowPledge: boolean;
  /** Fund in PLCC Tithe, the Vault ledger and DCB (the event's own name). */
  fundName: string | null;
  /** True when sourced from fellowship kit (or kit overlay) */
  fromKit: boolean;
};

/** Payment settings saved on the event (Events → Edit → Payments). Null = not set. */
export type EventRsvpPaymentSettings = {
  rsvp_payments_enabled?: boolean | null;
  rsvp_gift_min?: number | null;
  rsvp_gift_options?: number[] | null;
  rsvp_allow_pledge?: boolean | null;
};

/** The events columns these settings live in (see supabase/migrations/event_rsvp_payments.sql). */
export const EVENT_RSVP_PAYMENT_COLUMNS = 'rsvp_payments_enabled, rsvp_gift_min, rsvp_gift_options, rsvp_allow_pledge';

const KIT_IDS = new Set([
  DEFAULT_FELLOWSHIP_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
  MARRIEDS_DINNER_2026_EVENT_ID,
]);

export function isKnownFellowshipKitId(eventId?: string | null): boolean {
  return Boolean(eventId && KIT_IDS.has(String(eventId).trim()));
}

export function isValidRsvpTemplate(v: unknown): v is RsvpTemplate {
  return v === 'simple' || v === 'fellowship';
}

/** Default close: end of day before event date in Africa/Kampala. */
export function deriveDefaultRsvpCloseAt(eventDateYmd: string): string {
  const ymd = String(eventDateYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  // Noon UTC on event day, then subtract ~1.5 days → prior calendar day in ET
  const eventNoonUtc = Date.parse(`${ymd}T12:00:00.000Z`);
  if (!Number.isFinite(eventNoonUtc)) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  const prior = new Date(eventNoonUtc - 36 * 60 * 60 * 1000);
  const y = prior.getUTCFullYear();
  const m = String(prior.getUTCMonth() + 1).padStart(2, '0');
  const d = String(prior.getUTCDate()).padStart(2, '0');
  // 23:59 Eastern — use -05:00 as a stable offset label (DST edge is acceptable for RSVP close)
  return `${y}-${m}-${d}T23:59:00-05:00`;
}

export function closedMessageForName(name: string): string {
  return `Online signups for ${name || 'this event'} are closed. If you still plan to come, please contact the church office.`;
}

function kitToRuntime(kit: FellowshipEventConfig, nowMs: number): EventRsvpRuntimeConfig {
  return {
    eventId: kit.eventId,
    name: kit.name,
    shortName: kit.shortName,
    date: kit.date,
    timeLabel: kit.timeLabel,
    location: kit.location,
    template: 'fellowship',
    rsvpCloseAt: kit.rsvpCloseAt,
    closed: nowMs >= Date.parse(kit.rsvpCloseAt),
    giftMin: kit.giftMin,
    tshirtsEnabled: kit.tshirtsEnabled,
    maxAdultsFromHome: kit.maxAdultsFromHome,
    submitLabel: kit.submitLabel,
    menuItems: kit.menuItems,
    requireAllergyConsent: kit.requireAllergyConsent,
    requireInjuryConsent: kit.requireInjuryConsent,
    paymentChoiceEnabled: Boolean(kit.paymentChoiceEnabled),
    paymentMethods: kit.paymentMethods || [],
    giftOptions: rsvpGiftOptions(kit.giftMin, kit.giftOptions),
    giftHint: kit.giftHint || null,
    giftPerPerson: Boolean(kit.giftPerPerson),
    allowPledge: true,
    fundName: eventFundName(kit.eventId, kit.name),
    fromKit: true,
  };
}

type DbEventRow = {
  id: string;
  name?: string | null;
  date?: string | null;
  time?: string | null;
  end_time?: string | null;
  location?: string | null;
  rsvp_enabled?: boolean | null;
  rsvp_template?: string | null;
  rsvp_close_at?: string | null;
} & EventRsvpPaymentSettings;

/** "02:00 PM" → "2:00 PM"; "" for empty. */
export function cleanTimeLabel(raw: unknown): string {
  const t = String(raw || '').trim();
  return t.replace(/^0(\d):/, '$1:');
}

/**
 * Build runtime RSVP config from a DB event row.
 * Returns null when signup is not enabled (and not a kit with missing flags).
 */
export function runtimeConfigFromDbEvent(
  row: DbEventRow,
  nowMs: number = Date.now()
): EventRsvpRuntimeConfig | null {
  const id = String(row.id || '').trim();
  if (!id) return null;

  const kit = FELLOWSHIP_EVENTS[id];
  const enabled =
    row.rsvp_enabled === true ||
    (row.rsvp_enabled == null && Boolean(kit));

  if (!enabled) return null;

  const template: RsvpTemplate =
    isValidRsvpTemplate(row.rsvp_template)
      ? row.rsvp_template
      : kit
        ? 'fellowship'
        : 'simple';

  const date = String(row.date || kit?.date || '').slice(0, 10);
  const closeAt =
    (row.rsvp_close_at && String(row.rsvp_close_at)) ||
    kit?.rsvpCloseAt ||
    deriveDefaultRsvpCloseAt(date);

  // The calendar event's own time wins, so a time changed in the Vault calendar shows on the
  // RSVP page too; the built-in kit time is only a fallback for events with no time set.
  const timeLabel =
    [cleanTimeLabel(row.time), cleanTimeLabel(row.end_time)].filter(Boolean).join(' – ') ||
    kit?.timeLabel ||
    '';

  const name = String(row.name || kit?.name || 'Church event');
  const shortName = kit?.shortName || name.split(' ').slice(0, 2).join(' ') || 'Event';

  if (template === 'simple') {
    return {
      eventId: id,
      name,
      shortName,
      date,
      timeLabel,
      location: String(row.location || kit?.location || ''),
      template: 'simple',
      rsvpCloseAt: closeAt,
      closed: nowMs >= Date.parse(closeAt),
      giftMin: 0,
      tshirtsEnabled: false,
      maxAdultsFromHome: 50,
      submitLabel: 'Sign up',
      requireAllergyConsent: false,
      requireInjuryConsent: false,
      paymentChoiceEnabled: false,
      paymentMethods: [],
      giftOptions: [],
      giftHint: null,
      giftPerPerson: false,
      allowPledge: false,
      fundName: null,
      fromKit: Boolean(kit),
    };
  }

  // Payments: what staff set on the event wins; the built-in kit is the fallback.
  const paymentsOn =
    typeof row.rsvp_payments_enabled === 'boolean'
      ? row.rsvp_payments_enabled
      : Boolean(kit?.paymentChoiceEnabled);
  const savedMin = Number(row.rsvp_gift_min);
  const savedOrKitMin =
    Number.isFinite(savedMin) && savedMin >= 1
      ? Math.floor(savedMin)
      : kit?.giftMin ?? COOKOUT_FOOD_CONTRIBUTION_MIN;
  // Per-person events (Marrieds Dinner $100/person): the built-in amount is a hard floor,
  // even if an older, lower minimum is still saved on the event.
  const giftMin = kit?.giftPerPerson ? Math.max(savedOrKitMin, kit.giftMin) : savedOrKitMin;

  // Fellowship meal defaults; kit overlay when present
  return {
    eventId: id,
    name,
    shortName,
    date,
    timeLabel,
    location: String(row.location || kit?.location || ''),
    template: 'fellowship',
    rsvpCloseAt: closeAt,
    closed: nowMs >= Date.parse(closeAt),
    giftMin,
    tshirtsEnabled: kit?.tshirtsEnabled ?? false,
    maxAdultsFromHome: kit?.maxAdultsFromHome ?? 8,
    submitLabel: kit?.submitLabel || 'Sign up',
    menuItems: kit?.menuItems,
    requireAllergyConsent: kit?.requireAllergyConsent ?? true,
    requireInjuryConsent: kit?.requireInjuryConsent ?? true,
    paymentChoiceEnabled: paymentsOn,
    paymentMethods: paymentsOn ? kit?.paymentMethods || FELLOWSHIP_RSVP_PAYMENT_METHODS : [],
    giftOptions: rsvpGiftOptions(giftMin, row.rsvp_gift_options ?? kit?.giftOptions),
    giftHint: kit?.giftHint || null,
    giftPerPerson: Boolean(kit?.giftPerPerson),
    allowPledge: paymentsOn ? row.rsvp_allow_pledge !== false : false,
    fundName: eventFundName(id, name),
    fromKit: Boolean(kit),
  };
}

/** Kit-only runtime (no DB row) — for known fellowship IDs. */
export function runtimeConfigFromKit(
  eventId: string,
  nowMs: number = Date.now()
): EventRsvpRuntimeConfig | null {
  if (!isKnownFellowshipKitId(eventId)) return null;
  return kitToRuntime(getFellowshipEventConfig(eventId), nowMs);
}

/** Fund name for an event's RSVP payments, from its calendar name (built-in events use their kit name). */
export async function loadRsvpEventFundName(
  supabaseAdmin: { from: (table: string) => any },
  eventId: string | null | undefined
): Promise<string | null> {
  const id = String(eventId || '').trim();
  if (!id) return null;
  let name: string | null = null;
  try {
    const { data } = await supabaseAdmin.from('events').select('name').eq('id', id).maybeSingle();
    name = data?.name ? String(data.name) : null;
  } catch {
    name = null;
  }
  return eventFundName(id, name || FELLOWSHIP_EVENTS[id]?.name || null);
}

export function publicRsvpConfigPayload(cfg: EventRsvpRuntimeConfig) {
  return {
    ok: true as const,
    eventId: cfg.eventId,
    name: cfg.name,
    shortName: cfg.shortName,
    date: cfg.date,
    timeLabel: cfg.timeLabel,
    location: cfg.location,
    template: cfg.template,
    rsvpCloseAt: cfg.rsvpCloseAt,
    closed: cfg.closed,
    giftMin: cfg.giftMin,
    tshirtsEnabled: cfg.tshirtsEnabled,
    maxAdultsFromHome: cfg.maxAdultsFromHome,
    submitLabel: cfg.submitLabel,
    menuItems: cfg.menuItems || [],
    requireAllergyConsent: cfg.requireAllergyConsent,
    requireInjuryConsent: cfg.requireInjuryConsent,
    paymentChoiceEnabled: Boolean(cfg.paymentChoiceEnabled),
    paymentMethods: cfg.paymentMethods || [],
    giftOptions: cfg.giftOptions || [],
    giftHint: cfg.giftHint || null,
    giftPerPerson: Boolean(cfg.giftPerPerson),
    allowPledge: Boolean(cfg.allowPledge),
    fundName: cfg.fundName,
  };
}

/**
 * Load an event row for RSVP use, including payment settings when the columns exist.
 * Before supabase/migrations/event_rsvp_payments.sql runs, falls back to the older columns.
 */
export async function loadRsvpEventRow(
  supabaseAdmin: { from: (table: string) => any },
  eventId: string,
): Promise<{ row: any | null; error: any | null }> {
  const base = 'id, name, date, time, end_time, location, rsvp_enabled, rsvp_template, rsvp_close_at';
  const first = await supabaseAdmin
    .from('events')
    .select(`${base}, ${EVENT_RSVP_PAYMENT_COLUMNS}`)
    .eq('id', eventId)
    .maybeSingle();
  if (!first.error) return { row: first.data || null, error: null };
  const msg = String(first.error?.message || '');
  if (!/rsvp_(payments_enabled|gift_min|gift_options|allow_pledge)/.test(msg)) {
    return { row: null, error: first.error };
  }
  const second = await supabaseAdmin.from('events').select(base).eq('id', eventId).maybeSingle();
  return { row: second.data || null, error: second.error || null };
}
