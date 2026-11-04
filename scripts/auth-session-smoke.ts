/**
 * PLCC Vault — auth session desync smoke (pure helpers + source contracts).
 * Run: npx tsx scripts/auth-session-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_AUTH_STORAGE_KEYS,
  clearAppAuthStorage,
  decideBootAuthFromSession,
  handleProtectedApiUnauthorized,
  hasRecoverableSession,
  isAuthLandingHash,
  isJwtAccessToken,
  mirrorAccessToken,
  PREVIEW_AUTH_TESTING_RULE,
  registerUnrecoverableAuthHandler,
  sanitizeReturnTo,
  returnToFromRouterLocation,
  shouldAttemptAuthRecovery,
  shouldForceLogoutOnStatus,
  haltAuthPolling,
  isAuthPollingHalted,
  isNetworkAuthError,
  onAuthPollingChange,
  resumeAuthPolling,
  SESSION_EXPIRED_MESSAGE,
} from '../lib/authSession.js';
import { nextPollDelayMs } from '../lib/useVaultPoll.js';
import {
  formatAccountContact,
  isPhonePlaceholderEmail,
} from '../api/_utils/authPhone.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function main() {
  const jwt = 'aaa.bbb.ccc';

  console.log('Auth session smoke — token + boot decisions');

  assert(isJwtAccessToken(jwt) === true, 'A: JWT-shaped token accepted');
  assert(isJwtAccessToken('active') === false, 'B: placeholder active rejected');
  assert(isJwtAccessToken('') === false, 'B: empty token rejected');

  assert(
    decideBootAuthFromSession({ access_token: jwt, user: { id: 'u1' } }).authenticated === true,
    'A: valid session at boot → authenticated'
  );
  assert(
    decideBootAuthFromSession(null).authenticated === false,
    'B: no Supabase session → signed out'
  );
  assert(
    decideBootAuthFromSession({ access_token: 'active', user: { id: 'u1' } }).authenticated === false,
    'C: invalid session token → not authenticated'
  );
  assert(hasRecoverableSession({ access_token: jwt }) === true, 'A: recoverable session');
  assert(hasRecoverableSession(null) === false, 'C: null session unrecoverable');

  console.log('\nAuth session smoke — storage clear + mirror');

  const mem: Record<string, string> = {
    awc_auth_token: jwt,
    awc_user_id: 'stale-user',
    awc_user_name: 'Stale Name',
    awc_user_role: 'SUPER_ADMIN',
    awc_user_email: 'stale@example.com',
    awc_last_user_name: 'keep-me',
  };
  const storage = {
    setItem: (k: string, v: string) => {
      mem[k] = v;
    },
    removeItem: (k: string) => {
      delete mem[k];
    },
    getItem: (k: string) => mem[k] ?? null,
  };

  clearAppAuthStorage(storage);
  for (const key of APP_AUTH_STORAGE_KEYS) {
    assert(mem[key] == null, `B/E/F: cleared ${key}`);
  }
  assert(mem.awc_last_user_name === 'keep-me', 'F: farewell name key preserved');

  mirrorAccessToken(jwt, storage);
  assert(mem.awc_auth_token === jwt, 'D: TOKEN_REFRESHED-style mirror writes awc_auth_token');
  mirrorAccessToken('active', storage);
  assert(mem.awc_auth_token === jwt, 'D: mirror ignores non-JWT');

  console.log('\nAuth session smoke — API failure classification');

  assert(shouldAttemptAuthRecovery(401) === true, 'G: 401 attempts auth recovery');
  assert(shouldForceLogoutOnStatus(401) === true, 'G: 401 may clear unrecoverable session');
  assert(shouldAttemptAuthRecovery(403) === false, 'H: 403 does not trigger auth recovery');
  assert(shouldForceLogoutOnStatus(403) === false, 'H: 403 does not force logout');
  assert(shouldAttemptAuthRecovery(500) === false, 'I: 500 does not trigger auth recovery');
  assert(shouldForceLogoutOnStatus(500) === false, 'I: 500 does not force logout');

  const flag = { cleared: false };
  registerUnrecoverableAuthHandler(() => {
    flag.cleared = true;
  });

  const recovered = await handleProtectedApiUnauthorized({
    getSession: async () => ({ access_token: jwt, user: { id: 'u1' } }),
  });
  assert(recovered === 'recovered', 'G: recoverable session after 401 keeps auth');
  assert(flag.cleared === false, 'G: recoverable path does not clear UI handler');

  const wiped = await handleProtectedApiUnauthorized({
    getSession: async () => null,
  });
  assert(wiped === 'cleared', 'G: unrecoverable 401 clears session');
  assert(flag.cleared === true, 'E/G: SIGNED_OUT-style clear handler invoked');
  registerUnrecoverableAuthHandler(null);

  console.log('\nAuth session smoke — returnTo sanitize');

  assert(sanitizeReturnTo('/community/chat') === '/community/chat', 'K: internal returnTo ok');
  assert(sanitizeReturnTo('#/community/chat') === '/community/chat', 'K: hash prefix stripped');
  assert(sanitizeReturnTo('https://evil.example') === null, 'K: absolute URL rejected');
  assert(sanitizeReturnTo('//evil.example') === null, 'K: protocol-relative rejected');
  assert(sanitizeReturnTo('javascript:alert(1)') === null, 'K: javascript: rejected');
  assert(sanitizeReturnTo('/login') === null, 'K: login loop target rejected');
  assert(sanitizeReturnTo('/farewell') === null, 'K: farewell loop target rejected');
  assert(isAuthLandingHash('#/login') === true, 'K: login is auth landing');
  assert(isAuthLandingHash('#/farewell') === true, 'K: farewell is auth landing');
  assert(isAuthLandingHash('#/dashboard') === false, 'K: dashboard is not auth landing');
  assert(
    sanitizeReturnTo('/community/chat?channel=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') ===
      '/community/chat?channel=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'K: pathname + search allowed'
  );
  assert(
    sanitizeReturnTo('/community/chat?channel=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb&huddle=1') ===
      '/community/chat?channel=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb&huddle=1',
    'K: channel + huddle intent allowed'
  );
  assert(
    returnToFromRouterLocation({ pathname: '/community/chat', search: '' }) === '/community/chat',
    'K: pathname-only location survives'
  );
  assert(
    returnToFromRouterLocation({
      pathname: '/community/chat',
      search: '?channel=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    }) === '/community/chat?channel=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'K: pathname + search location survives'
  );
  assert(
    returnToFromRouterLocation({
      pathname: '/community/chat',
      search: '?channel=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb&huddle=1',
    }) === '/community/chat?channel=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb&huddle=1',
    'K: pathname + channel + huddle survives'
  );
  assert(
    returnToFromRouterLocation({ pathname: 'https://evil.example', search: '?x=1' }) === null,
    'K: malformed router location rejected'
  );
  assert(returnToFromRouterLocation(null) === null, 'K: null location falls back safely');

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const loginSrc = readFileSync(join(root, 'pages/auth/LoginPortal.tsx'), 'utf8');
  assert(/returnToFromRouterLocation/.test(loginSrc), 'K: LoginPortal uses pathname+search helper');
  assert(!/from\?\.pathname\)/.test(loginSrc), 'K: LoginPortal no longer restores pathname alone');
  assert(
    /notification_prefs\?\.onboarding\?\.completedAt/.test(loginSrc) &&
      /role !== 'PENDING'/.test(loginSrc) &&
      /nameIsEmailLocal/.test(loginSrc),
    'Onboarding: PENDING / email-local names do not skip /onboarding'
  );

  const authLinkSrc = readFileSync(join(root, 'api/_utils/auth.ts'), 'utf8');
  assert(
    /ensureMemberForUser/.test(authLinkSrc) &&
      /Created PENDING stub/.test(authLinkSrc) &&
      /notification_prefs/.test(authLinkSrc),
    'Auth link: PENDING stub syncs Members + exposes notification_prefs'
  );
  assert(
    /Do not invent a name from the email local-part/.test(authLinkSrc),
    'Auth link: stub name is not invented from email local-part'
  );
  assert(
    /export async function reconcileAuthPendingSignups/.test(authLinkSrc),
    'Auth reconcile: Auth-only signups surfaced for Staff & Roles'
  );
  assert(
    /jerless/i.test(authLinkSrc) && /@awc-vault\.local/.test(authLinkSrc),
    'Auth reconcile: skips local QA / jerless test emails'
  );
  const ensureMemberSrc = readFileSync(join(root, 'api/_utils/ensureMemberForUser.ts'), 'utf8');
  assert(/export async function ensureMemberForUser/.test(ensureMemberSrc), 'Members sync helper exported');
  assert(
    /isPendingRole \? 'Visitor' : 'Active'/.test(ensureMemberSrc) &&
      /memberUpdates\.status = 'Visitor'/.test(ensureMemberSrc),
    'Members sync: PENDING accounts use Visitor status'
  );
  assert(
    /Visitor/.test(ensureMemberSrc) && /status = 'Active'/.test(ensureMemberSrc),
    'Members sync: approved logins promote Visitor to Active'
  );

  const onboardSrc = readFileSync(join(root, 'pages/auth/OnboardingProcess.tsx'), 'utf8');
  assert(
    /Welcome to PLCC Vault/.test(onboardSrc) &&
      !/Church staff will welcome you and assign full access/.test(onboardSrc),
    'Onboarding: welcome copy without staff-approval gate messaging'
  );

  const mediaNoticeSrc = readFileSync(join(root, 'components/Consent/MediaNoticeModal.tsx'), 'utf8');
  assert(
    /MEDIA_NOTICE_VERSION/.test(mediaNoticeSrc) &&
      /mediaNotice/.test(mediaNoticeSrc) &&
      /awc_media_notice_dismissed/.test(mediaNoticeSrc) &&
      /I acknowledge/.test(mediaNoticeSrc),
    'Media notice: acknowledgment modal with prefs + session dismiss'
  );
  const appShellSrc = readFileSync(join(root, 'components/Layout/AppShell.tsx'), 'utf8');
  assert(/MediaNoticeModal/.test(appShellSrc), 'Media notice: gated from AppShell after login');

  // OTP Confirm Identity — visible errors, loading, 6-digit paste (no hard-coded slice bug)
  assert(/stage === 'otp'[\s\S]*\{error &&/.test(loginSrc), 'OTP: Verify stage renders error');
  assert(
    /otpLoading \? <Loader2 className="animate-spin" size=\{18\} \/> : 'Confirm Identity'/.test(loginSrc),
    'OTP: Confirm Identity shows loading state'
  );
  assert(/OTP_BOX_COUNT\s*=\s*6/.test(loginSrc), 'OTP: shows 6 digit boxes');
  assert(/OTP_MAX_LEN\s*=\s*6/.test(loginSrc), 'OTP: accepts 6 digits');
  assert(/\.slice\(0,\s*OTP_MAX_LEN\)/.test(loginSrc), 'OTP: paste uses OTP_MAX_LEN');
  assert(/onComplete:\s*\(digits:\s*string\[\]\)\s*=>\s*void/.test(loginSrc), 'OTP: onComplete receives latest digits');
  assert(/await handleAuthSuccess/.test(loginSrc), 'OTP: awaits handleAuthSuccess after verify');

  const authOtpSrc = readFileSync(join(root, 'lib/authOtp.ts'), 'utf8');
  assert(/type:\s*'magiclink'/.test(authOtpSrc), 'OTP: email verify retries magiclink on mismatch');
  assert(/invalid or expired/.test(authOtpSrc), 'OTP: null session has clear error');
  assert(/shouldCreateUser:\s*true/.test(authOtpSrc), 'OTP: send allows create for missing auth users');
  assert(/normalizeAuthEmail/.test(authOtpSrc), 'OTP: normalizes WebKit autofill emails');
  assert(/withAuthTimeout/.test(authOtpSrc), 'OTP: auth requests have a timeout');
  assert(/resource=auth-otp/.test(authOtpSrc), 'OTP: same-origin auth-otp proxy for WebKit');
  assert(
    /signInWithOtp\(\{[\s\S]*?email:\s*cleanEmail[\s\S]*?shouldCreateUser:\s*true[\s\S]*?\}\)/.test(authOtpSrc) &&
      !/emailRedirectTo/.test(authOtpSrc),
    'OTP: send omits emailRedirectTo'
  );
  assert(/readIdentifierFromDom|identifierInputRef/.test(loginSrc), 'OTP: Safari autofill reads DOM');
  assert(/otpLoading|passkeyLoading/.test(loginSrc), 'OTP: separate OTP vs passkey loading');

  const coreSrc = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  assert(
    /reconcileAuthPendingSignups/.test(coreSrc),
    'Admin users GET reconciles Auth-only pending signups'
  );
  assert(
    /onboardingCompletedAt/.test(coreSrc) &&
      /safeUpdates\.role = 'MEMBER'/.test(coreSrc),
    'Onboarding PATCH auto-approves PENDING users as MEMBER'
  );
  assert(/handleAuthOtp|auth-otp/.test(coreSrc), 'OTP: server auth-otp handler wired');
  assert(/case 'auth-phone'/.test(coreSrc), 'Phone: auth-phone route wired');
  assert(/signInWithPhonePassword/.test(authOtpSrc), 'Phone: client sign-in helper');
  assert(/signUpWithPhone/.test(authOtpSrc), 'Phone: client sign-up helper');
  assert(/stage === 'password'/.test(loginSrc), 'Phone: login password stage');
  assert(
    /await dispatchOtp\('email'/.test(loginSrc) || /dispatchOtp\('email'/.test(loginSrc),
    'Login: email identifier still sends OTP by default'
  );
  assert(/Use password instead/.test(loginSrc), 'Login: email OTP offers Use password instead');
  assert(/Use email code instead/.test(loginSrc), 'Login: email password can return to OTP');
  assert(
    /Use the password from when you created your account/.test(loginSrc),
    'Login: email password helper copy'
  );
  const authPhoneSrc = readFileSync(join(root, 'api/_utils/authPhone.ts'), 'utf8');
  assert(/handleAuthPhone/.test(authPhoneSrc), 'Phone: server handler exists');
  assert(/phone\.awcvault\.invalid/.test(authPhoneSrc), 'Phone: placeholder email for phone-only accounts');
  assert(/formatAccountContact/.test(authPhoneSrc), 'Phone: public contact formatter hides .invalid');
  const adminUsersSrc = readFileSync(join(root, 'pages/admin/AdminUsers.tsx'), 'utf8');
  assert(/formatAccountContact/.test(adminUsersSrc), 'Phone: staff users list hides placeholder email');
  assert(
    formatAccountContact('15089331804@phone.awcvault.invalid') === '+1 (508) 933-1804',
    'Phone: placeholder email displays as a phone number'
  );
  assert(
    isPhonePlaceholderEmail('15089331804@phone.awcvault.invalid') === true,
    'Phone: detects placeholder Auth email'
  );
  assert(
    isPhonePlaceholderEmail('pastor@plcc.church') === false,
    'Phone: real email is not a placeholder'
  );

  console.log('\nAuth session smoke — source contracts');

  const appSrc = readFileSync(join(root, 'App.tsx'), 'utf8');
  const apiSrc = readFileSync(join(root, 'lib/api.ts'), 'utf8');

  assert(/authReady/.test(appSrc), 'J: App exposes authReady');
  assert(/AuthBootScreen|Checking sign-in/.test(appSrc), 'J: ProtectedRoute boot loading state');
  assert(/onAuthStateChange/.test(appSrc), 'E: App registers onAuthStateChange');
  assert(/decideBootAuthFromSession|getSession\(/.test(appSrc), 'A/B: boot uses live session');
  assert(/refreshVaultProfileFromApi|users&self=true/.test(appSrc), 'role refresh after Staff & Roles approval');
  assert(
    !/useState\(\(\) => !!localStorage\.getItem\('awc_auth_token'\)\)/.test(appSrc),
    'B: no stale-token isAuthenticated init'
  );
  assert(/getSession\(\)/.test(apiSrc), 'getAuthHeaders prefers getSession');
  assert(!/ensureFreshAuthSession\(/.test(apiSrc), 'G: getAuthHeaders does not race a proactive refresh');
  assert(
    !/localStorage\.getItem\('awc_auth_token'\)/.test(apiSrc),
    'G: stale awc_auth_token is never sent after the session is gone'
  );
  assert(/export async function vaultFetch/.test(apiSrc), 'G: central vaultFetch wrapper exists');
  assert(/outcome !== 'recovered'/.test(apiSrc), 'G: vaultFetch retries once after recovered 401');
  assert(/shouldAttemptAuthRecovery/.test(apiSrc), 'G: vaultFetch recovers on 401 only');
  assert(/return vaultFetch\(path, options\)/.test(apiSrc), 'G: fetchAuthorized goes through vaultFetch');
  assert(
    /vaultFetch\(path, \{ \.\.\.rest, timeoutMs \}\)/.test(apiSrc),
    'G: apiFetch goes through vaultFetch'
  );
  const authedFetchSrc = readFileSync(join(root, 'lib/authedFetch.ts'), 'utf8');
  assert(/vaultFetch/.test(authedFetchSrc), 'G: authedFetch goes through vaultFetch');
  assert(/X-User-ID/.test(apiSrc), 'X-User-ID still sent as non-auth header');
  assert(
    PREVIEW_AUTH_TESTING_RULE.includes('stable Vercel branch alias'),
    'Preview hostname rule documented'
  );

  const authSessionSrc = readFileSync(join(root, 'lib/authSession.ts'), 'utf8');
  assert(/ensureFreshAuthSession/.test(authSessionSrc), 'session keep-alive helper exists');
  assert(/AUTH_SESSION_REFRESH_LEAD_MS\s*=\s*90_000/.test(authSessionSrc), 'API refresh lead is ~90s (not 10m)');
  assert(/ensureFreshInFlight/.test(authSessionSrc), 'session refresh is single-flight');
  assert(/refreshSession/.test(authSessionSrc), '401 recovery refreshes the live session');
  assert(/isAuthLandingHash/.test(authSessionSrc), 'Farewell protected from 401 login redirect');
  assert(/#\/farewell/.test(authSessionSrc), 'Farewell hash listed in auth landing guard');
  assert(
    /SIGNED_OUT[\s\S]*getSession\(\)[\s\S]*hasRecoverableSession/.test(appSrc),
    'SIGNED_OUT re-checks live session before clearing (tab-wake soft clear)'
  );
  assert(
    /hash = '#\/farewell'[\s\S]*clearLocalIdentity[\s\S]*signOut/.test(appSrc) ||
      /location\.hash = '#\/farewell'[\s\S]*clearLocalIdentity[\s\S]*signOut/.test(appSrc),
    'Logout navigates to farewell before signOut'
  );

  console.log('\nAuth session smoke — local sign-out, single refresh, poller halt');

  const allSources = [appSrc, apiSrc, authSessionSrc, authedFetchSrc].join('\n');
  assert(!/\.signOut\(\s*\)/.test(allSources), 'no default (global) signOut() in app auth code');
  assert(/signOut\(\{ scope: 'local' \}\)/.test(authSessionSrc), 'signOutLocal uses scope: local');
  assert(/signOutLocal\(\)/.test(appSrc), 'logout uses signOutLocal');
  assert(/haltAuthPolling\(\)[\s\S]*signOutLocal/.test(appSrc), 'logout halts pollers before sign-out');
  assert(/let refreshInFlight/.test(authSessionSrc), 'refreshSessionOnce shares one in-flight promise');
  assert(
    !/recoveryInFlight\) return 'skipped'/.test(authSessionSrc),
    'parallel 401s await the shared refresh instead of skipping'
  );
  assert(
    /if \(error\) return \{ ok: false/.test(authSessionSrc),
    'refresh error (400 / invalid refresh token) is terminal — no stale-JWT fallback'
  );
  assert(/setSessionExpiredNotice\(\)/.test(authSessionSrc), 'expiry stores the login notice');
  assert(
    SESSION_EXPIRED_MESSAGE === 'Your session expired — please sign in again',
    'friendly expired-session copy'
  );
  assert(/peekSessionExpiredNotice/.test(loginSrc), 'LoginPortal shows the expired-session notice');
  assert(
    /SIGNED_OUT[\s\S]*haltAuthPolling\(\)/.test(appSrc),
    'onAuthStateChange SIGNED_OUT halts pollers'
  );
  assert(
    /clearLocalIdentity\(\);[\s\S]*?isAuthLandingHash\(window\.location\.hash\)[\s\S]*?'#\/login'/.test(appSrc),
    'confirmed SIGNED_OUT routes to login unless on farewell/login/help'
  );

  resumeAuthPolling();
  let haltCalls = 0;
  const unsub = onAuthPollingChange((halted) => {
    if (halted) haltCalls += 1;
  });
  haltAuthPolling();
  haltAuthPolling();
  assert(isAuthPollingHalted() === true, 'haltAuthPolling stops pollers');
  assert(haltCalls === 1, 'halt notifies listeners once');
  const halted401 = await handleProtectedApiUnauthorized({ failedToken: jwt });
  assert(halted401 === 'cleared', 'halted session never starts another refresh');
  resumeAuthPolling();
  assert(isAuthPollingHalted() === false, 'resumeAuthPolling re-enables pollers after login');
  unsub();

  assert(isNetworkAuthError({ name: 'AuthRetryableFetchError' }) === true, 'retryable fetch error is network');
  assert(isNetworkAuthError({ name: 'AuthApiError', status: 400 }) === false, '400 refresh is terminal');

  console.log('\nAuth session smoke — poll backoff');

  assert(nextPollDelayMs(5_000, 0) === 5_000, 'success keeps normal interval');
  assert(nextPollDelayMs(5_000, 1) === 5_000, 'backoff step 1 = 5s');
  assert(nextPollDelayMs(5_000, 2) === 10_000, 'backoff step 2 = 10s');
  assert(nextPollDelayMs(5_000, 3) === 30_000, 'backoff step 3 = 30s');
  assert(nextPollDelayMs(5_000, 9) === 30_000, 'backoff caps at 30s');
  assert(nextPollDelayMs(60_000, 1) === 60_000, 'backoff never speeds up a slow poll');
  for (const p of [
    'components/Layout/Sidebar.tsx',
    'components/Layout/MobileBottomNav.tsx',
    'components/Layout/Topbar.tsx',
    'pages/churchProfile/components/Navigation.tsx',
    'pages/community/Chat.tsx',
    'pages/community/DM.tsx',
  ]) {
    const src = readFileSync(join(root, p), 'utf8');
    assert(/useVaultPoll\(/.test(src), `${p} polls through useVaultPoll`);
  }

  console.log('\nAll auth session smoke tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
