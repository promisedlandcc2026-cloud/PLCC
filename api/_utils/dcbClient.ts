/**
 * Vault → Digital Contribution Book (DCB) HMAC service client.
 * Matches DCB `verifyAwcServiceAuth` / Tithe `postContributionToDcb`.
 *
 * Env:
 * - AWC_DCB_API_URL — DCB base URL or full `/api/public/giving/contributions` path
 * - AWC_DCB_SERVICE_SECRET — shared HMAC secret (AWC_DCB_API_KEY accepted as alias)
 * - AWC_DCB_THANKSGIVING_FUND_CODE / AWC_DCB_THANKSGIVING_FUND_NAME — optional fund map
 */

import crypto from 'crypto';

export type DcbContributionPayload = {
  bookId?: string;
  voucherNumber: string;
  donorName: string;
  donorEmail?: string;
  envelopeNumber?: string;
  amount: number;
  feeAmount?: number;
  netAmount?: number;
  fundId?: number | string;
  fundCode?: string;
  fundName?: string;
  paymentMethod?: string;
  transactionId: string;
  contributedAt: string;
  autoCreateDonor?: boolean;
  /** Short note shown on the DCB contribution (DCB has a memo field). */
  memo?: string;
  /** Event RSVP payment: DCB creates the event's fund (fundName) if it does not have it yet. */
  eventFund?: boolean;
  /** Event fund: the Vault event id, so DCB keeps one fund per event across renames. */
  eventKey?: string;
  /** Event fund: its earlier names, so DCB finds the right fund after a rename. */
  previousFundNames?: string[];
  /** PLCC Vault fundraiser payment: DCB creates the fundraiser's fund (fundName) if it has never had it. */
  fundraiserFund?: boolean;
};

export type DcbSyncResult = {
  ok: boolean;
  voucherId: string;
  syncedAt: string;
  mock: boolean;
  /** True when URL/secret missing — caller should treat as skip, not success */
  skipped?: boolean;
  posted?: boolean;
  needsReview?: boolean;
  duplicate?: boolean;
  error?: string;
  providerTransactionRowId?: number;
  reviewItemId?: number;
};

function dcbServiceSecret(): string {
  return (
    process.env.AWC_DCB_SERVICE_SECRET?.trim() ||
    process.env.AWC_DCB_API_KEY?.trim() ||
    ''
  );
}

function dcbApiUrlConfigured(): string {
  return (
    process.env.AWC_DCB_API_URL?.trim() ||
    process.env.DCB_API_BASE_URL?.trim() ||
    ''
  );
}

export function isDcbBridgeConfigured(): boolean {
  return Boolean(dcbApiUrlConfigured() && dcbServiceSecret());
}

export function resolveDcbIngestUrl(): string {
  const configured = dcbApiUrlConfigured().replace(/\/$/, '');
  if (!configured) return '';
  if (configured.includes('/api/')) return configured;
  return `${configured}/api/public/giving/contributions`;
}

export function buildDcbVoucherNumber(transactionId: string): string {
  const suffix =
    transactionId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() ||
    String(Date.now()).slice(-8);
  return `PLCC-VOUCH-${suffix}`;
}

/** HMAC headers matching DCB `verifyAwcServiceAuth` (timestamp.body → hex HMAC-SHA256). */
export function signAwcServiceRequest(rawBody: string, secret?: string): Record<string, string> {
  const key = (secret ?? dcbServiceSecret()).trim();
  if (!key) {
    throw new Error('AWC_DCB_SERVICE_SECRET (or AWC_DCB_API_KEY) is not configured');
  }
  const timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', key).update(`${timestamp}.${rawBody}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-PLCC-Timestamp': timestamp,
    'X-PLCC-Signature': signature,
  };
}

/**
 * Post a settled contribution to DCB via HMAC.
 * When not configured, returns ok:false + skipped:true so Mark Paid can warn clearly.
 */
