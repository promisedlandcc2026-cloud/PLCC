/**
 * Thanksgiving (and future fellowship) gift payment choice helpers.
 */

import {
  buildDcbVoucherNumber,
  isDcbBridgeConfigured,
  postSettledContributionToDcb,
} from './dcbClient.js';

function buildDcbVoucherFromRef(referenceId: string): string {
  return buildDcbVoucherNumber(referenceId);
}

export type GiftPaymentIntent = 'pledge' | 'pay_now';
export type GiftPaymentMethod = 'card' | 'zelle' | 'cashapp' | 'venmo';

export type RsvpPaymentMethodPublic = {
  id: GiftPaymentMethod;
  title: string;
  value: string;
  description: string;
  /** False when the channel is not ready for real payments yet */
  live: boolean;
  /** Optional deep link (Cash App, etc.) */
  action?: string;
};

/** PLCC Tithe — the church's giving site. Every RSVP "Pay Now" gift is finished there. */
export const AWC_TITHE_URL = 'https://plcc-tithe.vercel.app/';

/**
 * Pay Now options for fellowship dinner RSVPs. All of them finish on PLCC Tithe:
 * card/bank is confirmed by Stripe; Zelle, Cash App and Venmo get a memo code
 * there and count only after Finance verifies them. Send-to details live in
 * Tithe so there is one source of truth.
 */
export const FELLOWSHIP_RSVP_PAYMENT_METHODS: RsvpPaymentMethodPublic[] = [
  {
    id: 'card',
    title: 'Card or bank',
    value: 'PLCC Tithe',
    description: 'Pay securely by card, Apple Pay, Google Pay or bank account on PLCC Tithe.',
    live: true,
  },
  {
    // Stored codes (zelle/cashapp/venmo) are kept so existing database checks
    // still pass; PLCC shows them as MTN, Airtel and Sendwave.
    id: 'zelle',
    title: 'MTN Mobile Money',
    value: 'PLCC Tithe',
    description: 'PLCC Tithe shows the church MTN number and a reference code to include.',
    live: true,
  },
  {
    id: 'cashapp',
    title: 'Airtel Money',
    value: 'PLCC Tithe',
    description: 'PLCC Tithe shows the church Airtel number and a reference code to include.',
    live: true,
  },
  {
    id: 'venmo',
    title: 'Sendwave',
    value: 'PLCC Tithe',
    description: 'Giving from abroad? PLCC Tithe shows who to send to on Sendwave and a reference code.',
    live: true,
  },
];

/** Tithe give-link method names for each RSVP option. */
const TITHE_METHOD: Record<GiftPaymentMethod, string> = {
  card: 'card',
  zelle: 'zelle',
  cashapp: 'cashapp',
  venmo: 'venmo',
};

/**
 * Link that opens PLCC Tithe pre-filled for this RSVP's gift. The donor still
 * reviews and confirms there; the RSVP is marked paid only when Tithe reports
 * the payment confirmed (see titheRsvpSync.ts) — never on this click.
 */
export function buildTitheRsvpPayUrl(input: {
  registrationId: string;
  amount: number;
  method?: GiftPaymentMethod | null;
  label?: string;
  fund?: string;
  /** Pre-fills Tithe so the guest doesn't type them twice. */
  name?: string | null;
  email?: string | null;
  /** Second line on Tithe's "Paying for" card, e.g. "Jerless M. · 3 adults, 2 children · Sun, Nov 22". */
  detail?: string | null;
  /** Where Tithe's "Back to my RSVP" goes (the RSVP confirmation). */
  returnUrl?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.method) params.set('method', TITHE_METHOD[input.method]);
  if (Number.isFinite(input.amount) && input.amount > 0) params.set('amount', input.amount.toFixed(2));
  params.set('ref', rsvpGiftReferenceId(input.registrationId));
  if (input.label) params.set('for', input.label);
  if (input.fund) params.set('fund', input.fund);
  if (input.detail) params.set('who', input.detail.slice(0, 120));
  if (input.name) params.set('name', String(input.name).trim().slice(0, 80));
  if (input.email) params.set('email', String(input.email).trim().slice(0, 120));
  if (input.returnUrl) params.set('return', input.returnUrl);
  params.set('from', 'vault-rsvp');
  return `${AWC_TITHE_URL}?${params.toString()}`;
}

