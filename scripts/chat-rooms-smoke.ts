/**
 * PLCC Chat set 4 smoke: announcement-only rooms, pins, search (no Supabase required).
 * Run: npx tsx scripts/chat-rooms-smoke.ts
 */
import assert from 'node:assert/strict';
import {
  MAX_PINS_PER_ROOM,
  cleanSearchQuery,
  decideCanPost,
  escapeLike,
  isAnnounceOnly,
  setMessagePinned,
  splitArchives,
} from '../api/_utils/chatRooms.js';
import { mentionsEveryone } from '../api/_utils/chatLive.js';
import { decideHuddleStart } from '../api/_utils/huddleStartPolicy.js';

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log('Announcement rooms');
  await check('members read and react but cannot post; room leaders can', () => {
    const member = decideHuddleStart({ visibility: 'open', role: 'MEMBER', isChannelModerator: false, isChannelCreator: false, isMinistryLeaderInScope: false });
    const pastor = decideHuddleStart({ visibility: 'open', role: 'PASTOR', isChannelModerator: false, isChannelCreator: false, isMinistryLeaderInScope: false });
    const mod = decideHuddleStart({ visibility: 'private', role: 'MEMBER', isChannelModerator: true, isChannelCreator: false, isMinistryLeaderInScope: false });
    assert.equal(decideCanPost({ announceOnly: true, isRoomLeader: member.canStart }), false);
    assert.equal(decideCanPost({ announceOnly: true, isRoomLeader: pastor.canStart }), true);
    assert.equal(decideCanPost({ announceOnly: true, isRoomLeader: mod.canStart }), true);
    assert.equal(decideCanPost({ announceOnly: false, isRoomLeader: false }), true);
  });
  await check('only an explicit true turns it on', () => {
    assert.equal(isAnnounceOnly({ announce_only: true }), true);
    assert.equal(isAnnounceOnly({ announce_only: 'true' }), false);
    assert.equal(isAnnounceOnly(null), false);
  });

  console.log('Search');
  await check('needs 2+ characters; wildcards are literal', () => {
    assert.equal(cleanSearchQuery(' a '), null);
    assert.equal(cleanSearchQuery('  bible   study '), 'bible study');
    assert.equal(escapeLike('100%_off\\'), '100\\%\\_off\\\\');
  });

  console.log('Pins');
  await check(`a 6th pin drops the oldest (max ${MAX_PINS_PER_ROOM})`, async () => {
    const updates: Array<{ id: string; patch: any }> = [];
    const pins = Array.from({ length: MAX_PINS_PER_ROOM }, (_, i) => ({ id: `p${i}`, content: 'x', user_name: 'A', pinned_at: `2026-11-0${i + 1}`, created_at: 'x' }));
    const sb: any = {
      from: () => {
        const q: any = {
          _patch: null as any,
          select: () => q, eq: (k: string, v: any) => { if (k === 'id') q._id = v; return q; },
          not: () => q, is: () => q, order: () => q,
          limit: async () => ({ data: pins, error: null }),
          update: (patch: any) => { q._patch = patch; return q; },
          then: (resolve: any) => { if (q._patch) updates.push({ id: q._id, patch: q._patch }); resolve({ error: null }); },
        };
        return q;
      },
    };
    const res = await setMessagePinned(sb, { channelId: 'c', messageId: 'new', userId: 'u', pinned: true });
    assert.equal(res.ok, true);
    assert.deepEqual(updates.map((u) => [u.id, u.patch.pinned_at === null]), [[`p${MAX_PINS_PER_ROOM - 1}`, true], ['new', false]]);
  });

  console.log('Archive + @everyone');
  await check('archived chats stay hidden until someone else posts after archiving', () => {
    const rows = [
      { channel_id: 'a', archived_at: '2026-11-02T10:00:00Z' },
      { channel_id: 'b', archived_at: '2026-11-02T10:00:00Z' },
      { channel_id: 'c', archived_at: '2026-11-02T10:00:00Z' },
    ];
    const latest = new Map([['a', '2026-11-02T09:00:00Z'], ['b', '2026-11-02T11:00:00Z']]);
    const { keep, revive } = splitArchives(rows, latest);
    assert.deepEqual(keep.map((k) => k.channelId), ['a', 'c']);
    assert.deepEqual(revive, ['b']);
  });
  await check('@everyone / @all as a word only', () => {
    assert.equal(mentionsEveryone('@everyone service moved to 11'), true);
    assert.equal(mentionsEveryone('Reminder @All!'), true);
    assert.equal(mentionsEveryone('email@everyone.org'), false);
    assert.equal(mentionsEveryone('@everyones'), false);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
