/**
 * Phase 2.6E.2 — Vault staff card scanner UI source contracts.
 * Run: node --import tsx --test scripts/test-card-scanner-ui.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const connectRoot = join(root, '..', 'awc-connect-main');
const require = createRequire(import.meta.url);

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

async function loadUi() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import('../lib/cardScannerUi.ts');
}

describe('card scanner UI A–AK', async () => {
  const ui = await loadUi();
  const {
    CARD_SCANNER_ROLES,
    CARD_SCANNER_DENIED_ROLES,
    SCANNER_ROUTE,
    isValidCardToken,
    precheckScannedToken,
    mapResolverResponse,
    headlineForResult,
    dependentPickupDisclaimer,
    RESULT_AUTO_CLEAR_MS,
    SCANNER_UI_FORBIDDEN_ACTIONS,
  } = ui;

  const pageSrc = read('pages/people/CardScanner.tsx');
  const cameraSrc = read('components/people/CardScannerCamera.tsx');
  const resultSrc = read('components/people/CardScannerResult.tsx');
  const clientSrc = read('lib/cardScannerClient.ts');
  const uiSrc = read('lib/cardScannerUi.ts');
  const appSrc = read('App.tsx');
  const navSrc = read('lib/navBySection.tsx');
  const permSrc = read('lib/permissions.ts');
  const pkg = JSON.parse(read('package.json'));

  it('A: route exists', () => {
    assert.equal(SCANNER_ROUTE, '/people/card-scanner');
    assert.equal(appSrc.includes('path="/people/card-scanner"'), true);
    assert.equal(appSrc.includes('CardScannerPage'), true);
    assert.equal(existsSync(join(root, 'pages/people/CardScanner.tsx')), true);
  });

  it('B: protected via ProtectedRoute', () => {
    assert.match(appSrc, /path="\/people\/card-scanner"[^>]*ProtectedRoute|ProtectedRoute[^>]*CardScannerPage/);
    assert.equal(pageSrc.includes('hasPermission'), true);
    assert.equal(pageSrc.includes('AccessDenied'), true);
  });

  it('C–D: allowed and denied roles', () => {
    assert.deepEqual([...CARD_SCANNER_ROLES].sort(), [
      'ADMIN',
      'ADMIN_STAFF',
      'ASST_SECRETARY',
      'FIRST_LADY',
      'PASTOR',
      'SECRETARY',
      'SUPER_ADMIN',
    ].sort());
    for (const r of CARD_SCANNER_DENIED_ROLES) {
      assert.equal(CARD_SCANNER_ROLES.includes(r), false, r);
    }
    assert.equal(permSrc.includes("'/people/card-scanner'"), true);
    assert.equal(permSrc.includes('Role.FINANCE') && /card-scanner'[\s\S]{0,400}FINANCE/.test(permSrc), false);
  });

  it('E: nav visibility under People as Card Scanner', () => {
    assert.equal(navSrc.includes("label: 'Card Scanner'"), true);
    assert.equal(navSrc.includes("path: '/people/card-scanner'"), true);
    assert.equal(navSrc.includes('Section.People'), true);
    assert.equal(/Children Check-In|kids-checkin|events\/check-in/.test(navSrc.match(/Card Scanner[\s\S]{0,80}/)?.[0] || ''), false);
  });

  it('F–H: POST resolver client token body only, no query token', () => {
    assert.equal(clientSrc.includes("method: 'POST'"), true);
    assert.equal(clientSrc.includes('subResource=card-resolver'), true);
    assert.equal(clientSrc.includes('JSON.stringify({ token })'), true);
    assert.equal(/token=|searchParams|query.*token/i.test(clientSrc), false);
  });

  it('I–J: token format precheck; malformed avoids request semantics', () => {
    assert.equal(isValidCardToken(`AWC1.${'a'.repeat(64)}`), true);
    assert.equal(isValidCardToken('PLCC-2026-00001'), false);
    assert.equal(isValidCardToken(`AWC1.${'A'.repeat(64)}`), false);
    assert.equal(precheckScannedToken('foo').ok, false);
    assert.equal(pageSrc.includes('precheckScannedToken'), true);
    assert.equal(pageSrc.includes("kind: 'malformed'"), true);
  });

  it('K–N: result mapping adult/dependent valid/invalid', () => {
    const adultValid = mapResolverResponse(200, {
      ok: true,
      result: {
        found: true,
        subjectType: 'adult',
        displayName: 'Ada',
        avatarUrl: null,
        cardNumber: 'PLCC-2026-00001',
        cardStatus: 'active',
        effectiveStatus: 'active',
        valid: true,
        label: 'PLCC Member',
        notice: 'Membership identification only.',
      },
    });
    assert.equal(adultValid.kind, 'result');
    if (adultValid.kind === 'result') {
      assert.equal(headlineForResult(adultValid.result).text, 'VALID PLCC MEMBER CARD');
    }

    const adultInvalid = mapResolverResponse(200, {
      ok: true,
      result: {
        found: true,
        subjectType: 'adult',
        displayName: 'Ada',
        avatarUrl: null,
        cardNumber: 'PLCC-2026-00002',
        cardStatus: 'revoked',
        effectiveStatus: 'revoked',
        valid: false,
        label: 'PLCC Member',
        notice: 'Membership identification only.',
      },
    });
    assert.equal(adultInvalid.kind, 'result');
    if (adultInvalid.kind === 'result') {
      assert.equal(headlineForResult(adultInvalid.result).text, 'CARD NOT VALID');
    }

    const depValid = mapResolverResponse(200, {
      ok: true,
      result: {
        found: true,
        subjectType: 'dependent',
        displayName: 'Child',
        avatarUrl: null,
        cardNumber: 'PLCC-2026-00003',
        cardStatus: 'active',
        effectiveStatus: 'active',
        valid: true,
        label: 'PLCC Child Member',
        notice: 'Membership identification only. Not child pickup/check-out authorization.',
      },
    });
    assert.equal(depValid.kind, 'result');
    if (depValid.kind === 'result') {
      assert.equal(headlineForResult(depValid.result).text, 'VALID PLCC CHILD MEMBER CARD');
    }

    const depInvalid = mapResolverResponse(200, {
      ok: true,
      result: {
        found: true,
        subjectType: 'dependent',
        displayName: 'Child',
        avatarUrl: null,
        cardNumber: 'PLCC-2026-00004',
        cardStatus: 'inactive',
        effectiveStatus: 'inactive',
        valid: false,
        label: 'PLCC Child Member',
        notice: 'Membership identification only. Not child pickup/check-out authorization.',
      },
    });
    assert.equal(depInvalid.kind, 'result');
    if (depInvalid.kind === 'result') {
      assert.equal(headlineForResult(depInvalid.result).tone, 'invalid');
    }
  });

  it('O: pickup disclaimer', () => {
    assert.match(dependentPickupDisclaimer(), /not child pickup\/check-out authorization/i);
    assert.equal(resultSrc.includes('dependentPickupDisclaimer'), true);
  });

  it('P–S: not found / conflict / rate limit / unavailable', () => {
    assert.equal(mapResolverResponse(200, { ok: true, result: { found: false, code: 'card_not_found' } }).kind, 'not_found');
    assert.equal(mapResolverResponse(409, { ok: false, code: 'resolver_conflict' }).kind, 'conflict');
    assert.equal(mapResolverResponse(429, { ok: false, code: 'scanner_rate_limited' }).kind, 'rate_limited');
    assert.equal(mapResolverResponse(502, { ok: false, code: 'scanner_unavailable' }).kind, 'unavailable');
  });

  it('T: scan another reset clears camera/token/result', () => {
    assert.equal(pageSrc.includes('resetScanner'), true);
    assert.equal(pageSrc.includes('setCameraActive(false)'), true);
    assert.equal(pageSrc.includes("setManualCode('')"), true);
    assert.equal(pageSrc.includes("setUiState({ kind: 'idle' })"), true);
  });

  it('U–W: no check-in / check-out / attendance', () => {
    const blob = pageSrc + resultSrc + cameraSrc + clientSrc;
    for (const phrase of ['Check In', 'Mark Present', 'Check Out', 'Release Child', 'Guardian Approved', 'Volunteer Check-In']) {
      assert.equal(blob.includes(phrase), false, phrase);
    }
    assert.equal(/from\(['"]attendance|event_volunteers|serve_signups/.test(blob), false);
    // Disclaimer may mention check-out as NOT authorized — must not add action buttons
    assert.equal(/<(button|a)[^>]*>[\s\S]{0,40}Check (In|Out)/i.test(resultSrc + pageSrc), false);
  });

  it('X: no recent-history', () => {
    assert.equal(/recent scans|scan history|history list/i.test(pageSrc + resultSrc), false);
  });

  it('Y–Z: no token storage / logs', () => {
    const blob = pageSrc + cameraSrc + clientSrc;
    assert.equal(/localStorage|sessionStorage|indexedDB/i.test(blob), false);
    assert.equal(/console\.(log|debug|info)\([^\)]*token/i.test(blob), false);
    assert.equal(/console\.(log|debug|info)\([^\)]*rawValue/i.test(cameraSrc), false);
  });

  it('AA–AB: adult avatar safe; dependent generic icon', () => {
    assert.equal(resultSrc.includes('avatarUrl'), true);
    assert.equal(resultSrc.includes('UserRound'), true);
    assert.equal(resultSrc.includes("subjectType === 'dependent'"), true);
  });

  it('AC–AE: camera explicit start/stop/unmount cleanup', () => {
    assert.equal(cameraSrc.includes('Start Camera'), true);
    assert.equal(cameraSrc.includes('Stop Camera'), true);
    assert.equal(pageSrc.includes('onStart={() => setCameraActive(true)}'), true);
    assert.equal(pageSrc.includes('visibilitychange'), true);
    assert.equal(/useEffect\(\(\) => \{\s*return \(\) =>/s.test(pageSrc), true);
  });

  it('AF: manual fallback', () => {
    assert.equal(pageSrc.includes('Enter card code'), true);
    assert.equal(pageSrc.includes('Resolve Card'), true);
  });

  it('AG: mobile targets (min height buttons)', () => {
    assert.equal(/min-h-\[48px\]/.test(pageSrc + cameraSrc + resultSrc), true);
    assert.equal(pageSrc.includes('max-w-2xl'), true);
  });

  it('AH: accessibility', () => {
    assert.equal(pageSrc.includes('<h1'), true);
    assert.equal(pageSrc.includes('htmlFor="awc-card-code"'), true);
    assert.equal(resultSrc.includes("role=\"status\""), true);
    assert.equal(resultSrc.includes("role={isAlert ? 'alert' : 'status'}"), true);
    assert.equal(resultSrc.includes('VALID PLCC MEMBER CARD') || uiSrc.includes('VALID PLCC MEMBER CARD'), true);
  });

  it('AI: no new API function', () => {
    const apiTs = readdirSync(join(root, 'api')).filter((f) => f.endsWith('.ts'));
    assert.equal(apiTs.includes('card-scanner.ts'), false);
    assert.equal(apiTs.includes('scanner.ts'), false);
    assert.equal(apiTs.includes('vault.ts'), true);
  });

  it('AJ: no SQL', () => {
    assert.equal(existsSync(join(root, 'supabase/migrations/connect_phase_2_6e2_card_scanner.sql')), false);
  });

  it('AK: Connect unchanged', () => {
    assert.equal(pageSrc.includes('awc-connect'), false);
    if (existsSync(connectRoot)) {
      assert.equal(existsSync(join(connectRoot, 'pages/people/CardScanner.tsx')), false);
    }
  });

  it('uses existing @yudiel/react-qr-scanner; page title + auto clear', () => {
    assert.equal(!!pkg.dependencies['@yudiel/react-qr-scanner'], true);
    assert.equal(cameraSrc.includes("@yudiel/react-qr-scanner"), true);
    assert.equal(pageSrc.includes('PLCC Card Scanner'), true);
    assert.equal(RESULT_AUTO_CLEAR_MS, 45_000);
    assert.equal(cameraSrc.includes('facingMode'), true);
  });
});
