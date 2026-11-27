// Emergency entry passes + strict health check (Nov 27 outage).
// Run: npx tsx scripts/ka-link-emergency-entry-smoke.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import passesMod from '../api/_utils/kaLinkPasses.ts';
import fallbackMod from '../api/_utils/huddleFallbackPass.ts';
const { buildPrayerRoomPasses, KA_LINK_PASS_TTL_SECONDS } = passesMod;
const { verifyHuddleFallbackPass } = fallbackMod;

const secret = 'test-livekit-secret';
const channels = [
  { id: 'c-morning', name: 'Morning Glory' },
  { id: 'c-midnight', name: 'PLCC Midnight Watch 🙏' },
  { id: 'c-youth', name: 'Youth Ministry' },
];
const base = { channels, userId: 'u1', displayName: 'Ann', role: 'MEMBER', moderator: false, teamRole: null, teamHasAdmins: true, secret, nowSeconds: 1_000_000 };

describe('prayer room passes', () => {
  it('only prayer rooms, each pass verifies for that room for 24 hours', () => {
    const passes = buildPrayerRoomPasses(base);
    assert.deepEqual(passes.map((p) => p.channelId), ['c-morning', 'c-midnight']);
    const claims = verifyHuddleFallbackPass(passes[0].pass, secret, 1_000_000);
    assert.equal(claims.channelId, 'c-morning');
    assert.equal(claims.userId, 'u1');
    assert.equal(claims.exp, 1_000_000 + KA_LINK_PASS_TTL_SECONDS);
    assert.equal(verifyHuddleFallbackPass(passes[0].pass, secret, 1_000_000 + KA_LINK_PASS_TTL_SECONDS + 1), null, 'expires');
    assert.equal(verifyHuddleFallbackPass(passes[0].pass, 'wrong-secret', 1_000_000), null, 'cannot be forged');
  });

  it('members can join a live room but not open an empty one; admins can', () => {
    const member = verifyHuddleFallbackPass(buildPrayerRoomPasses(base)[0].pass, secret, 1_000_000);
    assert.equal(member.canStart, false);
    assert.equal(member.canModerate, false);
    const superAdmin = verifyHuddleFallbackPass(buildPrayerRoomPasses({ ...base, role: 'SUPER_ADMIN', moderator: true })[0].pass, secret, 1_000_000);
    assert.equal(superAdmin.canStart, true);
    assert.equal(superAdmin.canModerate, true);
    const teamAdmin = verifyHuddleFallbackPass(buildPrayerRoomPasses({ ...base, teamRole: 'admin' })[0].pass, secret, 1_000_000);
    assert.equal(teamAdmin.canStart, true);
  });
});

describe('health check for uptime monitors', () => {
  it('strict mode answers 503 when the database is unavailable', async () => {
    const prior = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.SUPABASE_URL; delete process.env.VITE_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const mod = await import('../api/_utils/vaultNewsHandler.ts'); const handleVaultHealth = mod.handleVaultHealth || mod.default?.handleVaultHealth;
    const res = () => ({ code: 0, body: null, setHeader() {}, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } });
    const strict = res(); await handleVaultHealth({ query: { strict: '1' } }, strict);
    assert.equal(strict.code, 503);
    assert.equal(strict.body.database, 'unavailable');
    const normal = res(); await handleVaultHealth({ query: {} }, normal);
    assert.equal(normal.code, 200, 'apps still get 200');
    if (prior.url) process.env.SUPABASE_URL = prior.url;
    if (prior.key) process.env.SUPABASE_SERVICE_ROLE_KEY = prior.key;
  });
});
