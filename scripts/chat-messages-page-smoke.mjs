// Nov 28: phones reload only the messages that changed, not the whole room.
// Run: npx tsx scripts/chat-messages-page-smoke.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mod from '../api/_utils/chatMessagesPage.ts';
const { parseChatMessagesPageQuery, CHAT_PAGE_MAX_IDS } = mod;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('chat messages page query', () => {
  it('no params = the whole room, as before (and marks read)', () => {
    assert.deepEqual(parseChatMessagesPageQuery({ channelId: A }), { ok: true, ids: null, after: null, limit: null, partial: false });
  });
  it('ids, after and limit are read and checked', () => {
    const r = parseChatMessagesPageQuery({ ids: `${A}, ${B},${A}`, after: '2026-11-28T07:00:00Z', limit: '200' });
    assert.deepEqual(r, { ok: true, ids: [A, B], after: '2026-11-28T07:00:00.000Z', limit: 200, partial: true });
    assert.equal(parseChatMessagesPageQuery({ limit: '200' }).partial, false);
  });
  it('rejects bad input', () => {
    assert.equal(parseChatMessagesPageQuery({ ids: 'x' }).ok, false);
    assert.equal(parseChatMessagesPageQuery({ ids: Array.from({ length: CHAT_PAGE_MAX_IDS + 1 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`).join(',') }).ok, false);
    assert.equal(parseChatMessagesPageQuery({ after: 'soon' }).ok, false);
    assert.equal(parseChatMessagesPageQuery({ limit: '0' }).ok, false);
    assert.equal(parseChatMessagesPageQuery({ limit: '201' }).ok, false);
  });
  it('the messages endpoint uses it and skips read status on partial reloads', () => {
    const core = readFileSync(new URL('../api/_utils/core.ts', import.meta.url), 'utf8');
    assert.match(core, /parseChatMessagesPageQuery\(req\.query\)/);
    assert.match(core, /if \(pageQ\.ids\) msgQuery = msgQuery\.in\('id', pageQ\.ids\)/);
    assert.match(core, /if \(!pageQ\.partial\) await upsertChatReadStatus/);
  });
});