/** The RSVP confirmation address Tithe sends guests back to after paying. */
export function rsvpReturnUrl(origin: string, eventId: string, registrationId: string): string {
  const base = String(origin || 'https://plcc-opal.vercel.app').replace(/\/$/, '');
  return `${base}/#/events/${encodeURIComponent(eventId)}/rsvp?r=${encodeURIComponent(registrationId)}`;
}

/** "Jerless M. · 3 adults, 2 children · Sun, Nov 22" for Tithe's "Paying for" card. */
export function rsvpPartyLine(input: {
  name?: string | null;
  adults?: number;
  children?: number;
  guests?: number;
  dateLabel?: string | null;
}): string {
  const parts: string[] = [];
  const words = String(input.name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length) parts.push(words.length > 1 ? `${words[0]} ${words[words.length - 1][0]}.` : words[0]);
  const people: string[] = [];
  const a = Math.max(0, Math.floor(Number(input.adults) || 0));
  const c = Math.max(0, Math.floor(Number(input.children) || 0));
  const g = Math.max(0, Math.floor(Number(input.guests) || 0));
  if (a) people.push(`${a} adult${a === 1 ? '' : 's'}`);
  if (c) people.push(`${c} ${c === 1 ? 'child' : 'children'}`);
  if (g) people.push(`${g} guest${g === 1 ? '' : 's'}`);
  if (people.length) parts.push(people.join(', '));
  if (input.dateLabel) parts.push(String(input.dateLabel));
  return parts.join(' · ');
}

