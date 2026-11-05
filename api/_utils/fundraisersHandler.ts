/**
 * Fundraisers (moved from DCB).  resource=fundraisers&action=…
 *
 * Gifts, pledges, fun charges ("Coming in late" $20 …), game/event cash and online gifts
 * from PLCC Tithe, with a running calculator of what's raised and who still owes.
 *
 * Access (checked here, server-side):
 *   use     — by role: SUPER_ADMIN, ADMIN, PASTOR, FIRST_LADY, SECRETARY, ASST_SECRETARY, FINANCE;
 *             anyone else (Members, Accountants…) only with users.fundraiser_access switched on
 *   use     — includes starting, editing, closing/reopening a fundraiser and its fun charge prices,
 *             so the people who run the fundraiser don't depend on anyone else
 *   manage  — PLCC Tithe fund link (it shows donor names) and who has the switch:
 *             SUPER_ADMIN, ADMIN, PASTOR, FIRST_LADY, FINANCE
 *   delete  — fundraisers, entries, payments: SUPER_ADMIN, ADMIN, PASTOR, FIRST_LADY
 * Online gifts from Tithe are read-only here; fix or refund them in Tithe.
 * Requires supabase/migrations/fundraisers_phase_1.sql.
 */
import { getSupabaseAdmin as realGetSupabaseAdmin, requireAuth as realRequireAuth } from './auth.js';
import { logAudit as realLogAudit } from './audit.js';
import { titheSignedPost as realTitheSignedPost, isTitheSyncConfigured as realIsTitheSyncConfigured } from './titheRsvpSync.js';
import {
  allocatePayment,
  balancesByPerson,
  chargeBreakdown,
  isPaymentMethod,
  parseFundraiserBalanceRef,
  summarizeFundraiser,
  type OpenItem,
} from '../../lib/fundraiserMath.js';
import {
  catchUpDcb,
  dcbColumnsReady,
  dcbOverview,
  DCB_NOT_READY,
  realFundraiserDcbDeps,
  sendEarlierToDcb,
  sendPaymentIds,
  voidPaymentsInDcb,
  type FundraiserDcbDeps,
} from './fundraiserDcb.js';

/** Roles that use Fundraisers without needing the switch. */
export const FUNDRAISER_USE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'FIRST_LADY', 'SECRETARY', 'ASST_SECRETARY', 'FINANCE']);
/** These can never be given the switch (shared devices, unapproved sign-ups). */
const SWITCH_DENIED_ROLES = new Set(['KIOSK', 'PENDING', 'GUEST', '']);
export const FUNDRAISER_MANAGE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'FIRST_LADY', 'FINANCE']);
export const FUNDRAISER_DELETE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'FIRST_LADY']);

const NOT_READY = 'Fundraisers are not set up yet. Run supabase/migrations/fundraisers_phase_1.sql in Supabase.';
const ACCESS_NOT_READY = 'The Fundraiser access switch is not set up yet. Run supabase/migrations/fundraisers_phase_2_access.sql in Supabase.';
const NO_ACCESS = "You don't have Fundraiser access. Ask the Pastor, First Lady or Finance to turn it on for you.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TITHE_SYNC_EVERY_MS = 60_000;
const MAX_CENTS = 100_000_000; // $1,000,000

type Db = any;

/** Swappable for tests (fake database, auth, Tithe and DCB). */
export type FundraiserDeps = FundraiserDcbDeps & {
  getSupabaseAdmin: () => any;
  requireAuth: (req: any, res: any, db: any) => Promise<{ user: { id: string } | null; role: string | null } | null>;
  logAudit: typeof realLogAudit;
  titheSignedPost: <T = any>(path: string, payload: unknown) => Promise<T>;
  isTitheSyncConfigured: () => boolean;
};

const realDeps: FundraiserDeps = {
  getSupabaseAdmin: realGetSupabaseAdmin,
  requireAuth: realRequireAuth as any,
  logAudit: realLogAudit,
  titheSignedPost: realTitheSignedPost,
  isTitheSyncConfigured: realIsTitheSyncConfigured,
  ...realFundraiserDcbDeps,
};
let deps: FundraiserDeps = realDeps;
/** Per request: phase 4 (DCB columns) has been run. */
let dcbReady = false;

function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return String(v ?? '').trim();
}

function fail(res: any, status: number, error: string, code = 'fundraiser_error') {
  return res.status(status).json({ ok: false, code, error });
}

function isMissingSchema(err: any): boolean {
  return /does not exist|schema cache|Could not find the table/i.test(String(err?.message || err || ''));
}

function dbFail(res: any, err: any) {
  if (isMissingSchema(err)) return fail(res, 503, NOT_READY, 'fundraisers_unavailable');
  const msg = String(err?.message || '');
  if (/check constraint|violates/i.test(msg)) return fail(res, 400, 'That value is not allowed.', 'invalid_value');
  console.error('[fundraisers]', msg);
  return fail(res, 500, 'Fundraiser request failed.');
}

function cents(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x) : NaN;
}

