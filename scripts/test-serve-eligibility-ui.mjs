/**
 * Phase 2.3F.4 — Staff Serve Eligibility UI helpers + source contracts.
 * Run: node --import tsx --test scripts/test-serve-eligibility-ui.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

async function loadUi() {
  try {
    require('tsx/cjs');
  } catch {
    /* optional */
  }
  return import(pathToFileURL(join(root, 'lib/serveEligibilityUi.ts')).href);
}

describe('serve eligibility UI helpers', async () => {
  const ui = await loadUi();
  const {
    canManageServeEligibility,
    SERVE_ELIGIBILITY_UI_ROLES,
    STATUS_LABELS,
    STATUS_DESCRIPTIONS,
    REASON_OPTIONS,
    actionsForStatus,
    buildSetEligibilityBody,
    buildResetEligibilityBody,
    normalizeEligibilityDto,
    confirmMessageForAction,
    FUTURE_SIGNUP_CONFIRM_NOTE,
    eligibilityErrorMessage,
  } = ui;

  it('authorizes exact role allowlist and denies excluded roles', () => {
    for (const r of SERVE_ELIGIBILITY_UI_ROLES) {
      assert.equal(canManageServeEligibility(r), true, r);
    }
    for (const r of [
      'FINANCE',
      'MINISTRY_LEADER',
      'WORSHIP_TEAM',
      'MEMBER',
      'PENDING',
      'YOUTH',
    ]) {
      assert.equal(canManageServeEligibility(r), false, r);
    }
    assert.equal(SERVE_ELIGIBILITY_UI_ROLES.length, 7);
  });

  it('maps no-row / not_verified display copy', () => {
    assert.equal(STATUS_LABELS.not_verified, 'Not Verified');
    assert.match(STATUS_DESCRIPTIONS.not_verified, /not been reviewed/i);
    const dto = normalizeEligibilityDto(
      {
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'not_verified',
        reasonCode: 'not_verified',
        verifiedAt: null,
      },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    assert.equal(dto?.status, 'not_verified');
  });

  it('maps eligible / ineligible / suspended display', () => {
    assert.equal(STATUS_LABELS.eligible, 'Eligible');
    assert.equal(STATUS_LABELS.ineligible, 'Ineligible');
    assert.equal(STATUS_LABELS.suspended, 'Suspended');
    assert.match(STATUS_DESCRIPTIONS.eligible, /verified for Serve/i);
    assert.match(STATUS_DESCRIPTIONS.ineligible, /not eligible/i);
    assert.match(STATUS_DESCRIPTIONS.suspended, /temporarily suspended/i);
  });

  it('actions match status matrix', () => {
    const nv = actionsForStatus('not_verified').map((a) => a.key);
    assert.deepEqual(nv, ['verify', 'ineligible']);
    const el = actionsForStatus('eligible').map((a) => a.key);
    assert.deepEqual(el, ['suspend', 'ineligible', 'reset']);
    const inel = actionsForStatus('ineligible').map((a) => a.key);
    assert.deepEqual(inel, ['verify', 'suspend', 'reset']);
    const sus = actionsForStatus('suspended').map((a) => a.key);
    assert.deepEqual(sus, ['verify', 'ineligible', 'reset']);
  });

  it('Verify Eligible sends adult_verified', () => {
    const body = buildSetEligibilityBody(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'eligible',
      'adult_verified'
    );
    assert.deepEqual(body, {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'eligible',
      reasonCode: 'adult_verified',
    });
    assert.equal('verified_by' in body, false);
    assert.equal('verified_at' in body, false);
  });

  it('ineligible reason options map to under_18 and policy_ineligible', () => {
    const codes = REASON_OPTIONS.ineligible.map((o) => o.code);
    assert.deepEqual(codes, ['under_18', 'policy_ineligible']);
    assert.equal(
      buildSetEligibilityBody('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ineligible', 'under_18')
        .reasonCode,
      'under_18'
    );
    assert.equal(
      buildSetEligibilityBody(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'ineligible',
        'policy_ineligible'
      ).reasonCode,
      'policy_ineligible'
    );
  });

  it('Suspend sends temporarily_suspended', () => {
    assert.equal(
      buildSetEligibilityBody(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'suspended',
        'temporarily_suspended'
      ).reasonCode,
      'temporarily_suspended'
    );
  });

  it('Reset sends action=reset', () => {
    assert.deepEqual(buildResetEligibilityBody('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'reset',
    });
  });

  it('confirmation copy preserves existing signups', () => {
    for (const kind of ['verify', 'ineligible', 'suspend', 'reset']) {
      const msg = confirmMessageForAction(kind);
      assert.match(msg, /FUTURE Serve self-signups only/i);
      assert.match(msg, /not automatically cancelled/i);
      assert.ok(msg.includes(FUTURE_SIGNUP_CONFIRM_NOTE));
    }
  });

  it('maps user_not_found to unlinked messaging', () => {
    assert.match(
      eligibilityErrorMessage({ code: 'user_not_found' }),
      /not linked to a sign-in account/i
    );
  });
});

describe('serve eligibility UI source contracts', () => {
  const membersSrc = readFileSync(join(root, 'pages/people/Members.tsx'), 'utf8');
  const sectionSrc = readFileSync(
    join(root, 'components/people/ServeEligibilitySection.tsx'),
    'utf8'
  );
  const uiSrc = readFileSync(join(root, 'lib/serveEligibilityUi.ts'), 'utf8');
  const connectSanPath = join(root, '..', 'awc-connect-main', 'api/_utils/serveSanitize.js');

  it('wires section into Member Detail profile with role gate', () => {
    assert.ok(membersSrc.includes('ServeEligibilitySection'));
    assert.ok(membersSrc.includes('canManageServeEligibility'));
    assert.ok(membersSrc.includes('showServeEligibility'));
    assert.ok(membersSrc.includes('userRole={userRole}'));
    assert.ok(sectionSrc.includes('subResource=serve-eligibility'));
  });

  it('does not email-match for eligibility identity', () => {
    assert.equal(/resource=users&email=/.test(sectionSrc), false);
    assert.equal(/\.ilike\(\s*['"]email['"]/.test(sectionSrc), false);
    assert.ok(uiSrc.includes('Never email-match'));
    assert.ok(sectionSrc.includes('userId='));
    assert.ok(sectionSrc.includes('memberId'));
  });

  it('no free-text reason input; uses allowlisted radio options', () => {
    assert.equal(/<textarea/.test(sectionSrc), false);
    assert.ok(sectionSrc.includes("type=\"radio\""));
    assert.ok(sectionSrc.includes('REASON_OPTIONS.ineligible'));
    assert.ok(sectionSrc.includes('adult_verified'));
    assert.ok(sectionSrc.includes('temporarily_suspended'));
  });

  it('does not display verifiedBy or trigger signup cancellation', () => {
    assert.equal(/verifiedBy/.test(sectionSrc), false);
    assert.equal(/verified_by/.test(sectionSrc), false);
    assert.equal(/serve_signups/.test(sectionSrc), false);
    assert.equal(/serve_cancel/.test(sectionSrc), false);
    assert.equal(/event_volunteers/.test(sectionSrc), false);
  });

  it('unlinked member copy present; mutation gated on ready state', () => {
    assert.ok(sectionSrc.includes('not linked to a sign-in account'));
    assert.ok(sectionSrc.includes("kind === 'not_linked'"));
    assert.ok(sectionSrc.includes("kind === 'ready'"));
  });

  it('Connect signup activation remains untouched', () => {
    assert.equal(existsSync(connectSanPath), true);
    const connectSan = readFileSync(connectSanPath, 'utf8');
    assert.ok(connectSan.includes('SERVE_ELIGIBILITY_ENABLED = false'));
    assert.ok(connectSan.includes('serve_eligibility_not_ready'));
  });

  it('does not add a new Vercel API function for eligibility UI', () => {
    assert.equal(existsSync(join(root, 'api/serve-eligibility.js')), false);
    assert.equal(existsSync(join(root, 'api/serve-eligibility.ts')), false);
  });
});
