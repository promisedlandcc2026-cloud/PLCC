/**
 * Vault Family Huddle API — resource=family, subResource=huddle*
 * Membership resolved server-side from JWT. Guests redeem invite tokens.
 */
import { requireAuth } from './auth.js';
import { getSupabaseAdmin } from './auth.js';
import {
  FAMILY_GUEST_NAME_MAX,
  FAMILY_INVITE_MAX_USES,
  FAMILY_INVITE_TTL_MS,
  buildGuestIdentity,
  addHouseholdAdult,
  buildSanitizedFamilySummary,
  generateInviteToken,
  removeHouseholdMember,
  hashInviteToken,
  resolveAdultHouseholdForUser,
  sanitizeGuestDisplayName,
  vaultFamilyHuddleJoinPath,
} from './familyHuddleAccess.js';
import {
  endFamilyVoiceRoom,
  ensureFamilyVoiceRoom,
  getLiveKitServerConfig,
  listFamilyVoiceStatus,
  mintFamilyVoiceAccessToken,
} from './livekitFamilyVoice.js';

function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] || '').trim();
  return String(v || '').trim();
}

function huddleAction(req: any): string {
  const fromQuery =
    first(req.query?.huddleType) ||
    first(req.query?.action) ||
    first(req.query?.type);
  if (fromQuery) return fromQuery.toLowerCase();
  const sub = first(req.query?.subResource).toLowerCase();
  if (sub.startsWith('huddle-')) return sub.slice('huddle-'.length);
  if (sub === 'huddle') return 'status';
  return sub || 'status';
}