/** "2026-11-22" → "Sun, Nov 22" (the event's own calendar day). */
export function shortEventDate(ymd: string | null | undefined): string {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export type RsvpPayStatus = 'paid' | 'waiting' | 'processing' | 'pledged' | 'due';

/**
 * What the guest's RSVP shows: Paid; Waiting (Zelle / Cash App / Venmo sent, Finance confirms);
 * Processing (bank clearing); Pledged; or Due (Pay Now chosen but not finished).
 */
export function rsvpPayStatus(input: {
  paid?: boolean | null;
  intent?: string | null;
  titheStatus?: string | null;
  titheMethod?: string | null;
}): RsvpPayStatus {
  if (input.paid) return 'paid';
  if (input.titheStatus === 'paid') return 'paid';
  if (input.titheStatus === 'processing') {
    const m = String(input.titheMethod || '').toLowerCase();
    return m === 'zelle' || m === 'cash_app' || m === 'cashapp' || m === 'venmo' ? 'waiting' : 'processing';
  }
  return input.intent === 'pledge' ? 'pledged' : 'due';
}

/** @deprecated Prefer FELLOWSHIP_RSVP_PAYMENT_METHODS */
export const THANKSGIVING_PAYMENT_METHODS = FELLOWSHIP_RSVP_PAYMENT_METHODS;

export function isGiftPaymentIntent(v: unknown): v is GiftPaymentIntent {
  return v === 'pledge' || v === 'pay_now';
}

export function isGiftPaymentMethod(v: unknown): v is GiftPaymentMethod {
  return v === 'card' || v === 'zelle' || v === 'cashapp' || v === 'venmo';
}

export function giftPaymentMethodLabel(method: GiftPaymentMethod | null | undefined): string {
  switch (method) {
    case 'card':
      return 'Card or bank';
    case 'zelle':
      return 'Zelle';
    case 'cashapp':
      return 'Cash App';
    case 'venmo':
      return 'Venmo';
    default:
      return '';
  }
}

export function giftPaymentIntentLabel(intent: GiftPaymentIntent | null | undefined): string {
  if (intent === 'pay_now') return 'Pay Now';
  if (intent === 'pledge') return 'Pledge';
  return '';
}

/** Source string stored on giving_transactions for DCB. */
export function giftPaymentSourceForDcb(
  intent: GiftPaymentIntent | null | undefined,
  method: GiftPaymentMethod | null | undefined
): string {
  if (method) return giftPaymentMethodLabel(method) || 'Online';
  if (intent === 'pledge') return 'Pledge';
  return 'Fellowship Gift';
}

export function rsvpGiftReferenceId(registrationId: string): string {
  return `rsvp:${String(registrationId || '').trim()}`;
}

export function parseGiftPaymentChoice(body: {
  food_contribution_intent?: unknown;
  foodContributionIntent?: unknown;
  food_contribution_payment_method?: unknown;
  foodContributionPaymentMethod?: unknown;
}):
  | { ok: true; intent: GiftPaymentIntent | null; method: GiftPaymentMethod | null }
  | { ok: false; error: string } {
  const rawIntent = body.food_contribution_intent ?? body.foodContributionIntent;
  const rawMethod = body.food_contribution_payment_method ?? body.foodContributionPaymentMethod;

  if (rawIntent == null || rawIntent === '') {
    return { ok: true, intent: null, method: null };
  }
  if (!isGiftPaymentIntent(rawIntent)) {
    return { ok: false, error: 'Choose Pledge or Pay Now.' };
  }
  if (rawIntent === 'pledge') {
    return { ok: true, intent: 'pledge', method: null };
  }
  // The guest picks card / bank / Zelle / Cash App / Venmo on PLCC Tithe now; an older
  // form may still send one, which is kept as a hint.
  if (rawMethod == null || rawMethod === '') {
    return { ok: true, intent: 'pay_now', method: null };
  }
  if (!isGiftPaymentMethod(rawMethod)) {
    return { ok: false, error: 'Choose how you would like to pay now.' };
  }
  return { ok: true, intent: 'pay_now', method: rawMethod };
}

type SupabaseLike = {
  from: (table: string) => any;
};

function dcbRsvpFundCode(): string {
  return String(
    process.env.AWC_DCB_RSVP_FUND_CODE
      || process.env.AWC_DCB_THANKSGIVING_FUND_CODE
      || '',
  ).trim();
}

function dcbRsvpFundName(): string {
  return String(
    process.env.AWC_DCB_RSVP_FUND_NAME
      || process.env.AWC_DCB_THANKSGIVING_FUND_NAME
      || 'Special Offerings',
  ).trim() || 'Special Offerings';
}

function likeExact(name: string): string {
  return name.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Rename the event's fund in the Vault ledger (finance_funds) after the event was renamed,
 * so earlier gifts show under the new name. Leaves things alone if the new name already
 * exists or no old fund is found. Never throws.
 */
export async function renameVaultEventFund(
  supabaseAdmin: SupabaseLike,
  name: string,
  previousNames: string[]
): Promise<boolean> {
  try {
    const { data: already } = await supabaseAdmin
      .from('finance_funds')
      .select('id')
      .ilike('name', likeExact(name))
      .limit(1)
      .maybeSingle();
    if (already?.id) return false;
    for (const old of previousNames) {
      const { data: hit } = await supabaseAdmin
        .from('finance_funds')
        .select('id')
        .ilike('name', likeExact(old))
        .limit(1)
        .maybeSingle();
      if (!hit?.id) continue;
      const { error } = await supabaseAdmin.from('finance_funds').update({ name }).eq('id', hit.id);
      if (error) {
        console.warn('[RSVP] Could not rename Vault event fund:', error.message);
        return false;
      }
      return true;
    }
  } catch (err: any) {
    console.warn('[RSVP] Vault event fund rename failed:', err?.message || err);
  }
  return false;
}

/** The event's fund in the Vault ledger (finance_funds), created if missing. Empty string on failure. */
async function findOrCreateVaultEventFund(
  supabaseAdmin: SupabaseLike,
  name: string,
  previousNames: string[] = []
): Promise<string> {
  try {
    if (previousNames.length) await renameVaultEventFund(supabaseAdmin, name, previousNames);
    const { data: found } = await supabaseAdmin
      .from('finance_funds')
      .select('id, name')
      .ilike('name', likeExact(name))
      .limit(1)
      .maybeSingle();
    if (found?.id) return String(found.id);
    const { data: made, error } = await supabaseAdmin
      .from('finance_funds')
      .insert({ name, description: 'Event RSVP payments (set up automatically).', is_active: true })
      .select('id')
      .single();
    if (error) {
      console.warn('[RSVP] Could not create Vault event fund:', error.message);
      return '';
    }
    return made?.id ? String(made.id) : '';
  } catch (err: any) {
    console.warn('[RSVP] Vault event fund lookup failed:', err?.message || err);
    return '';
  }
}

/**
 * Idempotently post a paid RSVP gift into Vault giving_transactions, then HMAC-ingest into DCB.
 * Returns the giving_transactions.id when created or already linked.
 */
export async function postRsvpGiftToGivingTransactions(
  supabaseAdmin: SupabaseLike,
  reg: {
    id: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    food_contribution_amount?: number | string | null;
    food_contribution_intent?: string | null;
    food_contribution_payment_method?: string | null;
    food_contribution_posted_tx_id?: string | null;
    food_contribution_dcb_voucher_id?: string | null;
  },
  opts?: {
    eventShortName?: string;
    eventFundName?: string | null;
    /** The Vault event id the fund follows in Tithe and DCB. */
    eventId?: string | null;
    /** The event fund's earlier names (see eventFundPreviousNames). */
    previousFundNames?: string[];
  }
): Promise<{
  txId: string | null;
  created: boolean;
  dcbVoucherId?: string | null;
  warning?: string;
}> {
  const amount = Number(reg.food_contribution_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { txId: null, created: false, warning: 'No gift amount to post' };
  }

  const referenceId = rsvpGiftReferenceId(reg.id);
  const intent = isGiftPaymentIntent(reg.food_contribution_intent)
    ? reg.food_contribution_intent
    : null;
  const method = isGiftPaymentMethod(reg.food_contribution_payment_method)
    ? reg.food_contribution_payment_method
    : null;
  const source = giftPaymentSourceForDcb(intent, method);
  const shortName = opts?.eventShortName || 'Fellowship';
  // Each event has its own fund (e.g. "Thanksgiving Dinner 2026") in the Vault ledger, Tithe and DCB.
  const eventFund = String(opts?.eventFundName || '').trim() || null;
  const eventId = String(opts?.eventId || '').trim() || null;
  const previousFundNames = eventFund ? (opts?.previousFundNames || []).filter(Boolean) : [];
  const notes = [
    `${shortName} RSVP`,
    reg.name ? String(reg.name).trim() : null,
    reg.phone ? String(reg.phone).trim() : null,
    method ? giftPaymentMethodLabel(method) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  let txId: string | null = reg.food_contribution_posted_tx_id
    ? String(reg.food_contribution_posted_tx_id)
    : null;
  let created = false;
  const warnings: string[] = [];

  if (!txId) {
    const { data: existing } = await supabaseAdmin
      .from('giving_transactions')
      .select('id')
      .eq('reference_id', referenceId)
      .maybeSingle();
    if (existing?.id) {
      txId = String(existing.id);
    }
  }

  if (!txId) {
    let fundId = eventFund ? await findOrCreateVaultEventFund(supabaseAdmin, eventFund, previousFundNames) : '';
    if (!fundId) fundId = String(
      process.env.RSVP_GIFT_FUND_ID
        || process.env.MARRIEDS_GIFT_FUND_ID
        || process.env.THANKSGIVING_GIFT_FUND_ID
        || '',
    ).trim();
    if (!fundId) {
      const patterns = ['%married%', '%grand family%', '%thanksgiving%', '%special%'];
      for (const pattern of patterns) {
        const { data: named } = await supabaseAdmin
          .from('finance_funds')
          .select('id, name')
          .ilike('name', pattern)
          .limit(1)
          .maybeSingle();
        if (named?.id) {
          fundId = String(named.id);
          break;
        }
      }
    }
    if (!fundId) {
      const { data: first } = await supabaseAdmin
        .from('finance_funds')
        .select('id')
        .order('name', { ascending: true })
        .limit(1)
        .maybeSingle();
      fundId = first?.id ? String(first.id) : '';
    }
    if (!fundId) {
      warnings.push('No Vault finance fund found — gift marked paid but not posted to Vault ledger yet.');
    } else {
      let memberId: string | null = null;
      const email = String(reg.email || '').trim().toLowerCase();
      const digits = String(reg.phone || '').replace(/\D/g, '');
      if (email) {
        const { data: byEmail } = await supabaseAdmin
          .from('members')
          .select('id')
          .ilike('email', email)
          .limit(1)
          .maybeSingle();
        if (byEmail?.id) memberId = String(byEmail.id);
      }
      if (!memberId && digits.length >= 10) {
        const last10 = digits.slice(-10);
        const { data: byPhone } = await supabaseAdmin
          .from('members')
          .select('id, phone')
          .not('phone', 'is', null)
          .limit(200);
        const match = (byPhone || []).find((m: any) => String(m.phone || '').replace(/\D/g, '').endsWith(last10));
        if (match?.id) memberId = String(match.id);
      }

      const { data: tx, error } = await supabaseAdmin
        .from('giving_transactions')
        .insert({
          member_id: memberId,
          fund_id: fundId,
          amount: Math.round(amount * 100) / 100,
          transaction_date: new Date().toISOString().slice(0, 10),
          source,
          reference_id: referenceId,
          notes,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[RSVP] Vault gift post failed:', error.message);
        warnings.push(error.message || 'Could not post gift to Vault ledger');
      } else {
        txId = tx?.id ? String(tx.id) : null;
        created = true;
      }
    }
  }

  let dcbVoucherId: string | null = reg.food_contribution_dcb_voucher_id
    ? String(reg.food_contribution_dcb_voucher_id)
    : null;

  if (!dcbVoucherId) {
    if (!isDcbBridgeConfigured()) {
      warnings.push(
        'DCB bridge not configured (set AWC_DCB_API_URL + AWC_DCB_SERVICE_SECRET). Gift stays in Vault until configured.'
      );
    } else {
      const dcb = await postSettledContributionToDcb({
        donorName: String(reg.name || 'RSVP Guest').trim() || 'RSVP Guest',
        donorEmail: String(reg.email || '').trim() || undefined,
        amount: Math.round(amount * 100) / 100,
        feeAmount: 0,
        fundCode: eventFund ? undefined : dcbRsvpFundCode() || undefined,
        fundName: eventFund || dcbRsvpFundName(),
        eventFund: Boolean(eventFund),
        eventKey: eventFund && eventId ? eventId : undefined,
        previousFundNames: previousFundNames.length ? previousFundNames : undefined,
        paymentMethod: source,
        transactionId: referenceId,
        voucherNumber: buildDcbVoucherFromRef(referenceId),
        contributedAt: new Date().toISOString(),
        memo: notes,
        autoCreateDonor: Boolean(String(reg.email || '').trim()),
      });

      if (dcb.ok && dcb.voucherId) {
        dcbVoucherId = dcb.voucherId;
        if (dcb.needsReview) {
          warnings.push('Posted to DCB but needs Online Giving review (fund or donor match).');
        }
      } else if (dcb.skipped) {
        warnings.push(dcb.error || 'DCB bridge skipped');
      } else {
        console.error('[RSVP] DCB HMAC ingest failed:', dcb.error);
        warnings.push(dcb.error || 'Could not post gift to DCB');
      }
    }
  }

  return {
    txId,
    created,
    dcbVoucherId,
    warning: warnings.length ? warnings.join(' ') : undefined,
  };
}
