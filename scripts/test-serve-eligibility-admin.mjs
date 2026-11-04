/**
 * Phase 2.3F.2 — Vault Serve Eligibility Admin pure-logic + source contracts.
 * Run: node --import tsx --test scripts/test-serve-eligibility-admin.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

async function loadLogic() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import('../api/_utils/serveEligibilityAdminLogic.ts');
}

describe('serve eligibility admin logic', async () => {
  const logic = await loadLogic();
  const {
    isServeEligibilityAdminRole,
    SERVE_ELIGIBILITY_ADMIN_ROLES,
    SERVE_ELIGIBILITY_DENIED_ROLES,
    toEligibilityAdminDto,
    parseEligibilityMutation,
    asUuid,
  } = logic;

  it('authorizes exact approved role set and denies excluded roles', () => {
    for (const r of [
      'SUPER_ADMIN',
      'ADMIN',
      'PASTOR',
      'ADMIN_STAFF',
      'SECRETARY',
      'ASST_SECRETARY',
      'FIRST_LADY',
    ]) {
      assert.equal(isServeEligibilityAdminRole(r), true, r);
    }
    for (const r of [
      'FINANCE',
      'MINISTRY_LEADER',
      'WORSHIP_TEAM',
      'MEMBER',
      'PENDING',
      'YOUTH',
    ]) {
      assert.equal(isServeEligibilityAdminRole(r), false, r);
      assert.equal(SERVE_ELIGIBILITY_DENIED_ROLES.has(r), true, r);
    }
    assert.equal(isServeEligibilityAdminRole(null), false);
    assert.equal(SERVE_ELIGIBILITY_ADMIN_ROLES.size, 7);
  });

  it('no-row DTO is not_verified', () => {
    const dto = toEligibilityAdminDto('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null);
    assert.equal(dto.status, 'not_verified');
    assert.equal(dto.reasonCode, 'not_verified');
    assert.equal(dto.verifiedAt, null);
    assert.equal(dto.verifiedBy, null);
  });

  it('maps eligible row to admin DTO', () => {
    const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const staff = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const dto = toEligibilityAdminDto(uid, {
      status: 'eligible',
      reason_code: 'adult_verified',
      verified_at: '2026-01-01T00:00:00.000Z',
      verified_by: staff,
    });
    assert.equal(dto.userId, uid);
    assert.equal(dto.status, 'eligible');
    assert.equal(dto.reasonCode, 'adult_verified');
    assert.equal(dto.verifiedBy, staff);
  });

  it('eligible upsert uses server actor and ignores client spoof fields', () => {
    const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const spoof = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const parsed = parseEligibilityMutation(
      {
        userId: target,
        status: 'eligible',
        reasonCode: 'adult_verified',
        verified_by: spoof,
        verifiedBy: spoof,
        verified_at: '2000-01-01T00:00:00.000Z',
        created_at: '2000-01-01T00:00:00.000Z',
        updated_at: '2000-01-01T00:00:00.000Z',
      },
      actor
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.action, 'set');
      assert.equal(parsed.row?.verified_by, actor);
      assert.notEqual(parsed.row?.verified_at, '2000-01-01T00:00:00.000Z');
      assert.equal(parsed.row?.user_id, target);
      assert.equal(parsed.row?.status, 'eligible');
      assert.equal(parsed.row?.reason_code, 'adult_verified');
    }
  });

  it('ineligible and suspended upserts validate reason mapping', () => {
    const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const inel = parseEligibilityMutation(
      { userId: target, status: 'ineligible', reasonCode: 'under_18' },
      actor
    );
    assert.equal(inel.ok, true);
    if (inel.ok) assert.equal(inel.row?.status, 'ineligible');

    const sus = parseEligibilityMutation(
      { userId: target, status: 'suspended', reasonCode: 'temporarily_suspended' },
      actor
    );
    assert.equal(sus.ok, true);
    if (sus.ok) assert.equal(sus.row?.status, 'suspended');
  });

  it('defaults reasonCode from status when omitted', () => {
    const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const parsed = parseEligibilityMutation({ userId: target, status: 'eligible' }, actor);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.reasonCode, 'adult_verified');
  });

  it('reset deletes conceptual row (not_verified)', () => {
    const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const parsed = parseEligibilityMutation(
      { userId: target, action: 'reset' },
      actor
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.action, 'reset');
      assert.equal(parsed.status, 'not_verified');
      assert.equal(parsed.row, null);
    }
  });

  it('rejects invalid status and reason and mismatch', () => {
    const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    assert.equal(
      parseEligibilityMutation({ userId: target, status: 'not_verified' }, actor).ok,
      false
    );
    assert.equal(
      parseEligibilityMutation({ userId: target, status: 'approved' }, actor).code,
      'invalid_eligibility_status'
    );
    assert.equal(
      parseEligibilityMutation(
        { userId: target, status: 'eligible', reasonCode: 'free_text_note' },
        actor
      ).code,
      'invalid_reason_code'
    );
    assert.equal(
      parseEligibilityMutation(
        { userId: target, status: 'eligible', reasonCode: 'under_18' },
        actor
      ).code,
      'reason_code_status_mismatch'
    );
    assert.equal(
      parseEligibilityMutation({ userId: 'not-a-uuid', status: 'eligible' }, actor).code,
      'invalid_user_id'
    );
  });

  it('asUuid rejects garbage and email-shaped values', () => {
    assert.equal(asUuid('nope'), null);
    assert.equal(asUuid('person@example.com'), null);
    assert.equal(asUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
});

describe('serve eligibility admin source contracts', () => {
  const logicSrc = readFileSync(
    join(root, 'api/_utils/serveEligibilityAdminLogic.ts'),
    'utf8'
  );
  const handlerSrc = readFileSync(
    join(root, 'api/_utils/serveEligibilityAdminHandler.ts'),
    'utf8'
  );
  const coreSrc = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');

  it('wires users subResource=serve-eligibility without new API function', () => {
    assert.ok(coreSrc.includes("subResource || '') === 'serve-eligibility'"));
    assert.ok(coreSrc.includes('handleServeEligibilityAdmin'));
    assert.equal(existsSync(join(root, 'api/serve-eligibility.js')), false);
  });

  it('handler uses requireAuth + service role path and stable error codes', () => {
    assert.ok(handlerSrc.includes('requireAuth'));
    assert.ok(handlerSrc.includes('serve_eligibility_admin_forbidden'));
    assert.ok(handlerSrc.includes('user_not_found'));
    assert.ok(handlerSrc.includes('getSupabaseAdmin'));
    assert.ok(handlerSrc.includes("action: 'reset'"));
    assert.ok(handlerSrc.includes('logAudit'));
  });

  it('does not touch signups/opportunities/event_volunteers', () => {
    assert.equal(/from\(['"]serve_signups['"]\)/.test(handlerSrc), false);
    assert.equal(/from\(['"]serve_opportunities['"]\)/.test(handlerSrc), false);
    assert.equal(/from\(['"]event_volunteers['"]\)/.test(handlerSrc), false);
    assert.equal(/from\(['"]members['"]\)/.test(handlerSrc), false);
    assert.equal(/\.ilike\(\s*['"]email['"]/.test(handlerSrc), false);
  });

  it('does not trust client verified_by / verified_at', () => {
    assert.ok(logicSrc.includes('Ignores client verified_by'));
    assert.ok(handlerSrc.includes('verified_by: actor') || logicSrc.includes('verified_by: actor'));
  });
});
