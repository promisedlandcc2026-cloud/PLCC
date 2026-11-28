// Nov 28 test of the backup call line (Daily) with the church database down.
// The database is unreachable (every Supabase call fails); LiveKit and Daily
// still answer. Run: npx tsx scripts/ka-link-backup-line-db-down-smoke.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fallbackMod from '../api/_utils/huddleFallbackPass.ts';
const { handleVoiceTokenFallback, signHuddleFallbackPass, decideFallbackLine } = fallbackMod;

const ROOM = '11111111-1111-4111-8111-111111111111';
const SECRET = 'lk-secret-for-tests';
process.env.LIVEKIT_URL = 'wss://plcc-test.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'APItest';
process.env.LIVEKIT_API_SECRET = SECRET;
process.env.SUPABASE_URL = 'https://db-down.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

let world;
beforeEach(() => {
  world = { livekitPeople: 0, dailyPeople: 0, supabaseCalls: 0, dailyTokens: 0 };
  process.env.DAILY_API_KEY = 'daily-key';
});
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input);
  if (url.includes('supabase.co')) {
    world.supabaseCalls += 1;
    throw new TypeError('fetch failed (database down)');
  }
  if (url.includes('livekit.cloud')) {
    if (url.includes('ListParticipants')) {
      return json(200, { participants: Array.from({ length: world.livekitPeople }, (_, i) => ({ identity: `p${i}`, state: 'ACTIVE', kind: 0 })) });
    }
    return json(200, {});
  }
  if (url.startsWith('https://api.daily.co/v1/presence')) {
    return json(200, world.dailyPeople ? { [`awc-vault-${ROOM}`]: { participants: Array.from({ length: world.dailyPeople }, (_, i) => ({ id: `d${i}` })) } } : {});
  }
  if (url.startsWith('https://api.daily.co/v1/rooms')) return json(200, { name: `awc-vault-${ROOM}`, url: `https://plcc.daily.co/awc-vault-${ROOM}` });
  if (url.startsWith('https://api.daily.co/v1/meeting-tokens')) {
    world.dailyTokens += 1;
    return json(200, { token: 'daily-meeting-token' });
  }
  throw new Error(`unexpected fetch ${url}`);
};

const pass = (canStart = false) =>
  signHuddleFallbackPass({ userId: 'member-1', channelId: ROOM, displayName: 'Ann', canModerate: false, channelCanModerate: false, canStart }, SECRET);
async function join(body) {
  const res = { code: 0, body: null, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; }, setHeader() {} };
  await handleVoiceTokenFallback({ method: 'POST', body }, res);
  return res;
}

describe('backup line (Daily) with the database down', () => {
  it('LiveKit refused (out of minutes): the saved pass opens Daily, no database', async () => {
    world.dailyPeople = 14;
    const r = await join({ channelId: ROOM, fallbackPass: pass(), line: 'daily' });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.provider, 'daily');
    assert.equal(r.body.token, 'daily-meeting-token');
    assert.match(r.body.url, /^https:\/\/plcc\.daily\.co\//);
    assert.equal(world.supabaseCalls, 0);
  });

  it('room already moved to Daily: a rejoining phone follows the people there', async () => {
    world.dailyPeople = 9;
    world.livekitPeople = 0;
    const r = await join({ channelId: ROOM, fallbackPass: pass() });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.provider, 'daily');
    assert.equal(world.supabaseCalls, 0);
  });

  it('room on LiveKit: stays on LiveKit (no split room)', async () => {
    world.livekitPeople = 20;
    world.dailyPeople = 0;
    const r = await join({ channelId: ROOM, fallbackPass: pass() });
    assert.notEqual(r.body?.provider, 'daily');
    assert.equal(world.dailyTokens, 0);
    assert.equal(world.supabaseCalls, 0);
  });

  it('empty room: a member can’t open it on Daily, a Ka Link admin can', async () => {
    const member = await join({ channelId: ROOM, fallbackPass: pass(false), line: 'daily' });
    assert.equal(member.code, 403);
    assert.equal(world.dailyTokens, 0);
    const admin = await join({ channelId: ROOM, fallbackPass: pass(true), line: 'daily' });
    assert.equal(admin.code, 200, JSON.stringify(admin.body));
    assert.equal(admin.body.provider, 'daily');
  });

  it('forged or other-room pass, bad line, Daily not set up: refused', async () => {
    world.dailyPeople = 3;
    assert.equal((await join({ channelId: ROOM, fallbackPass: 'x.y', line: 'daily' })).code, 401);
    assert.equal((await join({ channelId: '22222222-2222-4222-8222-222222222222', fallbackPass: pass(), line: 'daily' })).code, 401);
    assert.equal((await join({ channelId: ROOM, fallbackPass: pass(), line: 'zoom' })).code, 400);
    delete process.env.DAILY_API_KEY;
    world.livekitPeople = 2;
    assert.equal((await join({ channelId: ROOM, fallbackPass: pass(), line: 'daily' })).code, 503);
  });

  it('line choice', () => {
    assert.equal(decideFallbackLine(null, { livekit: 0, daily: 5 }, true), 'daily');
    assert.equal(decideFallbackLine(null, { livekit: 3, daily: 5 }, true), 'livekit');
    assert.equal(decideFallbackLine(null, { livekit: null, daily: 5 }, true), 'daily');
    assert.equal(decideFallbackLine(null, { livekit: 0, daily: 5 }, false), 'livekit');
    assert.equal(decideFallbackLine('daily', { livekit: 9, daily: 0 }, true), 'daily');
  });
});
