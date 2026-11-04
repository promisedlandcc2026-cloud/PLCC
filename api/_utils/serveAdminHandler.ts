/**
 * Vault Serve Admin HTTP handler — service-role DB, requireAuth + SERVE_ADMIN_ROLES.
 * Mounted at resource=events&subResource=serve | serve-signups
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import {
  aggregateActiveSignupCounts,
  filterOpportunityList,
  isServeAdminRole,
  remainingSlots,
  resolveOpportunityStatusAction,
  resolveSignupAdminAction,
  SERVE_SIGNUP_ACTIVE,
  validateServeCreate,
  validateServeUpdate,
  decideStaffAddVolunteer,
} from './serveAdminLogic.js';

async function assertServeAdmin(req: any, res: any, supabase: any) {
  const auth = await requireAuth(req, res, supabase);
  if (!auth) return null;
  const role = String(auth.role || '').toUpperCase();
  if (!isServeAdminRole(role)) {
    res.status(403).json({ ok: false, error: 'Forbidden: Serve admin role required', code: 'forbidden' });
    return null;
  }
  return auth;
}

async function assertFkExists(
  supabase: any,
  table: string,
  id: string | null
): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
  if (error) return error.message;
  if (!data?.id) return `${table}_not_found`;
  return null;
}

async function activeSignupCount(supabase: any, opportunityId: string): Promise<number> {
  const { count, error } = await supabase
    .from('serve_signups')
    .select('*', { count: 'exact', head: true })
    .eq('opportunity_id', opportunityId)
    .in('status', [...SERVE_SIGNUP_ACTIVE]);
  if (error) throw error;
  return count ?? 0;
}

async function attachCounts(supabase: any, opportunities: any[]) {
  if (!opportunities.length) return [];
  const ids = opportunities.map((o) => o.id);
  const { data: signups, error } = await supabase
    .from('serve_signups')
    .select('opportunity_id, status')
    .in('opportunity_id', ids);
  if (error) throw error;
  const active = aggregateActiveSignupCounts(signups || []);
  return opportunities.map((o) => {
    const activeCount = active.get(o.id) || 0;
    return {
      ...o,
      activeSignupCount: activeCount,
      remainingSlots: remainingSlots(o.capacity, activeCount),
    };
  });
}

export async function handleServeAdmin(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });

  const sub = String(req.query?.subResource || '');
  const auth = await assertServeAdmin(req, res, supabase);
  if (!auth) return;

  try {
    if (sub === 'serve-signups') {
      return await handleServeSignups(req, res, supabase);
    }
    if (sub === 'serve') {
      return await handleServeOpportunities(req, res, supabase, auth);
    }
    return res.status(404).json({ ok: false, error: 'Unknown Serve subResource' });
  } catch (err: any) {
    console.error('[Serve Admin]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Serve admin failed' });
  }
}

async function handleServeOpportunities(req: any, res: any, supabase: any, auth: any) {
  if (req.method === 'GET') {
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (id) {
      const { data, error } = await supabase
        .from('serve_opportunities')
        .select(
          '*, event:events!event_id(id, name, date), ministry:ministries!ministry_id(id, name), team:teams!team_id(id, name)'
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ ok: false, error: 'Opportunity not found', code: 'not_found' });
      const [enriched] = await attachCounts(supabase, [data]);
      const { data: signups, error: sErr } = await supabase
        .from('serve_signups')
        .select(
          'id, opportunity_id, user_id, member_id, status, created_at, updated_at, cancelled_at, user:users!user_id(id, name, email), member:members!member_id(id, first_name, last_name, email)'
        )
        .eq('opportunity_id', id)
        .order('created_at', { ascending: true });
      if (sErr) throw sErr;
      const safeSignups = (signups || []).map(sanitizeSignup);
      return res.status(200).json({ ok: true, opportunity: enriched, signups: safeSignups });
    }

    const filter = typeof req.query?.filter === 'string' ? req.query.filter : 'all';
    const { data, error } = await supabase
      .from('serve_opportunities')
      .select(
        '*, event:events!event_id(id, name, date), ministry:ministries!ministry_id(id, name), team:teams!team_id(id, name)'
      )
      .order('starts_at', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const filtered = filterOpportunityList(data || [], filter);
    const opportunities = await attachCounts(supabase, filtered);
    return res.status(200).json({ ok: true, opportunities });
  }

  if (req.method === 'POST') {
    const validated = validateServeCreate(req.body || {}, auth.user.id);
    if (validated.ok === false) {
      return res.status(400).json({ ok: false, error: validated.error, code: validated.code });
    }
    for (const [table, col] of [
      ['events', validated.row.event_id],
      ['teams', validated.row.team_id],
      ['ministries', validated.row.ministry_id],
    ] as const) {
      const err = await assertFkExists(supabase, table, col);
      if (err) {
        return res.status(400).json({ ok: false, error: `Referenced ${table} not found`, code: err });
      }
    }
    const { data, error } = await supabase
      .from('serve_opportunities')
      .insert([validated.row])
      .select('*')
      .single();
    if (error) throw error;
    const [enriched] = await attachCounts(supabase, [data]);
    return res.status(201).json({ ok: true, opportunity: enriched });
  }

  if (req.method === 'PATCH') {
    const action = typeof req.body?.action === 'string' ? req.body.action : null;
    const id = typeof req.body?.id === 'string' ? req.body.id : null;
    if (!id) return res.status(400).json({ ok: false, error: 'id required', code: 'id_required' });

    const { data: existing, error: eErr } = await supabase
      .from('serve_opportunities')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!existing) return res.status(404).json({ ok: false, error: 'Opportunity not found', code: 'not_found' });

    if (action === 'cancel' || action === 'complete') {
      const resolved = resolveOpportunityStatusAction(existing.status, action);
      if (resolved.ok === false) {
        return res.status(400).json({ ok: false, error: resolved.error, code: resolved.code });
      }
      if (resolved.idempotent) {
        const [enriched] = await attachCounts(supabase, [existing]);
        return res.status(200).json({
          ok: true,
          opportunity: enriched,
          idempotent: true,
          status: resolved.next,
        });
      }
      const { data, error } = await supabase
        .from('serve_opportunities')
        .update({ status: resolved.next, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      const [enriched] = await attachCounts(supabase, [data]);
      return res.status(200).json({ ok: true, opportunity: enriched, status: resolved.next });
    }

    const active = await activeSignupCount(supabase, id);
    const validated = validateServeUpdate(req.body || {}, active);
    if (validated.ok === false) {
      return res.status(400).json({ ok: false, error: validated.error, code: validated.code });
    }

    // Cross-field time check using existing values when only one side patched
    const nextStart =
      validated.patch.starts_at !== undefined
        ? validated.patch.starts_at
        : existing.starts_at;
    const nextEnd =
      validated.patch.ends_at !== undefined ? validated.patch.ends_at : existing.ends_at;
    if (nextStart && nextEnd && String(nextEnd) < String(nextStart)) {
      return res.status(400).json({
        ok: false,
        error: 'ends_at must be >= starts_at',
        code: 'invalid_time_range',
      });
    }

    for (const [table, col] of [
      ['events', validated.patch.event_id],
      ['teams', validated.patch.team_id],
      ['ministries', validated.patch.ministry_id],
    ] as const) {
      if (col === undefined) continue;
      const err = await assertFkExists(supabase, table, col as string | null);
      if (err) {
        return res.status(400).json({ ok: false, error: `Referenced ${table} not found`, code: err });
      }
    }

    const { data, error } = await supabase
      .from('serve_opportunities')
      .update(validated.patch)
      .eq('id', validated.id)
      .select('*')
      .single();
    if (error) throw error;
    const [enriched] = await attachCounts(supabase, [data]);
    return res.status(200).json({ ok: true, opportunity: enriched });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

function sanitizeSignup(row: any) {
  const user = row.user || null;
  const member = row.member || null;
  const displayName =
    (user?.name && String(user.name).trim()) ||
    [member?.first_name, member?.last_name].filter(Boolean).join(' ').trim() ||
    'Unknown';
  const email =
    (typeof user?.email === 'string' && user.email) ||
    (typeof member?.email === 'string' && member.email) ||
    null;
  return {
    id: row.id,
    opportunity_id: row.opportunity_id,
    user_id: row.user_id,
    member_id: row.member_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cancelled_at: row.cancelled_at,
    displayName,
    email,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE = ['pending', 'confirmed'];

/** Staff "Add volunteer" search: people with a Vault account, with their Serve eligibility. */
async function serveAddCandidates(supabase: any, opportunityId: string, q: string) {
  const term = q.replace(/[%_,()]/g, ' ').trim().slice(0, 60);
  if (term.length < 2) return [];
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email')
    .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
    .order('name', { ascending: true })
    .limit(20);
  if (error) throw error;
  const ids = (users || []).map((u: any) => u.id);
  if (!ids.length) return [];
  const [{ data: elig }, { data: onRoster }] = await Promise.all([
    supabase.from('serve_eligibility').select('user_id, status').in('user_id', ids),
    supabase.from('serve_signups').select('user_id, status').eq('opportunity_id', opportunityId).in('user_id', ids),
  ]);
  const eligBy = new Map<string, string>((elig || []).map((e: any) => [String(e.user_id), String(e.status)] as [string, string]));
  const rosterBy = new Map<string, string>((onRoster || []).map((r: any) => [String(r.user_id), String(r.status)] as [string, string]));
  return (users || []).map((u: any) => ({
    id: String(u.id),
    name: String(u.name || u.email || 'Member'),
    email: u.email || null,
    eligibility: eligBy.get(String(u.id)) || 'not_verified',
    onRoster: ACTIVE.includes(rosterBy.get(String(u.id)) || ''),
  }));
}

