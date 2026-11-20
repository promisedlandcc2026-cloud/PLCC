/**
 * Private calls smoke (Nov 20 2026): audio / video calls between the two people in a
 * DM. Ring → phone alert + ping on the other person's call topic; answer; decline;
 * blocked people can't call. LiveKit and Supabase are faked.
 * Run: npx tsx scripts/community-phase-dm-call-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DM_CALL_ROOM_PREFIX,
  buildDmCallMetadata,
  callInboxTopic,
  decideDmCallStatus,
  dmCallAlertFor,
  dmCallRoomName,
  handleDmCall,
  parseDmCallCommand,
  parseDmCallMetadata,
  planDmCallToken,
  type DmCallContext,
  type DmCallRooms,
} from '../api/_utils/dmCall.js';
import { VOICE_ROOM_PREFIX, channelIdFromVoiceRoomName } from '../api/_utils/livekitVoice.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
};
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DM = `DM_${A}_${B}`;

function fakeRooms() {
  const rooms = new Map<string, { metadata: string; participantIds: string[] }>();
  const api: DmCallRooms = {
    create: async (name, metadata) => {
      const r = rooms.get(name);
      rooms.set(name, { metadata, participantIds: r?.participantIds || [] });
    },
    read: async (name) => rooms.get(name) || null,
    remove: async (name) => {
      rooms.delete(name);
    },
    listCalls: async () => [...rooms.entries()].map(([name, r]) => ({ name, metadata: r.metadata, people: r.participantIds.length })),
    mint: async (plan) => `token-for-${plan.identity}-${plan.roomName}`,
  };
  return { rooms, api };
}

function ctxFor(userId: string, rooms: DmCallRooms, over: Partial<DmCallContext> = {}) {
  const log = { broadcasts: [] as any[], pushes: [] as any[], notes: [] as any[] };
  const pending: Promise<unknown>[] = [];
  const ctx: DmCallContext = {
    userId,
    displayName: userId === A ? 'Ann' : 'Ben',
    lk: { url: 'wss://example.livekit.cloud', apiKey: 'k', apiSecret: 's' } as any,
    loadChannel: async () => ({ ok: true, channel: { id: C, name: DM, visibility: 'dm' } }),
    partnerOf: (ch, uid) => {
      const p = String(ch.name).split('_');
      return p[1] === uid ? p[2] : p[2] === uid ? p[1] : null;
    },
    blockStatus: async () => 'none',
    memberBlocked: async () => false,
    broadcast: async (topic, event, payload) => log.broadcasts.push({ topic, event, payload }),
    push: async (ids, msg) => log.pushes.push({ ids, msg }),
    postNote: async (cid, content) => log.notes.push({ cid, content }),
    later: (p) => pending.push(p),
    rooms,
    ...over,
  };
  return { ctx, log, flush: () => Promise.all(pending) };
}

process.env.CHAT_REALTIME_SECRET = 'test-secret';

async function main() {
await ok('commands are validated', () => {
  assert.equal(parseDmCallCommand({ action: 'inbox' }).ok, true);
  const r = parseDmCallCommand({ action: 'ring', channelId: C, video: true });
  assert.equal(r.ok && r.cmd.video, true);
  const j = parseDmCallCommand({ action: 'join', channelId: C, video: true });
  assert.equal(j.ok && j.cmd.video, false, 'only ring decides video');
  assert.equal(parseDmCallCommand({ action: 'ring', channelId: 'nope' }).ok, false);
  assert.equal(parseDmCallCommand({ action: 'hack', channelId: C }).ok, false);
});

await ok('call rooms never look like prayer rooms', () => {
  const name = dmCallRoomName(C);
  assert.ok(name.startsWith(DM_CALL_ROOM_PREFIX));
  assert.ok(!name.startsWith(VOICE_ROOM_PREFIX));
  assert.equal(channelIdFromVoiceRoomName(name), null, 'webhook / attendance / alerts skip it');
});

await ok('everyone gets mic and camera (video calls are for all members)', () => {
  const plan = planDmCallToken({ userId: B, displayName: 'Ben', channelId: C });
  assert.equal(plan.grant.canPublish, true);
  assert.equal(plan.grant.roomAdmin, false);
  assert.equal(plan.grant.canPublishSources.length, 2);
});

await ok('call topics are private and different per person', () => {
  assert.notEqual(callInboxTopic(A), callInboxTopic(B));
  assert.ok(!callInboxTopic(A).includes(A));
  assert.equal(callInboxTopic(A, ''), '');
});

await ok('alert text', () => {
  const v = dmCallAlertFor({ callerName: 'Ann', channelId: C, video: true });
  assert.match(v.title, /Ann is video calling/);
  assert.match(v.url, /\?call=answer$/);
  assert.match(dmCallAlertFor({ callerName: 'Ann', channelId: C, video: false }).title, /Ann is calling/);
});

await ok('metadata round trip', () => {
  const m = parseDmCallMetadata(buildDmCallMetadata({ callerId: A, callerName: 'Ann', video: true, startedAt: 1 }));
  assert.equal(m?.callerId, A);
  assert.equal(m?.video, true);
  assert.equal(parseDmCallMetadata('{"stage":1}'), null, 'prayer-room metadata is not a call');
});

await ok('ring: caller gets a pass, the other person is pinged, alerted, and a note is left', async () => {
  const { rooms, api } = fakeRooms();
  const { ctx, log, flush } = ctxFor(A, api);
  const r = await handleDmCall({ action: 'ring', channelId: C, video: true }, ctx);
  await flush();
  assert.equal(r.status, 200);
  assert.equal(r.body.partnerId, B);
  assert.equal(r.body.video, true);
  assert.ok(rooms.has(dmCallRoomName(C)));
  const ring = log.broadcasts.find((b) => b.event === 'ring');
  assert.equal(ring.topic, callInboxTopic(B));
  assert.equal(ring.payload.video, '1');
  assert.deepEqual(log.pushes[0].ids, [B]);
  assert.equal(log.notes[0].content, '🎥 Video call');
});

await ok('status: ringing for the other person while only the caller is in', async () => {
  const { rooms, api } = fakeRooms();
  await handleDmCall({ action: 'ring', channelId: C, video: false }, ctxFor(A, api).ctx);
  rooms.get(dmCallRoomName(C))!.participantIds = [A];
  const s = await handleDmCall({ action: 'status', channelId: C, video: false }, ctxFor(B, api).ctx);
  assert.equal(s.body.ringing, true);
  assert.equal(s.body.callerName, 'Ann');
  const mine = await handleDmCall({ action: 'status', channelId: C, video: false }, ctxFor(A, api).ctx);
  assert.equal(mine.body.ringing, false, 'never rings for the caller');
});

await ok('join: answers a live call; a finished call says so', async () => {
  const { rooms, api } = fakeRooms();
  const none = await handleDmCall({ action: 'join', channelId: C, video: false }, ctxFor(B, api).ctx);
  assert.equal(none.status, 410);
  await handleDmCall({ action: 'ring', channelId: C, video: true }, ctxFor(A, api).ctx);
  rooms.get(dmCallRoomName(C))!.participantIds = [A];
  const { ctx, log, flush } = ctxFor(B, api);
  const j = await handleDmCall({ action: 'join', channelId: C, video: false }, ctx);
  await flush();
  assert.equal(j.status, 200);
  assert.equal(j.body.video, true, 'video follows the ring');
  assert.ok(log.broadcasts.some((b) => b.event === 'answered' && b.topic === callInboxTopic(B)), 'my other phones stop ringing');
});

await ok('decline tells the caller; end closes the room', async () => {
  const { rooms, api } = fakeRooms();
  await handleDmCall({ action: 'ring', channelId: C, video: false }, ctxFor(A, api).ctx);
  const d = ctxFor(B, api);
  await handleDmCall({ action: 'decline', channelId: C, video: false }, d.ctx);
  await d.flush();
  assert.ok(d.log.broadcasts.some((b) => b.event === 'ended' && b.topic === callInboxTopic(A) && b.payload.reason === 'declined'));
  assert.ok(rooms.has(dmCallRoomName(C)), 'decline leaves the caller to hang up');
  await handleDmCall({ action: 'end', channelId: C, video: false }, ctxFor(A, api).ctx);
  assert.ok(!rooms.has(dmCallRoomName(C)));
});

await ok('blocked people and paused members cannot call', async () => {
  const { api } = fakeRooms();
  const iBlocked = await handleDmCall({ action: 'ring', channelId: C, video: false }, ctxFor(A, api, { blockStatus: async () => 'i_blocked' }).ctx);
  assert.equal(iBlocked.status, 403);
  assert.match(String(iBlocked.body.error), /Unblock/);
  const theyBlocked = await handleDmCall({ action: 'ring', channelId: C, video: false }, ctxFor(A, api, { blockStatus: async () => 'blocked_me' }).ctx);
  assert.equal(theyBlocked.status, 403);
  const paused = await handleDmCall({ action: 'join', channelId: C, video: false }, ctxFor(A, api, { memberBlocked: async () => true }).ctx);
  assert.equal(paused.body.code, 'member_blocked');
});

await ok('only private chats, and only the two people in them', async () => {
  const { api } = fakeRooms();
  const group = await handleDmCall(
    { action: 'ring', channelId: C, video: false },
    ctxFor(A, api, { loadChannel: async () => ({ ok: true, channel: { id: C, name: 'Youth' } }) }).ctx
  );
  assert.equal(group.status, 400);
  const stranger = await handleDmCall({ action: 'ring', channelId: C, video: false }, ctxFor(C, api).ctx);
  assert.equal(stranger.status, 400);
});

await ok('calling back while they are calling you points you to their call', async () => {
  const { rooms, api } = fakeRooms();
  await handleDmCall({ action: 'ring', channelId: C, video: false }, ctxFor(A, api).ctx);
  rooms.get(dmCallRoomName(C))!.participantIds = [A];
  const r = await handleDmCall({ action: 'ring', channelId: C, video: false }, ctxFor(B, api).ctx);
  assert.equal(r.body.code, 'call_incoming');
});

await ok('status helper ignores stale rings', () => {
  const old = decideDmCallStatus({
    meta: { callerId: A, callerName: 'Ann', video: false, startedAt: Date.now() - 10 * 60_000 },
    participantIds: [A],
    userId: B,
  });
  assert.equal(old.ringing, false);
});

await ok('pending: finds a call ringing for me even if the ring ping was missed', async () => {
  const { rooms, api } = fakeRooms();
  const none = await handleDmCall({ action: 'pending', channelId: null, video: false }, ctxFor(B, api).ctx);
  assert.equal(none.body.ringing, false);
  await handleDmCall({ action: 'ring', channelId: C, video: true }, ctxFor(A, api).ctx);
  rooms.get(dmCallRoomName(C))!.participantIds = [A];
  const p = await handleDmCall({ action: 'pending', channelId: null, video: false }, ctxFor(B, api).ctx);
  assert.equal(p.body.ringing, true);
  assert.equal(p.body.channelId, C);
  assert.equal(p.body.video, true);
  const mine = await handleDmCall({ action: 'pending', channelId: null, video: false }, ctxFor(A, api).ctx);
  assert.equal(mine.body.ringing, false, 'never for the caller');
  assert.equal(parseDmCallCommand({ action: 'pending' }).ok, true);
});

await ok('route is wired in core.ts', () => {
  const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  assert.match(core, /chatType === 'dm-call'/);
  assert.match(core, /subResource === 'dm-call'/);
  assert.match(core, /handleDmCall\(/);
});

console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
