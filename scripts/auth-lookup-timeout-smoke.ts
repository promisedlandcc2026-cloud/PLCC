/**
 * Nov 20 2026 incident (1:39–1:46 pm ET): Supabase slowed down, `users.byId` timed out after 8s,
 * and Canaan treated that like "not signed in" (401), so members were sent back to sign-in.
 * Now a slow/failed check is a temporary 503 ("try again"), the session is kept, and nobody gets
 * access until a check really succeeds. Also: profile changes always need a sign-in token.
 * Run: npx tsx scripts/auth-lookup-timeout-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTH_UNAVAILABLE_CODE,
  AuthServiceUnavailableError,
  isTransientSupabaseError,
  requireAuth,
  resolveAppUser,
  verifyAuth,
} from '../api/_utils/auth.js';
import { isTemporaryAuthFailure } from '../lib/authSession.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let passed = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const TOKEN = 'aaa.bbb.ccc';
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.org', user_metadata: {} };

/** Fake Supabase: auth.getUser result + what the users lookups return. */
function fakeSupabase(opts: {
  getUser?: () => Promise<any>;
  byId?: () => Promise<any>;
  byEmail?: () => Promise<any>;
  inserts?: any[];
}) {
  return {
    auth: { getUser: opts.getUser || (async () => ({ data: { user: USER }, error: null })) },
    from: (_table: string) => {
      let col = '';
      const q: any = {
        select: () => q,
        eq: (c: string) => {
          col = c;
          return q;
        },
        maybeSingle: () => (col === 'id' ? (opts.byId || (async () => ({ data: null, error: null })))() : (opts.byEmail || (async () => ({ data: null, error: null })))()),
        insert: (row: any) => {
          opts.inserts?.push(row);
          return q;
        },
        single: async () => ({ data: null, error: { message: 'insert blocked in test' } }),
      };
      return q;
    },
  } as any;
}

function fakeRes() {
  const out: any = { statusCode: 0, body: null, headers: {} as Record<string, string> };
  out.status = (c: number) => {
    out.statusCode = c;
    return out;
  };
  out.json = (b: any) => {
    out.body = b;
    return out;
  };
  out.setHeader = (k: string, v: string) => {
    out.headers[k] = v;
  };
  return out;
}
const req = () => ({ headers: { authorization: `Bearer ${TOKEN}` } });

