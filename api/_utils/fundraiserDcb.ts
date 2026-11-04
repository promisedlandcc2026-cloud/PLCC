/**
 * Fundraisers → Digital Contribution Book (DCB).
 *
 * Cash / check (any hand-entered) fundraiser payment is also recorded in the DCB, so the church's
 * income records match what the fundraiser team collected. The fundraiser team never needs DCB
 * access: the Vault server sends it with the same signed service link as RSVP "Mark Paid".
 *
 * - Online gifts from PLCC Tithe are NOT sent from here (Tithe already sent them to the DCB).
 * - Pledges and fun charges that are still owed are NOT money yet, so nothing goes to the DCB
 *   until a payment is recorded against them.
 * - A payment removed or changed in the Vault is taken back out through the DCB's void route,
 *   which opens a refund review item so Finance reverses it in the normal batch flow.
 * - The DCB de-duplicates on transactionId ('fundraiser:<payment id>'), so retries are safe.
 */

import {
  postContributionToDcb as realPost,
  voidContributionInDcb as realVoid,
  isDcbBridgeConfigured as realIsConfigured,
  type DcbContributionPayload,
  type DcbSyncResult,
  type DcbVoidResult,
} from './dcbClient.js';

type Db = any;

export type FundraiserDcbDeps = {
  postToDcb: (payload: DcbContributionPayload, opts?: { timeoutMs?: number }) => Promise<DcbSyncResult>;
  voidInDcb: (voucherId: string, body: { transactionId: string; reason?: string; refundAmount?: number }, opts?: { timeoutMs?: number }) => Promise<DcbVoidResult>;
  isDcbConfigured: () => boolean;
};

export const realFundraiserDcbDeps: FundraiserDcbDeps = {
  postToDcb: realPost,
  voidInDcb: realVoid,
  isDcbConfigured: realIsConfigured,
};

export const DCB_NOT_READY = 'Run supabase/migrations/fundraisers_phase_4_dcb.sql in Supabase so cash and check payments also go to the DCB.';
const TIMEOUT_MS = 8_000;
const RETRY_AFTER_MS = 2 * 60_000;
const RETRY_BATCH = 5;
const SEND_BATCH = 10;
/** Statuses that mean the DCB has (or may have) the payment, so removing it must be taken back there too. */
const IN_DCB = new Set(['posted', 'review']);

export function dcbTransactionId(paymentId: string): string {
  return `fundraiser:${paymentId}`;
}

export function dcbVoucherFor(paymentId: string): string {
  return `PLCC-FR-${String(paymentId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase()}`;
}

/** The DCB fund: the linked PLCC Tithe fund (so online and cash land together), else the fundraiser's name. */
export function dcbFundName(fundraiser: any): string {
  return String(fundraiser?.tithe_fund_name || fundraiser?.title || 'Fundraiser').trim().slice(0, 80);
}

function memoFor(fundraiser: any, entry: any): string {
  const what =
    entry.source_type === 'game'
      ? `Game / event: ${entry.display_name}`
      : entry.kind === 'pledge'
        ? 'Pledge payment'
        : entry.kind === 'charge'
          ? `Fun charge: ${entry.charge_label || 'charge'}`
          : 'Gift';
  return `Fundraiser: ${String(fundraiser?.title || '').trim()} · ${what} · entered in PLCC Vault`.slice(0, 180);
}

/** True once phase 4 is run (the dcb_* columns exist). */
export async function dcbColumnsReady(db: Db): Promise<boolean> {
  const { error } = await db.from('fundraiser_payments').select('id, dcb_status').limit(1);
  return !error;
}

/** Only hand-entered money is sent: never Tithe (external_ref), never zero. */
export function isSendable(payment: any): boolean {
  return !payment?.external_ref && Number(payment?.amount_cents || 0) > 0;
}

async function memberEmails(db: Db, memberIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (!ids.length) return out;
  const { data, error } = await db.from('members').select('id, email').in('id', ids);
  if (error) return out;
  for (const m of data || []) if (m?.email) out.set(m.id, String(m.email).trim());
  return out;
}

export type DcbSendSummary = { sent: number; review: number; failed: number; waiting: number; warning?: string };

/**
 * Send payments to the DCB and save how it went on each payment. Never throws.
 * `rows` are fundraiser_payments rows; `entries` maps entry id → its entry.
 */
