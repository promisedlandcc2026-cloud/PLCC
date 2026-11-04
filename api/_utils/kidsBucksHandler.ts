/**
 * PLCC Bucks — Phase 1 API.  resource=kids-bucks&action=…
 *
 * Every write goes through the awc_bucks_* database functions, which check the
 * caller's role / kids.bucks.award permission again inside Postgres. The client
 * never sends an amount, a balance or a leader name — the database derives them.
 * Parents read wallets through the dependents API (action=kids-view), which
 * already restricts them to their own household's children.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { CARD_TOKEN_RE, hashCardToken } from './cardResolverLogic.js';
import { notifyParentsOfBucksAward } from './kidsBucksNotify.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_RE = /^[a-z0-9_]{2,40}$/;
const KEY_RE = /^[A-Za-z0-9._:-]{8,100}$/;

const NOT_READY = 'PLCC Bucks is not set up yet. Run supabase/migrations/awc_bucks_phase_1.sql in Supabase.';

const DB_ERRORS: Record<string, { status: number; error: string }> = {
  not_authorized: { status: 403, error: 'You are not allowed to do that.' },
  not_a_child: { status: 400, error: 'That person is not a child in a household.' },
  unknown_reason: { status: 400, error: 'Pick one of the reasons.' },
  note_required: { status: 400, error: 'Please write a short note.' },
  unknown_prize: { status: 400, error: 'That prize is not available.' },
  request_not_found: { status: 404, error: 'That request was not found.' },
  recommendation_not_found: { status: 404, error: 'That recommendation was not found.' },
  invalid_cost: { status: 400, error: 'Enter the church cost in cents.' },
  grant_not_allowed: { status: 400, error: 'That permission cannot be given to this role. Volunteers cannot give Bucks.' },
  challenge_not_found: { status: 404, error: 'That challenge was not found.' },
  entry_not_found: { status: 404, error: 'That award was not found.' },
  not_reversible: { status: 400, error: 'Only awards can be corrected.' },
  idempotency_key_reused: { status: 409, error: 'Please try again.' },
  missing_input: { status: 400, error: 'Something is missing. Please try again.' },
  user_not_found: { status: 404, error: 'That user was not found.' },
};

function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return String(v ?? '').trim();
}

function prizeFail(data: any): string {
  switch (data?.code) {
    case 'not_enough': return `Not enough PLCC Bucks${data.needed ? ` (${data.needed} more)` : ''}.`;
    case 'out_of_stock': return 'That prize is out of stock.';
    case 'already_requested': return 'This child already has an open request for that prize.';
    case 'cost_not_set': return 'Enter what this prize costs the church before approving it.';
    case 'no_budget': return 'Set this month’s prize budget before approving.';
    case 'over_budget': return 'That would go over this month’s budget. A Super Admin can approve it with a note.';
    case 'already_fulfilled': return 'That prize was already handed over.';
    case 'not_waiting': return 'That request is no longer waiting.';
    case 'not_approved': return 'Approve the request before handing the prize over.';
    case 'already_decided': return 'That recommendation was already decided.';
    case 'below_reserved': return 'Stock cannot drop below prizes already approved.';
    default: return 'That prize request could not be completed.';
  }
}

function fail(res: any, status: number, code: string, error: string) {
  return res.status(status).json({ ok: false, code, error });
}

function isMissingSchema(err: any): boolean {
  return /does not exist|Could not find the function|schema cache/i.test(String(err?.message || err || ''));
}

function dbFail(res: any, err: any) {
  const msg = String(err?.message || '');
  if (isMissingSchema(err)) return fail(res, 503, 'bucks_unavailable', NOT_READY);
  const known = Object.keys(DB_ERRORS).find((k) => msg.includes(k));
  if (known) return fail(res, DB_ERRORS[known].status, known, DB_ERRORS[known].error);
  if (/check constraint|violates/i.test(msg)) return fail(res, 400, 'invalid_value', 'That value is not allowed.');
  console.error('[kids-bucks]', msg);
  return fail(res, 500, 'bucks_error', 'PLCC Bucks request failed.');
}

async function rpcBool(supabase: any, fn: string, userId: string): Promise<boolean | 'missing'> {
  const { data, error } = await supabase.rpc(fn, { p_user: userId });
  if (error) return isMissingSchema(error) ? 'missing' : false;
  return data === true;
}

function easternDayStartIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  const offsetMs = local - now.getTime();                 // Eastern offset right now
  const midnightLocal = Date.UTC(get('year'), get('month') - 1, get('day'));
  return new Date(midnightLocal - offsetMs).toISOString();
}

async function childNames(supabase: any, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data } = await supabase.from('members').select('id, first_name, last_name, preferred_name').in('id', ids);
  for (const m of data || []) {
    out.set(String(m.id), `${m.preferred_name || m.first_name || ''} ${m.last_name || ''}`.trim() || 'Child');
  }
  return out;
}

type Deps = {
  getSupabaseAdmin: () => any;
  requireAuth: (req: any, res: any, supabase: any) => Promise<{ user: { id: string } | null; role: string | null } | null>;
};
const DEFAULT_DEPS: Deps = { getSupabaseAdmin, requireAuth: requireAuth as Deps['requireAuth'] };

export async function handleKidsBucks(req: any, res: any, deps: Deps = DEFAULT_DEPS) {
  res.setHeader?.('Cache-Control', 'no-store');
  const supabase = deps.getSupabaseAdmin();
  if (!supabase) return fail(res, 503, 'unavailable', 'Service unavailable');

  const auth = await deps.requireAuth(req, res, supabase);
  if (!auth?.user) return;
  const userId = auth.user.id;
  const role = String(auth.role || '').toUpperCase();
  const action = first(req.query?.action || req.body?.action).toLowerCase();
  const method = String(req.method || 'GET').toUpperCase();

  // The shared kids-desk tablet login never awards: an award must name a person.
  if (role === 'KIOSK' || role === 'PENDING') {
    return fail(res, 403, 'not_authorized', 'Sign in with your own account to give PLCC Bucks.');
  }

  try {
    const canAward = await rpcBool(supabase, 'awc_bucks_can_award', userId);
    if (canAward === 'missing') return fail(res, 503, 'bucks_unavailable', NOT_READY);
    const canReverse = (await rpcBool(supabase, 'awc_bucks_can_reverse', userId)) === true;
    const canApprove = (await rpcBool(supabase, 'awc_bucks_can_approve', userId)) === true;
    const canFulfill = (await rpcBool(supabase, 'awc_bucks_can_fulfill', userId)) === true;
    const canRecommend = (await rpcBool(supabase, 'awc_bucks_can_recommend', userId)) === true;
    const isSuperAdmin = role === 'SUPER_ADMIN';

    // ---- who am I / reasons -------------------------------------------------
    if (method === 'GET' && (action === 'me' || action === 'reasons')) {
      const { data: reasons, error } = await supabase
        .from('awc_bucks_reasons')
        .select('id, label, amount, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (error) return dbFail(res, error);
      const { data: settings } = await supabase
        .from('awc_bucks_settings')
        .select('weekly_cap_per_child, daily_cap_per_issuer_per_child')
        .maybeSingle();
      return res.status(200).json({
        ok: true,
        canAward: canAward === true,
        canReverse,
        canApprove,
        canFulfill,
        canRecommend,
        isSuperAdmin,
        reasons: canAward === true || canRecommend ? reasons || [] : [],
        caps: settings
          ? { weekly: settings.weekly_cap_per_child, daily: settings.daily_cap_per_issuer_per_child }
          : null,
      });
    }

    // ---- children to pick from (leaders) -----------------------------------
    if (method === 'GET' && action === 'children') {
      if (canAward !== true && !canApprove && !canRecommend) {
        return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      }
      const { data: edges, error } = await supabase
        .from('household_members')
        .select('member_id')
        .eq('status', 'active')
        .in('relationship_type', ['child', 'dependent'])
        .limit(1000);
      if (error) return dbFail(res, error);
      const ids: string[] = Array.from(new Set<string>((edges || []).map((e: any) => String(e.member_id)).filter(Boolean)));
      const names = await childNames(supabase, ids);
      const balances = new Map<string, number>();
      if (ids.length) {
        const { data: rows } = await supabase.from('awc_bucks_ledger').select('child_member_id, amount').in('child_member_id', ids);
        for (const r of rows || []) {
          const k = String(r.child_member_id);
          balances.set(k, (balances.get(k) || 0) + Number(r.amount || 0));
        }
        const { data: holds, error: holdErr } = await supabase
          .from('awc_bucks_redemptions')
          .select('child_member_id, price_bucks')
          .in('child_member_id', ids)
          .in('status', ['requested', 'approved']);
        if (!holdErr) {
          for (const h of holds || []) {
            const k = String(h.child_member_id);
            balances.set(k, (balances.get(k) || 0) - Number(h.price_bucks || 0));
          }
        }
      }
      const children = ids
        .map((id) => ({ id, name: names.get(id) || 'Child', balance: balances.get(id) || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.status(200).json({ ok: true, children });
    }

    // ---- award ---------------------------------------------------------------
    if (method === 'POST' && action === 'award') {
      if (canAward !== true) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const body = req.body || {};
      const reasonId = first(body.reasonId);
      const key = first(body.idempotencyKey);
      const note = body.note == null ? null : String(body.note).slice(0, 200);
      if (!REASON_RE.test(reasonId)) return fail(res, 400, 'unknown_reason', DB_ERRORS.unknown_reason.error);
      if (!KEY_RE.test(key)) return fail(res, 400, 'missing_input', DB_ERRORS.missing_input.error);

      let childId = first(body.childId);
      const cardToken = typeof body.cardToken === 'string' ? body.cardToken.replace(/^﻿/, '').replace(/[\r\n]+/g, '') : '';
      if (cardToken) {
        if (!CARD_TOKEN_RE.test(cardToken)) {
          return fail(res, 400, 'invalid_card', 'That code is not an PLCC child card.');
        }
        const { data: card, error } = await supabase
          .from('dependent_digital_cards')
          .select('member_id, status')
          .eq('qr_token_hash', hashCardToken(cardToken))
          .maybeSingle();
        if (error) return dbFail(res, error);
        if (!card?.member_id) return fail(res, 404, 'card_not_found', 'No child card matches that code.');
        if (card.status !== 'active') return fail(res, 400, 'card_inactive', 'That child card is not active.');
        childId = String(card.member_id);
      }
      if (!UUID_RE.test(childId)) return fail(res, 400, 'missing_input', 'Scan a child card or pick a child.');

      const { data, error } = await supabase.rpc('awc_bucks_award', {
        p_child_member_id: childId,
        p_reason_id: reasonId,
        p_issued_by: userId,
        p_idempotency_key: key,
        p_note: note,
      });
      if (error) return dbFail(res, error);
      const names = await childNames(supabase, [childId]);
      const result = data || {};
      if (result.ok === false) {
        const left = Number(result.remaining || 0);
        const msg =
          result.code === 'weekly_cap'
            ? `This child has reached this week's PLCC Bucks limit${left ? ` (${left} left)` : ''}.`
            : `You've reached today's limit for this child${left ? ` (${left} left)` : ''}.`;
        return res.status(409).json({ ok: false, code: result.code, remaining: left, error: msg, childName: names.get(childId) });
      }
      if (result.duplicate !== true) {
        await notifyParentsOfBucksAward(supabase, {
          childId,
          amount: Number(result.amount),
          reasonLabel: String(result.reasonLabel || ''),
          entryId: String(result.entryId || ''),
          actorUserId: userId,
        });
      }
      return res.status(200).json({ ok: true, ...result, childId, childName: names.get(childId) || 'Child' });
    }

    // ---- wallet (leaders; parents use action=kids-view) ---------------------
    if (method === 'GET' && action === 'wallet') {
      if (canAward !== true) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const childId = first(req.query?.childId);
      if (!UUID_RE.test(childId)) return fail(res, 400, 'missing_input', 'Valid childId required.');
      const { data, error } = await supabase.rpc('awc_bucks_wallet', { p_child_member_id: childId, p_limit: 20 });
      if (error) return dbFail(res, error);
      return res.status(200).json({ ok: true, wallet: data });
    }

    // ---- today's awards (for corrections) -----------------------------------
    if (method === 'GET' && action === 'recent') {
      if (!canReverse) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const { data: rows, error } = await supabase
        .from('awc_bucks_ledger')
        .select('id, child_member_id, kind, amount, reason_label, issued_by_name, note, reverses_id, created_at')
        .gte('created_at', easternDayStartIso())
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) return dbFail(res, error);
      const reversed = new Set<string>((rows || []).filter((r: any) => r.reverses_id).map((r: any) => String(r.reverses_id)));
      const names = await childNames(supabase, Array.from(new Set<string>((rows || []).map((r: any) => String(r.child_member_id)))));
      return res.status(200).json({
        ok: true,
        entries: (rows || []).map((r: any) => ({
          id: r.id,
          kind: r.kind,
          amount: r.amount,
          reasonLabel: r.reason_label,
          awardedBy: r.issued_by_name,
          note: r.note,
          childName: names.get(String(r.child_member_id)) || 'Child',
          createdAt: r.created_at,
          reversed: reversed.has(String(r.id)),
        })),
      });
    }

    // ---- reverse ---------------------------------------------------------------
    if (method === 'POST' && action === 'reverse') {
      if (!canReverse) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const entryId = first(req.body?.entryId);
      const note = String(req.body?.note || '').slice(0, 200);
      if (!UUID_RE.test(entryId)) return fail(res, 400, 'missing_input', 'Valid entryId required.');
      const { data, error } = await supabase.rpc('awc_bucks_reverse', {
        p_entry_id: entryId,
        p_issued_by: userId,
        p_note: note,
      });
      if (error) return dbFail(res, error);
      if (data?.ok === false) return fail(res, 409, String(data.code || 'already_reversed'), 'That award was already corrected.');
      return res.status(200).json({ ok: true, ...data });
    }

    // ---- Super Admin --------------------------------------------------------
    if (action === 'admin' && method === 'GET') {
      if (!isSuperAdmin) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const [{ data: reasons, error: rErr }, { data: settings }, leadersRes, { data: staff }] = await Promise.all([
        supabase.from('awc_bucks_reasons').select('id, label, amount, active, sort_order').order('sort_order'),
        supabase.from('awc_bucks_settings').select('weekly_cap_per_child, daily_cap_per_issuer_per_child').maybeSingle(),
        supabase.from('awc_bucks_leaders').select('user_id, display_name, can_award, can_approve, can_fulfill, can_recommend, active'),
        supabase
          .from('users')
          .select('id, name, role')
          .in('role', ['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'ADMIN_STAFF', 'FIRST_LADY', 'MINISTRY_LEADER',
            'SUNDAY_SCHOOL_TEACHER', 'TEACHER', 'SECRETARY', 'ASST_SECRETARY', 'VOLUNTEER'])
          .order('name'),
      ]);
      let leaders = leadersRes.data;
      if (leadersRes.error) {
        if (!/column/i.test(String(leadersRes.error.message || ''))) return dbFail(res, leadersRes.error);
        const fallback = await supabase.from('awc_bucks_leaders').select('user_id, display_name, can_award, active');
        if (fallback.error) return dbFail(res, fallback.error);
        leaders = fallback.data;
      }
      if (rErr) return dbFail(res, rErr);
      const byUser = new Map<string, any>((leaders || []).map((l: any) => [String(l.user_id), l] as [string, any]));
      return res.status(200).json({
        ok: true,
        reasons: reasons || [],
        caps: settings ? { weekly: settings.weekly_cap_per_child, daily: settings.daily_cap_per_issuer_per_child } : null,
        leaders: (staff || []).map((u: any) => {
          const l: any = byUser.get(String(u.id));
          return {
            userId: u.id,
            name: u.name || 'Unnamed',
            role: String(u.role || '').toUpperCase(),
            displayName: l?.display_name || null,
            canAward: Boolean(l?.can_award),
            canApprove: Boolean(l?.can_approve),
            canFulfill: Boolean(l?.can_fulfill),
            canRecommend: Boolean(l?.can_recommend),
            active: l ? Boolean(l.active) : true,
          };
        }),
      });
    }

    if (method === 'PATCH' && (action === 'caps' || action === 'reason' || action === 'leader')) {
      if (!isSuperAdmin) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const b = req.body || {};
      let rpc: { fn: string; args: Record<string, unknown> };
      if (action === 'caps') {
        rpc = { fn: 'awc_bucks_set_caps', args: { p_by: userId, p_weekly: Number(b.weekly), p_daily: Number(b.daily) } };
      } else if (action === 'reason') {
        if (!REASON_RE.test(first(b.id))) return fail(res, 400, 'invalid_value', 'Reason id: 2–40 lowercase letters, digits or _.');
        rpc = {
          fn: 'awc_bucks_upsert_reason',
          args: { p_by: userId, p_id: first(b.id), p_label: String(b.label || '').trim(), p_amount: Number(b.amount),
            p_active: b.active !== false, p_sort: Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 100 },
        };
      } else {
        if (!UUID_RE.test(first(b.userId))) return fail(res, 400, 'missing_input', 'Valid userId required.');
        rpc = b.canApprove !== undefined || b.canFulfill !== undefined || b.canRecommend !== undefined
          ? {
              fn: 'awc_bucks_set_permissions',
              args: {
                p_by: userId, p_user: first(b.userId), p_display_name: b.displayName ?? null,
                p_can_award: b.canAward === true, p_can_approve: b.canApprove === true,
                p_can_fulfill: b.canFulfill === true, p_can_recommend: b.canRecommend === true,
                p_active: b.active !== false,
              },
            }
          : {
              fn: 'awc_bucks_set_leader',
              args: { p_by: userId, p_user: first(b.userId), p_display_name: b.displayName ?? null,
                p_can_award: b.canAward === true, p_active: b.active !== false },
            };
      }
      const { data, error } = await supabase.rpc(rpc.fn, rpc.args);
      if (error) return dbFail(res, error);
      return res.status(200).json({ ok: true, ...(data || {}) });
    }

    if (method === 'GET' && action === 'prizes') {
      if (!canApprove && !canFulfill && !isSuperAdmin && canAward !== true) {
        return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      }
      const { data, error } = await supabase.rpc('awc_bucks_prize_list', { p_include_inactive: isSuperAdmin });
      if (error) return dbFail(res, error);
      const prizes = Array.isArray(data) ? data : [];
      return res.status(200).json({
        ok: true,
        prizes: isSuperAdmin || canApprove ? prizes : prizes.map(({ unitCostCents: _c, ...rest }: any) => rest),
      });
    }

    if (method === 'GET' && action === 'requests') {
      if (!canApprove && !canFulfill) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const { data, error } = await supabase
        .from('awc_bucks_redemptions')
        .select('id, child_member_id, prize_name, price_bucks, status, requested_at, committed_cost_cents')
        .in('status', ['requested', 'approved'])
        .order('requested_at', { ascending: true })
        .limit(100);
      if (error) return dbFail(res, error);
      const names = await childNames(supabase, Array.from(new Set((data || []).map((r: any) => String(r.child_member_id)))));
      return res.status(200).json({
        ok: true,
        requests: (data || []).map((r: any) => ({
          id: r.id,
          childName: names.get(String(r.child_member_id)) || 'Child',
          prizeName: r.prize_name,
          price: r.price_bucks,
          status: r.status,
          requestedAt: r.requested_at,
          costCents: r.committed_cost_cents,
        })),
      });
    }

    if (method === 'POST' && action === 'request') {
      if (!canApprove) return fail(res, 403, 'not_authorized', 'Only an approver can request a prize from this desk.');
      const childId = first(req.body?.childId);
      const prizeId = first(req.body?.prizeId);
      const idem = first(req.body?.idempotencyKey);
      if (!UUID_RE.test(childId) || !REASON_RE.test(prizeId) || !KEY_RE.test(idem)) {
        return fail(res, 400, 'missing_input', DB_ERRORS.missing_input.error);
      }
      const { data, error } = await supabase.rpc('awc_bucks_request_prize', {
        p_child: childId, p_prize: prizeId, p_requested_by: userId, p_idempotency_key: idem,
      });
      if (error) return dbFail(res, error);
      if (data?.ok === false) return fail(res, 409, String(data.code || 'request_failed'), prizeFail(data));
      return res.status(200).json({ ok: true, ...data });
    }

    if (method === 'POST' && action === 'approve') {
      if (!canApprove) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const requestId = first(req.body?.requestId);
      if (!UUID_RE.test(requestId)) return fail(res, 400, 'missing_input', 'Valid requestId required.');
      const { data, error } = await supabase.rpc('awc_bucks_approve_request', {
        p_request: requestId, p_by: userId, p_override: req.body?.override === true, p_note: req.body?.note ?? null,
      });
      if (error) return dbFail(res, error);
      if (data?.ok === false) return fail(res, 409, String(data.code || 'approve_failed'), prizeFail(data));
      return res.status(200).json({ ok: true, ...data });
    }

    if (method === 'POST' && action === 'fulfill') {
      if (!canFulfill) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const requestId = first(req.body?.requestId);
      if (!UUID_RE.test(requestId)) return fail(res, 400, 'missing_input', 'Valid requestId required.');
      const { data, error } = await supabase.rpc('awc_bucks_fulfill_request', {
        p_request: requestId, p_by: userId, p_actual_cost_cents: req.body?.actualCostCents ?? null, p_note: req.body?.note ?? null,
      });
      if (error) return dbFail(res, error);
      if (data?.ok === false) return fail(res, 409, String(data.code || 'fulfill_failed'), prizeFail(data));
      return res.status(200).json({ ok: true, ...data });
    }

    if (method === 'POST' && action === 'close') {
      const requestId = first(req.body?.requestId);
      const which = first(req.body?.which);
      if (!UUID_RE.test(requestId) || (which !== 'reject' && which !== 'cancel')) {
        return fail(res, 400, 'missing_input', DB_ERRORS.missing_input.error);
      }
      const { data, error } = await supabase.rpc('awc_bucks_close_request', {
        p_request: requestId, p_by: userId, p_action: which, p_note: req.body?.note ?? null,
      });
      if (error) return dbFail(res, error);
      if (data?.ok === false) return fail(res, 409, String(data.code || 'close_failed'), prizeFail(data));
      return res.status(200).json({ ok: true, ...data });
    }

    if (method === 'GET' && action === 'recommendations') {
      if (canAward !== true && !canRecommend) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const { data, error } = await supabase
        .from('awc_bucks_recommendations')
        .select('id, child_member_id, reason_id, note, recommended_by_name, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) return dbFail(res, error);
      const names = await childNames(supabase, Array.from(new Set((data || []).map((r: any) => String(r.child_member_id)))));
      return res.status(200).json({
        ok: true,
        recommendations: (data || []).map((r: any) => ({
          id: r.id,
          childName: names.get(String(r.child_member_id)) || 'Child',
          reasonId: r.reason_id,
          note: r.note,
          recommendedBy: r.recommended_by_name,
          status: r.status,
          createdAt: r.created_at,
        })),
      });
    }

    if (method === 'POST' && action === 'recommend') {
      if (!canRecommend) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const childId = first(req.body?.childId);
      const reasonId = first(req.body?.reasonId);
      const idem = first(req.body?.idempotencyKey);
      if (!UUID_RE.test(childId) || !REASON_RE.test(reasonId) || !KEY_RE.test(idem)) {
        return fail(res, 400, 'missing_input', DB_ERRORS.missing_input.error);
      }
      const { data, error } = await supabase.rpc('awc_bucks_recommend', {
        p_child: childId, p_reason: reasonId, p_by: userId, p_idempotency_key: idem, p_note: req.body?.note ?? null,
      });
      if (error) return dbFail(res, error);
      return res.status(200).json({ ok: true, ...(data || {}) });
    }

    if (method === 'POST' && action === 'decide-recommendation') {
      if (canAward !== true) return fail(res, 403, 'not_authorized', DB_ERRORS.not_authorized.error);
      const id = first(req.body?.recommendationId);
      if (!UUID_RE.test(id)) return fail(res, 400, 'missing_input', 'Valid recommendationId required.');
      const { data, error } = await supabase.rpc('awc_bucks_decide_recommendation', {
        p_recommendation: id, p_by: userId, p_approve: req.body?.approve === true, p_note: req.body?.note ?? null,
      });
      if (error) return dbFail(res, error);
      if (data?.ok === false) return fail(res, 409, String(data.code || 'decide_failed'), prizeFail(data));
      if (req.body?.approve === true && data?.entryId) {
        const { data: entry } = await supabase
          .from('awc_bucks_ledger')
          .select('child_member_id, amount, reason_label')
          .eq('id', data.entryId)
          .maybeSingle();
        if (entry?.child_member_id) {
          await notifyParentsOfBucksAward(supabase, {
            childId: String(entry.child_member_id),
            amount: Number(entry.amount),
            reasonLabel: String(entry.reason_label || data.reasonLabel || ''),
            entryId: String(data.entryId),
            actorUserId: userId,
          });
        }
      }
      return res.status(200).json({ ok: true, ...data });
    }

    if (isSuperAdmin && method === 'PATCH' && action === 'prize') {
      const b = req.body || {};
      if (!REASON_RE.test(first(b.id))) return fail(res, 400, 'invalid_value', 'Prize id: 2–40 lowercase letters, digits or _.');
      const { data, error } = await supabase.rpc('awc_bucks_upsert_prize', {
        p_by: userId, p_id: first(b.id), p_name: String(b.name || '').trim(), p_description: b.description ?? null,
        p_price: Number(b.price), p_unit_cost_cents: b.unitCostCents == null || b.unitCostCents === '' ? null : Number(b.unitCostCents),
        p_image_url: b.imageUrl ?? null, p_active: b.active !== false, p_sort: Number(b.sortOrder || 100),
      });
      if (error) return dbFail(res, error);
      return res.status(200).json({ ok: true, ...(data || {}) });
    }

    if (isSuperAdmin && method === 'POST' && action === 'stock') {
      const { data, error } = await supabase.rpc('awc_bucks_adjust_stock', {
        p_by: userId, p_prize: first(req.body?.prizeId), p_delta: Number(req.body?.delta), p_note: String(req.body?.note || ''),
      });
      if (error) return dbFail(res, error);
      if (data?.ok === false) return fail(res, 409, String(data.code || 'stock_failed'), prizeFail(data));
      return res.status(200).json({ ok: true, ...(data || {}) });
    }

    if (isSuperAdmin && method === 'PATCH' && action === 'budget') {
      const { data, error } = await supabase.rpc('awc_bucks_set_budget', {
        p_by: userId, p_month: first(req.body?.month), p_budget_cents: Number(req.body?.budgetCents),
      });
      if (error) return dbFail(res, error);
      return res.status(200).json({ ok: true, ...(data || {}) });
    }

    return fail(res, 405, 'method_not_allowed', 'Unknown PLCC Bucks request.');
  } catch (err: any) {
    return dbFail(res, err);
  }
}
