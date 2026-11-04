import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getBcrypt } from './deps.js';
import { ensureMemberForUser } from './ensureMemberForUser.js';

/** Per-request ceiling so a stuck PostgREST call cannot burn the whole Vercel maxDuration. */
const SUPABASE_FETCH_TIMEOUT_MS = 12_000;

/**
 * Hard timeout that does not rely on fetch AbortSignal (Node can hang through abort
 * when PostgREST/Auth is degraded). Use around awaited Supabase query builders.
 */
export async function withSupabaseTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS,
  label = 'Supabase'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fetchWithSupabaseTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort(new Error(`Supabase request timed out after ${SUPABASE_FETCH_TIMEOUT_MS}ms`));
    } catch {
      controller.abort();
    }
  }, SUPABASE_FETCH_TIMEOUT_MS);

  const parent = init?.signal;
  const onParentAbort = () => {
    try {
      controller.abort(parent?.reason);
    } catch {
      controller.abort();
    }
  };
  if (parent) {
    if (parent.aborted) onParentAbort();
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    if (parent) parent.removeEventListener('abort', onParentAbort);
  });
}

export const getSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithSupabaseTimeout },
  });
};

export type AuthResult = {
  user: { id: string; email?: string | null; metadata?: any; name?: string; title?: string } | null;
  role: string | null;
};