function validCents(v: number, { allowZero = false } = {}): boolean {
  return Number.isFinite(v) && (allowZero ? v >= 0 : v > 0) && v <= MAX_CENTS;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateOr(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim();
  return DATE_RE.test(s) ? s : fallback;
}

function cleanText(v: unknown, max = 500): string | null {
  const s = String(v ?? '').trim().slice(0, max);
  return s || null;
}

function memberName(m: any): string {
  return `${String(m?.first_name || '').trim()} ${String(m?.last_name || '').trim()}`.trim() || 'Member';
}

/** Tithe payment method → Vault label. */
function titheMethod(m: unknown): string {
  const v = String(m || '');
  if (v === 'cash_app' || v === 'cashapp') return 'cashapp';
  if (v === 'zelle') return 'zelle';
  if (v === 'venmo') return 'venmo';
  if (v === 'card' || v === 'apple_pay' || v === 'google_pay' || v === 'link') return 'card';
  return 'other';
}

async function audit(req: any, userId: string, action: string, resourceId: string, details: any, severity: 'info' | 'warning' = 'info') {
  await deps.logAudit({ userId, action, details, resourceType: 'fundraiser', resourceId, severity, req });
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadFundraiserRow(db: Db, id: string) {
  const { data, error } = await db.from('fundraisers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadEntryRow(db: Db, fundraiserId: string, entryId: string) {
  const { data, error } = await db
    .from('fundraiser_entries')
    .select('*')
    .eq('id', entryId)
    .eq('fundraiser_id', fundraiserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** received_amount_cents always equals the sum of the entry's payments. */
async function recomputeReceived(db: Db, entryId: string): Promise<number> {
  const { data, error } = await db.from('fundraiser_payments').select('amount_cents').eq('entry_id', entryId);
  if (error) throw error;
  const total = (data || []).reduce((a: number, p: any) => a + Number(p.amount_cents || 0), 0);
  const { error: upErr } = await db
    .from('fundraiser_entries')
    .update({ received_amount_cents: total, updated_at: new Date().toISOString() })
    .eq('id', entryId);
  if (upErr) throw upErr;
  return total;
}

async function loadFull(db: Db, id: string) {
  const fundraiser = await loadFundraiserRow(db, id);
  if (!fundraiser) return null;
  const [{ data: items, error: iErr }, { data: entries, error: eErr }] = await Promise.all([
    db.from('fundraiser_charge_items').select('*').eq('fundraiser_id', id).order('sort_order').order('created_at'),
    db
      .from('fundraiser_entries')
      .select('*')
      .eq('fundraiser_id', id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);
  if (iErr) throw iErr;
  if (eErr) throw eErr;
  const entryIds = (entries || []).map((e: any) => e.id);
  const payments = await loadPaymentsFor(db, entryIds);

  // "Recorded by" — names of the volunteers who entered each payment / entry
  const userIds = new Set<string>();
  for (const p of payments) if (p.entered_by) userIds.add(p.entered_by);
  for (const e of entries || []) if (e.entered_by) userIds.add(e.entered_by);
  const names = new Map<string, string>();
  const ids = [...userIds];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db.from('users').select('id, name, email').in('id', ids.slice(i, i + 150));
    for (const u of data || []) names.set(u.id, String(u.name || u.email || '').trim() || 'Staff');
  }
  const recordedBy = (row: any) => (row.external_ref ? 'PLCC Tithe' : row.entered_by ? names.get(row.entered_by) || 'Staff' : null);

  const byEntry = new Map<string, any[]>();
  for (const p of payments) {
    const list = byEntry.get(p.entry_id) || [];
    list.push({ ...p, amount_cents: Number(p.amount_cents || 0), recorded_by_name: recordedBy(p) });
    byEntry.set(p.entry_id, list);
  }
  const fullEntries = (entries || []).map((e: any) => ({
    ...e,
    owed_amount_cents: Number(e.owed_amount_cents || 0),
    received_amount_cents: Number(e.received_amount_cents || 0),
    recorded_by_name: recordedBy(e),
    payments: byEntry.get(e.id) || [],
  }));
  const goal = fundraiser.goal_amount_cents == null ? null : Number(fundraiser.goal_amount_cents);
  let pendingVoids = 0;
  if (dcbReady) {
    const { count } = await db
      .from('fundraiser_dcb_voids')
      .select('id', { count: 'exact', head: true })
      .eq('fundraiser_id', id)
      .is('done_at', null);
    pendingVoids = Number(count || 0);
  }
  return {
    fundraiser: { ...fundraiser, goal_amount_cents: goal },
    dcb: dcbOverview(payments, dcbReady, deps.isDcbConfigured(), pendingVoids),
    chargeItems: items || [],
    entries: fullEntries,
    summary: summarizeFundraiser(fullEntries, goal),
    balances: balancesByPerson(fullEntries),
    charges: chargeBreakdown(fullEntries),
  };
}

async function loadPaymentsFor(db: Db, entryIds: string[]): Promise<any[]> {
  let payments: any[] = [];
  // Chunk to keep URLs short on big fundraisers
  for (let i = 0; i < entryIds.length; i += 150) {
    const { data, error } = await db
      .from('fundraiser_payments')
      .select('*')
      .in('entry_id', entryIds.slice(i, i + 150))
      .order('payment_date', { ascending: false });
    if (error) throw error;
    payments = payments.concat(data || []);
  }
  return payments;
}

// ---------------------------------------------------------------------------
// PLCC Tithe online gifts
//
// Every row created from one Tithe gift carries external_ref 'tithe:<transaction>'.
// A gift paid through a "Pay my balance" link (frm:/fre: reference) goes onto that
// person's open pledges and fun charges, oldest first; anything over what they owe
// stays as an online gift. Other online gifts are kept as gifts and can be matched
// to someone's balance by hand ("To match").
// ---------------------------------------------------------------------------

type SyncResult = { added: number; applied: number; updated: number; warning?: string };

type LiveEntry = {
  id: string;
  kind: string;
  source_type: string;
  member_id: string | null;
  display_name: string;
  owed_amount_cents: number;
  received_amount_cents: number;
  entry_date: string;
  created_at: string;
  external_ref: string | null;
};

function openLeft(e: LiveEntry): number {
  return e.kind === 'paid' ? 0 : Math.max(0, e.owed_amount_cents - e.received_amount_cents);
}

function sortOldest(a: LiveEntry, b: LiveEntry) {
  return String(a.entry_date).localeCompare(String(b.entry_date)) || String(a.created_at).localeCompare(String(b.created_at));
}

/** Open pledges / fun charges for the person a balance reference points at (oldest first). */
function openItemsForRef(entries: LiveEntry[], fundraiserId: string, ref: unknown): OpenItem[] {
  const parsed = parseFundraiserBalanceRef(ref);
  if (!parsed || parsed.fundraiserId !== String(fundraiserId).toLowerCase()) return [];
  let mine: LiveEntry[];
  if (parsed.kind === 'member') {
    mine = entries.filter((e) => String(e.member_id || '').toLowerCase() === parsed.id);
  } else {
    const anchor = entries.find((e) => e.id.toLowerCase() === parsed.id);
    if (!anchor) return [];
    mine = anchor.member_id
      ? entries.filter((e) => e.member_id === anchor.member_id)
      : entries.filter((e) => !e.member_id && e.source_type !== 'online' && e.display_name.trim().toLowerCase() === anchor.display_name.trim().toLowerCase());
  }
  return mine
    .filter((e) => e.source_type !== 'online' && openLeft(e) > 0)
    .sort(sortOldest)
    .map((e) => ({ entryId: e.id, leftCents: openLeft(e) }));
}

function openItemsForIds(entries: LiveEntry[], ids: string[]): OpenItem[] {
  const out: OpenItem[] = [];
  for (const id of ids) {
    const e = entries.find((x) => x.id === id);
    if (e && e.source_type !== 'online' && openLeft(e) > 0) out.push({ entryId: e.id, leftCents: openLeft(e) });
  }
  return out;
}

async function loadLiveEntries(db: Db, fundraiserId: string): Promise<LiveEntry[]> {
  const { data, error } = await db
    .from('fundraiser_entries')
    .select('id, kind, source_type, member_id, display_name, owed_amount_cents, received_amount_cents, entry_date, created_at, external_ref')
    .eq('fundraiser_id', fundraiserId);
  if (error) throw error;
  return (data || []).map((e: any) => ({
    ...e,
    owed_amount_cents: Number(e.owed_amount_cents || 0),
    received_amount_cents: Number(e.received_amount_cents || 0),
  }));
}

/** Put a Tithe gift onto open items; any remainder becomes an online gift entry. */
async function applyTitheGift(
  db: Db,
  fundraiser: any,
  entries: LiveEntry[],
  g: any,
  ref: string,
  netCents: number,
  targets: OpenItem[]
): Promise<{ appliedCents: number; giftCents: number }> {
  const entryDate = dateOr(String(g.contributedAt || '').slice(0, 10), today());
  const method = titheMethod(g.paymentMethod);
  const note = g.receiptNumber ? `PLCC Tithe receipt ${g.receiptNumber}` : 'PLCC Tithe';
  const { allocations, remainderCents } = allocatePayment(targets, netCents);
  for (const a of allocations) {
    const { error } = await db.from('fundraiser_payments').insert({
      entry_id: a.entryId,
      payment_date: entryDate,
      amount_cents: a.amountCents,
      payment_method: method,
      notes: note,
      external_ref: ref,
    });
    if (error) throw error;
    const received = await recomputeReceived(db, a.entryId);
    const local = entries.find((e) => e.id === a.entryId);
    if (local) local.received_amount_cents = received;
  }
  if (remainderCents > 0) {
    const { data: inserted, error: insErr } = await db
      .from('fundraiser_entries')
      .insert({
        fundraiser_id: fundraiser.id,
        entry_date: entryDate,
        source_type: 'online',
        display_name: cleanText(g.donorName, 120) || 'Online donor',
        kind: 'paid',
        owed_amount_cents: 0,
        received_amount_cents: remainderCents,
        payment_method: method,
        notes: allocations.length ? `${note} · amount over the balance` : note,
        external_ref: ref,
      })
      .select('*')
      .single();
    if (insErr) {
      if (/duplicate key|unique/i.test(String(insErr.message || ''))) return { appliedCents: netCents - remainderCents, giftCents: 0 };
      throw insErr;
    }
    const { error: pErr } = await db.from('fundraiser_payments').insert({
      entry_id: inserted.id,
      payment_date: entryDate,
      amount_cents: remainderCents,
      payment_method: method,
      notes: 'PLCC Tithe',
      external_ref: ref,
    });
    if (pErr) throw pErr;
    entries.push({ ...inserted, owed_amount_cents: 0, received_amount_cents: remainderCents });
  }
  return { appliedCents: netCents - remainderCents, giftCents: remainderCents };
}

async function syncTitheGifts(db: Db, fundraiser: any, force = false): Promise<SyncResult> {
  const none: SyncResult = { added: 0, applied: 0, updated: 0 };
  if (!fundraiser?.tithe_fund_id || fundraiser.status !== 'open') return none;
  if (!force && fundraiser.tithe_synced_at && Date.now() - Date.parse(fundraiser.tithe_synced_at) < TITHE_SYNC_EVERY_MS) {
    return none;
  }
  if (!deps.isTitheSyncConfigured()) {
    return { ...none, warning: 'PLCC Tithe link not configured (set AWC_TITHE_VAULT_KEY), so online gifts are not added yet.' };
  }
  let gifts: any[];
  try {
    const data = await deps.titheSignedPost<{ gifts: any[] }>('fund-gifts', { fundId: fundraiser.tithe_fund_id });
    gifts = Array.isArray(data.gifts) ? data.gifts : [];
  } catch (err: any) {
    console.error('[fundraisers] Tithe sync failed:', err?.message || err);
    return { ...none, warning: 'Could not reach PLCC Tithe to check online gifts. Showing saved entries.' };
  }

  const entries = await loadLiveEntries(db, fundraiser.id);
  const payments = (await loadPaymentsFor(db, entries.map((e) => e.id))).filter((p: any) => p.external_ref);
  const byRef = new Map<string, { total: number; paymentIds: string[]; targetIds: string[] }>();
  for (const p of payments) {
    const row = byRef.get(p.external_ref) || { total: 0, paymentIds: [], targetIds: [] };
    row.total += Number(p.amount_cents || 0);
    row.paymentIds.push(p.id);
    const entry = entries.find((e) => e.id === p.entry_id);
    if (entry && entry.source_type !== 'online' && !row.targetIds.includes(entry.id)) row.targetIds.push(entry.id);
    byRef.set(p.external_ref, row);
  }

  const result: SyncResult = { added: 0, applied: 0, updated: 0 };
  for (const g of gifts) {
    const txId = String(g?.transactionId || '').trim();
    if (!txId) continue;
    const ref = `tithe:${txId}`;
    const netCents = Math.max(0, Math.round((Number(g.amount || 0) - Number(g.refundedAmount || 0)) * 100));
    const existing = byRef.get(ref);
    if (existing && existing.total === netCents) continue;
    if (!existing && netCents <= 0) continue;

    let targets: OpenItem[];
    if (existing) {
      // Refunded (fully or partly) in Tithe — take it back out and put the new amount on the same people
      await db.from('fundraiser_payments').delete().in('id', existing.paymentIds);
      await db.from('fundraiser_entries').delete().eq('external_ref', ref);
      for (const id of existing.targetIds) {
        const received = await recomputeReceived(db, id);
        const local = entries.find((e) => e.id === id);
        if (local) local.received_amount_cents = received;
      }
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].external_ref === ref) entries.splice(i, 1);
      targets = openItemsForIds(entries, existing.targetIds);
      result.updated++;
    } else {
      targets = openItemsForRef(entries, fundraiser.id, g.externalRef);
    }
    if (netCents > 0) {
      const done = await applyTitheGift(db, fundraiser, entries, g, ref, netCents, targets);
      if (!existing) {
        if (done.appliedCents > 0) result.applied++;
        else if (done.giftCents > 0) result.added++;
      }
    }
  }
  await db.from('fundraisers').update({ tithe_synced_at: new Date().toISOString() }).eq('id', fundraiser.id);
  return result;
}

// ---------------------------------------------------------------------------
// Fundraiser access switch
// ---------------------------------------------------------------------------

/** true / false, or 'missing' when the phase 2 column isn't there yet. */
async function hasSwitch(db: Db, userId: string, email?: string | null): Promise<boolean | 'missing'> {
  if (!userId) return false;
  const byId = await db.from('users').select('fundraiser_access').eq('id', userId).maybeSingle();
  if (byId.error) return isMissingSchema(byId.error) || /fundraiser_access/.test(String(byId.error.message)) ? 'missing' : false;
  if (byId.data) return byId.data.fundraiser_access === true;
  if (email) {
    const byEmail = await db.from('users').select('fundraiser_access').ilike('email', String(email).trim()).maybeSingle();
    if (byEmail.error) return false;
    return byEmail.data?.fundraiser_access === true;
  }
  return false;
}

export function fundraiserAccessDecision(role: string, switchOn: boolean | 'missing'): boolean {
  const r = String(role || '').toUpperCase();
  if (FUNDRAISER_USE_ROLES.has(r)) return true;
  if (SWITCH_DENIED_ROLES.has(r)) return false;
  return switchOn === true;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleFundraisers(req: any, res: any, injected?: Partial<FundraiserDeps>) {
  deps = injected ? { ...realDeps, ...injected } : realDeps;
  const db = deps.getSupabaseAdmin();
  if (!db) return fail(res, 503, 'Database not configured.');
  dcbReady = false;
  const auth = await deps.requireAuth(req, res, db);
  if (!auth) return;
  const role = String(auth.role || '').toUpperCase();
  const userId = String(auth.user?.id || '');
  const method = String(req.method || 'GET').toUpperCase();
  const action = first(req.query?.action) || (method === 'GET' ? 'list' : '');
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  let switchOn: boolean | 'missing' = false;
  if (!FUNDRAISER_USE_ROLES.has(role) && !SWITCH_DENIED_ROLES.has(role)) {
    switchOn = await hasSwitch(db, userId, auth.user?.email);
  }
  const allowed = fundraiserAccessDecision(role, switchOn);
  const canManage = allowed && FUNDRAISER_MANAGE_ROLES.has(role);
  const canDelete = allowed && FUNDRAISER_DELETE_ROLES.has(role);
  const permissions = { canManage, canDelete, role };

  // Lets the menu decide whether to show Fundraisers. Never an error.
  if (method === 'GET' && action === 'access') {
    return res.status(200).json({ ok: true, allowed, ...permissions });
  }
  if (!allowed) return fail(res, 403, NO_ACCESS, 'no_fundraiser_access');
  dcbReady = await dcbColumnsReady(db).catch(() => false);

  try {
    // ---------------- reads ----------------
    if (method === 'GET') {
      if (action === 'list') {
        const { data: rows, error } = await db
          .from('fundraisers')
          .select('*')
          .order('status', { ascending: false }) // open first
          .order('start_date', { ascending: false });
        if (error) throw error;
        const ids = (rows || []).map((r: any) => r.id);
        let entries: any[] = [];
        if (ids.length) {
          const { data, error: eErr } = await db
            .from('fundraiser_entries')
            .select('id, fundraiser_id, kind, source_type, member_id, display_name, owed_amount_cents, received_amount_cents')
            .in('fundraiser_id', ids);
          if (eErr) throw eErr;
          entries = data || [];
        }
        const fundraisers = (rows || []).map((r: any) => {
          const goal = r.goal_amount_cents == null ? null : Number(r.goal_amount_cents);
          const mine = entries
            .filter((e) => e.fundraiser_id === r.id)
            .map((e) => ({ ...e, owed_amount_cents: Number(e.owed_amount_cents), received_amount_cents: Number(e.received_amount_cents) }));
          return { ...r, goal_amount_cents: goal, summary: summarizeFundraiser(mine, goal) };
        });
        return res.status(200).json({ ok: true, fundraisers, permissions });
      }

      if (action === 'get') {
        const id = first(req.query?.id);
        if (!UUID_RE.test(id)) return fail(res, 400, 'Fundraiser ID is required.');
        const row = await loadFundraiserRow(db, id);
        if (!row) return fail(res, 404, 'Fundraiser not found.');
        let sync: SyncResult = { added: 0, applied: 0, updated: 0 };
        try {
          sync = await syncTitheGifts(db, row);
        } catch (err: any) {
          console.error('[fundraisers] sync error', err?.message || err);
          sync = { added: 0, applied: 0, updated: 0, warning: 'Online gifts could not be updated right now.' };
        }
        let full: any = await loadFull(db, id);
        if (dcbReady && full) {
          const payments = full.entries.flatMap((e: any) => e.payments);
          const caught = await catchUpDcb(db, row, payments, full.entries, deps).catch(() => null);
          if (caught && (caught.sent || caught.review || caught.failed)) full = await loadFull(db, id);
        }
        return res.status(200).json({ ok: true, ...full, tithe: sync, permissions });
      }

      if (action === 'member-search') {
        const q = first(req.query?.q).replace(/[%,()]/g, '').slice(0, 40);
        if (q.length < 2) return res.status(200).json({ ok: true, members: [] });
        const parts = q.split(/\s+/).filter(Boolean);
        let query = db.from('members').select('id, first_name, last_name').limit(20);
        if (parts.length >= 2) {
          query = query.ilike('first_name', `${parts[0]}%`).ilike('last_name', `${parts.slice(1).join(' ')}%`);
        } else {
          query = query.or(`first_name.ilike.${parts[0]}%,last_name.ilike.${parts[0]}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        // Names only — no contact details or giving history
        return res.status(200).json({
          ok: true,
          members: (data || []).map((m: any) => ({ id: m.id, name: memberName(m) })).sort((a: any, b: any) => a.name.localeCompare(b.name)),
        });
      }

      if (action === 'access-list') {
        if (!canManage) return fail(res, 403, 'Only finance leaders can see who has Fundraiser access.', 'forbidden');
        const { data, error } = await db
          .from('users')
          .select('id, name, email, role, fundraiser_access_granted_at')
          .eq('fundraiser_access', true)
          .order('name');
        if (error) {
          if (isMissingSchema(error) || /fundraiser_access/.test(String(error.message))) return fail(res, 503, ACCESS_NOT_READY, 'access_unavailable');
          throw error;
        }
        return res.status(200).json({
          ok: true,
          byRole: ['Super Admin', 'Admin', 'Pastor', 'First Lady', 'Secretary', 'Asst. Secretary', 'Finance'],
          people: (data || []).map((u: any) => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role, grantedAt: u.fundraiser_access_granted_at })),
        });
      }

      if (action === 'access-search') {
        if (!canManage) return fail(res, 403, 'Only finance leaders can give Fundraiser access.', 'forbidden');
        const q = first(req.query?.q).replace(/[%,()]/g, '').slice(0, 60);
        if (q.length < 2) return res.status(200).json({ ok: true, people: [] });
        const { data, error } = await db
          .from('users')
          .select('id, name, email, role, fundraiser_access')
          .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(15);
        if (error) {
          if (isMissingSchema(error) || /fundraiser_access/.test(String(error.message))) return fail(res, 503, ACCESS_NOT_READY, 'access_unavailable');
          throw error;
        }
        return res.status(200).json({
          ok: true,
          people: (data || []).map((u: any) => {
            const r = String(u.role || '').toUpperCase();
            return {
              id: u.id,
              name: u.name || u.email,
              email: u.email,
              role: u.role,
              hasSwitch: u.fundraiser_access === true,
              byRole: FUNDRAISER_USE_ROLES.has(r),
              canGrant: !SWITCH_DENIED_ROLES.has(r) && !FUNDRAISER_USE_ROLES.has(r),
            };
          }),
        });
      }

      if (action === 'tithe-funds') {
        if (!canManage) return fail(res, 403, 'Only finance leaders can link an PLCC Tithe fund.', 'forbidden');
        if (!deps.isTitheSyncConfigured()) return res.status(200).json({ ok: true, funds: [], warning: 'PLCC Tithe link not configured (set AWC_TITHE_VAULT_KEY).' });
        try {
          const data = await deps.titheSignedPost<{ funds: any[] }>('funds', {});
          return res.status(200).json({ ok: true, funds: data.funds || [] });
        } catch (err: any) {
          return res.status(200).json({ ok: true, funds: [], warning: 'Could not reach PLCC Tithe. Try again in a minute.' });
        }
      }

      return fail(res, 400, 'Unknown action.');
    }

    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    // ---------------- writes ----------------
    if (action === 'set-access') {
      if (!canManage) return fail(res, 403, 'Only finance leaders can change Fundraiser access.', 'forbidden');
      const targetId = first(body.userId);
      if (!UUID_RE.test(targetId)) return fail(res, 400, 'Pick a person.');
      const on = body.allowed === true;
      const { data: target, error: tErr } = await db.from('users').select('id, name, email, role, fundraiser_access').eq('id', targetId).maybeSingle();
      if (tErr) {
        if (isMissingSchema(tErr) || /fundraiser_access/.test(String(tErr.message))) return fail(res, 503, ACCESS_NOT_READY, 'access_unavailable');
        throw tErr;
      }
      if (!target) return fail(res, 404, 'That person was not found.');
      const targetRole = String(target.role || '').toUpperCase();
      if (on && SWITCH_DENIED_ROLES.has(targetRole)) {
        return fail(res, 400, targetRole === 'KIOSK' ? 'A kids-desk tablet login cannot have Fundraiser access.' : 'Approve this account first, then give Fundraiser access.');
      }
      const { error } = await db
        .from('users')
        .update({
          fundraiser_access: on,
          fundraiser_access_granted_by: on ? userId || null : null,
          fundraiser_access_granted_at: on ? new Date().toISOString() : null,
        })
        .eq('id', targetId);
      if (error) throw error;
      await deps.logAudit({
        userId,
        action: on ? 'FUNDRAISER_ACCESS_GRANTED' : 'FUNDRAISER_ACCESS_REMOVED',
        details: { person: target.name || target.email, role: target.role },
        resourceType: 'user',
        resourceId: targetId,
        severity: 'warning',
        req,
      });
      return res.status(200).json({ ok: true, userId: targetId, allowed: on });
    }

    if (action === 'create') {
      const title = cleanText(body.title, 120);
      if (!title) return fail(res, 400, 'Give the fundraiser a name, such as 2nd Floor Building Fund.');
      const goal = body.goalAmountCents == null || body.goalAmountCents === '' ? null : cents(body.goalAmountCents);
      if (goal != null && !validCents(goal, { allowZero: true })) return fail(res, 400, 'Enter a valid goal amount.');
      const { data, error } = await db
        .from('fundraisers')
        .insert({
          title,
          start_date: dateOr(body.startDate, today()),
          goal_amount_cents: goal,
          notes: cleanText(body.notes),
          created_by: userId || null,
        })
        .select('*')
        .single();
      if (error) throw error;
      await audit(req, userId, 'FUNDRAISER_CREATED', data.id, { title });
      return res.status(201).json({ ok: true, fundraiser: data });
    }

    const fundraiserId = first(body.fundraiserId || req.query?.id);
    if (!UUID_RE.test(fundraiserId)) return fail(res, 400, 'Fundraiser ID is required.');
    const fundraiser = await loadFundraiserRow(db, fundraiserId);
    if (!fundraiser) return fail(res, 404, 'Fundraiser not found.');
    const isOpen = fundraiser.status === 'open';
    const dcbWarnings: string[] = [];
    const reply = async (status = 200) =>
      res.status(status).json({
        ok: true,
        ...(await loadFull(db, fundraiserId)),
        permissions,
        ...(dcbWarnings.length ? { dcbWarning: dcbWarnings.join(' ') } : {}),
      });
    /** Send just-recorded cash / check payments to the DCB (no-op until phase 4 is run). */
    const toDcb = async (paymentIds: string[]) => {
      if (!dcbReady || !paymentIds.length) return;
      const r = await sendPaymentIds(db, fundraiser, paymentIds, deps).catch(() => null);
      if (r?.warning) dcbWarnings.push(r.warning);
    };
    /** Before removing payments: take them back out of the DCB if it has them. */
    const outOfDcb = async (payments: any[], entry: any | null, reason: string) => {
      if (!dcbReady || !payments?.length) return;
      const r = await voidPaymentsInDcb(db, fundraiser, payments, entry, reason, deps).catch(() => null);
      if (r?.warning) dcbWarnings.push(r.warning);
    };

    if (action === 'update') {
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) {
        const title = cleanText(body.title, 120);
        if (!title) return fail(res, 400, 'Give the fundraiser a name.');
        patch.title = title;
      }
      if (body.startDate !== undefined) {
        if (!DATE_RE.test(String(body.startDate))) return fail(res, 400, 'Enter a valid start date.');
        patch.start_date = body.startDate;
      }
      if (body.goalAmountCents !== undefined) {
        const goal = body.goalAmountCents == null || body.goalAmountCents === '' ? null : cents(body.goalAmountCents);
        if (goal != null && !validCents(goal, { allowZero: true })) return fail(res, 400, 'Enter a valid goal amount.');
        patch.goal_amount_cents = goal;
      }
      if (body.notes !== undefined) patch.notes = cleanText(body.notes);
      if (body.status === 'open' || body.status === 'closed') {
        patch.status = body.status;
        patch.closed_at = body.status === 'closed' ? new Date().toISOString() : null;
      }
      if (body.titheFundId !== undefined) {
        if (!canManage) return fail(res, 403, 'Only finance leaders can link an PLCC Tithe fund.', 'forbidden');
        const fundId = cleanText(body.titheFundId, 100);
        patch.tithe_fund_id = fundId;
        patch.tithe_fund_name = fundId ? cleanText(body.titheFundName, 120) : null;
        patch.tithe_synced_at = null;
      }
      const { error } = await db.from('fundraisers').update(patch).eq('id', fundraiserId);
      if (error) throw error;
      const auditAction = patch.status && patch.status !== fundraiser.status
        ? patch.status === 'closed' ? 'FUNDRAISER_CLOSED' : 'FUNDRAISER_REOPENED'
        : 'FUNDRAISER_UPDATED';
      await audit(req, userId, auditAction, fundraiserId, { before: fundraiser, changes: patch });
      if (patch.tithe_fund_id) {
        const fresh = await loadFundraiserRow(db, fundraiserId);
        await syncTitheGifts(db, fresh, true).catch(() => undefined);
      }
      return reply();
    }

    if (action === 'sync-tithe') {
      const result = await syncTitheGifts(db, fundraiser, true);
      return res.status(200).json({ ok: true, ...(await loadFull(db, fundraiserId)), tithe: result, permissions });
    }

    if (action === 'delete') {
      if (!canDelete) return fail(res, 403, 'Only the Super Admin, Pastor or First Lady can delete a fundraiser.', 'forbidden');
      if (String(body.confirmTitle || '').trim().toLowerCase() !== String(fundraiser.title).trim().toLowerCase()) {
        return fail(res, 400, `Type the fundraiser name "${fundraiser.title}" to confirm.`);
      }
      const snapshot = await loadFull(db, fundraiserId);
      for (const e of snapshot?.entries || []) await outOfDcb(e.payments, e, 'Fundraiser deleted in PLCC Canaan');
      const { error } = await db.from('fundraisers').delete().eq('id', fundraiserId); // cascades
      if (error) throw error;
      await audit(req, userId, 'FUNDRAISER_DELETED', fundraiserId, {
        title: fundraiser.title,
        summary: snapshot?.summary,
        entries: snapshot?.entries?.length || 0,
      }, 'warning');
      return res.status(200).json({ ok: true, deleted: true, ...(dcbWarnings.length ? { dcbWarning: dcbWarnings.join(' ') } : {}) });
    }

    // ----- price list (fun charges) -----
    if (action === 'add-charge-item' || action === 'update-charge-item') {
      if (action === 'add-charge-item') {
        const label = cleanText(body.label, 80);
        const amount = cents(body.amountCents);
        if (!label) return fail(res, 400, 'Name the charge, such as Coming in late.');
        if (!validCents(amount)) return fail(res, 400, 'Enter the charge amount.');
        const { count } = await db.from('fundraiser_charge_items').select('id', { count: 'exact', head: true }).eq('fundraiser_id', fundraiserId);
        const { error } = await db.from('fundraiser_charge_items').insert({
          fundraiser_id: fundraiserId,
          label,
          amount_cents: amount,
          sort_order: Number(count || 0),
        });
        if (error) throw error;
        await audit(req, userId, 'FUNDRAISER_CHARGE_ITEM_ADDED', fundraiserId, { label, amount });
        return reply();
      }
      const itemId = first(body.itemId);
      if (!UUID_RE.test(itemId)) return fail(res, 400, 'Charge ID is required.');
      const patch: Record<string, any> = {};
      if (body.label !== undefined) {
        const label = cleanText(body.label, 80);
        if (!label) return fail(res, 400, 'Name the charge.');
        patch.label = label;
      }
      if (body.amountCents !== undefined) {
        const amount = cents(body.amountCents);
        if (!validCents(amount)) return fail(res, 400, 'Enter the charge amount.');
        patch.amount_cents = amount;
      }
      if (typeof body.active === 'boolean') patch.active = body.active;
      const { error } = await db.from('fundraiser_charge_items').update(patch).eq('id', itemId).eq('fundraiser_id', fundraiserId);
      if (error) throw error;
      await audit(req, userId, 'FUNDRAISER_CHARGE_ITEM_UPDATED', fundraiserId, { itemId, ...patch });
      return reply();
    }

    // Payments entered before the DCB link existed: a finance leader decides to send them.
    if (action === 'send-earlier-to-dcb') {
      if (!canManage) return fail(res, 403, 'Only finance leaders can send earlier payments to the DCB.', 'forbidden');
      if (!dcbReady) return fail(res, 503, DCB_NOT_READY, 'dcb_unavailable');
      const full: any = await loadFull(db, fundraiserId);
      const payments = full.entries.flatMap((e: any) => e.payments);
      const r = await sendEarlierToDcb(db, fundraiser, payments, full.entries, deps);
      if (r.warning) dcbWarnings.push(r.warning);
      await audit(req, userId, 'FUNDRAISER_SENT_TO_DCB', fundraiserId, { sent: r.sent, review: r.review, failed: r.failed, remaining: r.remaining });
      return res.status(200).json({ ok: true, ...(await loadFull(db, fundraiserId)), permissions, sentToDcb: r, ...(dcbWarnings.length ? { dcbWarning: dcbWarnings.join(' ') } : {}) });
    }

    // Everything below changes money records — fundraiser must be open
    if (!isOpen) return fail(res, 400, 'This fundraiser is closed. Reopen it before making changes.');

    if (action === 'add-entry') {
      const sourceType = ['member', 'visitor', 'game'].includes(body.sourceType) ? body.sourceType : null;
      if (!sourceType) return fail(res, 400, 'Choose a member, visitor, or game / event.');
      const kind = sourceType === 'game' ? 'paid' : body.kind;
      if (!['paid', 'pledge', 'charge'].includes(kind)) return fail(res, 400, 'Choose Gift, Pledge or Fun charge.');
      const entryDate = dateOr(body.entryDate, today());

      let memberId: string | null = null;
      let displayName = cleanText(body.displayName, 120);
      if (sourceType === 'member') {
        memberId = first(body.memberId);
        if (!UUID_RE.test(memberId)) return fail(res, 400, 'Select the church member.');
        const { data: m, error } = await db.from('members').select('id, first_name, last_name').eq('id', memberId).maybeSingle();
        if (error) throw error;
        if (!m) return fail(res, 400, 'That member was not found.');
        displayName = memberName(m);
      } else if (!displayName) {
        return fail(res, 400, sourceType === 'game' ? 'Name the game or event that brought in the cash.' : "Enter the visitor's name.");
      }

      let owed = 0;
      let paidNow = 0;
      let chargeItemId: string | null = null;
      let chargeLabel: string | null = null;
      let quantity = 1;
      if (kind === 'paid') {
        paidNow = cents(body.amountCents);
        if (!validCents(paidNow)) return fail(res, 400, 'Enter the amount received.');
      } else if (kind === 'pledge') {
        owed = cents(body.pledgedAmountCents);
        if (!validCents(owed)) return fail(res, 400, 'Enter the pledged amount.');
        paidNow = body.paidNowCents == null || body.paidNowCents === '' ? 0 : cents(body.paidNowCents);
        if (!validCents(paidNow, { allowZero: true }) || paidNow > owed) return fail(res, 400, 'Paid so far must be between $0 and the pledge.');
      } else {
        chargeItemId = first(body.chargeItemId);
        if (!UUID_RE.test(chargeItemId)) return fail(res, 400, 'Pick a fun charge.');
        const { data: item, error } = await db
          .from('fundraiser_charge_items')
          .select('*')
          .eq('id', chargeItemId)
          .eq('fundraiser_id', fundraiserId)
          .maybeSingle();
        if (error) throw error;
        if (!item || !item.active) return fail(res, 400, 'That fun charge is not available.');
        chargeLabel = item.label;
        quantity = Math.max(1, Math.min(99, Math.floor(Number(body.quantity) || 1)));
        // Price can be adjusted for this person (discount, special amount)
        const unit = body.unitAmountCents == null || body.unitAmountCents === '' ? Number(item.amount_cents) : cents(body.unitAmountCents);
        if (!validCents(unit)) return fail(res, 400, 'Enter the charge amount.');
        owed = unit * quantity;
        if (owed > MAX_CENTS) return fail(res, 400, 'That amount is too large.');
        paidNow = body.paidNow ? owed : 0;
      }
      const paymentMethod = String(body.paymentMethod || '').trim().toLowerCase();
      if (paidNow > 0 && !isPaymentMethod(paymentMethod)) return fail(res, 400, 'Choose how it was paid.');

      const { data: entry, error: insErr } = await db
        .from('fundraiser_entries')
        .insert({
          fundraiser_id: fundraiserId,
          entry_date: entryDate,
          source_type: sourceType,
          member_id: memberId,
          display_name: displayName,
          kind,
          charge_item_id: chargeItemId,
          charge_label: chargeLabel,
          quantity,
          owed_amount_cents: owed,
          received_amount_cents: 0,
          payment_method: paidNow > 0 ? paymentMethod : null,
          notes: cleanText(body.notes),
          entered_by: userId || null,
        })
        .select('*')
        .single();
      if (insErr) throw insErr;
      if (paidNow > 0) {
        const { data: pay, error: payErr } = await db
          .from('fundraiser_payments')
          .insert({
            entry_id: entry.id,
            payment_date: entryDate,
            amount_cents: paidNow,
            payment_method: paymentMethod,
            notes: kind === 'paid' ? null : 'Paid when entered',
            entered_by: userId || null,
          })
          .select('id')
          .single();
        if (payErr) {
          await db.from('fundraiser_entries').delete().eq('id', entry.id);
          throw payErr;
        }
        await recomputeReceived(db, entry.id);
        if (pay?.id) await toDcb([pay.id]);
      }
      await audit(req, userId, 'FUNDRAISER_ENTRY_ADDED', fundraiserId, {
        entryId: entry.id, kind, sourceType, name: displayName, owed, paidNow, chargeLabel, quantity,
      });
      return reply(201);
    }

    const entryId = first(body.entryId);

    // Put an online gift (from PLCC Tithe) onto someone's pledges / fun charges.
    if (action === 'match-online') {
      if (!UUID_RE.test(entryId)) return fail(res, 400, 'Pick the online gift.');
      const gift = await loadEntryRow(db, fundraiserId, entryId);
      if (!gift || gift.source_type !== 'online' || !gift.external_ref) return fail(res, 404, 'That online gift was not found.');
      const targetIds: string[] = Array.isArray(body.targetEntryIds) ? body.targetEntryIds.map((x: unknown) => first(x)).filter((x: string) => UUID_RE.test(x)) : [];
      if (!targetIds.length) return fail(res, 400, 'Pick whose balance this pays.');
      const entries = await loadLiveEntries(db, fundraiserId);
      const targets = openItemsForIds(entries, targetIds);
      if (!targets.length) return fail(res, 400, 'That person has nothing left to pay.');
      const amount = Number(gift.received_amount_cents || 0);
      const { allocations, remainderCents } = allocatePayment(targets, amount);
      const { data: giftPayments } = await db.from('fundraiser_payments').select('*').eq('entry_id', gift.id);
      const method = gift.payment_method || 'other';
      for (const a of allocations) {
        const { error } = await db.from('fundraiser_payments').insert({
          entry_id: a.entryId,
          payment_date: gift.entry_date,
          amount_cents: a.amountCents,
          payment_method: method,
          notes: `${gift.notes || 'PLCC Tithe'} · matched from ${gift.display_name}`,
          external_ref: gift.external_ref,
          entered_by: userId || null,
        });
        if (error) throw error;
        await recomputeReceived(db, a.entryId);
      }
      if (remainderCents > 0) {
        const keep = (giftPayments || [])[0];
        if (keep) {
          await db.from('fundraiser_payments').delete().eq('entry_id', gift.id).neq('id', keep.id);
          await db.from('fundraiser_payments').update({ amount_cents: remainderCents, external_ref: gift.external_ref }).eq('id', keep.id);
        }
        await recomputeReceived(db, gift.id);
        await db.from('fundraiser_entries').update({ notes: `${gift.notes || 'PLCC Tithe'} · part applied to a balance` }).eq('id', gift.id);
      } else {
        await db.from('fundraiser_entries').delete().eq('id', gift.id); // its payment row goes with it
      }
      await audit(req, userId, 'FUNDRAISER_ONLINE_GIFT_MATCHED', fundraiserId, {
        gift: gift.display_name,
        amount,
        appliedTo: allocations,
        keptAsGift: remainderCents,
      });
      return reply();
    }

    // An online gift that is just a gift — take it off the To match list.
    if (action === 'keep-as-gift') {
      if (!UUID_RE.test(entryId)) return fail(res, 400, 'Pick the online gift.');
      const gift = await loadEntryRow(db, fundraiserId, entryId);
      if (!gift || gift.source_type !== 'online') return fail(res, 404, 'That online gift was not found.');
      const { error } = await db.from('fundraiser_entries').update({ match_dismissed: true }).eq('id', gift.id);
      if (error) {
        if (/match_dismissed/.test(String(error.message))) {
          return fail(res, 503, 'Run supabase/migrations/fundraisers_phase_3_matching.sql in Supabase first.', 'matching_unavailable');
        }
        throw error;
      }
      return reply();
    }

    if (['update-entry', 'delete-entry', 'add-payment', 'delete-payment'].includes(action)) {
      if (!UUID_RE.test(entryId)) return fail(res, 400, 'Entry ID is required.');
      const entry = await loadEntryRow(db, fundraiserId, entryId);
      if (!entry) return fail(res, 404, 'Entry not found.');
      if (entry.source_type === 'online') {
        return fail(res, 400, 'Online gifts come from PLCC Tithe. Fix or refund them in Tithe and they update here.');
      }
      const owed = Number(entry.owed_amount_cents || 0);
      const received = Number(entry.received_amount_cents || 0);

      if (action === 'update-entry') {
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        let newPaymentId: string | null = null;
        if (body.entryDate !== undefined) {
          if (!DATE_RE.test(String(body.entryDate))) return fail(res, 400, 'Enter a valid date.');
          patch.entry_date = body.entryDate;
        }
        if (body.displayName !== undefined) {
          if (entry.source_type === 'member') return fail(res, 400, "A member's entry uses the member's name. Delete it and re-enter it for a different person.");
          const name = cleanText(body.displayName, 120);
          if (!name) return fail(res, 400, 'Enter a name.');
          patch.display_name = name;
        }
        if (body.notes !== undefined) patch.notes = cleanText(body.notes);
        if (entry.kind === 'paid' && body.amountCents !== undefined) {
          const amount = cents(body.amountCents);
          if (!validCents(amount)) return fail(res, 400, 'Enter the amount received.');
          const method = String(body.paymentMethod || entry.payment_method || '').toLowerCase();
          if (!isPaymentMethod(method)) return fail(res, 400, 'Choose how it was paid.');
          const { data: oldPayments } = await db.from('fundraiser_payments').select('*').eq('entry_id', entryId);
          const newDate = patch.entry_date || entry.entry_date;
          const old = oldPayments || [];
          // Saving the form without changing the money (e.g. only the notes) keeps the same payment,
          // so the DCB is not asked to reverse and re-add it.
          const unchanged =
            old.length === 1 &&
            Number(old[0].amount_cents) === amount &&
            String(old[0].payment_method) === method &&
            String(old[0].payment_date) === String(newDate);
          if (!unchanged) {
            await outOfDcb(old, entry, 'Gift amount changed in PLCC Canaan fundraiser');
            await db.from('fundraiser_payments').delete().eq('entry_id', entryId);
            const { data: pay, error } = await db
              .from('fundraiser_payments')
              .insert({
                entry_id: entryId,
                payment_date: newDate,
                amount_cents: amount,
                payment_method: method,
                entered_by: userId || null,
              })
              .select('id')
              .single();
            if (error) throw error;
            newPaymentId = pay?.id || null;
          }
          patch.payment_method = method;
        }
        if (entry.kind === 'pledge' && body.pledgedAmountCents !== undefined) {
          const amount = cents(body.pledgedAmountCents);
          if (!validCents(amount)) return fail(res, 400, 'Enter the pledged amount.');
          if (amount < received) return fail(res, 400, `The pledge can't be less than the $${(received / 100).toFixed(2)} already paid. Remove a payment first.`);
          patch.owed_amount_cents = amount;
        }
        if (entry.kind === 'charge' && (body.quantity !== undefined || body.unitAmountCents !== undefined)) {
          const qty = body.quantity === undefined ? Number(entry.quantity || 1) : Math.max(1, Math.min(99, Math.floor(Number(body.quantity) || 1)));
          const unit = body.unitAmountCents === undefined ? Math.round(owed / Math.max(1, Number(entry.quantity || 1))) : cents(body.unitAmountCents);
          if (!validCents(unit)) return fail(res, 400, 'Enter the charge amount.');
          const total = unit * qty;
          if (total < received) return fail(res, 400, `The charge can't be less than the $${(received / 100).toFixed(2)} already paid. Remove a payment first.`);
          patch.quantity = qty;
          patch.owed_amount_cents = total;
        }
        const { error } = await db.from('fundraiser_entries').update(patch).eq('id', entryId);
        if (error) throw error;
        if (entry.kind === 'paid' && body.amountCents !== undefined) await recomputeReceived(db, entryId);
        if (newPaymentId) await toDcb([newPaymentId]);
        await audit(req, userId, 'FUNDRAISER_ENTRY_UPDATED', fundraiserId, { entryId, before: entry, changes: patch });
        return reply();
      }

      if (action === 'delete-entry') {
        if (!canDelete) return fail(res, 403, 'Only the Super Admin, Pastor or First Lady can delete an entry.', 'forbidden');
        const { data: payments } = await db.from('fundraiser_payments').select('*').eq('entry_id', entryId);
        await outOfDcb(payments || [], entry, 'Entry deleted in PLCC Canaan fundraiser');
        const { error } = await db.from('fundraiser_entries').delete().eq('id', entryId); // cascades payments
        if (error) throw error;
        await audit(req, userId, 'FUNDRAISER_ENTRY_DELETED', fundraiserId, { entry, payments: payments || [] }, 'warning');
        return reply();
      }

      if (action === 'add-payment') {
        if (entry.kind === 'paid') return fail(res, 400, 'Payments are recorded on pledges and fun charges.');
        const amount = cents(body.amountCents);
        const left = Math.max(0, owed - received);
        if (!validCents(amount)) return fail(res, 400, 'Enter the amount received.');
        if (amount > left) return fail(res, 400, `Only $${(left / 100).toFixed(2)} is left on this ${entry.kind === 'pledge' ? 'pledge' : 'charge'}.`);
        const method = String(body.paymentMethod || '').toLowerCase();
        if (!isPaymentMethod(method)) return fail(res, 400, 'Choose how it was paid.');
        const { data: pay, error } = await db
          .from('fundraiser_payments')
          .insert({
            entry_id: entryId,
            payment_date: dateOr(body.paymentDate, today()),
            amount_cents: amount,
            payment_method: method,
            notes: cleanText(body.notes),
            entered_by: userId || null,
          })
          .select('id')
          .single();
        if (error) throw error;
        await recomputeReceived(db, entryId);
        if (pay?.id) await toDcb([pay.id]);
        if (!entry.payment_method) {
          await db.from('fundraiser_entries').update({ payment_method: method }).eq('id', entryId);
        }
        await audit(req, userId, 'FUNDRAISER_PAYMENT_ADDED', fundraiserId, { entryId, amount, method, name: entry.display_name });
        return reply();
      }

      if (action === 'delete-payment') {
        if (!canDelete) return fail(res, 403, 'Only the Super Admin, Pastor or First Lady can remove a payment.', 'forbidden');
        if (entry.kind === 'paid') return fail(res, 400, 'To fix a gift, edit its amount or delete the whole gift.');
        const paymentId = first(body.paymentId);
        if (!UUID_RE.test(paymentId)) return fail(res, 400, 'Payment ID is required.');
        const { data: payment, error: pErr } = await db
          .from('fundraiser_payments')
          .select('*')
          .eq('id', paymentId)
          .eq('entry_id', entryId)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!payment) return fail(res, 404, 'Payment not found.');
        if (payment.external_ref) {
          return fail(res, 400, 'This payment came from PLCC Tithe. Refund it in Tithe and it comes off here automatically.');
        }
        await outOfDcb([payment], entry, 'Payment removed in PLCC Canaan fundraiser');
        const { error } = await db.from('fundraiser_payments').delete().eq('id', paymentId);
        if (error) throw error;
        await recomputeReceived(db, entryId);
        await audit(req, userId, 'FUNDRAISER_PAYMENT_DELETED', fundraiserId, { entryId, payment }, 'warning');
        return reply();
      }
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err: any) {
    return dbFail(res, err);
  }
}
