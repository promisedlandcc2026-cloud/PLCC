/**
 * Super Admin Canaan Repair Desk — diagnose + allowlisted repairs only.
 * No free-form SQL / code execution.
 */
import { getSupabaseAdmin, requireAuth, resolveAppUser } from './auth.js';
import { ensureMemberForUser } from './ensureMemberForUser.js';
import { getAudit, getBcrypt } from './deps.js';

export const VAULT_REPAIR_ACTIONS = [
  'ensure_member_row',
  'promote_onboarded_member',
  'reset_temporary_password',
  'clear_media_notice',
  'force_media_ack',
  'relink_auth_user',
  'set_member_active',
] as const;

export type VaultRepairAction = (typeof VAULT_REPAIR_ACTIONS)[number];

const MEDIA_NOTICE_VERSION = 'awc-media-notice-v1';

const EVERYDAY_PATHS = [
  '/dashboard',
  '/members',
  '/family',
  '/settings',
  '/community/feed',
  '/community/chat',
  '/communication/announcements',
  '/admin/policies',
  '/help/how-to-videos',
];

function isSuperAdmin(role: string | null | undefined): boolean {
  return String(role || '').toUpperCase() === 'SUPER_ADMIN';
}

function isAllowlistedAction(action: string): action is VaultRepairAction {
  return (VAULT_REPAIR_ACTIONS as readonly string[]).includes(action);
}

function pathAccessNote(role: string, path: string): { allowed: boolean; note: string } {
  const r = String(role || '').toUpperCase();
  const p = String(path || '').trim() || '/dashboard';
  if (!r || r === 'PENDING') {
    return { allowed: false, note: 'PENDING accounts cannot open app sections until onboarding/auto-approve or Staff & Roles' };
  }
  if (r === 'KIOSK') {
    const ok = p.startsWith('/events/') || p.startsWith('/attendance/');
    return { allowed: ok, note: ok ? 'Kiosk may use check-in routes' : 'Kiosk is limited to kids check-in routes' };
  }
  if (r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'PASTOR') {
    return { allowed: true, note: 'Elevated role generally bypasses path ACL' };
  }
  if (EVERYDAY_PATHS.includes(p) || EVERYDAY_PATHS.some((e) => p.startsWith(e + '/'))) {
    return { allowed: true, note: 'Everyday member route' };
  }
  return {
    allowed: false,
    note: `Role ${r} may not include ${p} — confirm in Staff & Roles / PATH_PERMISSIONS`,
  };
}

async function findAuthUser(supabase: any, email: string, userId?: string) {
  if (userId) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (!error && data?.user) return data.user;
  }
  if (email && typeof supabase.auth.admin.getUserByEmail === 'function') {
    const { data, error } = await supabase.auth.admin.getUserByEmail(email);
    if (!error && data?.user) return data.user;
  }
  // Fallback scan (bounded)
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const hit = (data?.users || []).find((u: any) => String(u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if ((data?.users || []).length < 200) break;
  }
  return null;
}

async function lookupAppUser(supabase: any, q: string) {
  const query = String(q || '').trim();
  if (!query) return null;

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
  if (uuidLike) {
    const { data } = await supabase.from('users').select('*').eq('id', query).maybeSingle();
    if (data) return data;
  }

  if (query.includes('@')) {
    const { data } = await supabase.from('users').select('*').ilike('email', query.toLowerCase()).maybeSingle();
    if (data) return data;
  }

  const digits = query.replace(/\D/g, '');
  if (digits.length >= 7) {
    const { data } = await supabase.from('users').select('*').ilike('phone', `%${digits.slice(-10)}%`).limit(5);
    if (data?.[0]) return data[0];
  }

  const { data: byName } = await supabase
    .from('users')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(5);
  if (byName?.[0]) return byName[0];

  return null;
}

function applicableActions(report: any): VaultRepairAction[] {
  const out: VaultRepairAction[] = [];
  const role = String(report?.users?.role || '').toUpperCase();
  const onboarded = !!report?.users?.onboardingCompletedAt;
  if (!report?.members?.id) out.push('ensure_member_row');
  if (role === 'PENDING' && onboarded) out.push('promote_onboarded_member');
  if (report?.users?.id) {
    out.push('reset_temporary_password');
    out.push('clear_media_notice');
    out.push('force_media_ack');
  }
  if (report?.auth?.id && report?.users?.email) out.push('relink_auth_user');
  if (report?.members?.status === 'Visitor' && role && role !== 'PENDING') out.push('set_member_active');
  return out;
}