function displayNameFromMetadata(
  metadata?: Record<string, any> | null,
  _email?: string | null
): string {
  const first = String(metadata?.first_name || '').trim();
  const last = String(metadata?.last_name || '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  const full = String(metadata?.full_name || metadata?.name || '').trim();
  if (full) return full;
  // Do not invent a name from the email local-part — that skips onboarding
  // (LoginPortal treated any non-empty name as "already onboarded").
  return '';
}

/** Lean projection for auth linking — avoid select('*') under statement-timeout pressure. */
const APP_USER_SELECT =
  'id, email, name, title, role, password_hash, is_temporary_password, created_at, notification_prefs';

/**
 * Resolve the app `users` row for a Supabase Auth account.
 *
 * Staff invites often create a `users` row keyed by email with a random id.
 * When that person later signs up, Auth gives them a different UUID. Without
 * linking, every login looks "new" (onboarding loop) and assigned roles never apply.
 *
 * Public signup creates Auth only — if no vault row exists yet, provision a
 * PENDING stub so Super Admins can see and approve them in Staff & Roles.
 */
export const resolveAppUser = async (
  supabase: SupabaseClient,
  authUserId: string,
  email?: string | null,
  metadata?: Record<string, any> | null
): Promise<Record<string, any> | null> => {
  const { data: byId, error: byIdError } = await withSupabaseTimeout(
    supabase.from('users').select(APP_USER_SELECT).eq('id', authUserId).maybeSingle(),
    8_000,
    'users.byId'
  );

  if (byIdError) {
    console.log(`[Auth Link] Lookup by id failed: ${byIdError.message}`);
  }
  if (byId) return byId;

  const normalizedEmail = (email || '').toLowerCase().trim();
  if (!normalizedEmail) return null;

  // Prefer exact eq (index-friendly). Emails are stored lowercased on insert.
  const { data: byEmail, error: byEmailError } = await withSupabaseTimeout(
    supabase.from('users').select(APP_USER_SELECT).eq('email', normalizedEmail).maybeSingle(),
    8_000,
    'users.byEmail'
  );

  if (byEmailError) {
    console.log(`[Auth Link] Lookup by email failed: ${byEmailError.message}`);
    return null;
  }

  if (!byEmail) {
    // Auth-only signup: create a PENDING vault row for Staff & Roles visibility
    const bcrypt = await getBcrypt();
    const password_hash = bcrypt ? await bcrypt.hash('Temporary123!', 10) : 'TEMP_HASH';
    const stub = {
      id: authUserId,
      email: normalizedEmail,
      name: displayNameFromMetadata(metadata, normalizedEmail),
      role: 'PENDING',
      password_hash,
      is_temporary_password: true,
      ...(metadata?.phone ? { phone: String(metadata.phone).trim() } : {}),
    };
    let { data: created, error: createError } = await supabase
      .from('users')
      .insert(stub)
      .select(APP_USER_SELECT)
      .single();

    if (createError && /phone/i.test(createError.message || '')) {
      const { phone: _phone, ...stubWithoutPhone } = stub as Record<string, unknown>;
      const retry = await supabase
        .from('users')
        .insert(stubWithoutPhone)
        .select(APP_USER_SELECT)
        .single();
      created = retry.data;
      createError = retry.error;
    }

    if (createError || !created) {
      // Race: another request may have inserted — re-read
      console.warn(`[Auth Link] PENDING stub insert failed for ${normalizedEmail}:`, createError?.message);
      const { data: again } = await supabase
        .from('users')
        .select(APP_USER_SELECT)
        .eq('id', authUserId)
        .maybeSingle();
      if (again) {
        await ensureMemberForUser(supabase, again).catch(() => null);
        return again;
      }
      const { data: byEmailAgain } = await supabase
        .from('users')
        .select(APP_USER_SELECT)
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (byEmailAgain) {
        await ensureMemberForUser(supabase, byEmailAgain).catch(() => null);
      }
      return byEmailAgain || null;
    }

    console.log(`[Auth Link] Created PENDING stub for ${normalizedEmail} (${authUserId})`);
    // New public signups must appear in Members immediately (not only after onboarding PATCH)
    await ensureMemberForUser(supabase, created).catch(() => null);
    return created;
  }

  if (byEmail.id === authUserId) return byEmail;

  // Move the invited/staff row onto the Auth UUID so role + profile stick.
  const oldId = byEmail.id;
  const orphanEmail = `orphaned+${oldId.replace(/-/g, '')}@awc-vault.local`;

  const { error: freeEmailError } = await supabase
    .from('users')
    .update({ email: orphanEmail })
    .eq('id', oldId);

  if (freeEmailError) {
    console.error(`[Auth Link] Could not free email for ${normalizedEmail}:`, freeEmailError.message);
    // Still return the email row so role works this request (id remains mismatched until fixed).
    return byEmail;
  }

  const { id: _old, created_at: _c, updated_at: _u, ...profile } = byEmail;
  const { data: linked, error: insertError } = await supabase
    .from('users')
    .insert({
      ...profile,
      id: authUserId,
      email: normalizedEmail,
    })
    .select(APP_USER_SELECT)
    .single();

  if (insertError || !linked) {
    console.error(`[Auth Link] Could not insert linked user:`, insertError?.message);
    // Roll email back so Staff & Roles still finds them
    await supabase.from('users').update({ email: byEmail.email }).eq('id', oldId);
    return byEmail;
  }

  const { error: deleteError } = await supabase.from('users').delete().eq('id', oldId);
  if (deleteError) {
    console.warn(`[Auth Link] Linked ok but orphan row remains (${oldId}):`, deleteError.message);
  } else {
    console.log(`[Auth Link] Linked ${normalizedEmail}: ${oldId} → ${authUserId}`);
  }

  return linked;
};

/** Placeholder / QA / typo-lab emails that should never reappear in Staff & Roles. */
function isNonDirectoryEmail(email: string): boolean {
  const e = (email || '').toLowerCase().trim();
  return (
    !e ||
    !e.includes('@') ||
    /@awc-vault\.local$/i.test(e) ||
    /^orphaned\+/i.test(e) ||
    /@phone\.awcvault\.invalid$/i.test(e) ||
    e === 'pending@email.com' ||
    // Local QA / developer trial accounts (never church members)
    /jerless/i.test(e) ||
    /@atomic(mail|vault)?\.io$/i.test(e) ||
    /@atomicmail\.com$/i.test(e) ||
    /@atomic\.io$/i.test(e) ||
    // Obvious typo / malformed signup trials
    /gmailcom$/i.test(e) ||
    /gmail\.comm$/i.test(e) ||
    /@gmaul\./i.test(e) ||
    /@2gmail\./i.test(e) ||
    /@2gmal\./i.test(e) ||
    /@gmail\.com\d+$/i.test(e) ||
    /^phase\d/i.test(e)
  );
}

/**
 * Surface Auth-only signups (and PENDING stubs missing from Members) so Staff & Roles
 * / Members → Visitors never hide people who already created an account.
 * Best-effort and bounded — safe to call on Super Admin user list loads.
 */
export async function reconcileAuthPendingSignups(
  supabase: SupabaseClient
): Promise<{ created: number; synced: number }> {
  let created = 0;
  let synced = 0;

  try {
    const { data: pendingUsers, error: pendingErr } = await withSupabaseTimeout(
      supabase
        .from('users')
        .select(APP_USER_SELECT)
        .eq('role', 'PENDING')
        .limit(200),
      10_000,
      'users.pending'
    );
    if (pendingErr) {
      console.warn('[Auth Reconcile] PENDING lookup failed:', pendingErr.message);
    } else {
      for (const u of pendingUsers || []) {
        if (isNonDirectoryEmail(String(u.email || ''))) continue;
        const memberId = await ensureMemberForUser(supabase, u);
        if (memberId) synced += 1;
      }
    }

    const { data: existingUsers, error: existingErr } = await withSupabaseTimeout(
      supabase.from('users').select('id, email').limit(2000),
      12_000,
      'users.allIds'
    );
    if (existingErr) {
      console.warn('[Auth Reconcile] users index failed:', existingErr.message);
      return { created, synced };
    }

    const knownIds = new Set((existingUsers || []).map((u: any) => String(u.id)));
    const knownEmails = new Set(
      (existingUsers || [])
        .map((u: any) => String(u.email || '').toLowerCase().trim())
        .filter(Boolean)
    );

    const cutoffMs = Date.now() - 180 * 24 * 60 * 60 * 1000;
    let page = 1;
    while (page <= 8) {
      const { data, error } = await withSupabaseTimeout(
        supabase.auth.admin.listUsers({ page, perPage: 200 }),
        12_000,
        `auth.listUsers.${page}`
      );
      if (error) {
        console.warn('[Auth Reconcile] listUsers failed:', error.message);
        break;
      }
      const users = data?.users || [];
      for (const au of users) {
        const email = String(au.email || '')
          .toLowerCase()
          .trim();
        if (isNonDirectoryEmail(email)) continue;
        if (knownIds.has(au.id) || knownEmails.has(email)) continue;
        const createdAt = au.created_at ? new Date(au.created_at).getTime() : 0;
        if (createdAt && createdAt < cutoffMs) continue;

        const row = await resolveAppUser(supabase, au.id, email, au.user_metadata || null);
        if (row?.id) {
          created += 1;
          knownIds.add(au.id);
          knownEmails.add(email);
        }
      }
      if (users.length < 200) break;
      page += 1;
    }
  } catch (err: any) {
    console.warn('[Auth Reconcile] failed:', err?.message || err);
  }

  if (created || synced) {
    console.log(`[Auth Reconcile] created=${created} synced=${synced}`);
  }
  return { created, synced };
}

/**
 * Require a valid Bearer JWT. X-User-ID alone is never sufficient.
 * Role is read from the users table (linked by Auth id, or email when needed).
 */
export const verifyAuth = async (req: any, supabase: SupabaseClient): Promise<AuthResult> => {
  // Reuse the result within one request (the API gate and the handler both ask).
  const cacheKey = String(req?.headers?.authorization || '');
  if (req && cacheKey && req.__awcAuthCache?.key === cacheKey) return req.__awcAuthCache.promise;
  const promise = verifyAuthUncached(req, supabase);
  if (req && cacheKey) {
    try {
      Object.defineProperty(req, '__awcAuthCache', { value: { key: cacheKey, promise }, configurable: true, writable: true });
    } catch {
      /* frozen request object — skip caching */
    }
  }
  return promise;
};

const verifyAuthUncached = async (req: any, supabase: SupabaseClient): Promise<AuthResult> => {
  try {
    const authHeader = req.headers?.authorization;
    console.log(`[Auth Check] Authorization: ${authHeader ? 'Present' : 'Missing'}`);

    if (!authHeader) {
      console.log('[Auth Check] FAILED: Missing Authorization header');
      return { user: null, role: null };
    }

    const token = Array.isArray(authHeader)
      ? authHeader[0].replace(/^Bearer\s+/i, '')
      : String(authHeader).replace(/^Bearer\s+/i, '');

    if (!token || token === 'undefined' || token === 'active' || token.split('.').length !== 3) {
      console.log('[Auth Check] FAILED: Invalid or placeholder token');
      return { user: null, role: null };
    }

    const { data: { user }, error } = await withSupabaseTimeout(
      supabase.auth.getUser(token),
      12_000,
      'auth.getUser'
    );
    if (error || !user) {
      console.log(`[Auth Check] FAILED: ${error?.message || 'No user for token'}`);
      return { user: null, role: null };
    }

    const userId = user.id;
    const email = user.email;
    const metadata = user.user_metadata;

    const userData = await resolveAppUser(supabase, userId, email, metadata);

    const role = userData?.role || 'PENDING';
    console.log(`[Auth Check] SUCCESS: User ${email || userId} authenticated with role ${role}`);

    return {
      user: {
        id: userId,
        email: email || userData?.email,
        metadata,
        name: userData?.name || metadata?.full_name || metadata?.name,
        title: userData?.title || metadata?.title,
      },
      role,
    };
  } catch (err: any) {
    console.error('[Auth Check] CRITICAL ERROR:', err.message);
    return { user: null, role: null };
  }
};

/** Return 401 JSON if auth failed; otherwise return the auth result. */
export const requireAuth = async (req: any, res: any, supabase: SupabaseClient): Promise<AuthResult | null> => {
  const auth = await verifyAuth(req, supabase);
  if (!auth.user) {
    res.status(401).json({ ok: false, error: 'Unauthorized: valid Bearer token required' });
    return null;
  }
  return auth;
};

export const FINANCE_ROLES = new Set([
  'SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE',
]);
