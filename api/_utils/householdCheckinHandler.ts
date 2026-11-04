/**
 * Vault Household Check-In HTTP handler (Phase 2.7D.7).
 * POST /api/vault?resource=attendance&subResource=household-preview
 * POST /api/vault?resource=attendance&subResource=household-checkin
 */

import { getSupabaseAdmin, requireAuth } from './auth.js';
import {
  hashCardToken,
  humanMessageForHouseholdCode,
  httpStatusForHouseholdCode,
  isHouseholdCheckinRole,
  mapHouseholdRpcError,
  parseHouseholdCheckinBody,
  parseHouseholdPreviewBody,
  sanitizeHouseholdPreview,
  type HouseholdCheckinErrorCode,
} from './householdCheckinLogic.js';

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

function fail(res: any, code: HouseholdCheckinErrorCode, error?: string) {
  setNoStore(res);
  return res.status(httpStatusForHouseholdCode(code)).json({
    ok: false,
    error: error || humanMessageForHouseholdCode(code),
    code,
  });
}

function rpcFail(res: any, error: any) {
  const msg = String(error?.message || error || '');
  const code = mapHouseholdRpcError(msg);
  if (code) return fail(res, code);
  if (/relation .* does not exist|function .* does not exist/i.test(msg)) {
    return fail(res, 'household_unavailable');
  }
  console.error('[household-checkin] rpc error:', msg);
  return fail(res, 'household_error', 'Household check-in request failed.');
}

export async function handleHouseholdCheckin(req: any, res: any) {
  try {
    setNoStore(res);
    const supabase = getSupabaseAdmin();
    if (!supabase) return fail(res, 'household_unavailable', 'Supabase Admin not initialized.');

    const auth = await requireAuth(req, res, supabase);
    if (!auth) return;

    if (!isHouseholdCheckinRole(auth.role)) {
      return fail(res, 'forbidden', 'Household check-in requires an authorized staff role.');
    }

    const sub = String(req.query?.subResource || '');
    const method = String(req.method || '').toUpperCase();
    if (method !== 'POST') return fail(res, 'method_not_allowed');

    if (sub === 'household-preview') {
      const parsed = parseHouseholdPreviewBody(req.body);
      if (!parsed.ok) return fail(res, parsed.code, parsed.error);
      const tokenHash = hashCardToken(parsed.token);
      const { data, error } = await supabase.rpc('attendance_household_preview_by_card_hash', {
        p_qr_token_hash: tokenHash,
        p_session_id: parsed.sessionId,
      });
      if (error) return rpcFail(res, error);
      const dto = sanitizeHouseholdPreview(data);
      if (!dto) return fail(res, 'household_error', 'Preview returned an invalid payload.');
      // Eligible = not already checked in
      const eligible = dto.members.filter((m) => !m.alreadyCheckedIn);
      setNoStore(res);
      return res.status(200).json({
        ok: true,
        ...dto,
        eligibleCount: eligible.length,
      });
    }

    if (sub === 'household-checkin') {
      const parsed = parseHouseholdCheckinBody(req.body);
      if (!parsed.ok) return fail(res, parsed.code, parsed.error);
      const { data, error } = await supabase.rpc('attendance_checkin_household', {
        p_session_id: parsed.sessionId,
        p_anchor_member_id: parsed.anchorMemberId,
        p_member_ids: parsed.memberIds,
        p_actor_user_id: auth.user!.id,
      });
      if (error) return rpcFail(res, error);
      const results = Array.isArray(data?.results) ? data.results : [];
      // Phase 2.7D.8 — reconcile household members to event when session has event_id
      for (const r of results) {
        if (r?.alreadyCheckedIn) continue;
        const mid = r?.memberId;
        if (!mid) continue;
        try {
          await supabase.rpc('attendance_reconcile_event_checkin', {
            p_session_id: parsed.sessionId,
            p_member_id: mid,
            p_attendance_record_id: null,
            p_actor_user_id: auth.user!.id,
            p_source: 'household_bulk',
          });
        } catch {
          /* non-fatal */
        }
      }
      setNoStore(res);
      return res.status(200).json({
        ok: true,
        sessionId: data?.sessionId,
        checkedInCount: Number(data?.checkedInCount) || 0,
        alreadyCheckedInCount: Number(data?.alreadyCheckedInCount) || 0,
        results: results.map((r: any) => ({
          displayName: String(r?.displayName || 'PLCC Member').slice(0, 120),
          alreadyCheckedIn: Boolean(r?.alreadyCheckedIn),
        })),
      });
    }

    return fail(res, 'method_not_allowed', 'Unknown household check-in path.');
  } catch (err: any) {
    console.error('[household-checkin] handler error:', err?.message || err);
    return fail(res, 'household_error');
  }
}
