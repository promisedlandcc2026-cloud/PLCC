/**
 * Phase 2.6E.1 — Vault staff card resolver logic + source contracts.
 * Run from Vault: node --import tsx --test scripts/test-card-resolver.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const connectRoot = join(root, '..', 'awc-connect-main');
const require = createRequire(import.meta.url);

async function loadLogic() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import('../api/_utils/cardResolverLogic.ts');
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const SYNTH_TOKEN = `AWC1.${'a'.repeat(64)}`;
const SYNTH_HASH = createHash('sha256').update(SYNTH_TOKEN, 'utf8').digest('hex');

describe('card resolver logic + contracts A–AK', async () => {
  const logic = await loadLogic();
  const {
    isCardResolverRole,
    CARD_RESOLVER_ROLES,
    CARD_RESOLVER_DENIED_ROLES,
    isValidCardToken,
    hashCardToken,
    parseCardResolverBody,
    effectiveAdultCardStatus,
    effectiveDependentCardStatus,
    buildAdultResolverDto,
    buildDependentResolverDto,
    buildNotFoundDto,
    resolveCollision,
    sanitizeAvatarUrl,
    evaluateRateLimit,
    CARD_RESOLVER_RATE_LIMITS,
    httpStatusForResolverCode,
    displayNameFromUserSafe,
  } = logic;

  const logicSrc = read('api/_utils/cardResolverLogic.ts');
  const handlerSrc = read('api/_utils/cardResolverHandler.ts');
  const coreSrc = read('api/_utils/core.ts');

  it('A–E: authorized role set; MEMBER/FINANCE/MINISTRY_LEADER/WORSHIP denied', () => {
    for (const r of [
      'SUPER_ADMIN',
      'ADMIN',
      'PASTOR',
      'ADMIN_STAFF',
      'SECRETARY',
      'ASST_SECRETARY',
      'FIRST_LADY',
    ]) {
      assert.equal(isCardResolverRole(r), true, r);
    }
    for (const r of [
      'FINANCE',
      'MINISTRY_LEADER',
      'WORSHIP_TEAM',
      'MEMBER',
      'PENDING',
      'YOUTH',
    ]) {
      assert.equal(isCardResolverRole(r), false, r);
      assert.equal(CARD_RESOLVER_DENIED_ROLES.has(r), true, r);
    }
    assert.equal(CARD_RESOLVER_ROLES.size, 7);
    assert.equal(isCardResolverRole(null), false);
  });

  it('F: allowed-role matrix size exact', () => {
    assert.deepEqual(
      [...CARD_RESOLVER_ROLES].sort(),
      [
        'ADMIN',
        'ADMIN_STAFF',
        'ASST_SECRETARY',
        'FIRST_LADY',
        'PASTOR',
        'SECRETARY',
        'SUPER_ADMIN',
      ].sort()
    );
  });

  it('G: POST only — method_not_allowed maps to 405', () => {
    assert.equal(httpStatusForResolverCode('method_not_allowed'), 405);
    assert.equal(/method !== 'POST'|Method not allowed\. Use POST/i.test(handlerSrc), true);
  });

  it('H–J: malformed / uppercase / card number rejected', () => {
    assert.equal(isValidCardToken('not-a-token'), false);
    assert.equal(isValidCardToken(`AWC1.${'A'.repeat(64)}`), false);
    assert.equal(isValidCardToken('PLCC-2026-00001'), false);
    assert.equal(isValidCardToken(`AWC1.${'a'.repeat(63)}`), false);
    assert.equal(isValidCardToken(` ${SYNTH_TOKEN}`), false);
    assert.equal(isValidCardToken(`${SYNTH_TOKEN} `), false);
    assert.equal(parseCardResolverBody({ token: SYNTH_TOKEN.toUpperCase() }).ok, false);
    assert.equal(parseCardResolverBody({ token: 'PLCC-2026-00001' }).ok, false);
    assert.equal(parseCardResolverBody({ token: 'uuid-like' }).code, 'invalid_card_format');
  });

  it('K: valid token hashes to sha256 lowercase hex', () => {
    assert.equal(isValidCardToken(SYNTH_TOKEN), true);
    assert.equal(hashCardToken(SYNTH_TOKEN), SYNTH_HASH);
    assert.equal(/^[0-9a-f]{64}$/.test(hashCardToken(SYNTH_TOKEN)), true);
  });

  it('L: raw token not echoed in builders / fail paths', () => {
    const adult = buildAdultResolverDto({
      displayName: 'Test',
      avatarUrl: null,
      cardNumber: 'PLCC-2026-00001',
      cardStatus: 'active',
      effectiveStatus: 'active',
    });
    assert.equal(JSON.stringify(adult).includes(SYNTH_TOKEN), false);
    assert.equal(JSON.stringify(adult).includes(SYNTH_HASH), false);
    assert.equal(/\bqr_token\b/.test(handlerSrc), false);
    // Audit details must never include token/hash fields
    assert.equal(/details:\s*\{[^}]*\btoken\s*:/.test(handlerSrc), false);
    assert.equal(/details:\s*\{[^}]*\btokenHash\s*:/.test(handlerSrc), false);
    assert.equal(handlerSrc.includes('hashCardToken(parsed.token)'), true);
  });

  it('M–P: adult DTOs + PENDING effective inactive', () => {
    const active = buildAdultResolverDto({
      displayName: 'Ada Member',
      avatarUrl: 'https://cdn.example/a.png',
      cardNumber: 'PLCC-2026-00001',
      cardStatus: 'active',
      effectiveStatus: 'active',
    });
    assert.equal(active.found, true);
    assert.equal(active.subjectType, 'adult');
    assert.equal(active.valid, true);
    assert.equal(active.label, 'PLCC Member');
    assert.equal(active.notice, 'Membership identification only.');

    const inactive = buildAdultResolverDto({
      displayName: 'Ada',
      avatarUrl: null,
      cardNumber: 'PLCC-2026-00002',
      cardStatus: 'inactive',
      effectiveStatus: 'inactive',
    });
    assert.equal(inactive.valid, false);
    assert.equal(inactive.found, true);

    const revoked = buildAdultResolverDto({
      displayName: 'Ada',
      avatarUrl: null,
      cardNumber: 'PLCC-2026-00003',
      cardStatus: 'revoked',
      effectiveStatus: 'revoked',
    });
    assert.equal(revoked.valid, false);
    assert.equal(revoked.effectiveStatus, 'revoked');

    assert.equal(effectiveAdultCardStatus('active', 'PENDING'), 'inactive');
    assert.equal(effectiveAdultCardStatus('active', 'MEMBER'), 'active');
    assert.equal(effectiveAdultCardStatus('revoked', 'ADMIN'), 'revoked');
    assert.equal(effectiveAdultCardStatus('inactive', 'ADMIN'), 'inactive');
  });

  it('Q–S: dependent DTOs active/inactive/revoked', () => {
    const active = buildDependentResolverDto({
      displayName: 'Child One',
      cardNumber: 'PLCC-2026-00010',
      cardStatus: 'active',
    });
    assert.equal(active.subjectType, 'dependent');
    assert.equal(active.valid, true);
    assert.equal(active.avatarUrl, null);
    assert.match(active.notice, /Not child pickup\/check-out authorization/);

    const inactive = buildDependentResolverDto({
      displayName: 'Child',
      cardNumber: 'PLCC-2026-00011',
      cardStatus: 'inactive',
    });
    assert.equal(inactive.valid, false);
    assert.equal(effectiveDependentCardStatus('inactive'), 'inactive');

    const revoked = buildDependentResolverDto({
      displayName: 'Child',
      cardNumber: 'PLCC-2026-00012',
      cardStatus: 'revoked',
    });
    assert.equal(revoked.valid, false);
    assert.equal(revoked.cardStatus, 'revoked');
  });

  it('T–W: no guardian/check flags/UUIDs/email/phone/DOB in DTOs', () => {
    const dep = buildDependentResolverDto({
      displayName: 'Child',
      cardNumber: 'PLCC-2026-00010',
      cardStatus: 'active',
    });
    const keys = Object.keys(dep).sort();
    assert.deepEqual(keys, [
      'avatarUrl',
      'cardNumber',
      'cardStatus',
      'displayName',
      'effectiveStatus',
      'found',
      'label',
      'notice',
      'subjectType',
      'valid',
    ]);
    const blob = JSON.stringify(dep);
    assert.equal(/guardian|household|can_check|dob|email|phone|userId|memberId|cardRef|qr/i.test(blob), false);

    const adult = buildAdultResolverDto({
      displayName: 'Ada',
      avatarUrl: null,
      cardNumber: 'PLCC-2026-00001',
      cardStatus: 'active',
      effectiveStatus: 'active',
    });
    assert.equal(/email|phone|role|userId|memberId/i.test(JSON.stringify(adult)), false);
    assert.equal(displayNameFromUserSafe({ name: '' }), 'PLCC Member');
  });

  it('X–Y: not found + conflict fail closed', () => {
    assert.deepEqual(buildNotFoundDto(), { found: false, code: 'card_not_found' });
    assert.equal(resolveCollision(false, false), 'none');
    assert.equal(resolveCollision(true, false), 'adult');
    assert.equal(resolveCollision(false, true), 'dependent');
    assert.equal(resolveCollision(true, true), 'conflict');
    assert.equal(httpStatusForResolverCode('resolver_conflict'), 409);
  });

  it('Z–AA: no raw hash/QR selected in handler', () => {
    assert.equal(/\.select\([^)]*qr_token/.test(handlerSrc), false);
    assert.equal(/from\(['"]member_digital_cards['"]\)[\s\S]*qr_token(?!_hash)/.test(handlerSrc), false);
    assert.equal(handlerSrc.includes("eq('qr_token_hash', tokenHash)"), true);
    assert.equal(handlerSrc.includes('card_ref'), false);
  });

  it('AB–AF: no attendance/notification/serve/pickup writes', () => {
    assert.equal(/from\(['"]attendance|event_attendance|serve_signups|notifications|consents/.test(handlerSrc), false);
    assert.equal(/\.insert\(/.test(handlerSrc.replace(/audit_logs|logAudit|safeAudit/g, '')), false);
    // Handler must not return check flags; logic may list them only as rejected client keys
    assert.equal(/can_check_in|can_check_out|canCheckIn|canCheckOut/.test(handlerSrc), false);
    assert.equal(/custody|release permission/i.test(handlerSrc), false);
    assert.equal(logicSrc.includes('Not child pickup/check-out authorization'), true);
    assert.equal(logicSrc.includes('FORBIDDEN_CLIENT_CONTROL_KEYS'), true);
    assert.equal(/buildDependentResolverDto[\s\S]*can_check/.test(logicSrc), false);
  });

  it('AG: cache headers private,no-store on all responses', () => {
    assert.equal(handlerSrc.includes("Cache-Control', 'private, no-store'"), true);
    assert.equal(handlerSrc.includes("Pragma', 'no-cache'"), true);
    assert.equal(/function setNoStore/.test(handlerSrc), true);
  });

  it('AH: audit safe — action card_resolver.scan, no token/hash in details templates', () => {
    assert.equal(handlerSrc.includes("action: 'card_resolver.scan'"), true);
    assert.equal(/details:[\s\S]{0,80}tokenHash|details:[\s\S]{0,80}parsed\.token|rawToken/.test(handlerSrc), false);
    assert.equal(handlerSrc.includes('safeAudit'), true);
  });

  it('AI: rate-limit contract — evaluate + 429 code', () => {
    const now = 1_000_000;
    const burst = Array.from({ length: 10 }, (_, i) => now - 1000 + i);
    assert.equal(evaluateRateLimit(burst, now, [...CARD_RESOLVER_RATE_LIMITS]).allowed, false);
    assert.equal(evaluateRateLimit(burst.slice(0, 9), now, [...CARD_RESOLVER_RATE_LIMITS]).allowed, true);
    assert.equal(httpStatusForResolverCode('scanner_rate_limited'), 429);
    assert.equal(handlerSrc.includes('scanner_rate_limited'), true);
    assert.equal(handlerSrc.includes('NOT globally authoritative') || handlerSrc.includes('best-effort'), true);
  });

  it('AJ: no new Vercel function; mount under existing /api/vault people', () => {
    assert.equal(existsSync(join(root, 'api/card-resolver.ts')), false);
    assert.equal(existsSync(join(root, 'api/scanner.ts')), false);
    assert.equal(coreSrc.includes("subResource || '') === 'card-resolver'"), true);
    assert.equal(coreSrc.includes('handleCardResolver'), true);
    const apiFiles = readdirSync(join(root, 'api')).filter((f) => f.endsWith('.ts'));
    assert.equal(apiFiles.includes('vault.ts'), true);
    assert.equal(apiFiles.includes('card-resolver.ts'), false);
  });

  it('AK: Connect unchanged by this phase (sibling path check + no Connect imports)', () => {
    assert.equal(handlerSrc.includes('awc-connect'), false);
    assert.equal(logicSrc.includes('awc-connect'), false);
    if (existsSync(connectRoot)) {
      // Soft check: Connect card API files not referenced
      assert.equal(handlerSrc.includes('fetchMyGuardianDependentCards'), false);
    }
  });

  it('rejects client control fields that could influence identity', () => {
    assert.equal(parseCardResolverBody({ token: SYNTH_TOKEN, userId: 'x' }).ok, false);
    assert.equal(parseCardResolverBody({ token: SYNTH_TOKEN, user_id: 'x' }).ok, false);
    assert.equal(parseCardResolverBody({ token: SYNTH_TOKEN, member_id: 'x' }).ok, false);
    assert.equal(parseCardResolverBody({ token: SYNTH_TOKEN, qrTokenHash: 'x' }).ok, false);
    assert.equal(parseCardResolverBody({ token: SYNTH_TOKEN, role: 'ADMIN' }).ok, false);
    assert.equal(parseCardResolverBody({ token: SYNTH_TOKEN, valid: true }).ok, false);
    assert.equal(parseCardResolverBody({ token: SYNTH_TOKEN }).ok, true);
  });

  it('sanitizes avatar URLs', () => {
    assert.equal(sanitizeAvatarUrl('https://cdn.example/a.png'), 'https://cdn.example/a.png');
    assert.equal(sanitizeAvatarUrl('javascript:alert(1)'), null);
    assert.equal(sanitizeAvatarUrl('data:image/png;base64,xx'), null);
    assert.equal(sanitizeAvatarUrl(null), null);
  });

  it('handler uses requireAuth-equivalent verifyAuth + getSupabaseAdmin + no qr_token select', () => {
    assert.equal(handlerSrc.includes('verifyAuth'), true);
    assert.equal(handlerSrc.includes('getSupabaseAdmin'), true);
    assert.equal(handlerSrc.includes("from('member_digital_cards')"), true);
    assert.equal(handlerSrc.includes("from('dependent_digital_cards')"), true);
    assert.equal(handlerSrc.includes("select('user_id, member_id, card_number, status')"), true);
    assert.equal(handlerSrc.includes("select('member_id, card_number, status')"), true);
  });
});
