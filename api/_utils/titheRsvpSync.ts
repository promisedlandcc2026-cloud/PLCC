/**
 * PLCC Canaan ⇄ PLCC Tithe — event RSVP "Pay Now" gifts.
 *
 * The RSVP form sends donors to Tithe with ref=rsvp:<registration id>. When an
 * admin opens the RSVP list, the Vault asks Tithe (HMAC-signed) which of the
 * unpaid gifts were paid, and marks those paid.
 *
 * Tithe reports "paid" only after its Stripe webhook completed the donation or
 * Finance verified the Zelle / Cash App gift. Tithe also delivers that gift to
 * DCB itself, so here the gift is posted to the Vault ledger only — the DCB
 * voucher column is set to the Tithe receipt so the Vault never re-posts it.
 *
 * Env (Vercel):
 * - AWC_TITHE_VAULT_KEY — shared HMAC key (Tithe: AWC_VAULT_KEY)
 * - AWC_TITHE_API_URL   — optional, defaults to https://plcc-tithe.vercel.app
 */

import crypto from 'crypto';
import { postRsvpGiftToGivingTransactions, rsvpGiftReferenceId } from './rsvpGiftPayment.js';

import { formatCurrency } from '../../utils/formatters.js';
type SupabaseLike = { from: (table: string) => any };

export type TitheRefStatus = {
  ref: string;
  status: 'paid' | 'processing' | 'started' | 'refunded' | 'none';
  amount: number | null;
  receiptNumber: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
};

const TITHE_TIMEOUT_MS = 6000;

function titheKey(): string {
  return String(process.env.AWC_TITHE_VAULT_KEY || '').trim();
}

function titheBaseUrl(): string {
  return String(process.env.AWC_TITHE_API_URL || 'https://plcc-tithe.vercel.app').trim().replace(/\/$/, '');
}

export function isTitheSyncConfigured(): boolean {
  return Boolean(titheKey());
}

export function signTitheRequest(key: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac('sha256', key).update(`${timestamp}.${rawBody}`).digest('hex');
}

const METHOD_LABEL: Record<string, string> = {
  card: 'Card',
  us_bank_account: 'Bank',
  apple_pay: 'Apple Pay',
  cash_app: 'Cash App',
  zelle: 'Zelle',
  venmo: 'Venmo',
};