export async function handleFamily(req: any, res: any) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, error: 'Service unavailable' });
  }

  // Parent self-serve children (no Auth/email) — before huddle adult gate
  const subResource = first(req.query?.subResource).toLowerCase();
  if (subResource === 'dependents') {
    const { handleParentDependents } = await import('./parentDependentsHandler.js');
    return handleParentDependents(req, res);
  }

  const action = huddleAction(req);
  const lk = getLiveKitServerConfig();

  // Guest redeem — no Bearer required
  if (action === 'invite-redeem' || action === 'redeem') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!lk) {
      return res.status(503).json({
        ok: false,
        error: 'Family Huddle is not configured yet',
        code: 'huddle_unavailable',
      });
    }
    const rawToken = String(req.body?.token || req.body?.code || '').trim();
    const displayName = sanitizeGuestDisplayName(req.body?.displayName);
    if (!rawToken) {
      return res.status(400).json({ ok: false, error: 'Invite code is required' });
    }
    if (!displayName) {
      return res.status(400).json({
        ok: false,
        error: `Enter a name (up to ${FAMILY_GUEST_NAME_MAX} characters).`,
      });
    }

    const tokenHash = hashInviteToken(rawToken);
    const { data: invite, error: invErr } = await supabaseAdmin
      .from('family_huddle_invites')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (invErr) {
      console.warn('[family-huddle] invite lookup', invErr.message);
      return res.status(503).json({ ok: false, error: 'Could not check that invite.' });
    }
    if (!invite) {
      return res.status(404).json({ ok: false, error: 'That invite link is not valid.' });
    }
    if (invite.locked) {
      return res.status(403).json({
        ok: false,
        error: 'This Family Huddle is locked to new guests.',
        code: 'invite_locked',
      });
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({
        ok: false,
        error: 'This invite link has expired.',
        code: 'invite_expired',
      });
    }
    if (Number(invite.use_count) >= Number(invite.max_uses)) {
      return res.status(403).json({
        ok: false,
        error: 'This invite link has reached its guest limit.',
        code: 'invite_exhausted',
      });
    }

    const { error: bumpErr } = await supabaseAdmin
      .from('family_huddle_invites')
      .update({ use_count: Number(invite.use_count) + 1 })
      .eq('id', invite.id)
      .eq('use_count', invite.use_count);

    if (bumpErr) {
      return res.status(409).json({
        ok: false,
        error: 'Could not join with that invite. Please try again.',
      });
    }

    try {
      await ensureFamilyVoiceRoom(lk, invite.household_id);
      const identity = buildGuestIdentity(String(invite.id));
      const minted = await mintFamilyVoiceAccessToken(lk, {
        identity,
        displayName,
        householdId: invite.household_id,
        canModerate: false,
      });
      return res.status(200).json({
        ok: true,
        token: minted.token,
        url: minted.url,
        roomName: minted.roomName,
        expiresIn: minted.expiresIn,
        canModerate: false,
        isGuest: true,
        displayName,
        householdName: null,
      });
    } catch (e: any) {
      console.warn('[family-huddle] guest mint', e?.message || e);
      return res.status(500).json({ ok: false, error: 'Could not join Family Huddle.' });
    }
  }

  // Remaining actions require auth
  const auth = await requireAuth(req, res, supabaseAdmin);
  if (!auth) return;

  const membership = await resolveAdultHouseholdForUser(supabaseAdmin, auth.user.id);
  if (!membership.ok) {
    return res.status(membership.status).json({
      ok: false,
      code: membership.code,
      error: membership.error,
    });
  }
  const { ctx } = membership;

  if (action === 'summary') {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    try {
      const summary = await buildSanitizedFamilySummary(supabaseAdmin, ctx);
      return res.status(200).json({ ok: true, summary });
    } catch (e: any) {
      console.warn('[family-huddle] summary', e?.message || e);
      return res.status(500).json({ ok: false, error: 'Could not load your family.' });
    }
  }

  if (action === 'add-member') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const result = await addHouseholdAdult(supabaseAdmin, ctx, {
      fullName: first(req.body?.fullName || req.body?.name),
      relationship: first(req.body?.relationship || 'other'),
    });
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
    return res.status(200).json({ ok: true, summary: result.summary });
  }

  if (action === 'remove-member') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const result = await removeHouseholdMember(
      supabaseAdmin,
      ctx,
      first(req.body?.membershipId)
    );
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
    return res.status(200).json({ ok: true, summary: result.summary });
  }

  if (action === 'status') {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!lk) {
      return res.status(200).json({
        ok: true,
        configured: false,
        live: false,
        participantCount: 0,
        householdName: ctx.householdName,
      });
    }
    try {
      const status = await listFamilyVoiceStatus(lk, ctx.householdId);
      return res.status(200).json({
        ok: true,
        configured: true,
        live: status.active,
        participantCount: status.participantCount,
        householdName: ctx.householdName,
      });
    } catch (e: any) {
      console.warn('[family-huddle] status', e?.message || e);
      return res.status(200).json({
        ok: true,
        configured: true,
        live: false,
        participantCount: 0,
        householdName: ctx.householdName,
      });
    }
  }

  if (action === 'token') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!lk) {
      return res.status(503).json({
        ok: false,
        code: 'huddle_unavailable',
        error: 'Family Huddle is not configured yet',
      });
    }
    try {
      await ensureFamilyVoiceRoom(lk, ctx.householdId);
      const minted = await mintFamilyVoiceAccessToken(lk, {
        identity: ctx.userId,
        displayName: ctx.displayName,
        householdId: ctx.householdId,
        canModerate: true,
      });
      return res.status(200).json({
        ok: true,
        token: minted.token,
        url: minted.url,
        roomName: minted.roomName,
        expiresIn: minted.expiresIn,
        canModerate: true,
        isGuest: false,
        displayName: ctx.displayName,
        householdName: ctx.householdName,
      });
    } catch (e: any) {
      console.warn('[family-huddle] token', e?.message || e);
      return res.status(500).json({ ok: false, error: 'Could not start Family Huddle.' });
    }
  }

  if (action === 'end') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!lk) {
      return res.status(503).json({
        ok: false,
        code: 'huddle_unavailable',
        error: 'Family Huddle is not configured yet',
      });
    }
    try {
      const result = await endFamilyVoiceRoom(lk, ctx.householdId);
      await supabaseAdmin
        .from('family_huddle_invites')
        .update({ locked: true })
        .eq('household_id', ctx.householdId)
        .eq('locked', false)
        .gt('expires_at', new Date().toISOString());
      return res.status(200).json({ ok: true, ended: result.ended });
    } catch (e: any) {
      console.warn('[family-huddle] end', e?.message || e);
      return res.status(500).json({ ok: false, error: 'Could not end Family Huddle.' });
    }
  }

  if (action === 'invite-create' || action === 'invite') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + FAMILY_INVITE_TTL_MS).toISOString();
    const { data: created, error } = await supabaseAdmin
      .from('family_huddle_invites')
      .insert({
        household_id: ctx.householdId,
        created_by_user_id: ctx.userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        max_uses: FAMILY_INVITE_MAX_USES,
        use_count: 0,
        locked: false,
      })
      .select('id, expires_at, max_uses')
      .maybeSingle();

    if (error || !created) {
      console.warn('[family-huddle] invite-create', error?.message);
      return res.status(500).json({ ok: false, error: 'Could not create invite link.' });
    }

    return res.status(200).json({
      ok: true,
      code: rawToken,
      path: vaultFamilyHuddleJoinPath(rawToken),
      expiresAt: created.expires_at,
      maxUses: created.max_uses,
      householdName: ctx.householdName,
    });
  }

  if (action === 'invite-lock' || action === 'lock') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const { error } = await supabaseAdmin
      .from('family_huddle_invites')
      .update({ locked: true })
      .eq('household_id', ctx.householdId)
      .eq('locked', false)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.warn('[family-huddle] invite-lock', error.message);
      return res.status(500).json({ ok: false, error: 'Could not lock invites.' });
    }
    return res.status(200).json({ ok: true, locked: true });
  }

  return res.status(404).json({
    ok: false,
    error: 'Unknown family huddle action.',
    code: 'not_found',
  });
}