async function main() {
  await ok('timeouts, overload and 5xx are temporary; "no rows" and bad tokens are not', () => {
    assert.equal(isTransientSupabaseError(new Error('users.byId timed out after 8000ms')), true);
    assert.equal(isTransientSupabaseError({ code: '57014', message: 'canceling statement due to statement timeout' }), true);
    assert.equal(isTransientSupabaseError({ status: 503, message: 'Service Unavailable' }), true);
    assert.equal(isTransientSupabaseError({ name: 'AuthRetryableFetchError', message: 'fetch failed' }), true);
    assert.equal(isTransientSupabaseError({ message: 'remaining connection slots are reserved' }), true);
    assert.equal(isTransientSupabaseError({ status: 401, message: 'invalid JWT' }), false);
    assert.equal(isTransientSupabaseError({ status: 403, message: 'User from sub claim in JWT does not exist' }), false);
    assert.equal(isTransientSupabaseError(null), false);
  });

  await ok('a failed users.byId lookup stops (no email lookup, no PENDING stub, no relink)', async () => {
    const inserts: any[] = [];
    let emailAsked = false;
    const sb = fakeSupabase({
      byId: async () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }),
      byEmail: async () => {
        emailAsked = true;
        return { data: null, error: null };
      },
      inserts,
    });
    await assert.rejects(resolveAppUser(sb, USER.id, USER.email), AuthServiceUnavailableError);
    assert.equal(emailAsked, false);
    assert.equal(inserts.length, 0);
  });

  await ok('a thrown lookup (network) is also temporary', async () => {
    const sb = fakeSupabase({ byId: async () => Promise.reject(new Error('fetch failed')) });
    await assert.rejects(resolveAppUser(sb, USER.id, USER.email), AuthServiceUnavailableError);
  });

  await ok('a failed email lookup is temporary too (never "no member")', async () => {
    const sb = fakeSupabase({ byEmail: async () => ({ data: null, error: { message: 'upstream request timeout' } }) });
    await assert.rejects(resolveAppUser(sb, USER.id, USER.email), AuthServiceUnavailableError);
  });

  await ok('verifyAuth: lookup timeout → unavailable (not signed out, no access)', async () => {
    const sb = fakeSupabase({ byId: async () => ({ data: null, error: { message: 'users.byId timed out after 8000ms' } }) });
    const r = await verifyAuth(req(), sb);
    assert.equal(r.unavailable, true);
    assert.equal(r.user, null, 'no access until the check succeeds');
    assert.equal(r.role, null);
  });

  await ok('verifyAuth: Supabase Auth 5xx/timeout → unavailable', async () => {
    const r1 = await verifyAuth(req(), fakeSupabase({ getUser: async () => ({ data: { user: null }, error: { status: 504, message: 'Gateway Timeout' } }) }));
    assert.equal(r1.unavailable, true);
    const r2 = await verifyAuth(req(), fakeSupabase({ getUser: async () => Promise.reject(new Error('auth.getUser timed out after 12000ms')) }));
    assert.equal(r2.unavailable, true);
  });

  await ok('verifyAuth: a really bad token is still signed out (401 path)', async () => {
    const r = await verifyAuth(req(), fakeSupabase({ getUser: async () => ({ data: { user: null }, error: { status: 401, message: 'invalid JWT' } }) }));
    assert.equal(r.unavailable, undefined);
    assert.equal(r.user, null);
  });

  await ok('verifyAuth: a good check still works', async () => {
    const r = await verifyAuth(req(), fakeSupabase({ byId: async () => ({ data: { id: USER.id, role: 'MEMBER', name: 'Mem Ber' }, error: null }) }));
    assert.equal(r.user?.id, USER.id);
    assert.equal(r.role, 'MEMBER');
  });

  await ok('requireAuth answers 503 + Retry-After with a retry message (not 401)', async () => {
    const res = fakeRes();
    const sb = fakeSupabase({ byId: async () => ({ data: null, error: { message: 'timed out' } }) });
    const r = await requireAuth(req(), res, sb);
    assert.equal(r, null);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, AUTH_UNAVAILABLE_CODE);
    assert.equal(res.body.retryable, true);
    assert.match(res.body.error, /still signed in/);
    assert.equal(res.headers['Retry-After'], '5');
  });

  await ok('apps keep the session on a temporary failure', () => {
    assert.equal(isTemporaryAuthFailure(503, { code: AUTH_UNAVAILABLE_CODE }), true);
    assert.equal(isTemporaryAuthFailure(504), true);
    assert.equal(isTemporaryAuthFailure(0), true);
    assert.equal(isTemporaryAuthFailure(401), false);
    assert.equal(isTemporaryAuthFailure(200), false);
  });

  await ok('the API gate answers 503 for every route when the check is unavailable', () => {
    const core = read('api/_utils/core.ts');
    assert.match(core, /if \(gateAuth\.unavailable\) return sendAuthUnavailable\(res\);/);
    assert.match(core, /if \(!res\.headersSent && isTransientSupabaseError\(err\)\) \{/);
  });

  await ok('security: profile changes always need a sign-in token (no x-user-id shortcut)', () => {
    const core = read('api/_utils/core.ts');
    assert.ok(!/isOnboardingPatch/.test(core));
    assert.match(core, /const effectiveUser = user;/);
  });

  await ok('sign-in screen: retries, then "Try again" — never falls back to PENDING/onboarding', () => {
    const login = read('pages/auth/LoginPortal.tsx');
    assert.match(login, /if \(isTemporaryAuthFailure\(res\.status, data\)\) \{/);
    assert.match(login, /if \(temporaryFailure\) \{\s*setVerifyRetry\(\{ user, accessToken \}\);\s*return;/);
    assert.match(login, /data-testid="verify-retry"/);
  });

  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
