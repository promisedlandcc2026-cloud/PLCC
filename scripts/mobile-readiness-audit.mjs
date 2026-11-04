#!/usr/bin/env node
/**
 * PLCC Vault — Mobile readiness audit (static + optional authenticated live).
 *
 * Static (default): README Mobile Responsiveness Contract coverage in source.
 * Live: Playwright at 320/390 — overflow + sub-44px targets.
 * Auth live: sign in with email/password (or inject a token) and audit member routes.
 *
 * Usage:
 *   node scripts/mobile-readiness-audit.mjs
 *   node scripts/mobile-readiness-audit.mjs --live https://plcc-opal.vercel.app
 *   node scripts/mobile-readiness-audit.mjs --live https://plcc-opal.vercel.app --auth
 *
 * Auth credentials (never commit these):
 *   MOBILE_AUDIT_EMAIL / MOBILE_AUDIT_PASSWORD
 *   or AWC_AUDIT_EMAIL / AWC_AUDIT_PASSWORD
 *   optional: MOBILE_AUDIT_ACCESS_TOKEN (Bearer) + MOBILE_AUDIT_REFRESH_TOKEN
 *   loads .env.local / .env.diagnostic.local when present
 *
 * Requires for --live: npm i -D playwright && npx playwright install chromium
 * Exit 0 informational; --strict fails on static contract gaps.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pagesDir = join(root, 'pages');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const wantAuth = args.includes('--auth');
const liveIdx = args.indexOf('--live');
const liveBase = liveIdx >= 0 ? String(args[liveIdx + 1] || '').replace(/\/$/, '') : '';

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env) || !process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(join(root, '.env.local'));
loadEnvFile(join(root, '.env.diagnostic.local'));

function env(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function rel(p) {
  return relative(root, p).replace(/\\/g, '/');
}

function supabaseStorageKey(supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).hostname.split('.')[0];
    return `sb-${host}-auth-token`;
  } catch {
    return 'sb-auth-token';
  }
}

const pages = walk(pagesDir);
const withResponsive = [];
const withoutResponsive = [];
const withTable = [];
const withSafeArea = [];
const withTouchFloor = [];

for (const p of pages) {
  const src = readFileSync(p, 'utf8');
  const r = rel(p);
  if (/ResponsivePage/.test(src)) withResponsive.push(r);
  else withoutResponsive.push(r);
  if (/<table[\s>]/.test(src)) withTable.push(r);
  if (/safe-area-inset/.test(src)) withSafeArea.push(r);
  if (/min-h-\[(?:44|48)px\]|min-w-\[(?:44|48)px\]/.test(src)) withTouchFloor.push(r);
}

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const hasViewport = /name=["']viewport["']/.test(indexHtml);
const viewportFit = /viewport-fit=cover/.test(indexHtml);
const mobileNav = existsSync(join(root, 'components/Layout/MobileBottomNav.tsx'))
  ? readFileSync(join(root, 'components/Layout/MobileBottomNav.tsx'), 'utf8')
  : '';
const mobileNavSafe = /safe-area-inset-bottom/.test(mobileNav);

const criticalWithoutWrapper = withoutResponsive.filter((r) =>
  /pages\/(community\/Chat|attendance\/|auth\/LoginPortal|giving\/|events\/KidsKiosk|Dashboard)/.test(
    r
  )
);

console.log('\n=== PLCC Vault mobile readiness audit (static) ===\n');
console.log(`Pages scanned:              ${pages.length}`);
console.log(
  `ResponsivePage used:        ${withResponsive.length} (${Math.round((withResponsive.length / pages.length) * 100)}%)`
);
console.log(`Missing ResponsivePage:     ${withoutResponsive.length}`);
console.log(`Pages with <table>:         ${withTable.length}`);
console.log(`Pages with safe-area CSS:   ${withSafeArea.length}`);
console.log(`Pages with 44/48px floors:  ${withTouchFloor.length}`);
console.log(
  `index.html viewport meta:   ${hasViewport ? 'yes' : 'NO'}${viewportFit ? ' (viewport-fit=cover)' : ''}`
);
console.log(`MobileBottomNav safe-area:  ${mobileNavSafe ? 'yes' : 'NO'}`);

if (criticalWithoutWrapper.length) {
  console.log('\nCritical routes missing ResponsivePage (may still be OK via AppShell):');
  for (const r of criticalWithoutWrapper) console.log(`  - ${r}`);
}

console.log('\nContract gaps (informational):');
const gaps = [];
if (!hasViewport) gaps.push('Missing viewport meta in index.html');
if (!mobileNavSafe) gaps.push('MobileBottomNav missing safe-area-inset-bottom');
if (withResponsive.length / pages.length < 0.25) {
  gaps.push(
    `ResponsivePage coverage low (${withResponsive.length}/${pages.length}) — README requires it on new pages`
  );
}
if (withTable.length > 0) {
  gaps.push(
    `${withTable.length} pages still use <table> — verify card-grid fallback under 768px`
  );
}
if (gaps.length === 0) console.log('  (none flagged)');
else for (const g of gaps) console.log(`  • ${g}`);

console.log('\nSample pages missing ResponsivePage:');
for (const r of withoutResponsive.slice(0, 15)) console.log(`  - ${r}`);
if (withoutResponsive.length > 15) console.log(`  … +${withoutResponsive.length - 15} more`);

const PUBLIC_ROUTES = ['#/login', '#/help/member-setup'];
const AUTH_ROUTES = [
  '#/dashboard',
  '#/community/chat',
  '#/community/prayer-wall',
  '#/attendance/sessions',
  '#/events/overview',
  '#/members',
  '#/giving/transactions',
];

async function resolveAuthSession() {
  const supabaseUrl = env('VITE_SUPABASE_URL', 'SUPABASE_URL');
  const anonKey = env('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
  const accessToken = env('MOBILE_AUDIT_ACCESS_TOKEN', 'AWC_AUDIT_ACCESS_TOKEN');
  const refreshToken = env('MOBILE_AUDIT_REFRESH_TOKEN', 'AWC_AUDIT_REFRESH_TOKEN');
  const email = env('MOBILE_AUDIT_EMAIL', 'AWC_AUDIT_EMAIL');
  const password = env('MOBILE_AUDIT_PASSWORD', 'AWC_AUDIT_PASSWORD');

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'Auth live needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (from .env.local)'
    );
  }

  const storageKey = supabaseStorageKey(supabaseUrl);
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (accessToken) {
    if (refreshToken) {
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error || !data.session) {
        throw new Error(`setSession failed: ${error?.message || 'no session'}`);
      }
      return { session: data.session, storageKey, label: 'token+refresh' };
    }
    // Access token only — seed awc_auth_token; some routes need full Supabase session.
    return {
      session: {
        access_token: accessToken,
        refresh_token: '',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: null,
      },
      storageKey,
      label: 'access-token-only',
      warn: 'No refresh token — prefer email/password or ACCESS+REFRESH pair',
    };
  }

  if (!email || !password) {
    throw new Error(
      'Auth live needs MOBILE_AUDIT_EMAIL + MOBILE_AUDIT_PASSWORD (or AWC_AUDIT_*)'
    );
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`signInWithPassword failed: ${error?.message || 'no session'}`);
  }
  return {
    session: data.session,
    storageKey,
    label: `password (${email.replace(/(.{2}).+(@.+)/, '$1…$2')})`,
  };
}

async function injectAuth(page, { session, storageKey }) {
  await page.addInitScript(
    ({ key, sess, token }) => {
      try {
        localStorage.setItem('awc_auth_token', token);
        if (sess) localStorage.setItem(key, JSON.stringify(sess));
      } catch {
        /* ignore */
      }
    },
    {
      key: storageKey,
      sess: session,
      token: String(session.access_token || ''),
    }
  );
}