async function handleServeSignups(req: any, res: any, supabase: any) {
  if (req.method === 'GET' && typeof req.query?.candidates === 'string') {
    const opportunityId = typeof req.query?.opportunityId === 'string' ? req.query.opportunityId : '';
    if (!UUID_RE.test(opportunityId)) return res.status(400).json({ ok: false, error: 'opportunityId required' });
    return res.status(200).json({ ok: true, people: await serveAddCandidates(supabase, opportunityId, req.query.candidates) });
  }

  if (req.method === 'POST') {
    // Staff "Add volunteer" — puts an eligible person straight on the roster (confirmed).
    const opportunityId = String(req.body?.opportunityId || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!UUID_RE.test(opportunityId) || !UUID_RE.test(userId)) {
      return res.status(400).json({ ok: false, error: 'opportunityId and userId required', code: 'bad_request' });
    }
    const [{ data: opp }, { data: person }, { data: elig }, { data: existing }, { count: activeCount }] = await Promise.all([
      supabase.from('serve_opportunities').select('id, status, capacity').eq('id', opportunityId).maybeSingle(),
      supabase.from('users').select('id').eq('id', userId).maybeSingle(),
      supabase.from('serve_eligibility').select('status').eq('user_id', userId).maybeSingle(),
      supabase.from('serve_signups').select('id, status').eq('opportunity_id', opportunityId).eq('user_id', userId).maybeSingle(),
      supabase.from('serve_signups').select('id', { count: 'exact', head: true }).eq('opportunity_id', opportunityId).in('status', ACTIVE),
    ]);
    if (!opp) return res.status(404).json({ ok: false, error: 'Opportunity not found', code: 'not_found' });
    if (!person) return res.status(404).json({ ok: false, error: 'That person was not found', code: 'not_found' });
    const decision = decideStaffAddVolunteer({
      opportunityStatus: opp.status,
      capacity: opp.capacity,
      activeCount: activeCount || 0,
      eligibilityStatus: elig?.status || null,
      existingStatus: existing?.status || null,
    });
    if (decision.ok === false) return res.status(decision.status).json({ ok: false, error: decision.error, code: decision.code });
    const now = new Date().toISOString();
    const write =
      decision.mode === 'revive'
        ? supabase
            .from('serve_signups')
            .update({ status: 'confirmed', cancelled_at: null, updated_at: now })
            .eq('id', existing.id)
        : supabase.from('serve_signups').insert({ opportunity_id: opportunityId, user_id: userId, status: 'confirmed' });
    const { error } = await write;
    if (error) {
      if (String(error.code) === '23505') return res.status(409).json({ ok: false, error: 'They are already on this roster.', code: 'already_signed_up' });
      throw error;
    }
    const { data: rows } = await supabase
      .from('serve_signups')
      .select(
        'id, opportunity_id, user_id, member_id, status, created_at, updated_at, cancelled_at, user:users!user_id(id, name, email), member:members!member_id(id, first_name, last_name, email)'
      )
      .eq('opportunity_id', opportunityId)
      .eq('user_id', userId)
      .limit(1);
    return res.status(200).json({ ok: true, signup: rows?.[0] ? sanitizeSignup(rows[0]) : null });
  }

  if (req.method === 'GET') {
    const opportunityId =
      typeof req.query?.opportunityId === 'string' ? req.query.opportunityId : null;
    if (!opportunityId) {
      return res.status(400).json({ ok: false, error: 'opportunityId required', code: 'opportunity_id_required' });
    }
    const { data, error } = await supabase
      .from('serve_signups')
      .select(
        'id, opportunity_id, user_id, member_id, status, created_at, updated_at, cancelled_at, user:users!user_id(id, name, email), member:members!member_id(id, first_name, last_name, email)'
      )
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return res.status(200).json({ ok: true, signups: (data || []).map(sanitizeSignup) });
  }

  if (req.method === 'PATCH') {
    const id = typeof req.body?.id === 'string' ? req.body.id : null;
    const action = typeof req.body?.action === 'string' ? req.body.action : null;
    if (!id || !action) {
      return res.status(400).json({ ok: false, error: 'id and action required', code: 'bad_request' });
    }
    const { data: existing, error: eErr } = await supabase
      .from('serve_signups')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!existing) return res.status(404).json({ ok: false, error: 'Signup not found', code: 'not_found' });

    const resolved = resolveSignupAdminAction(existing.status, action);
    if (resolved.ok === false) {
      return res.status(400).json({ ok: false, error: resolved.error, code: resolved.code });
    }
    if (resolved.idempotent) {
      return res.status(200).json({
        ok: true,
        signup: {
          id: existing.id,
          status: resolved.next,
          opportunity_id: existing.opportunity_id,
        },
        idempotent: true,
      });
    }

    const { data, error } = await supabase
      .from('serve_signups')
      .update({ status: resolved.next, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(409).json({
        ok: false,
        error: 'Signup is no longer pending',
        code: 'conflict',
      });
    }
    return res.status(200).json({
      ok: true,
      signup: {
        id: data.id,
        status: data.status,
        opportunity_id: data.opportunity_id,
      },
    });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
