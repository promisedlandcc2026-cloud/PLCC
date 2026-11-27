// Nov 27 outage: "read" storms in busy Ka Link rooms. Run: npx tsx scripts/chat-read-throttle-smoke.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mod from '../api/_utils/chatReadThrottle.ts';
const { shouldBroadcastRead, roomReceipts, fetchChannelForRead, __resetChatReadThrottle } = mod;

function fakeSupabase() {
  const calls = { chat_read_status: 0, users: 0, chat_channels: 0 };
  const from = (table) => {
    calls[table] = (calls[table] || 0) + 1;
    const q = {
      select() { return q; }, eq() { return q; }, neq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; },
      maybeSingle: async () => ({ data: { id: 'room', type: 'channel' }, error: null }),
      then(resolve) {
        if (table === 'chat_read_status') resolve({ data: [{ user_id: 'a', last_read_at: '2026-11-27T19:00:00Z' }, { user_id: 'b', last_read_at: '2026-11-27T18:00:00Z' }], error: null });
        else resolve({ data: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Ben' }], error: null });
      },
    };
    return q;
  };
  return { from, calls };
}

describe('chat read brakes', () => {
  beforeEach(() => __resetChatReadThrottle());

  it('sends at most one "read" signal per room every few seconds', () => {
    assert.equal(shouldBroadcastRead('room', 1_000), true);
    assert.equal(shouldBroadcastRead('room', 2_000), false);
    assert.equal(shouldBroadcastRead('other', 2_000), true);
    assert.equal(shouldBroadcastRead('room', 5_500), true);
  });

  it('50 people asking "Seen by" at once costs one database read', async () => {
    const sb = fakeSupabase();
    const all = await Promise.all(Array.from({ length: 50 }, () => roomReceipts(sb, 'room')));
    assert.equal(sb.calls.chat_read_status, 1);
    assert.equal(sb.calls.users, 1);
    assert.equal(all[0][0].name, 'Ann');
    await roomReceipts(sb, 'room');
    assert.equal(sb.calls.chat_read_status, 1, 'still cached a moment later');
  });

  it('room lookups for read paths are shared too', async () => {
    const sb = fakeSupabase();
    await Promise.all(Array.from({ length: 30 }, () => fetchChannelForRead(sb, 'room')));
    assert.equal(sb.calls.chat_channels, 1);
  });
});