async function measurePage(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(doc.scrollWidth, body.scrollWidth);
    const clientW = doc.clientWidth;
    const small = [];
    for (const el of document.querySelectorAll(
      'button, a, [role=button], input, select, textarea, [role=tab]'
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.width < 44 || r.height < 44) {
        const label = (
          el.getAttribute('aria-label') ||
          el.textContent ||
          el.tagName ||
          ''
        )
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 50);
        small.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
        if (small.length >= 8) break;
      }
    }
    const onLogin =
      /login/i.test(location.hash) || /Login/i.test(document.title || '');
    return {
      title: document.title,
      hash: location.hash,
      overflowX: scrollW - clientW,
      small,
      onLogin,
    };
  });
}

async function runLive(base) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log(
      '\nLive audit skipped: install Playwright to enable (`npm i -D playwright && npx playwright install chromium`).'
    );
    return;
  }

  let authBundle = null;
  if (wantAuth) {
    try {
      authBundle = await resolveAuthSession();
      console.log(
        `\nAuth: signed in as ${authBundle.label}${authBundle.warn ? ` — ${authBundle.warn}` : ''}`
      );
    } catch (e) {
      console.error(`\nAuth failed: ${e.message || e}`);
      process.exitCode = 1;
      return;
    }
  } else if (liveBase) {
    console.log('\nLive (public only). Pass --auth + MOBILE_AUDIT_EMAIL/PASSWORD for member routes.');
  }

  const routes = wantAuth ? [...PUBLIC_ROUTES, ...AUTH_ROUTES] : PUBLIC_ROUTES;
  const viewports = [
    { name: 'iPhone-SE', width: 320, height: 568 },
    { name: 'iPhone-14', width: 390, height: 844 },
  ];

  console.log(`\n=== Live audit against ${base}${wantAuth ? ' (authenticated)' : ''} ===\n`);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      if (authBundle) await injectAuth(page, authBundle);

      for (const hash of routes) {
        const url = `${base}/${hash}`;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          await page.waitForTimeout(1000);
          const metrics = await measurePage(page);
          const overflowOk = metrics.overflowX <= 1;
          const authExpected = wantAuth && AUTH_ROUTES.includes(hash);
          const bouncedToLogin = authExpected && metrics.onLogin;
          const status = bouncedToLogin ? 'AUTH' : overflowOk ? 'OK' : 'FAIL';
          console.log(
            `${status.padEnd(4)} ${vp.name.padEnd(10)} ${hash.padEnd(28)} overflowX=${metrics.overflowX} smallTargets=${metrics.small.length}  ${metrics.title}`
          );
          if (bouncedToLogin) {
            console.log('       · still on login — check credentials / session inject');
          }
          if (metrics.small.length) {
            for (const t of metrics.small.slice(0, 4)) {
              console.log(`       · ${t.w}×${t.h}  ${t.label || '(untitled)'}`);
            }
          }
        } catch (e) {
          console.log(`ERR  ${vp.name.padEnd(10)} ${hash.padEnd(28)} ${e.message || e}`);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

if (liveBase) {
  await runLive(liveBase);
} else {
  console.log('\nTip:');
  console.log('  node scripts/mobile-readiness-audit.mjs --live https://plcc-opal.vercel.app');
  console.log(
    '  node scripts/mobile-readiness-audit.mjs --live https://plcc-opal.vercel.app --auth'
  );
  console.log('  (set MOBILE_AUDIT_EMAIL + MOBILE_AUDIT_PASSWORD in the environment)');
}

console.log('\nDone.\n');
if (strict && gaps.length) process.exit(1);