export async function postContributionToDcb(
  payload: DcbContributionPayload,
  opts: { timeoutMs?: number } = {}
): Promise<DcbSyncResult> {
  const syncedAt = new Date().toISOString();
  const ingestUrl = resolveDcbIngestUrl();
  const voucherNumber = payload.voucherNumber || buildDcbVoucherNumber(payload.transactionId);

  if (!ingestUrl || !dcbServiceSecret()) {
    return {
      ok: false,
      voucherId: voucherNumber,
      syncedAt,
      mock: false,
      skipped: true,
      error:
        'DCB bridge not configured (set AWC_DCB_API_URL + AWC_DCB_SERVICE_SECRET on Vault).',
    };
  }

  // Keep the fund name exact so DCB can match (or create) the fund; the note goes in memo.
  const fundName = payload.fundName;

  const body = {
    bookId: payload.bookId,
    voucherNumber,
    donorName: payload.donorName,
    donorEmail: payload.donorEmail,
    envelopeNumber: payload.envelopeNumber,
    amount: payload.amount,
    feeAmount: payload.feeAmount ?? 0,
    netAmount: payload.netAmount ?? payload.amount,
    fundId: payload.fundId,
    fundCode: payload.fundCode,
    fundName,
    paymentMethod: payload.paymentMethod,
    transactionId: payload.transactionId,
    contributedAt: payload.contributedAt,
    autoCreateDonor: payload.autoCreateDonor,
    memo: payload.memo ? String(payload.memo).slice(0, 180) : undefined,
    eventFund: payload.eventFund === true ? true : undefined,
    eventKey: payload.eventFund === true && payload.eventKey ? payload.eventKey : undefined,
    previousFundNames:
      payload.eventFund === true && payload.previousFundNames?.length ? payload.previousFundNames.slice(0, 10) : undefined,
    fundraiserFund: payload.fundraiserFund === true ? true : undefined,
  };

  try {
    const rawBody = JSON.stringify(body);
    const headers = signAwcServiceRequest(rawBody);
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        voucherId: voucherNumber,
        syncedAt,
        mock: false,
        error: `DCB API ${response.status}: ${text.slice(0, 240)}`,
      };
    }

    let voucherId = voucherNumber;
    let posted = true;
    let needsReview = false;
    let duplicate = false;
    let providerTransactionRowId: number | undefined;
    let reviewItemId: number | undefined;
    try {
      const json = (await response.json()) as {
        voucherId?: string;
        voucherNumber?: string;
        id?: string;
        posted?: boolean;
        needsReview?: boolean;
        duplicate?: boolean;
        providerTransactionRowId?: number;
        reviewItemId?: number;
        error?: string;
      };
      if (json.error && json.posted === false && !json.duplicate) {
        return {
          ok: false,
          voucherId: json.voucherId || voucherNumber,
          syncedAt,
          mock: false,
          error: json.error,
        };
      }
      voucherId = json.voucherId || json.voucherNumber || json.id || voucherNumber;
      posted = json.posted !== false;
      needsReview = !!json.needsReview;
      duplicate = !!json.duplicate;
      providerTransactionRowId = json.providerTransactionRowId;
      reviewItemId = json.reviewItemId;
    } catch {
      // non-JSON success body is fine
    }

    return {
      ok: true,
      voucherId,
      syncedAt,
      mock: false,
      posted,
      needsReview,
      duplicate,
      providerTransactionRowId,
      reviewItemId,
    };
  } catch (err) {
    return {
      ok: false,
      voucherId: voucherNumber,
      syncedAt,
      mock: false,
      error: err instanceof Error ? err.message : 'Unknown DCB sync error',
    };
  }
}

export type DcbVoidResult = { ok: boolean; skipped?: boolean; duplicate?: boolean; notFound?: boolean; error?: string };

/**
 * Tell DCB a bridged gift was taken back (e.g. a fundraiser payment removed in the Vault).
 * DCB never edits posted money here: it opens a "refund" review item so Finance reverses it
 * through the normal batch flow. Already voided → ok + duplicate. Never throws.
 */
export async function voidContributionInDcb(
  voucherId: string,
  body: { transactionId: string; reason?: string; refundAmount?: number },
  opts: { timeoutMs?: number } = {}
): Promise<DcbVoidResult> {
  const ingestUrl = resolveDcbIngestUrl();
  if (!ingestUrl || !dcbServiceSecret()) {
    return { ok: false, skipped: true, error: 'DCB bridge not configured (set AWC_DCB_API_URL + AWC_DCB_SERVICE_SECRET on Vault).' };
  }
  const url = `${ingestUrl.replace(/\/$/, '')}/${encodeURIComponent(voucherId || body.transactionId)}/void`;
  try {
    const rawBody = JSON.stringify({ ...body, refundedAt: new Date().toISOString() });
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...signAwcServiceRequest(rawBody), 'Idempotency-Key': body.transactionId },
      body: rawBody,
      ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
    if (response.status === 409) return { ok: true, duplicate: true };
    // DCB never got it (e.g. it failed to post), so there is nothing to take back.
    if (response.status === 404) return { ok: true, notFound: true };
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, error: `DCB API ${response.status}: ${text.slice(0, 240)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown DCB void error' };
  }
}

/** Alias used by Thanksgiving Mark Paid bridge. */
export const postSettledContributionToDcb = postContributionToDcb;
