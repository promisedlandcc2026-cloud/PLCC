/**
 * Check-in points HTTP handler.
 *
 * Leader (attendance check-in roles):
 *   GET   /api/vault?resource=attendance&subResource=self-qr&sessionId=
 *         → current rotating QR token (30s), points switch, live count
 *   PATCH /api/vault?resource=attendance&subResource=self-qr
 *         body { sessionId, pointsEnabled } → turn points on/off for a session
 *
 * Member (any signed-in member):
 *   POST  /api/vault?resource=attendance&subResource=self-check-in
 *         body { code } → check in with the scanned QR, returns points earned
 *   GET   /api/vault?resource=attendance&subResource=my-points
 *         → season + lifetime totals, rank, streak-friendly history
 *   PATCH /api/vault?resource=attendance&subResource=my-points
 *         body { showOnLeaderboard } → leaderboard opt-out
 *   GET   /api/vault?resource=attendance&subResource=points-leaderboard
 *         → top 10 for the current season (first name + last initial only)
 *
 *   POST  /api/vault?resource=attendance&subResource=kids-self-check-in
 *         body { pass, childIds } → parent checks in their own children (kids sessions)
 *
 * Kids sessions use the same rotating QR at the classroom door. Scanning it returns the
 * parent's children (kind: 'kids') instead of checking the parent in. Pickup is still
 * done by a teacher at the Kids Kiosk.
 *
 * Points themselves are awarded by the database trigger on attendance_records,
 * so card scans, manual and household check-ins earn points the same way.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { isAttendanceCheckinRole } from './attendanceCheckinLogic.js';
import {
  canSelfCheckin,
  extractQrToken,
  isMembershipCardCode,
  isUuid,
  kidsCheckinMessage,
  leaderboardName,
  mapSelfCheckinRpcError,
  pointsSeasonKey,
  reasonLabel,
  resolveQrSecret,
  seasonEmoji,
  seasonLabel,
  selfCheckinMessage,
  signKidsPass,
  signQrToken,
  toAwardLines,
  verifyKidsPass,
  verifyQrToken,
} from './checkinPointsLogic.js';

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

function fail(res: any, status: number, code: string, error: string) {
  setNoStore(res);
  return res.status(status).json({ ok: false, code, error });
}

function missingSchema(err: any): boolean {
  return /relation .* does not exist|function .* does not exist|column .* does not exist|Could not find the function/i.test(
    String(err?.message || err || '')
  );
}

const NOT_READY = 'Check-in points aren’t set up yet. Run checkin_points_phase_1.sql in Supabase.';

// Light per-user rate limit for self check-in (best effort per instance).
const selfBuckets = new Map<string, number[]>();
function allowSelfCheckin(userId: string): boolean {
  const now = Date.now();
  const kept = (selfBuckets.get(userId) || []).filter((t) => t > now - 60_000);
  if (kept.length >= 12) return false;
  kept.push(now);
  selfBuckets.set(userId, kept);
  if (selfBuckets.size > 5000) {
    const oldest = selfBuckets.keys().next().value;
    if (oldest) selfBuckets.delete(oldest);
  }
  return true;
}

async function linkedMemberId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_member_links')
    .select('member_id')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  return data[0]?.member_id ? String(data[0].member_id) : null;
}

async function memberSummary(supabase: any, memberId: string, seasonKey: string) {
  const { data, error } = await supabase.rpc('points_member_summary', {
    p_member_id: memberId,
    p_season_key: seasonKey,
  });
  if (error) throw error;
  const s = (data || {}) as Record<string, any>;
  return {
    seasonPoints: Number(s.seasonPoints || 0),
    lifetimePoints: Number(s.lifetimePoints || 0),
    checkins: Number(s.checkins || 0),
    showOnLeaderboard: s.showOnLeaderboard !== false,
    rank: s.rank == null ? null : Number(s.rank),
  };
}

function seasonMeta(seasonKey: string) {
  return { key: seasonKey, label: seasonLabel(seasonKey), emoji: seasonEmoji(seasonKey) };
}

export async function handleCheckinPoints(req: any, res: any) {
  setNoStore(res);
  const supabase = getSupabaseAdmin();
  if (!supabase) return fail(res, 503, 'unavailable', 'Supabase Admin not initialized.');

  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;

  const sub = String(req.query?.subResource || '');
  const method = String(req.method || '').toUpperCase();

  try {
    if (sub === 'self-qr') {
      if (!isAttendanceCheckinRole(auth.role)) {
        return fail(res, 403, 'forbidden', 'Only check-in leaders can show the check-in code.');
      }
      if (method === 'GET') return await leaderQr(req, res, supabase);
      if (method === 'PATCH') return await leaderTogglePoints(req, res, supabase, auth.user.id);
      return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
    }

    if (!canSelfCheckin(auth.role)) {
      return fail(res, 403, 'forbidden', 'Your account can’t use check-in points yet.');
    }

    if (sub === 'self-check-in') {
      if (method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
      return await selfCheckin(req, res, supabase, auth.user.id);
    }
    if (sub === 'kids-self-check-in') {
      if (method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
      return await kidsSelfCheckin(req, res, supabase, auth.user.id);
    }
    if (sub === 'my-points') {
      if (method === 'GET') return await myPoints(res, supabase, auth.user.id);
      if (method === 'PATCH') return await updateMyPrefs(req, res, supabase, auth.user.id);
      return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
    }
    if (sub === 'points-leaderboard') {
      if (method !== 'GET') return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
      return await leaderboard(res, supabase, auth.user.id);
    }
    return fail(res, 404, 'not_found', 'Unknown points request.');
  } catch (err: any) {
    if (missingSchema(err)) return fail(res, 503, 'points_unavailable', NOT_READY);
    console.error('[checkin-points]', sub, err?.message || err);
    return fail(res, 500, 'points_error', 'Points request failed.');
  }
}

// ---------------------------------------------------------------------------
// Leader
// ---------------------------------------------------------------------------

async function leaderQr(req: any, res: any, supabase: any) {
  const sessionId = String(req.query?.sessionId || '').trim().toLowerCase();
  if (!isUuid(sessionId)) return fail(res, 400, 'invalid_request', 'Missing session.');

  const { data: session, error } = await supabase
    .from('attendance_sessions')
    .select('id, title, status, type, starts_at, points_enabled')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!session) return fail(res, 404, 'session_not_found', 'Session not found.');

  // Kids sessions count children still in the room; others count attendance.
  const isKids = session.type === 'kids';
  const table = isKids ? 'child_custody_records' : 'attendance_records';
  let countQuery = supabase.from(table).select('id', { count: 'exact', head: true }).eq('session_id', sessionId);
  if (isKids) countQuery = countQuery.is('checked_out_at', null);
  const { count } = await countQuery;

  // Latest few check-ins for the big screen (first name + initial only)
  const { data: recent } = await supabase
    .from(table)
    .select(
      isKids
        ? 'checked_in_at, member:members!child_custody_records_child_member_id_fkey(first_name, last_name, preferred_name)'
        : 'checked_in_at, member:members(first_name, last_name, preferred_name)'
    )
    .eq('session_id', sessionId)
    .order('checked_in_at', { ascending: false })
    .limit(5);

  const base = {
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      type: session.type,
      pointsEnabled: session.points_enabled === true,
    },
    checkedInCount: count || 0,
    recent: (recent || []).map((r: any) => leaderboardName(r.member || {})),
  };

  if (session.status !== 'open') {
    return res.status(200).json({ ok: true, ...base, token: null, expiresAt: null });
  }

  const secret = resolveQrSecret();
  if (!secret) return fail(res, 503, 'unavailable', 'Check-in signing key is not configured.');
  const now = Date.now();
  const signed = signQrToken(secret, sessionId, now);
  return res.status(200).json({
    ok: true,
    ...base,
    token: signed.token,
    expiresAt: new Date(signed.expiresAtMs).toISOString(),
    serverNow: new Date(now).toISOString(),
  });
}

async function leaderTogglePoints(req: any, res: any, supabase: any, actorId: string) {
  const sessionId = String(req.body?.sessionId || '').trim().toLowerCase();
  const pointsEnabled = req.body?.pointsEnabled;
  if (!isUuid(sessionId) || typeof pointsEnabled !== 'boolean') {
    return fail(res, 400, 'invalid_request', 'Send sessionId and pointsEnabled.');
  }
  const { data, error } = await supabase
    .from('attendance_sessions')
    .update({ points_enabled: pointsEnabled })
    .eq('id', sessionId)
    .select('id, points_enabled')
    .maybeSingle();
  if (error) throw error;
  if (!data) return fail(res, 404, 'session_not_found', 'Session not found.');

  try {
    const { getAudit } = await import('./deps.js');
    const logAudit = await getAudit();
    await logAudit({
      userId: actorId,
      action: 'attendance_session.points',
      details: { sessionId, pointsEnabled },
      resourceType: 'attendance_session',
      resourceId: sessionId,
      severity: 'info',
      req,
    });
  } catch (err: any) {
    console.warn('[checkin-points] audit failed (non-fatal):', err?.message || err);
  }

  // Turned on late? Award everyone already checked in (never doubles).
  let backfilled = 0;
  if (data.points_enabled === true) {
    const { data: n, error: backfillError } = await supabase.rpc('award_points_for_session', {
      p_session_id: sessionId,
    });
    if (backfillError) {
      console.warn('[checkin-points] backfill skipped:', backfillError.message);
    } else {
      backfilled = Number(n || 0);
    }
  }

  return res.status(200).json({ ok: true, pointsEnabled: data.points_enabled === true, backfilled });
}

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

async function selfCheckin(req: any, res: any, supabase: any, userId: string) {
  if (!allowSelfCheckin(userId)) {
    return fail(res, 429, 'rate_limited', selfCheckinMessage('rate_limited'));
  }
  if (isMembershipCardCode(req.body?.code)) {
    return fail(res, 400, 'membership_card', selfCheckinMessage('membership_card'));
  }
  const token = extractQrToken(req.body?.code);
  if (!token) return fail(res, 400, 'invalid_code', selfCheckinMessage('invalid_code'));

  const secret = resolveQrSecret();
  if (!secret) return fail(res, 503, 'unavailable', 'Check-in signing key is not configured.');

  const verified = verifyQrToken(secret, token, Date.now());
  if (verified.ok !== true) {
    const code = (verified as { code: 'invalid_code' | 'code_expired' }).code;
    return fail(res, code === 'code_expired' ? 410 : 400, code, selfCheckinMessage(code));
  }
  const sessionId = (verified as { sessionId: string }).sessionId;

  const { data: scanned } = await supabase
    .from('attendance_sessions')
    .select('id, title, type, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (scanned?.type === 'kids') return await kidsChooser(res, supabase, scanned, userId, secret);

  const { data, error } = await supabase.rpc('attendance_self_checkin', {
    p_session_id: sessionId,
    p_user_id: userId,
  });
  if (error) {
    if (missingSchema(error)) return fail(res, 503, 'points_unavailable', NOT_READY);
    const code = mapSelfCheckinRpcError(error.message);
    const status = code === 'session_not_found' || code === 'member_not_found' ? 404 : code === 'checkin_error' ? 500 : 409;
    if (code === 'checkin_error') console.error('[self-check-in] rpc:', error.message);
    return fail(res, status, code, selfCheckinMessage(code));
  }

  const result = (data || {}) as Record<string, any>;
  const attendanceId = String(result.attendanceId || '');
  const memberId = String(result.memberId || '');
  const alreadyCheckedIn = result.alreadyCheckedIn === true;

  // Keep event RSVPs in sync like the card scanner does (non-fatal).
  if (!alreadyCheckedIn && attendanceId && memberId) {
    try {
      await supabase.rpc('attendance_reconcile_event_checkin', {
        p_session_id: sessionId,
        p_member_id: memberId,
        p_attendance_record_id: attendanceId,
        p_actor_user_id: userId,
        p_source: 'digital_card',
      });
    } catch (err: any) {
      console.warn('[self-check-in] event reconcile skipped:', err?.message || err);
    }
  }

  const [{ data: session }, { data: awards }] = await Promise.all([
    supabase.from('attendance_sessions').select('title, points_enabled').eq('id', sessionId).maybeSingle(),
    attendanceId
      ? supabase
          .from('member_point_ledger')
          .select('reason, points, note')
          .eq('attendance_record_id', attendanceId)
      : Promise.resolve({ data: [] }),
  ]);

  const lines = toAwardLines(awards || []);
  const seasonKey = pointsSeasonKey(new Date());
  const summary = memberId ? await memberSummary(supabase, memberId, seasonKey) : null;

  return res.status(200).json({
    ok: true,
    alreadyCheckedIn,
    sessionTitle: session?.title || 'Check-in',
    pointsEnabled: session?.points_enabled === true,
    awards: lines,
    pointsEarned: lines.reduce((sum, l) => sum + l.points, 0),
    season: seasonMeta(seasonKey),
    summary,
  });
}

// ---------------------------------------------------------------------------
// Kids — parent checks in their own children from the classroom door QR
// ---------------------------------------------------------------------------

async function loadParentChildren(supabase: any, sessionId: string, userId: string) {
  const { data, error } = await supabase.rpc('kids_parent_children', {
    p_session_id: sessionId,
    p_user_id: userId,
  });
  if (error) throw error;
  return (data || []).map((c: any) => ({
    id: String(c.child_member_id),
    name: `${String(c.preferred_name || c.first_name || '').trim()} ${String(c.last_name || '').trim()}`.trim() || 'Child',
    checkedIn: c.checked_in === true,
  }));
}

async function kidsChooser(res: any, supabase: any, session: any, userId: string, secret: string) {
  if (session.status !== 'open') {
    return fail(res, 409, 'session_not_open', kidsCheckinMessage('session_not_open'));
  }
  const children = await loadParentChildren(supabase, session.id, userId);
  return res.status(200).json({
    ok: true,
    kind: 'kids',
    sessionTitle: session.title || 'Kids check-in',
    pass: signKidsPass(secret, session.id, userId, Date.now()),
    children,
  });
}

async function kidsSelfCheckin(req: any, res: any, supabase: any, userId: string) {
  if (!allowSelfCheckin(userId)) {
    return fail(res, 429, 'rate_limited', selfCheckinMessage('rate_limited'));
  }
  const secret = resolveQrSecret();
  if (!secret) return fail(res, 503, 'unavailable', 'Check-in signing key is not configured.');
  const verified = verifyKidsPass(secret, req.body?.pass, userId, Date.now());
  if (verified.ok !== true) {
    const code = (verified as { code: 'invalid_code' | 'code_expired' }).code;
    return fail(res, code === 'code_expired' ? 410 : 400, code, kidsCheckinMessage(code));
  }
  const sessionId = (verified as { sessionId: string }).sessionId;

  const raw: unknown[] = Array.isArray(req.body?.childIds) ? req.body.childIds : [];
  const childIds: string[] = Array.from(
    new Set(raw.map((v) => String(v || '').trim().toLowerCase()).filter((v) => isUuid(v)))
  ).slice(0, 12);
  if (childIds.length === 0) return fail(res, 400, 'no_children', kidsCheckinMessage('no_children'));

  const results: { id: string; ok: boolean; alreadyCheckedIn?: boolean; error?: string }[] = [];
  for (const childId of childIds) {
    const { data, error } = await supabase.rpc('kids_parent_self_checkin', {
      p_session_id: sessionId,
      p_child_member_id: childId,
      p_user_id: userId,
    });
    if (error) {
      if (missingSchema(error)) return fail(res, 503, 'unavailable', 'Kids check-in by phone isn’t set up yet.');
      const code = String(error.message || '').match(/[a-z_]+/)?.[0] || 'checkin_error';
      if (code === 'checkin_error') console.error('[kids-self-check-in] rpc:', error.message);
      results.push({ id: childId, ok: false, error: kidsCheckinMessage(code) });
      continue;
    }
    results.push({ id: childId, ok: true, alreadyCheckedIn: data?.alreadyCheckedIn === true });
  }

  try {
    const { getAudit } = await import('./deps.js');
    const logAudit = await getAudit();
    await logAudit({
      userId,
      action: 'kids_custody.parent_phone_checkin',
      details: { sessionId, childIds: results.filter((r) => r.ok).map((r) => r.id) },
      resourceType: 'attendance_session',
      resourceId: sessionId,
      severity: 'info',
      req,
    });
  } catch (err: any) {
    console.warn('[kids-self-check-in] audit failed (non-fatal):', err?.message || err);
  }

  const [{ data: session }, children] = await Promise.all([
    supabase.from('attendance_sessions').select('title').eq('id', sessionId).maybeSingle(),
    loadParentChildren(supabase, sessionId, userId),
  ]);
  return res.status(200).json({
    ok: results.some((r) => r.ok),
    sessionTitle: session?.title || 'Kids check-in',
    results,
    children,
  });
}

async function myPoints(res: any, supabase: any, userId: string) {
  const seasonKey = pointsSeasonKey(new Date());
  const memberId = await linkedMemberId(supabase, userId);
  if (!memberId) {
    return res.status(200).json({ ok: true, linked: false, season: seasonMeta(seasonKey), summary: null, history: [] });
  }

  const [summary, { data: history, error }] = await Promise.all([
    memberSummary(supabase, memberId, seasonKey),
    supabase
      .from('member_point_ledger')
      .select('reason, points, note, created_at, session:attendance_sessions(title)')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);
  if (error) throw error;

  return res.status(200).json({
    ok: true,
    linked: true,
    season: seasonMeta(seasonKey),
    summary,
    history: (history || []).map((h: any) => ({
      label: reasonLabel(String(h.reason || '')),
      reason: h.reason,
      points: Number(h.points || 0),
      note: h.note || null,
      sessionTitle: h.session?.title || null,
      at: h.created_at,
    })),
  });
}

async function updateMyPrefs(req: any, res: any, supabase: any, userId: string) {
  const show = req.body?.showOnLeaderboard;
  if (typeof show !== 'boolean') return fail(res, 400, 'invalid_request', 'Send showOnLeaderboard.');
  const memberId = await linkedMemberId(supabase, userId);
  if (!memberId) return fail(res, 404, 'member_link_required', selfCheckinMessage('member_link_required'));
  const { error } = await supabase
    .from('member_points_settings')
    .upsert({ member_id: memberId, show_on_leaderboard: show, updated_at: new Date().toISOString() }, { onConflict: 'member_id' });
  if (error) throw error;
  return res.status(200).json({ ok: true, showOnLeaderboard: show });
}

async function leaderboard(res: any, supabase: any, userId: string) {
  const seasonKey = pointsSeasonKey(new Date());
  const { data: rows, error } = await supabase.rpc('points_leaderboard', { p_season_key: seasonKey, p_limit: 10 });
  if (error) throw error;

  const ids = (rows || []).map((r: any) => String(r.member_id));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: members, error: mErr } = await supabase
      .from('members')
      .select('id, first_name, last_name, preferred_name')
      .in('id', ids);
    if (mErr) throw mErr;
    for (const m of members || []) names.set(String(m.id), leaderboardName(m));
  }

  const ownMember = await linkedMemberId(supabase, userId);
  const me = ownMember ? await memberSummary(supabase, ownMember, seasonKey) : null;

  res.setHeader?.('Cache-Control', 'private, max-age=30');
  return res.status(200).json({
    ok: true,
    season: seasonMeta(seasonKey),
    leaders: (rows || []).map((r: any) => ({
      rank: Number(r.rank),
      name: names.get(String(r.member_id)) || 'Member',
      points: Number(r.points),
      isMe: ownMember != null && String(r.member_id) === ownMember,
    })),
    me: me ? { points: me.seasonPoints, rank: me.rank, showOnLeaderboard: me.showOnLeaderboard } : null,
  });
}