async function buildDiagnosis(supabase: any, opts: { query?: string; userId?: string; path?: string }) {
  const findings: Array<{ level: 'ok' | 'warn' | 'error'; code: string; message: string }> = [];
  let appUser = opts.userId
    ? (await supabase.from('users').select('*').eq('id', opts.userId).maybeSingle()).data
    : await lookupAppUser(supabase, opts.query || '');

  // Auth-only orphan: query is email but no users row
  const emailHint = String(opts.query || appUser?.email || '')
    .toLowerCase()
    .trim();
  const authUser = await findAuthUser(supabase, emailHint, appUser?.id || opts.userId);

  if (!appUser && !authUser) {
    findings.push({ level: 'error', code: 'not_found', message: 'No Auth or Vault user matched that lookup.' });
    return {
      query: opts.query || null,
      auth: null,
      users: null,
      members: null,
      link: null,
      pathCheck: null,
      applicableActions: [],
      findings,
    };
  }

  if (!appUser && authUser) {
    findings.push({
      level: 'warn',
      code: 'auth_only',
      message: 'Auth account exists but no Vault users row — run Relink / create PENDING stub.',
    });
  }

  if (appUser) {
    const role = String(appUser.role || '').toUpperCase();
    if (role === 'PENDING') {
      findings.push({
        level: 'warn',
        code: 'pending_role',
        message: 'Login role is PENDING — section access will fail until promoted.',
      });
    } else {
      findings.push({ level: 'ok', code: 'role_ok', message: `Role is ${role || 'unset'}.` });
    }
    if (appUser.is_temporary_password) {
      findings.push({
        level: 'warn',
        code: 'temp_password',
        message: 'Account is flagged with a temporary password.',
      });
    }
  }

  if (authUser) {
    if (!authUser.email_confirmed_at) {
      findings.push({ level: 'warn', code: 'email_unconfirmed', message: 'Auth email is not confirmed.' });
    } else {
      findings.push({ level: 'ok', code: 'email_confirmed', message: 'Auth email is confirmed.' });
    }
    if (authUser.banned_until) {
      findings.push({ level: 'error', code: 'banned', message: `Auth user banned until ${authUser.banned_until}.` });
    }
  } else {
    findings.push({
      level: 'error',
      code: 'no_auth',
      message: 'No Supabase Auth user found — they cannot sign in until Auth exists.',
    });
  }

  let member: any = null;
  if (appUser?.id) {
    const byId = await supabase.from('members').select('id, email, first_name, last_name, status, role').eq('id', appUser.id).maybeSingle();
    member = byId.data;
  }
  if (!member && emailHint) {
    const byEmail = await supabase
      .from('members')
      .select('id, email, first_name, last_name, status, role')
      .ilike('email', emailHint)
      .maybeSingle();
    member = byEmail.data;
  }

  if (!member) {
    findings.push({
      level: 'warn',
      code: 'no_member',
      message: 'No Members directory row — they may be missing from /members.',
    });
  } else if (String(member.status) === 'Visitor') {
    findings.push({
      level: 'warn',
      code: 'member_visitor',
      message: 'Members status is Visitor (shows under Visitors / Pending).',
    });
  } else {
    findings.push({ level: 'ok', code: 'member_ok', message: `Members row present (${member.status}).` });
  }

  let link: any = null;
  if (appUser?.id) {
    try {
      const { data } = await supabase
        .from('user_member_links')
        .select('user_id, member_id, status, link_method')
        .eq('user_id', appUser.id)
        .maybeSingle();
      link = data;
    } catch {
      link = null;
    }
  }

  const prefs = (appUser?.notification_prefs && typeof appUser.notification_prefs === 'object'
    ? appUser.notification_prefs
    : {}) as any;
  const onboardingCompletedAt = prefs?.onboarding?.completedAt || null;
  if (appUser && !onboardingCompletedAt && String(appUser.role || '').toUpperCase() === 'PENDING') {
    findings.push({
      level: 'warn',
      code: 'onboarding_incomplete',
      message: 'Onboarding not completed — auto-approve to MEMBER will not run until they finish.',
    });
  } else if (onboardingCompletedAt) {
    findings.push({ level: 'ok', code: 'onboarded', message: 'Onboarding completedAt is set.' });
  }

  const path = String(opts.path || '/dashboard').trim() || '/dashboard';
  const pathCheck = pathAccessNote(String(appUser?.role || 'PENDING'), path);
  if (!pathCheck.allowed) {
    findings.push({ level: 'warn', code: 'path_denied', message: `${path}: ${pathCheck.note}` });
  } else {
    findings.push({ level: 'ok', code: 'path_ok', message: `${path}: ${pathCheck.note}` });
  }

  const report = {
    query: opts.query || null,
    auth: authUser
      ? {
          id: authUser.id,
          email: authUser.email,
          email_confirmed_at: authUser.email_confirmed_at || null,
          last_sign_in_at: authUser.last_sign_in_at || null,
          banned_until: authUser.banned_until || null,
          created_at: authUser.created_at || null,
        }
      : null,
    users: appUser
      ? {
          id: appUser.id,
          email: appUser.email,
          name: appUser.name || null,
          role: appUser.role || null,
          phone: appUser.phone || null,
          is_temporary_password: !!appUser.is_temporary_password,
          onboardingCompletedAt,
          mediaNotice: prefs?.mediaNotice || null,
          created_at: appUser.created_at || null,
        }
      : null,
    members: member,
    link,
    pathCheck: { path, ...pathCheck },
    findings,
    applicableActions: [] as VaultRepairAction[],
  };
  report.applicableActions = applicableActions(report);
  return report;
}

