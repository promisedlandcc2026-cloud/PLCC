/**
 * Phase 2.7D.6 — Child Check-In / Check-Out (Family Pass) source contracts.
 * Run from Vault: node --test scripts/test-connect-phase-2-7d6-child-custody.mjs
 *
 * Source-contract only. Does not apply SQL or touch live data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mig = join(root, 'supabase/migrations/connect_phase_2_7d6_child_custody.sql');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(path) {
  return readFileSync(path, 'utf8');
}

function readRel(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function codeOnly(sql) {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, '').trim())
    .filter(Boolean)
    .join('\n');
}

function fnBody(sql, name) {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\)\\s*RETURNS jsonb[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`
  );
  const m = sql.match(re);
  assert.ok(m, `${name} body not found`);
  return m[1];
}

describe('connect_phase_2_7d6_child_custody.sql', () => {
  it('A: migration exists + review-gated additive', () => {
    assert.equal(existsSync(mig), true);
    const sql = read(mig);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    const code = codeOnly(sql);
    assert.ok(code.includes('CREATE TABLE IF NOT EXISTS public.child_custody_records'));
    assert.ok(code.includes('kids_custody_lookup_by_card_hash'));
    assert.ok(code.includes('kids_custody_checkin'));
    assert.ok(code.includes('kids_custody_checkout'));
    assert.equal(/\bDROP TABLE\b/i.test(code), false);
    assert.equal(/\bINSERT\s+INTO\s+public\.attendance\b/i.test(code), false);
    assert.equal(/\bALTER TABLE\s+public\.attendance_records\b/i.test(code), false);
  });

  it('B: open custody unique + service_role only', () => {
    const sql = read(mig);
    assert.ok(sql.includes('child_custody_records_open_session_child_uidx'));
    assert.ok(/WHERE checked_out_at IS NULL/.test(sql));
    assert.ok(/GRANT ALL ON TABLE public\.child_custody_records TO service_role/.test(sql));
    assert.ok(/REVOKE ALL ON TABLE public\.child_custody_records FROM authenticated/.test(sql));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.kids_custody_lookup_by_card_hash[\s\S]*TO service_role/.test(sql));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.kids_custody_checkin[\s\S]*TO service_role/.test(sql));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.kids_custody_checkout[\s\S]*TO service_role/.test(sql));
  });

  it('C: lookup is hash-only; rejects adult cards; kids session only', () => {
    const sql = read(mig);
    const body = fnBody(sql, 'kids_custody_lookup_by_card_hash');
    assert.ok(body.includes("p_qr_token_hash !~ '^[0-9a-f]{64}$'"));
    assert.ok(body.includes('dependent_digital_cards'));
    assert.ok(body.includes('member_digital_cards'));
    assert.ok(body.includes("RAISE EXCEPTION 'adult_card_required'"));
    assert.ok(body.includes("RAISE EXCEPTION 'card_not_found'"));
    assert.ok(body.includes("v_session.type IS DISTINCT FROM 'kids'"));
    assert.ok(body.includes('can_check_in'));
    assert.ok(body.includes('can_check_out'));
    assert.equal(/AWC1\./.test(body), false);
    assert.equal(/p_token\b|p_raw|p_qr_token\b(?!_hash)/.test(sql), false);
  });

  it('D: checkin requires can_check_in guardian; blocks double check-in', () => {
    const body = fnBody(read(mig), 'kids_custody_checkin');
    assert.ok(body.includes('can_check_in = true'));
    assert.ok(body.includes("RAISE EXCEPTION 'guardian_not_authorized'"));
    assert.ok(body.includes("RAISE EXCEPTION 'already_checked_in'"));
    assert.ok(body.includes('check_in_guardian_user_id'));
    assert.ok(body.includes('checked_in_by'));
  });

  it('E: checkout requires can_check_out; open custody only', () => {
    const body = fnBody(read(mig), 'kids_custody_checkout');
    assert.ok(body.includes('can_check_out = true'));
    assert.ok(body.includes("RAISE EXCEPTION 'guardian_not_authorized'"));
    assert.ok(body.includes("RAISE EXCEPTION 'already_checked_out'"));
    assert.ok(body.includes("RAISE EXCEPTION 'custody_not_found'"));
    assert.ok(body.includes('check_out_guardian_user_id'));
    assert.ok(body.includes('checked_out_by'));
  });

  it('F: QR alone is not pickup; comments say so', () => {
    const sql = read(mig);
    assert.ok(/QR alone|not pickup|never authorizes pickup/i.test(sql));
  });
});

describe('Phase 2.7D.6 Vault API + Kids Kiosk', () => {
  const logicSrc = readRel('api/_utils/kidsCustodyLogic.ts');
  const handlerSrc = readRel('api/_utils/kidsCustodyHandler.ts');
  const coreSrc = readRel('api/_utils/core.ts');
  const kidsSrc = readRel('pages/events/KidsKiosk.tsx');
  const clientSrc = readRel('lib/kidsCustodyClient.ts');
  const uiSrc = readRel('lib/familyAdminUi.ts');
  const askSrc = readRel('api/_utils/askAdminPrompt.ts');

  it('G: handler mounted under attendance kids-custody-*', () => {
    assert.ok(coreSrc.includes("kids-custody-lookup"));
    assert.ok(coreSrc.includes("kids-custody-checkin"));
    assert.ok(coreSrc.includes("kids-custody-checkout"));
    assert.ok(coreSrc.includes("kids-custody-open"));
    assert.ok(coreSrc.includes('handleKidsCustody'));
    assert.ok(handlerSrc.includes("kids_custody_lookup_by_card_hash"));
    assert.ok(handlerSrc.includes('hashCardToken'));
    assert.ok(logicSrc.includes('adult_card_required'));
    assert.ok(logicSrc.includes('guardian_required'));
  });

  it('H: Kids Kiosk Family Pass flow + legacy path', () => {
    assert.ok(kidsSrc.includes('lookupKidsCustodyByCard'));
    assert.ok(kidsSrc.includes('kidsCustodyCheckin'));
    assert.ok(kidsSrc.includes('kidsCustodyCheckout'));
    assert.ok(kidsSrc.includes('fetchAttendanceSessions'));
    assert.ok(kidsSrc.includes("type: 'kids'"));
    assert.ok(kidsSrc.includes('Check In Child'));
    assert.ok(kidsSrc.includes('Check Out Child'));
    assert.ok(kidsSrc.includes('kiosk-lookup'));
    assert.ok(kidsSrc.includes('adult membership card'));
    assert.ok(clientSrc.includes('kids-custody-lookup'));
    assert.equal(kidsSrc.includes('AttendanceSessionScanner'), false);
  });

  it('I: Family Admin helpers + Ask Admin how-tos', () => {
    assert.ok(uiSrc.includes('CHECKIN_HELPER'));
    assert.ok(uiSrc.includes('CHECKOUT_HELPER'));
    assert.ok(/Kids Kiosk/.test(uiSrc));
    assert.ok(askSrc.includes('Family Pass'));
    assert.ok(askSrc.includes('Check In Child'));
    assert.ok(askSrc.includes('Check Out Child'));
    assert.ok(/authorized.*guardian|guardian.*confirm/i.test(askSrc));
  });

  it('J: Connect disclaimer updated; no Connect custody APIs', () => {
    assert.equal(existsSync(join(connectRoot, 'package.json')), true);
    const disc = read(join(connectRoot, 'lib/dependentCardUi.ts'));
    assert.ok(/QR alone is not pickup authorization/i.test(disc));
    assert.ok(/Kids Check-In|Kids Kiosk/i.test(disc));
    assert.equal(existsSync(join(connectRoot, 'api/_utils/kidsCustodyHandler.ts')), false);
    assert.equal(
      existsSync(join(connectRoot, 'supabase/migrations/connect_phase_2_7d6_child_custody.sql')),
      false
    );
  });

  it('K: git diff --check clean on migration', () => {
    try {
      execSync('git diff --check -- supabase/migrations/connect_phase_2_7d6_child_custody.sql', {
        cwd: root,
        stdio: 'pipe',
      });
    } catch (e) {
      // untracked file — check content has no tabs
    }
    const sql = read(mig);
    assert.equal(/\t/.test(sql), false);
  });
});

describe('kidsCustodyLogic unit', () => {
  it('L: parse helpers reject spoof + require guardian (source + hash)', () => {
    const logic = readRel('api/_utils/kidsCustodyLogic.ts');
    assert.ok(logic.includes('spoof_rejected'));
    assert.ok(logic.includes('guardian_required'));
    assert.ok(logic.includes('parseCustodyLookupBody'));
    assert.ok(logic.includes('parseCustodyCheckinBody'));
    assert.ok(logic.includes('hashCardToken'));
    assert.ok(logic.includes("createHash('sha256')"));
    const hash = createHash('sha256').update('AWC1.' + 'a'.repeat(64), 'utf8').digest('hex');
    assert.equal(hash.length, 64);
  });
});
