/**
 * PLCC Chat live updates + phone alerts smoke (no Supabase/Realtime required).
 * Run: npx tsx scripts/chat-live-smoke.ts
 */
import assert from 'node:assert/strict';
import {
  __setChatLiveFetchForTests,
  broadcastChatEvent,
  chatAlertAudience,
  chatAlertFor,
  chatRealtimeTopic,
  decideChatEdit,
  mutedUserIds,
} from '../api/_utils/chatLive.js';
import { cleanTopics } from '../api/_utils/pushAlerts.js';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const U1 = '33333333-3333-4333-8333-333333333333';
const U2 = '44444444-4444-4444-8444-444444444444';

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fakeSupabase(tables: Record<string, any[]>): any {
  return {
    from(table: string) {
      const rows = tables[table] || [];
      const filters: Array<[string, any]> = [];
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => (filters.push([k, v]), q),
        then: (resolve: any) => resolve({ data: rows.filter((r) => filters.every(([k, v]) => r[k] === v)), error: null }),
      };
      return q;
    },
  };
}

async function main() {
  console.log('Chat live updates');
  await check('room topic is stable, different per room, and needs the secret', () => {
    const a = chatRealtimeTopic(C1, 'secret');
    assert.equal(a, chatRealtimeTopic(C1, 'secret'));
    assert.notEqual(a, chatRealtimeTopic(C2, 'secret'));
    assert.notEqual(a, chatRealtimeTopic(C1, 'other-secret'));
    assert.ok(!a.includes(C1), 'room id must not be readable from the topic');
    assert.equal(chatRealtimeTopic(C1, ''), '');
  });

  await check('broadcast sends ids only to the Realtime REST API', async () => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    let seen: any = null;
    __setChatLiveFetchForTests((async (url: any, init: any) => {
      seen = { url: String(url), body: JSON.parse(init.body), headers: init.headers };
      return new Response(null, { status: 202 });
    }) as any);
    assert.equal(await broadcastChatEvent(C1, 'message', { id: U1 }), true);
    assert.equal(seen.url, 'https://proj.supabase.co/realtime/v1/api/broadcast');
    assert.equal(seen.body.messages[0].topic, chatRealtimeTopic(C1, 'service-key'));
    assert.deepEqual(seen.body.messages[0].payload, { id: U1 });
    __setChatLiveFetchForTests(null);
  });

  await check('broadcast never throws when Realtime is down', async () => {
    __setChatLiveFetchForTests((async () => {
      throw new Error('down');
    }) as any);
    assert.equal(await broadcastChatEvent(C1, 'message', { id: U1 }), false);
    __setChatLiveFetchForTests(null);
  });

  console.log('Phone alerts');
  await check('group alert: room name, "Name: text", opens the room, one per room', () => {
    const a = chatAlertFor({ channel: { id: C1, name: "Men's Ministry", visibility: 'ministry' }, authorName: 'Bro Paul', content: 'Meeting at 7' });
    assert.deepEqual(a, {
      title: "Men's Ministry",
      body: 'Bro Paul: Meeting at 7',
      url: `/community/chat/${C1}`,
      tag: `chat:${C1}`,
    });
  });

  await check('direct message alert: sender as title', () => {
    const a = chatAlertFor({ channel: { id: C1, name: 'DM_x', visibility: 'dm' }, authorName: 'Sis Ann', content: '📷 Photo' });
    assert.equal(a.title, 'Sis Ann');
    assert.equal(a.body, '📷 Photo');
  });

  await check('audience: open rooms → everyone with chat alerts; others → members', async () => {
    const sb = fakeSupabase({ chat_room_members: [{ channel_id: C1, user_id: U2 }] });
    assert.deepEqual(await chatAlertAudience(sb, { id: C1, visibility: 'open' }), { everyone: true });
    const ministry = await chatAlertAudience(sb, { id: C1, visibility: 'ministry', participants: [U1] });
    assert.deepEqual((ministry as any).userIds.sort(), [U1, U2].sort());
    const dm = await chatAlertAudience(sb, { id: C1, visibility: 'dm', participants: JSON.stringify([U1, U2]) });
    assert.deepEqual((dm as any).userIds.sort(), [U1, U2].sort());
  });

  await check('muted (forever or until later) are skipped; expired mutes are not', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const past = new Date(Date.now() - 3600_000).toISOString();
    const sb = fakeSupabase({
      chat_room_mutes: [
        { channel_id: C1, user_id: U1, muted_until: null },
        { channel_id: C1, user_id: U2, muted_until: past },
        { channel_id: C1, user_id: 'later', muted_until: future },
      ],
    });
    const muted = await mutedUserIds(sb, C1);
    assert.equal(muted.has(U1), true);
    assert.equal(muted.has(U2), false);
    assert.equal(muted.has('later'), true);
  });

  await check('PLCC Chat phones can subscribe to chat only; Connect keeps church alerts', () => {
    assert.deepEqual(cleanTopics(['chat']), ['chat']);
    assert.ok(cleanTopics(['prayer']).includes('church'));
    assert.ok(!cleanTopics(undefined).includes('chat'), 'chat is never on by default for Connect');
  });

  console.log('Editing');
  await check('authors can edit within 24 hours; nobody else, never removed messages', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    const base = { authorId: U1, userId: U1, createdAt: '2026-11-02T08:00:00Z', deletedAt: null, now };
    assert.equal(decideChatEdit(base).ok, true);
    assert.equal(decideChatEdit({ ...base, userId: U2 }).ok, false);
    assert.equal(decideChatEdit({ ...base, authorId: null }).ok, false);
    assert.equal(decideChatEdit({ ...base, deletedAt: '2026-11-02T09:00:00Z' }).ok, false);
    assert.equal(decideChatEdit({ ...base, createdAt: '2026-11-01T11:00:00Z' }).ok, false);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