async function runRepair(
  supabase: any,
  action: VaultRepairAction,
  userId: string,
  actorId: string,
  req: any
) {
  const { data: appUser, error: userErr } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (userErr) throw new Error(userErr.message);

  let result: Record<string, unknown> = { action, userId };

  switch (action) {
    case 'ensure_member_row': {
      if (!appUser) throw new Error('Vault user row required');
      const memberId = await ensureMemberForUser(supabase, appUser);
      if (!memberId) throw new Error('Could not create/sync Members row');
      result.memberId = memberId;
      break;
    }
    case 'promote_onboarded_member': {
      if (!appUser) throw new Error('Vault user row required');
      const completed = !!(appUser.notification_prefs as any)?.onboarding?.completedAt;
      if (!completed) throw new Error('Onboarding is not completed — cannot auto-promote');
      if (String(appUser.role || '').toUpperCase() !== 'PENDING') {
        throw new Error(`Role is ${appUser.role}, not PENDING`);
      }
      const { data, error } = await supabase
        .from('users')
        .update({ role: 'MEMBER' })
        .eq('id', userId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      await ensureMemberForUser(supabase, { ...data, role: 'MEMBER' });
      result.role = 'MEMBER';
      break;
    }
    case 'reset_temporary_password': {
      if (!appUser?.email) throw new Error('User email required');
      const temp = `AwC-${Math.random().toString(36).slice(2, 8)}!${Math.floor(10 + Math.random() * 89)}`;
      const { error: authErr } = await supabase.auth.admin.updateUserById(userId, { password: temp });
      if (authErr) throw new Error(authErr.message);
      const bcrypt = await getBcrypt();
      const password_hash = bcrypt ? await bcrypt.hash(temp, 10) : 'TEMP_HASH';
      await supabase
        .from('users')
        .update({ password_hash, is_temporary_password: true })
        .eq('id', userId);
      result.temporaryPassword = temp;
      result.note = 'Share this password securely once. It will not be shown again.';
      break;
    }
    case 'clear_media_notice': {
      if (!appUser) throw new Error('Vault user row required');
      const prefs = { ...(appUser.notification_prefs || {}) };
      delete (prefs as any).mediaNotice;
      const { error } = await supabase.from('users').update({ notification_prefs: prefs }).eq('id', userId);
      if (error) throw new Error(error.message);
      result.cleared = true;
      break;
    }
    case 'force_media_ack': {
      if (!appUser) throw new Error('Vault user row required');
      const prefs = {
        ...(appUser.notification_prefs || {}),
        mediaNotice: {
          acknowledgedAt: new Date().toISOString(),
          version: MEDIA_NOTICE_VERSION,
        },
      };
      const { error } = await supabase.from('users').update({ notification_prefs: prefs }).eq('id', userId);
      if (error) throw new Error(error.message);
      result.acknowledged = true;
      break;
    }
    case 'relink_auth_user': {
      const email = String(appUser?.email || '').toLowerCase();
      const auth = await findAuthUser(supabase, email, userId);
      if (!auth) throw new Error('No Auth user to relink');
      const linked = await resolveAppUser(supabase, auth.id, auth.email, auth.user_metadata || null);
      if (!linked) throw new Error('Relink failed');
      await ensureMemberForUser(supabase, linked);
      result.linkedUserId = linked.id;
      result.role = linked.role;
      break;
    }
    case 'set_member_active': {
      if (!appUser) throw new Error('Vault user row required');
      if (String(appUser.role || '').toUpperCase() === 'PENDING') {
        throw new Error('Cannot set Active while login role is PENDING');
      }
      let memberId: string | null = null;
      const byId = await supabase.from('members').select('id, status').eq('id', userId).maybeSingle();
      if (byId.data?.id) memberId = byId.data.id;
      if (!memberId && appUser.email) {
        const byEmail = await supabase
          .from('members')
          .select('id, status')
          .ilike('email', appUser.email)
          .maybeSingle();
        memberId = byEmail.data?.id || null;
      }
      if (!memberId) {
        memberId = await ensureMemberForUser(supabase, { ...appUser, role: appUser.role });
      }
      if (!memberId) throw new Error('No Members row to update');
      const { error } = await supabase.from('members').update({ status: 'Active' }).eq('id', memberId);
      if (error) throw new Error(error.message);
      result.memberId = memberId;
      result.status = 'Active';
      break;
    }
    default:
      throw new Error('Unknown repair action');
  }

  const logAudit = await getAudit();
  await logAudit({
    action: 'Vault Repair',
    details: { action, targetUserId: userId, actorId, result: { ...result, temporaryPassword: result.temporaryPassword ? '[redacted]' : undefined } },
    resourceType: 'user',
    resourceId: userId,
    severity: action === 'reset_temporary_password' ? 'critical' : 'warning',
    req,
  });

  return result;
}

function buildRepairSystemPrompt(diagnosis: any): string {
  return `You are PLCC Canaan Repair Assistant for Super Admins only.
You diagnose member login/access issues and recommend ONE allowlisted repair action when helpful.

Allowlisted actions ONLY:
${VAULT_REPAIR_ACTIONS.map((a) => `- ${a}`).join('\n')}

Rules:
- Never invent actions outside the allowlist.
- Never suggest deleting users, running SQL, or assigning SUPER_ADMIN.
- Prefer the smallest safe fix.
- Respond with a short human summary, then a JSON block on its own lines:

\`\`\`json
{"summary":"...","recommendedAction":"<allowlisted or null>","rationale":"..."}
\`\`\`

Current diagnosis JSON:
${JSON.stringify(diagnosis, null, 2)}
`;
}

function parseRecommendedAction(text: string): { summary: string; recommendedAction: VaultRepairAction | null; rationale: string } {
  const fallback = { summary: text.slice(0, 1200), recommendedAction: null as VaultRepairAction | null, rationale: '' };
  const match = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/\{[\s\S]*"recommendedAction"[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const raw = match[1] || match[0];
    const json = JSON.parse(raw);
    const action = String(json.recommendedAction || '');
    return {
      summary: String(json.summary || fallback.summary),
      recommendedAction: isAllowlistedAction(action) ? action : null,
      rationale: String(json.rationale || ''),
    };
  } catch {
    return fallback;
  }
}

async function callOpenAI(system: string, messages: { role: string; content: string }[]) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return { ok: false as const, skip: true as const, error: 'OPENAI_API_KEY not set' };
  const model = process.env.OPENAI_ASK_ADMIN_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { ok: false as const, skip: false as const, error: json?.error?.message || text.slice(0, 300) };
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content) return { ok: false as const, skip: false as const, error: 'Empty OpenAI response' };
  return { ok: true as const, text: String(content) };
}