export async function sendPaymentsToDcb(
  db: Db,
  fundraiser: any,
  rows: any[],
  entries: Map<string, any>,
  deps: FundraiserDcbDeps
): Promise<DcbSendSummary> {
  const summary: DcbSendSummary = { sent: 0, review: 0, failed: 0, waiting: 0 };
  const todo = rows.filter((p) => isSendable(p) && entries.has(p.entry_id));
  if (!todo.length) return summary;
  if (!deps.isDcbConfigured()) {
    summary.waiting = todo.length;
    summary.warning = 'The DCB link is not set up on the Vault (AWC_DCB_API_URL + AWC_DCB_SERVICE_SECRET), so cash and check payments are waiting to go to the DCB.';
    return summary;
  }
  const emails = await memberEmails(db, todo.map((p) => entries.get(p.entry_id)?.member_id));
  const fundName = dcbFundName(fundraiser);

  await Promise.all(
    todo.map(async (p) => {
      const entry = entries.get(p.entry_id);
      const now = new Date().toISOString();
      const cents = Number(p.amount_cents || 0);
      if (cents < 100) {
        // DCB only accepts $1.00 and up
        await db.from('fundraiser_payments').update({ dcb_status: 'not_sent', dcb_error: 'Under $1.00 — the DCB does not take amounts this small.', dcb_synced_at: now }).eq('id', p.id);
        return;
      }
      const email = entry.member_id ? emails.get(entry.member_id) : undefined;
      let result: DcbSyncResult;
      try {
        result = await deps.postToDcb(
          {
            voucherNumber: dcbVoucherFor(p.id),
            transactionId: dcbTransactionId(p.id),
            donorName: String(entry.display_name || 'Fundraiser').trim() || 'Fundraiser',
            donorEmail: email || undefined,
            autoCreateDonor: Boolean(email),
            amount: Math.round(cents) / 100,
            feeAmount: 0,
            fundName,
            fundraiserFund: true,
            paymentMethod: String(p.payment_method || 'cash'),
            contributedAt: String(p.payment_date || now.slice(0, 10)),
            memo: memoFor(fundraiser, entry),
          },
          { timeoutMs: TIMEOUT_MS }
        );
      } catch (err: any) {
        result = { ok: false, voucherId: dcbVoucherFor(p.id), syncedAt: now, mock: false, error: err?.message || 'DCB error' };
      }
      let patch: Record<string, any>;
      if (result.ok) {
        const status = result.needsReview ? 'review' : 'posted';
        patch = { dcb_status: status, dcb_voucher_id: result.voucherId || dcbVoucherFor(p.id), dcb_error: null, dcb_synced_at: now };
        if (status === 'review') summary.review++;
        else summary.sent++;
      } else if (result.skipped) {
        patch = { dcb_synced_at: now };
        summary.waiting++;
      } else {
        patch = { dcb_status: 'failed', dcb_error: String(result.error || 'DCB did not take it').slice(0, 300), dcb_synced_at: now };
        summary.failed++;
        console.error('[fundraisers→DCB] post failed:', result.error);
      }
      const { error } = await db.from('fundraiser_payments').update(patch).eq('id', p.id);
      if (error) console.error('[fundraisers→DCB] could not save DCB status:', error.message);
    })
  );
  if (summary.failed) summary.warning = 'Some payments could not reach the DCB yet. They are retried automatically.';
  return summary;
}

/** Send the given payment ids (just created). */
export async function sendPaymentIds(db: Db, fundraiser: any, paymentIds: string[], deps: FundraiserDcbDeps): Promise<DcbSendSummary> {
  if (!paymentIds.length) return { sent: 0, review: 0, failed: 0, waiting: 0 };
  const { data: rows, error } = await db.from('fundraiser_payments').select('*').in('id', paymentIds);
  if (error || !rows?.length) return { sent: 0, review: 0, failed: 0, waiting: 0 };
  const entryIds = [...new Set(rows.map((r: any) => r.entry_id))];
  const { data: ents } = await db.from('fundraiser_entries').select('*').in('id', entryIds);
  const map = new Map<string, any>((ents || []).map((e: any) => [e.id, e]));
  return sendPaymentsToDcb(db, fundraiser, rows, map, deps);
}

/**
 * Payments about to be removed (or replaced): if the DCB has them, queue a void and try it now.
 * Call BEFORE deleting the rows. Never throws.
 */
export async function voidPaymentsInDcb(
  db: Db,
  fundraiser: any,
  payments: any[],
  entry: any | null,
  reason: string,
  deps: FundraiserDcbDeps
): Promise<{ queued: number; warning?: string }> {
  const inDcb = (payments || []).filter((p) => isSendable(p) && (IN_DCB.has(String(p.dcb_status)) || p.dcb_voucher_id || p.dcb_status === 'failed'));
  if (!inDcb.length) return { queued: 0 };
  const rows = inDcb.map((p) => ({
    fundraiser_id: fundraiser?.id || null,
    payment_id: p.id,
    voucher_id: p.dcb_voucher_id || dcbVoucherFor(p.id),
    transaction_id: dcbTransactionId(p.id),
    amount_cents: Number(p.amount_cents || 0),
    display_name: entry?.display_name || null,
    reason: reason.slice(0, 120),
  }));
  const { data: queued, error } = await db.from('fundraiser_dcb_voids').insert(rows).select('*');
  if (error) {
    console.error('[fundraisers→DCB] could not queue DCB void:', error.message);
    const list = rows.map((r) => r.voucher_id).join(', ');
    return { queued: 0, warning: `Tell Finance to reverse ${list} in the DCB (it was removed here).` };
  }
  const left = await runVoids(db, queued || [], deps);
  return {
    queued: rows.length,
    warning: left ? 'The DCB could not be reached to take the removed payment back out. It is retried automatically.' : undefined,
  };
}