/** Signed POST to an PLCC Tithe Vault-integration endpoint (funds, fund-gifts, ref-status). */
export async function titheSignedPost<T = any>(path: string, payload: unknown, timeoutMs = TITHE_TIMEOUT_MS): Promise<T> {
  const key = titheKey();
  if (!key) throw new Error('PLCC Tithe link not configured (set AWC_TITHE_VAULT_KEY).');
  const body = JSON.stringify(payload ?? {});
  const timestamp = String(Date.now());
  const res = await fetch(`${titheBaseUrl()}/api/integrations/vault/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PLCC-Key-Id': 'vault',
      'X-PLCC-Timestamp': timestamp,
      'X-PLCC-Signature': signTitheRequest(key, timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ? `PLCC Tithe: ${data.error}` : `PLCC Tithe returned ${res.status}`);
  }
  return data as T;
}

/** Ask Tithe for the status of up to 200 RSVP references. */
export async function fetchTitheRefStatuses(refs: string[]): Promise<TitheRefStatus[]> {
  const key = titheKey();
  if (!key || !refs.length) return [];
  const body = JSON.stringify({ refs: refs.slice(0, 200) });
  const timestamp = String(Date.now());
  const res = await fetch(`${titheBaseUrl()}/api/integrations/vault/ref-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PLCC-Key-Id': 'vault',
      'X-PLCC-Timestamp': timestamp,
      'X-PLCC-Signature': signTitheRequest(key, timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(TITHE_TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ? `PLCC Tithe: ${data.error}` : `PLCC Tithe returned ${res.status}`);
  }
  return Array.isArray(data.statuses) ? data.statuses : [];
}

/**
 * Make sure PLCC Tithe has the event's fund (e.g. "Thanksgiving Dinner 2026") so Pay Now
 * gifts land there and reach DCB under that name. Never throws — returns a warning.
 *
 * The fund follows the Vault event id: after the event is renamed, Tithe renames the same
 * fund (and tells DCB), so gifts made under the old name stay with the event. previousNames
 * lets Tithe find a fund that was set up before it knew the event id.
 */
export async function ensureTitheEventFund(
  fundName: string | null | undefined,
  opts: { eventId?: string | null; previousNames?: string[] } = {}
): Promise<{ ok: boolean; warning?: string; renamed?: boolean }> {
  const name = String(fundName || '').trim();
  if (!name) return { ok: false };
  if (!isTitheSyncConfigured()) {
    return { ok: false, warning: 'PLCC Tithe link not configured (set AWC_TITHE_VAULT_KEY) — event fund not set up in Tithe.' };
  }
  try {
    const out: any = await titheSignedPost(
      'event-fund',
      {
        name,
        ...(opts.eventId ? { eventId: String(opts.eventId) } : {}),
        ...(opts.previousNames?.length ? { previousNames: opts.previousNames.slice(0, 10) } : {}),
      },
      4000
    );
    return { ok: true, renamed: Boolean(out?.renamed) };
  } catch (err: any) {
    console.warn('[RSVP] Tithe event fund setup failed:', err?.message || err);
    return { ok: false, warning: `Could not set up "${name}" in PLCC Tithe. Gifts may land in the default fund.` };
  }
}

/**
 * Mark unpaid RSVP gifts paid when Tithe confirms them. Mutates `rows` in place
 * so the caller's totals include the update. Never throws — returns a warning.
 */
export async function syncRsvpGiftsFromTithe(
  supabaseAdmin: SupabaseLike,
  rows: any[],
  opts?: { eventShortName?: string; eventFundName?: string | null; eventId?: string | null; previousFundNames?: string[] }
): Promise<{ updated: number; warning?: string }> {
  // Only events with the Pledge / Pay Now choice send donors to Tithe. Pledges are
  // included because staff can share a pledger's own Tithe pay link from the RSVP list.
  const unpaid = rows.filter(
    (r) =>
      r?.id &&
      !r.food_contribution_paid &&
      Number(r.food_contribution_amount) > 0 &&
      (r.food_contribution_intent === 'pay_now' || r.food_contribution_intent === 'pledge')
  );
  if (!unpaid.length) return { updated: 0 };
  if (!isTitheSyncConfigured()) {
    return {
      updated: 0,
      warning: 'PLCC Tithe link not configured (set AWC_TITHE_VAULT_KEY) — Pay Now gifts must be marked paid by hand.',
    };
  }

  let statuses: TitheRefStatus[];
  try {
    statuses = await fetchTitheRefStatuses(unpaid.map((r) => rsvpGiftReferenceId(r.id)));
  } catch (err: any) {
    console.error('[RSVP] Tithe status check failed:', err?.message || err);
    return { updated: 0, warning: 'Could not reach PLCC Tithe to check Pay Now gifts. Showing saved status.' };
  }
  const paidByRef = new Map(statuses.filter((s) => s.status === 'paid').map((s) => [s.ref, s]));
  // Not paid yet, but started on Tithe — shown as a hint on the RSVP list (not saved).
  const pendingByRef = new Map(
    statuses
      .filter((s) => s.status === 'started' || s.status === 'processing' || s.status === 'refunded')
      .map((s) => [s.ref, s])
  );
  for (const row of unpaid) {
    const pending = pendingByRef.get(rsvpGiftReferenceId(row.id));
    if (pending) {
      row.tithe_status = pending.status;
      // Zelle / Cash App / Venmo wait for Finance; bank payments are clearing.
      row.tithe_method = pending.paymentMethod || null;
    }
  }

  let updated = 0;
  const warnings: string[] = [];
  for (const row of unpaid) {
    const hit = paidByRef.get(rsvpGiftReferenceId(row.id));
    if (!hit) continue;
    const method = METHOD_LABEL[String(hit.paymentMethod || '')] || 'PLCC Tithe';
    const patch: Record<string, any> = {
      food_contribution_paid: true,
      food_contribution_paid_at: hit.paidAt || new Date().toISOString(),
      food_contribution_paid_by: `PLCC Tithe · ${method}${hit.receiptNumber ? ` · ${hit.receiptNumber}` : ''}`,
      // Tithe already delivered this gift to DCB; this stops the Vault re-posting it.
      food_contribution_dcb_voucher_id: `tithe:${hit.receiptNumber || rsvpGiftReferenceId(row.id)}`,
    };
    // Only mark paid when the row hasn't changed underneath us.
    let { data, error } = await supabaseAdmin
      .from('event_registrations')
      .update(patch)
      .eq('id', row.id)
      .eq('food_contribution_paid', false)
      .select()
      .maybeSingle();
    if (error && String(error.message || '').includes('food_contribution_dcb_voucher_id')) {
      // Older schema without the voucher column: mark paid, but skip the ledger post below
      // so DCB can't get the gift twice.
      const { food_contribution_dcb_voucher_id: _skip, ...withoutVoucher } = patch;
      ({ data, error } = await supabaseAdmin
        .from('event_registrations')
        .update(withoutVoucher)
        .eq('id', row.id)
        .eq('food_contribution_paid', false)
        .select()
        .maybeSingle());
      if (!error && data) {
        Object.assign(row, data);
        updated++;
        warnings.push('Run add_thanksgiving_dcb_voucher.sql so Tithe-paid gifts also post to PLCC Canaan ledger.');
        continue;
      }
    }
    if (error) {
      warnings.push(error.message || 'Could not mark a Tithe gift paid');
      continue;
    }
    if (!data) continue; // someone else marked it in the meantime
    Object.assign(row, data);
    updated++;

    try {
      const posted = await postRsvpGiftToGivingTransactions(supabaseAdmin, data, {
        eventShortName: opts?.eventShortName,
        eventFundName: opts?.eventFundName,
        eventId: opts?.eventId,
        previousFundNames: opts?.previousFundNames,
      });
      if (posted.txId && posted.txId !== data.food_contribution_posted_tx_id) {
        await supabaseAdmin
          .from('event_registrations')
          .update({ food_contribution_posted_tx_id: posted.txId })
          .eq('id', row.id);
        row.food_contribution_posted_tx_id = posted.txId;
      }
      if (posted.warning) warnings.push(posted.warning);
    } catch (err: any) {
      warnings.push(err?.message || 'Could not post a Tithe gift to PLCC Canaan ledger');
    }
  }

  return { updated, warning: warnings.length ? [...new Set(warnings)].join(' ') : undefined };
}

/**
 * Move this event's RSVP gifts that PLCC Tithe filed under the wrong fund (Give-page bug
 * before Oct 29, 2026) into the event's fund. Tithe moves gifts DCB doesn't have yet and
 * lists the ones DCB already recorded. Never throws.
 */
export async function repairTitheRsvpGiftFunds(
  fundName: string | null | undefined,
  rows: any[]
): Promise<{ moved: number; warning?: string }> {
  const name = String(fundName || '').trim();
  const refs = rows
    .filter(
      (r) =>
        r?.id &&
        Number(r.food_contribution_amount) > 0 &&
        (r.food_contribution_intent === 'pay_now' || r.food_contribution_intent === 'pledge')
    )
    .map((r) => rsvpGiftReferenceId(r.id));
  if (!name || !refs.length || !isTitheSyncConfigured()) return { moved: 0 };
  try {
    let moved = 0;
    const inDcb: Array<{ receiptOrMemo: string; amount: number; fundName: string }> = [];
    for (let i = 0; i < refs.length; i += 200) {
      const out: any = await titheSignedPost('rsvp-gift-fund', { eventFund: name, refs: refs.slice(i, i + 200) }, 6000);
      moved += Number(out?.moved) || 0;
      if (Array.isArray(out?.alreadyInDcb)) inDcb.push(...out.alreadyInDcb);
    }
    if (!inDcb.length) return { moved };
    const list = inDcb.map((g) => `${g.receiptOrMemo} (${formatCurrency(Number(g.amount))})`).join(', ');
    return {
      moved,
      warning: `${inDcb.length} paid RSVP gift(s) reached DCB under the wrong fund (${inDcb[0].fundName}): ${list}. Move them to "${name}" in DCB.`,
    };
  } catch (err: any) {
    console.warn('[RSVP] Tithe fund repair failed:', err?.message || err);
    return { moved: 0 };
  }
}