async function callAnthropic(system: string, messages: { role: string; content: string }[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) return { ok: false as const, skip: true as const, error: 'ANTHROPIC_API_KEY not set' };
  const model = process.env.ANTHROPIC_ASK_ADMIN_MODEL || 'claude-3-5-haiku-20241022';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      temperature: 0.2,
      system,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    }),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { ok: false as const, skip: false as const, error: json?.error?.message || text.slice(0, 300) };
  }
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const content = blocks
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
  if (!content) return { ok: false as const, skip: false as const, error: 'Empty Anthropic response' };
  return { ok: true as const, text: content };
}

export async function handleVaultRepair(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase Admin not initialized' });

  const auth = await requireAuth(req, res, supabase);
  if (!auth) return;
  if (!isSuperAdmin(auth.role)) {
    return res.status(403).json({ error: 'Only Super Admins can use Vault Repair.' });
  }

  const action = String(req.query?.action || req.body?.action || '').toLowerCase();

  try {
    if (req.method === 'GET' || action === 'diagnose') {
      const query = String(req.query?.q || req.body?.query || '').trim();
      const userId = String(req.query?.userId || req.body?.userId || '').trim();
      const path = String(req.query?.path || req.body?.path || '/dashboard').trim();
      if (!query && !userId) {
        return res.status(400).json({ error: 'Provide q (email/phone/name) or userId' });
      }
      const diagnosis = await buildDiagnosis(supabase, { query, userId: userId || undefined, path });
      return res.status(200).json({ ok: true, diagnosis, allowlistedActions: VAULT_REPAIR_ACTIONS });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (action === 'chat') {
      const userId = String(req.body?.userId || '').trim();
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      if (!userId) return res.status(400).json({ error: 'userId required for repair chat' });
      const diagnosis = await buildDiagnosis(supabase, { userId, path: req.body?.path || '/dashboard' });
      const system = buildRepairSystemPrompt(diagnosis);
      const normalized = messages
        .filter((m: any) => m?.content)
        .map((m: any) => ({
          role: m.role === 'assistant' || m.role === 'ai' ? 'assistant' : 'user',
          content: String(m.content).slice(0, 4000),
        }))
        .slice(-12);
      if (normalized.length === 0) {
        return res.status(400).json({ error: 'messages required' });
      }

      let llm = await callOpenAI(system, normalized);
      if (!llm.ok) llm = await callAnthropic(system, normalized);
      if (!llm.ok) {
        return res.status(200).json({
          ok: true,
          offline: true,
          reply:
            'AI is unavailable right now. Use the diagnosis findings and one-click repairs on the left — those work without AI.',
          recommendedAction: diagnosis.applicableActions[0] || null,
          diagnosis,
        });
      }

      const parsed = parseRecommendedAction(llm.text);
      // Hard reject non-allowlisted suggestions
      if (parsed.recommendedAction && !isAllowlistedAction(parsed.recommendedAction)) {
        parsed.recommendedAction = null;
      }
      if (
        parsed.recommendedAction &&
        !diagnosis.applicableActions.includes(parsed.recommendedAction)
      ) {
        // Still allow suggesting allowlisted actions; UI will confirm
      }

      return res.status(200).json({
        ok: true,
        reply: parsed.summary,
        rationale: parsed.rationale,
        recommendedAction: parsed.recommendedAction,
        raw: llm.text.slice(0, 4000),
        diagnosis,
      });
    }

    if (action === 'repair') {
      const repairAction = String(req.body?.repairAction || req.body?.fix || '').trim();
      const userId = String(req.body?.userId || '').trim();
      const confirm = req.body?.confirm === true;
      if (!isAllowlistedAction(repairAction)) {
        return res.status(400).json({ error: 'Action not allowlisted', allowlistedActions: VAULT_REPAIR_ACTIONS });
      }
      if (!userId) return res.status(400).json({ error: 'userId required' });
      if (!confirm) return res.status(400).json({ error: 'confirm: true is required' });

      const result = await runRepair(supabase, repairAction, userId, auth.user!.id, req);
      const diagnosis = await buildDiagnosis(supabase, { userId });
      return res.status(200).json({ ok: true, result, diagnosis });
    }

    return res.status(400).json({ error: 'Unknown action. Use diagnose, repair, or chat.' });
  } catch (err: any) {
    console.error('[vault-repair]', err);
    return res.status(500).json({ error: err?.message || 'Vault repair failed' });
  }
}