async function runVoids(db: Db, voids: any[], deps: FundraiserDcbDeps): Promise<number> {
  if (!voids.length) return 0;
  if (!deps.isDcbConfigured()) return voids.length;
  let left = 0;
  await Promise.all(
    voids.map(async (v) => {
      let r: DcbVoidResult;
      try {
        r = await deps.voidInDcb(
          String(v.voucher_id || ''),
          { transactionId: String(v.transaction_id), reason: String(v.reason || 'Removed in PLCC Vault fundraiser'), refundAmount: Number(v.amount_cents || 0) / 100 },
          { timeoutMs: TIMEOUT_MS }
        );
      } catch (err: any) {
        r = { ok: false, error: err?.message || 'DCB error' };
      }
      if (r.ok) {
        await db.from('fundraiser_dcb_voids').update({ done_at: new Date().toISOString(), last_error: null }).eq('id', v.id);
      } else {
        left++;
        await db.from('fundraiser_dcb_voids').update({ last_error: String(r.error || 'failed').slice(0, 300) }).eq('id', v.id);
      }
    })
  );
  return left;
}

/**
 * Background catch-up, run when a fundraiser is opened: send waiting / failed payments and finish
 * queued voids. Small batches, throttled per payment, never throws.
 */
export async function catchUpDcb(db: Db, fundraiser: any, payments: any[], entries: any[], deps: FundraiserDcbDeps): Promise<DcbSendSummary | null> {
  try {
    const { data: openVoids } = await db.from('fundraiser_dcb_voids').select('*').is('done_at', null).limit(RETRY_BATCH);
    if (openVoids?.length) await runVoids(db, openVoids, deps);
  } catch {
    /* the void table may not exist yet */
  }
  const cutoff = Date.now() - RETRY_AFTER_MS;
  const due = payments.filter(
    (p) =>
      isSendable(p) &&
      (p.dcb_status == null || p.dcb_status === 'failed') &&
      (!p.dcb_synced_at || Date.parse(p.dcb_synced_at) < cutoff)
  );
  if (!due.length) return null;
  const map = new Map<string, any>(entries.map((e: any) => [e.id, e]));
  return sendPaymentsToDcb(db, fundraiser, due.slice(0, RETRY_BATCH), map, deps);
}

/** Send payments a finance leader chose to send (entered before the link existed). */
export async function sendEarlierToDcb(db: Db, fundraiser: any, payments: any[], entries: any[], deps: FundraiserDcbDeps): Promise<DcbSendSummary & { remaining: number }> {
  const earlier = payments.filter((p) => isSendable(p) && p.dcb_status === 'before_link');
  const batch = earlier.slice(0, SEND_BATCH);
  if (batch.length) {
    const { error } = await db.from('fundraiser_payments').update({ dcb_status: null, dcb_synced_at: null }).in('id', batch.map((p) => p.id));
    if (error) throw error;
  }
  const map = new Map<string, any>(entries.map((e: any) => [e.id, e]));
  const res = await sendPaymentsToDcb(db, fundraiser, batch.map((p) => ({ ...p, dcb_status: null })), map, deps);
  return { ...res, remaining: earlier.length - batch.length };
}

export type DcbOverview = {
  ready: boolean;
  configured: boolean;
  posted: { count: number; cents: number };
  review: { count: number; cents: number };
  waiting: { count: number; cents: number };
  failed: { count: number; cents: number; lastError: string | null };
  beforeLink: { count: number; cents: number };
  notSent: { count: number; cents: number };
  pendingVoids: number;
};

/** What the fundraiser page shows: how much of the hand-entered money is in the DCB. */
export function dcbOverview(payments: any[], ready: boolean, configured: boolean, pendingVoids = 0): DcbOverview {
  const z = () => ({ count: 0, cents: 0 });
  const o: DcbOverview = {
    ready,
    configured,
    posted: z(),
    review: z(),
    waiting: z(),
    failed: { count: 0, cents: 0, lastError: null },
    beforeLink: z(),
    notSent: z(),
    pendingVoids,
  };
  for (const p of payments) {
    if (!isSendable(p)) continue;
    const c = Number(p.amount_cents || 0);
    const bucket =
      p.dcb_status === 'posted' ? o.posted
        : p.dcb_status === 'review' ? o.review
          : p.dcb_status === 'failed' ? o.failed
            : p.dcb_status === 'before_link' ? o.beforeLink
              : p.dcb_status === 'not_sent' ? o.notSent
                : o.waiting;
    bucket.count++;
    bucket.cents += c;
    if (p.dcb_status === 'failed' && p.dcb_error) o.failed.lastError = String(p.dcb_error);
  }
  return o;
}
