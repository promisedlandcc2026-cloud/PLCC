// Nov 27 outage follow-up: "Seen by" removed; mark-read shares the room lookup.
// Run: npx tsx scripts/chat-read-throttle-smoke.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mod from '../api/_utils/chatReadThrottle.ts';
const { fetchChannelForRead, __resetChatReadThrottle } = mod;

function fakeSupabase() {
  const calls = { chat_channels: 0 };
  const from = (table) => {
    calls[table] = (calls[table] || 0) + 1;
    const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data: { id: 'room' }, error: null }) };
    return q;
  };
  return { from, calls };
}

describe('mark-read', () => {
  beforeEach(() => __resetChatReadThrottle());

  it('30 people marking the same room read share one room lookup', async () => {
    const sb = fakeSupabase();
    await Promise.all(Array.from({ length: 30 }, () => fetchChannelForRead(sb, 'room')));
    assert.equal(sb.calls.chat_channels, 1);
  });

  it('"Seen by" is gone: no read-receipts endpoint and no "read" signal', () => {
    const core = readFileSync(new URL('../api/_utils/core.ts', import.meta.url), 'utf8');
    assert.ok(!core.includes("chatType === 'read-receipts'"));
    assert.ok(!core.includes("subResource === 'read-receipts'"));
    assert.ok(!core.includes("broadcastChatEvent(cid, 'read'"));
    assert.ok(core.includes("chatType === 'mark-read'"), 'unread counts still work');
  });
});
