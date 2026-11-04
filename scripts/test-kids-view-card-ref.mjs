/**
 * Kids View by guardian cardRef (PLCC Connect bridge).
 * Run from Vault: node --test scripts/test-kids-view-card-ref.mjs
 *
 * Source-contract only. Does not apply SQL or touch live data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const handler = readFileSync(join(root, 'api/_utils/parentDependentsHandler.ts'), 'utf8');

function fnBody(name) {
  const start = handler.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = handler.indexOf('\nasync function ', start + 10);
  const exp = handler.indexOf('\nexport async function ', start + 10);
  const ends = [next, exp].filter((i) => i > start);
  return handler.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('kids-view cardRef', () => {
  it('validates AWCD.<64 hex> and resolves through dependent_digital_cards', () => {
    assert.match(handler, /CARD_REF_RE = \/\^AWCD\\\.\[0-9a-f\]\{64\}\$\//);
    const body = fnBody('childIdForCardRef');
    assert.match(body, /CARD_REF_RE\.test\(cardRef\)/);
    assert.match(body, /from\('dependent_digital_cards'\)/);
    assert.match(body, /eq\('card_ref', cardRef\)/);
    assert.match(body, /'revoked'/);
  });

  it('runs before ensureParentContext so a read never bootstraps a household', () => {
    const main = fnBody('handleParentDependents');
    const cardRefRoute = main.indexOf('kidsByCardRef(req, res, supabase, auth.user.id, action, cardRef)');
    const bootstrap = main.indexOf('ensureParentContext(supabase, auth.user.id)');
    assert.ok(cardRefRoute > 0 && bootstrap > 0 && cardRefRoute < bootstrap);
    assert.equal(/ensureParentContext|insert\(/.test(fnBody('kidsByCardRef') + fnBody('cardRefAccess')), false);
  });

  it('allows an active guardian of the child or an adult in the child household', () => {
    const access = fnBody('cardRefAccess');
    assert.match(access, /from\('guardian_relationships'\)/);
    assert.match(access, /eq\('guardian_user_id', userId\)/);
    assert.match(access, /eq\('child_member_id', childId\)/);
    assert.match(access, /eq\('status', 'active'\)/);
    assert.match(access, /resolveAdultHouseholdForUser\(supabase, userId\)/);
    assert.match(access, /isHouseholdChild\(supabase, household\.ctx\.householdId, childId\)/);
    assert.match(fnBody('kidsByCardRef'), /if \(!access\.ok\)[\s\S]*status\(403\)/);
  });

  it('never echoes the child members.id on the cardRef path', () => {
    assert.match(fnBody('kidsByCardRef'), /const \{ id: _omit, \.\.\.child \} = view\.child;/);
  });

  it('theme PATCH by cardRef only changes kids_theme', () => {
    assert.match(fnBody('kidsByCardRef'), /action === 'kids-theme'\) return kidsThemeForChild/);
    const body = fnBody('kidsThemeForChild');
    assert.match(body, /update\(\{ kids_theme: theme \}\)/);
    assert.doesNotMatch(body, /first_name|household_members'\)\s*\.update|guardian_relationships/);
    assert.match(handler, /req\.method === 'PATCH' && action === 'kids-theme'/);
  });
});
