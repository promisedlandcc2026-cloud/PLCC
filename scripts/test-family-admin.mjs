/**
 * Phase 2.6C.2 — Vault Family Admin logic + source contracts (brief A–X).
 * Run from Vault: node --import tsx --test scripts/test-family-admin.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
  return import('../api/_utils/familyAdminLogic.ts');
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SAME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('family admin logic A–X', async () => {
  const logic = await loadLogic();
  const {
    isFamilyAdminRole,
    FAMILY_ADMIN_ROLES,
    FAMILY_ADMIN_DENIED_ROLES,
    parseFamilyMutation,
    linkMethodForPair,
    isSameUuidCandidate,
    guardianPermissionDiff,
    asUuid,
    HOUSEHOLD_RELATIONSHIP_TYPES,
    GUARDIAN_RELATIONSHIP_TYPES,
  } = logic;

  it('A: authorizes exact approved role set and denies excluded roles', () => {
    for (const r of [
      'SUPER_ADMIN',
      'ADMIN',
      'PASTOR',
      'ADMIN_STAFF',
      'SECRETARY',
      'ASST_SECRETARY',
      'FIRST_LADY',
    ]) {
      assert.equal(isFamilyAdminRole(r), true, r);
    }
    for (const r of [
      'FINANCE',
      'MINISTRY_LEADER',
      'WORSHIP_TEAM',
      'MEMBER',
      'PENDING',
      'YOUTH',
    ]) {
      assert.equal(isFamilyAdminRole(r), false, r);
      assert.equal(FAMILY_ADMIN_DENIED_ROLES.has(r), true, r);
    }
    assert.equal(isFamilyAdminRole(null), false);
    assert.equal(FAMILY_ADMIN_ROLES.size, 7);
  });

  it('B: no auto-link from email/name/phone — propose requires explicit userId UUID', () => {
    assert.equal(
      parseFamilyMutation({ action: 'link-propose', memberId: MEMBER, email: 'a@b.com' }, ACTOR).ok,
      false
    );
    assert.equal(
      parseFamilyMutation({ action: 'link-propose', memberId: MEMBER, name: 'Jane' }, ACTOR).ok,
      false
    );
    assert.equal(
      parseFamilyMutation({ action: 'link-propose', memberId: MEMBER, phone: '555' }, ACTOR).ok,
      false
    );
    const ok = parseFamilyMutation(
      { action: 'link-propose', memberId: MEMBER, userId: USER },
      ACTOR
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.linkMethod, 'staff_verified');
  });

  it('C: same_uuid only when memberId === userId; otherwise staff_verified', () => {
    assert.equal(linkMethodForPair(SAME, SAME), 'same_uuid');
    assert.equal(linkMethodForPair(MEMBER, USER), 'staff_verified');
    assert.equal(isSameUuidCandidate(SAME, SAME), true);
    assert.equal(isSameUuidCandidate(MEMBER, USER), false);
    const same = parseFamilyMutation(
      { action: 'link-propose', memberId: SAME, userId: SAME },
      ACTOR
    );
    assert.equal(same.ok, true);
    assert.equal(same.linkMethod, 'same_uuid');
  });

  it('D: propose/verify/revoke are distinct actions; verify does not invent userId', () => {
    const v = parseFamilyMutation({ action: 'link-verify', memberId: MEMBER }, ACTOR);
    assert.equal(v.ok, true);
    assert.equal(v.action, 'link-verify');
    assert.equal('userId' in v, false);
    const r = parseFamilyMutation({ action: 'link-revoke', memberId: MEMBER }, ACTOR);
    assert.equal(r.ok, true);
    assert.equal(r.action, 'link-revoke');
  });

  it('E: household membership ≠ guardian — separate actions and type allowlists', () => {
    assert.equal(HOUSEHOLD_RELATIONSHIP_TYPES.has('spouse'), true);
    assert.equal(GUARDIAN_RELATIONSHIP_TYPES.has('spouse'), false);
    assert.equal(GUARDIAN_RELATIONSHIP_TYPES.has('parent'), true);
    assert.equal(GUARDIAN_RELATIONSHIP_TYPES.has('legal_guardian'), true);
    assert.equal(GUARDIAN_RELATIONSHIP_TYPES.has('authorized_guardian'), true);
    const hh = parseFamilyMutation(
      {
        action: 'household-add',
        memberId: MEMBER,
        householdId: USER,
        relationshipType: 'spouse',
      },
      ACTOR
    );
    assert.equal(hh.ok, true);
    const bad = parseFamilyMutation(
      {
        action: 'guardian-create',
        guardianUserId: USER,
        childMemberId: MEMBER,
        relationshipType: 'spouse',
      },
      ACTOR
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'invalid_relationship');
  });

  it('F: guardian flags independent — defaults false; partial updates allowed', () => {
    const create = parseFamilyMutation(
      {
        action: 'guardian-create',
        guardianUserId: USER,
        childMemberId: MEMBER,
        relationshipType: 'parent',
      },
      ACTOR
    );
    assert.equal(create.ok, true);
    assert.equal(create.canViewCard, false);
    assert.equal(create.canCheckIn, false);
    assert.equal(create.canCheckOut, false);

    const onlyOut = parseFamilyMutation(
      {
        action: 'guardian-update',
        guardianId: USER,
        canCheckOut: true,
      },
      ACTOR
    );
    assert.equal(onlyOut.ok, true);
    assert.equal(onlyOut.canCheckOut, true);
    assert.equal(onlyOut.canViewCard, undefined);
    assert.equal(onlyOut.canCheckIn, undefined);

    const diff = guardianPermissionDiff(
      { canViewCard: false, canCheckIn: true, canCheckOut: false },
      { canViewCard: true, canCheckIn: true, canCheckOut: false }
    );
    assert.deepEqual(diff, { canViewCard: { from: false, to: true } });
  });

  it('G: rejects client-supplied linked_by / verified_by / created_by', () => {
    for (const field of ['linked_by', 'linkedBy', 'verified_by', 'verifiedBy', 'created_by', 'createdBy']) {
      const parsed = parseFamilyMutation(
        {
          action: 'link-propose',
          memberId: MEMBER,
          userId: USER,
          [field]: ACTOR,
        },
        ACTOR
      );
      assert.equal(parsed.ok, false, field);
      assert.equal(parsed.code, 'forbidden', field);
    }
  });

  it('H: unauthorized without actor; invalid UUID and action codes stable', () => {
    assert.equal(parseFamilyMutation({ action: 'link-verify', memberId: MEMBER }, null).code, 'unauthorized');
    assert.equal(
      parseFamilyMutation({ action: 'link-verify', memberId: 'not-uuid' }, ACTOR).code,
      'invalid_uuid'
    );
    assert.equal(parseFamilyMutation({ action: 'explode' }, ACTOR).code, 'invalid_action');
    assert.equal(asUuid('person@example.com'), null);
  });

  it('I: household-inactivate / guardian revoke+reactivate parse cleanly', () => {
    assert.equal(
      parseFamilyMutation({ action: 'household-inactivate', membershipId: USER }, ACTOR).ok,
      true
    );
    assert.equal(
      parseFamilyMutation({ action: 'guardian-revoke', guardianId: USER }, ACTOR).ok,
      true
    );
    assert.equal(
      parseFamilyMutation({ action: 'guardian-reactivate', guardianId: USER }, ACTOR).ok,
      true
    );
  });

  it('J: search requires query length ≥ 2 (candidates only; no auto-write semantics in parser)', () => {
    assert.equal(
      parseFamilyMutation({ action: 'search-users', query: 'a' }, ACTOR).code,
      'query_required'
    );
    const s = parseFamilyMutation({ action: 'search-users', query: 'ab' }, ACTOR);
    assert.equal(s.ok, true);
    assert.equal(s.action, 'search-users');
  });

  it('Y: suggest-directory-household-members parses memberId only (no auto-insert fields)', () => {
    const bad = parseFamilyMutation({ action: 'suggest-directory-household-members' }, ACTOR);
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'invalid_uuid');
    const ok = parseFamilyMutation(
      { action: 'suggest-directory-household-members', memberId: MEMBER },
      ACTOR
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.action, 'suggest-directory-household-members');
    assert.equal(ok.memberId, MEMBER);
    assert.equal('relationshipType' in ok, false);
    assert.equal('householdId' in ok, false);
  });

  it('Z: household-add accepts optional contextMemberId for reload focus', () => {
    const plain = parseFamilyMutation(
      {
        action: 'household-add',
        memberId: MEMBER,
        householdId: USER,
        relationshipType: 'spouse',
      },
      ACTOR
    );
    assert.equal(plain.ok, true);
    assert.equal(plain.contextMemberId, undefined);
    const withCtx = parseFamilyMutation(
      {
        action: 'household-add',
        memberId: USER,
        householdId: MEMBER,
        relationshipType: 'child',
        contextMemberId: MEMBER,
      },
      ACTOR
    );
    assert.equal(withCtx.ok, true);
    assert.equal(withCtx.memberId, USER);
    assert.equal(withCtx.contextMemberId, MEMBER);
    assert.equal(withCtx.relationshipType, 'child');
  });
});

describe('family admin source contracts K–X', () => {
  const logicSrc = read('api/_utils/familyAdminLogic.ts');
  const handlerSrc = read('api/_utils/familyAdminHandler.ts');
  const uiSrc = read('lib/familyAdminUi.ts');
  const sectionSrc = read('components/people/FamilyAccessSection.tsx');
  const membersSrc = read('pages/people/Members.tsx');
  const coreSrc = read('api/_utils/core.ts');

  it('K: core mounts people/family-identity early-return without new API function', () => {
    assert.ok(coreSrc.includes("subResource || '') === 'family-identity'"));
    assert.ok(coreSrc.includes('handleFamilyAdmin'));
    assert.ok(coreSrc.includes("import('./familyAdminHandler.js')"));
    assert.equal(existsSync(join(root, 'api/family-identity.js')), false);
    assert.equal(existsSync(join(root, 'api/family-admin.js')), false);
  });

  it('L: handler uses requireAuth + getSupabaseAdmin + logAudit; no client actor trust', () => {
    assert.ok(handlerSrc.includes('requireAuth'));
    assert.ok(handlerSrc.includes('getSupabaseAdmin'));
    assert.ok(handlerSrc.includes('logAudit'));
    assert.ok(handlerSrc.includes('linked_by: actorId') || handlerSrc.includes('linked_by: actor'));
    // Guardian create/reactivate uses live verified_by; household_members may use created_by
    assert.ok(handlerSrc.includes('verified_by: actorId') || handlerSrc.includes('verified_by: actor'));
    assert.ok(handlerSrc.includes(".from('household_members')") && handlerSrc.includes('created_by: actorId'));
    assert.equal(/req\.body\.(linked_by|verified_by|created_by)/.test(handlerSrc), false);
  });

  it('2.6C.2B A: UML handler does NOT select/write verified_by', () => {
    // Comments may mention the forbidden names; strip comment lines then assert.
    const code = handlerSrc
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join('\n');
    const umlBlocks = code.split(".from('user_member_links')");
    assert.ok(umlBlocks.length > 1, 'expected user_member_links usage');
    for (let i = 1; i < umlBlocks.length; i++) {
      const chunk = umlBlocks[i].slice(0, 900);
      assert.equal(/verified_by/.test(chunk), false, `UML chunk ${i} must not reference verified_by`);
    }
  });

  it('2.6C.2B B: UML handler does NOT select/write verified_at', () => {
    const code = handlerSrc
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join('\n');
    const umlBlocks = code.split(".from('user_member_links')");
    for (let i = 1; i < umlBlocks.length; i++) {
      const chunk = umlBlocks[i].slice(0, 900);
      assert.equal(/verified_at/.test(chunk), false, `UML chunk ${i} must not reference verified_at`);
    }
  });

  it('2.6C.2B C: UML handler does NOT select/write revoked_at', () => {
    const code = handlerSrc
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join('\n');
    const umlBlocks = code.split(".from('user_member_links')");
    for (let i = 1; i < umlBlocks.length; i++) {
      const chunk = umlBlocks[i].slice(0, 900);
      assert.equal(/revoked_at/.test(chunk), false, `UML chunk ${i} must not reference revoked_at`);
    }
  });

  it('2.6C.2B D: UML handler does NOT select/write notes', () => {
    const code = handlerSrc
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join('\n');
    const umlBlocks = code.split(".from('user_member_links')");
    for (let i = 1; i < umlBlocks.length; i++) {
      const chunk = umlBlocks[i].slice(0, 900);
      assert.equal(/\bnotes\b/.test(chunk), false, `UML chunk ${i} must not reference notes`);
    }
  });

  it('2.6C.2B E: Guardian handler does NOT write created_by', () => {
    const code = handlerSrc
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join('\n');
    const grBlocks = code.split(".from('guardian_relationships')");
    assert.ok(grBlocks.length > 1);
    for (let i = 1; i < grBlocks.length; i++) {
      const chunk = grBlocks[i].slice(0, 1200);
      assert.equal(/created_by\s*:/.test(chunk), false, `guardian chunk ${i} must not write created_by`);
    }
  });

  it('2.6C.2B F: Guardian handler does NOT write revoked_at', () => {
    const code = handlerSrc
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join('\n');
    const grBlocks = code.split(".from('guardian_relationships')");
    for (let i = 1; i < grBlocks.length; i++) {
      const chunk = grBlocks[i].slice(0, 1200);
      assert.equal(/revoked_at/.test(chunk), false, `guardian chunk ${i} must not reference revoked_at`);
    }
  });

  it('2.6C.2B G: Guardian create DOES use verified_by/verified_at', () => {
    assert.ok(handlerSrc.includes('verified_by: actorId'));
    assert.ok(handlerSrc.includes('verified_at: now') || handlerSrc.includes('verified_at: now,'));
    assert.ok(handlerSrc.includes('action: \'guardian-create\'') || handlerSrc.includes("'guardian-create'"));
  });

  it('2.6C.2B H: Guardian reactivate refreshes verified_by/verified_at', () => {
    assert.ok(handlerSrc.includes('guardian-reactivate') || handlerSrc.includes("'guardian-reactivate'"));
    // Reactivate block sets both fields (same actor assignment pattern as create)
    const idx = handlerSrc.indexOf('Family Guardian Relationship Reactivated');
    assert.ok(idx > 0);
    const before = handlerSrc.slice(Math.max(0, idx - 600), idx);
    assert.ok(/verified_by:\s*actorId/.test(before));
    assert.ok(/verified_at:\s*now/.test(before));
  });

  it('2.6C.2B I: Checkout/Check-in helpers authorize Kids Kiosk custody (not QR alone)', () => {
    assert.ok(/Kids Kiosk|Family Pass|authorized guardian|drop-off|pickup/i.test(uiSrc));
    assert.ok(/QR alone never|never releases|staff must select/i.test(uiSrc));
    assert.ok(uiSrc.includes('CHECKIN_HELPER'));
    assert.ok(uiSrc.includes('CHECKOUT_HELPER'));
    assert.equal(/may release the child/i.test(uiSrc), false);
    assert.equal(/planned child pickup system/i.test(uiSrc), false);
  });

  it('2.6C.2B J: No SQL migration added', () => {
    assert.equal(existsSync(join(root, 'supabase/migrations/connect_phase_2_6c_2_family_admin.sql')), false);
    assert.equal(existsSync(join(root, 'supabase/migrations/connect_phase_2_6c_2b_schema_align.sql')), false);
  });

  it('2.6C.2B K: Connect must not host Vault Family Admin surfaces', () => {
    // Connect may ship member Family UI (2.6C.4B+); Vault admin must stay in Vault.
    assert.equal(existsSync(join(connectRoot, 'components/people/FamilyAccessSection.tsx')), false);
    assert.equal(existsSync(join(connectRoot, 'api/_utils/familyAdminLogic.ts')), false);
  });
  it('M: collision codes user_already_linked / member_already_linked present', () => {
    assert.ok(handlerSrc.includes('user_already_linked'));
    assert.ok(handlerSrc.includes('member_already_linked'));
    assert.ok(logicSrc.includes('user_already_linked'));
    assert.ok(logicSrc.includes('member_already_linked'));
  });

  it('N: household writes only household_members; guardians only guardian_relationships', () => {
    assert.ok(handlerSrc.includes(".from('household_members')"));
    assert.ok(handlerSrc.includes(".from('guardian_relationships')"));
    assert.ok(handlerSrc.includes(".from('user_member_links')"));
    // Must not mutate digital cards or legacy children JSON
    assert.equal(/from\(['"]member_digital_cards['"]\)/.test(handlerSrc), false);
    assert.equal(/\.update\(\s*\{\s*children/.test(handlerSrc), false);
    assert.equal(/household_name\s*:/.test(handlerSrc.replace(/legacyHouseholdName/g, '')), false);
  });

  it('O: guardian-create requires verified link gate (link_not_verified)', () => {
    assert.ok(handlerSrc.includes('link_not_verified'));
    assert.ok(handlerSrc.includes("eq('status', 'verified')"));
  });

  it('P: UI role gate + Family & Access tab wiring', () => {
    assert.ok(uiSrc.includes('canManageFamilyAdmin'));
    assert.ok(membersSrc.includes('canManageFamilyAdmin'));
    assert.ok(membersSrc.includes('FamilyAccessSection'));
    assert.ok(membersSrc.includes("'family'"));
    assert.ok(membersSrc.includes('Family & Access'));
    assert.ok(sectionSrc.includes('Identity Link'));
    assert.ok(sectionSrc.includes('Guardian Access'));
    assert.ok(sectionSrc.includes('does not verify') || sectionSrc.includes('SEARCH_DOES_NOT_VERIFY'));
    assert.ok(sectionSrc.includes('STEP_SIGN_IN_TITLE') || sectionSrc.includes('Step 1'));
    assert.ok(sectionSrc.includes('STEP_HOUSEHOLD_TITLE') || sectionSrc.includes('Step 2'));
    assert.ok(sectionSrc.includes('STEP_ADD_PEOPLE_TITLE') || sectionSrc.includes('Step 3'));
    assert.ok(sectionSrc.includes('STEP_GUARDIAN_TITLE') || sectionSrc.includes('Step 4'));
    assert.ok(sectionSrc.includes('Add spouse'));
    assert.ok(sectionSrc.includes('Add child / dependent'));
    assert.ok(
      sectionSrc.includes('suggest-directory-household-members') ||
        sectionSrc.includes('SUGGEST_DIRECTORY_TITLE')
    );
    assert.ok(handlerSrc.includes('suggest-directory-household-members'));
    assert.ok(handlerSrc.includes('contextMemberId'));
    assert.ok(logicSrc.includes('suggest-directory-household-members'));
  });

  it('P2: My Family summary path ignores members.children JSON (Connect counts)', () => {
    // Authoritative RPC (2.6D bridge) — Family Pass reads household_members + guardian only.
    const sql = read('supabase/migrations/connect_phase_2_6d_dependent_card_ref_bridge.sql');
    assert.ok(/CREATE OR REPLACE FUNCTION public\.get_my_family_summary/i.test(sql));
    assert.ok(/FROM public\.household_members hm/i.test(sql));
    assert.ok(/No members\.children JSON/i.test(sql));
    // Body must not select members.children / jsonb children notes into adults/dependents.
    const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.get_my_family_summary');
    const fnBody = sql.slice(fnStart, fnStart + 12000);
    assert.equal(/\bm\.children\b|\bmembers\.children\b/i.test(fnBody), false);
    assert.equal(/jsonb_array_elements[^\n]*children/i.test(fnBody), false);
    assert.ok(logicSrc.includes('suggest-directory-household-members'));
    assert.ok(handlerSrc.includes('Never auto-inserts') || handlerSrc.includes('suggestDirectoryHouseholdMembers'));
  });

  it('Q: flags independent in UI (three checkboxes; checkout helper; defaults false)', () => {
    assert.ok(sectionSrc.includes('View Child Card'));
    assert.ok(sectionSrc.includes('Check In'));
    assert.ok(sectionSrc.includes('Check Out'));
    assert.ok(sectionSrc.includes('CHECKOUT_HELPER'));
    assert.ok(sectionSrc.includes('CHECKIN_HELPER'));
    assert.ok(sectionSrc.includes('useState(false)') || /setCanViewCard\(false\)/.test(sectionSrc));
    assert.ok(/No spouse-card controls/i.test(sectionSrc));
    assert.equal(/spouse QR|Wallet/i.test(sectionSrc), false);
  });

  it('R: legacy household read-only + legacy children warning only', () => {
    assert.ok(sectionSrc.includes('Legacy directory household') || uiSrc.includes('Legacy'));
    assert.ok(sectionSrc.includes('LEGACY_CHILDREN_WARNING') || sectionSrc.includes('not a member record') || uiSrc.includes('not member records'));
  });

  it('S: no SQL migrations added in this phase', () => {
    assert.equal(existsSync(join(root, 'supabase/migrations/connect_phase_2_6c_2_family_admin.sql')), false);
    assert.equal(existsSync(join(root, 'supabase/migrations/connect_phase_2_6c_family_admin.sql')), false);
  });

  it('T: Connect must not host Vault Family Admin surfaces', () => {
    // Member /family UI is allowed post-2.6C.4B; Family Access admin stays Vault-only.
    assert.equal(existsSync(join(connectRoot, 'components/people/FamilyAccessSection.tsx')), false);
    assert.equal(existsSync(join(connectRoot, 'api/_utils/familyAdminLogic.ts')), false);
    assert.equal(existsSync(join(connectRoot, 'pages/admin/FamilyAccess.tsx')), false);
  });

  it('U: no auto-email-match authorization path in handler mutations', () => {
    assert.equal(/\.eq\(\s*['"]email['"]/.test(handlerSrc), false);
    assert.equal(/email\s*===|email\s*==/.test(handlerSrc), false);
    // search may ilike for discovery; propose must not write from email field
    assert.ok(handlerSrc.includes('action: \'link-propose\'') || handlerSrc.includes("'link-propose'"));
    assert.ok(handlerSrc.includes('parsed.userId'));
  });

  it('V: household-inactivate warns about active guardian without deleting guardians', () => {
    assert.ok(handlerSrc.includes('warningActiveGuardian'));
    assert.ok(handlerSrc.includes('hadActiveGuardian'));
    // inactivate path updates household_members status, not delete guardians
    assert.ok(handlerSrc.includes("status: 'inactive'"));
  });

  it('W: permission diff helper exists for audit detail', () => {
    assert.ok(logicSrc.includes('guardianPermissionDiff'));
    assert.ok(handlerSrc.includes('guardianPermissionDiff'));
  });

  it('X: no scanner / check-in execution / child card minting', () => {
    assert.equal(/check.?in.?execution|scanner|rotate_member_digital_card|get_my_member_digital_card/i.test(handlerSrc), false);
    assert.equal(/from\(['"]member_digital_cards['"]\)/.test(sectionSrc), false);
    assert.equal(/Wallet|spouse QR/i.test(sectionSrc), false);
  });
});
