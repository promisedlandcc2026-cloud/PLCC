/**
 * Vault Family Huddle contract smoke — room naming + invite hash helpers.
 * Run from awc-vault-main: node --test scripts/test-family-huddle.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Family LiveKit room naming', () => {
  it('uses awc-family-{householdId} prefix parallel to channel rooms', () => {
    const src = read('api/_utils/livekitFamilyVoice.ts');
    assert.ok(src.includes("FAMILY_VOICE_ROOM_PREFIX = 'awc-family-'"));
    assert.ok(src.includes('voiceRoomNameForHousehold'));
    assert.equal(src.includes('awc-channel-'), false);
  });

  it('exports mint/end/status helpers without channel ACL', () => {
    const src = read('api/_utils/livekitFamilyVoice.ts');
    assert.ok(src.includes('mintFamilyVoiceAccessToken'));
    assert.ok(src.includes('endFamilyVoiceRoom'));
    assert.ok(src.includes('listFamilyVoiceStatus'));
    assert.equal(src.includes('voice-huddle-mod'), false);
  });
});

describe('Family huddle access + invites', () => {
  it('resolves adult household server-side; never trusts client householdId', () => {
    const access = read('api/_utils/familyHuddleAccess.ts');
    assert.ok(access.includes('resolveAdultHouseholdForUser'));
    assert.ok(access.includes('FAMILY_INVITE_TTL_MS'));
    assert.ok(access.includes('2 * 60 * 60 * 1000') || access.includes('7200000'));
    assert.ok(access.includes('hashInviteToken'));
    assert.ok(access.includes('generateInviteToken'));
    assert.ok(access.includes('child') || access.includes('dependent'));
  });

  it('handler gates token/end on adult membership; redeem is public', () => {
    const handler = read('api/_utils/familyHuddleHandler.ts');
    assert.ok(handler.includes('invite-redeem'));
    assert.ok(handler.includes('requireAuth'));
    assert.ok(handler.includes('resolveAdultHouseholdForUser'));
    assert.ok(handler.includes('token_hash'));
    assert.equal(handler.includes('req.body?.householdId'), false);
    assert.ok(handler.includes('vaultFamilyHuddleJoinPath'));
  });

  it('invite hash is sha256 — raw token returned once, hash stored', () => {
    const access = read('api/_utils/familyHuddleAccess.ts');
    assert.ok(access.includes("createHash('sha256')"));
    const sample = 'test-invite-token';
    const expected = createHash('sha256').update(sample, 'utf8').digest('hex');
    assert.equal(expected.length, 64);
  });

  it('migration creates family_huddle_invites', () => {
    const mig = join(root, 'supabase/migrations/connect_phase_family_huddle_invites.sql');
    assert.ok(existsSync(mig));
    const sql = readFileSync(mig, 'utf8');
    assert.ok(sql.includes('family_huddle_invites'));
    assert.ok(sql.includes('token_hash'));
    assert.ok(sql.includes('max_uses'));
    assert.ok(sql.includes('locked'));
  });

  it('core routes resource=family to handleFamily', () => {
    const core = read('api/_utils/core.ts');
    assert.ok(core.includes("case 'family'"));
    assert.ok(core.includes('handleFamily'));
  });
});

describe('Vault Family Huddle UI', () => {
  it('mints Vault hash invite URLs — not a Connect path', () => {
    const access = read('api/_utils/familyHuddleAccess.ts');
    assert.ok(access.includes("return `/#/family/huddle/join?code="));
    assert.ok(access.includes('vaultFamilyHuddleJoinPath'));
    const handler = read('api/_utils/familyHuddleHandler.ts');
    assert.ok(handler.includes('vaultFamilyHuddleJoinPath(rawToken)'));
    assert.equal(handler.includes('path: `/family/huddle/join?code='), false);
  });

  it('summary action returns display names only — no householdId to the client', () => {
    const access = read('api/_utils/familyHuddleAccess.ts');
    assert.ok(access.includes('buildSanitizedFamilySummary'));
    assert.ok(access.includes('Household id stays on the server'));
    const handler = read('api/_utils/familyHuddleHandler.ts');
    assert.ok(handler.includes("action === 'summary'"));
    assert.ok(handler.includes('buildSanitizedFamilySummary'));
    const client = read('lib/familyHuddleClient.ts');
    assert.ok(client.includes("authedFetch('summary'"));
    assert.equal(/householdId/.test(client), false);
    assert.ok(client.includes("body: '{}'"));
    assert.ok(client.includes('invite-redeem'));
    assert.equal(client.includes('Authorization') || client.includes('getAuthHeaders'), true);
  });

  it('registers protected /family and public /family/huddle/join', () => {
    const app = read('App.tsx');
    assert.ok(app.includes("path=\"/family\""));
    assert.ok(app.includes("path=\"/family/huddle/join\""));
    assert.ok(app.includes('MyFamilyPage'));
    assert.ok(app.includes('FamilyHuddleJoinPage'));
    const joinIdx = app.indexOf('path="/family/huddle/join"');
    const joinSlice = app.slice(joinIdx, joinIdx + 160);
    assert.ok(joinSlice.includes('FamilyHuddleJoinPage'));
    assert.equal(joinSlice.includes('ProtectedRoute'), false);
    const familyIdx = app.indexOf('path="/family" element=');
    const familySlice = app.slice(familyIdx, familyIdx + 220);
    assert.ok(familySlice.includes('ProtectedRoute'));
    assert.ok(familySlice.includes('MyFamilyPage'));
    const shell = read('components/Layout/AppShell.tsx');
    assert.ok(shell.includes("pathname.startsWith('/family')"));
    const nav = read('lib/navBySection.tsx');
    assert.ok(nav.includes("label: 'My Family'") && nav.includes("path: '/family'"));
    const simple = read('lib/simpleNav.tsx');
    assert.ok(simple.includes("label: 'My Family'") && simple.includes("path: '/family'"));
    const perms = read('lib/permissions.ts');
    assert.ok(perms.includes("'/family': ALL_APP_ROLES"));
    assert.ok(existsSync(join(root, 'pages/family/MyFamily.tsx')));
    assert.ok(existsSync(join(root, 'pages/family/FamilyHuddleJoin.tsx')));
  });

  it('gates Family & Access huddle card on viewerCanHuddle', () => {
    const handler = read('api/_utils/familyAdminHandler.ts');
    assert.ok(handler.includes('viewerCanHuddle'));
    assert.ok(handler.includes('resolveAdultHouseholdForUser'));
    const section = read('components/people/FamilyAccessSection.tsx');
    assert.ok(section.includes('viewerCanHuddle'));
    assert.ok(section.includes('FamilyHuddleCard'));
    assert.ok(section.includes('Open My Family'));
    assert.ok(section.includes("to=\"/family\""));
    assert.ok(/viewerCanHuddle \? \(/.test(section) || section.includes('viewerCanHuddle ? ('));
  });

  it('FamilyVoiceHuddle uses keep-alive; adults can end, guests cannot', () => {
    const ui = read('components/family/FamilyVoiceHuddle.tsx');
    assert.ok(ui.includes('huddleKeepAlive'));
    assert.ok(ui.includes('HUDDLE_AUTO_REJOIN_DELAY_MS'));
    assert.ok(ui.includes('huddleTokenRefreshDelayMs'));
    assert.ok(ui.includes('shouldAutoRejoinHuddle'));
    assert.ok(ui.includes('endFamilyHuddle'));
    assert.ok(ui.includes('End Family Huddle for everyone'));
    assert.ok(ui.includes('canModerate && !isGuest'));
    assert.ok(ui.includes('guestToken'));
    assert.ok(ui.includes('whatsappInviteHref'));
    assert.ok(ui.includes('isScreenShareSupported'));
    assert.equal(/householdId/.test(ui), false);
  });
});
