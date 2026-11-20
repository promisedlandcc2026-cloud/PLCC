/**
 * Member conduct smoke (Nov 19 2026): warn first, then block; a block stops calls,
 * chat and Tribes posts until a leader unblocks. No Supabase or LiveKit needed.
 * Run: npx tsx scripts/community-phase-member-conduct-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMBER_BLOCKED_CODE, WARN_VALID_DAYS, parseConductCommand, warningStillCounts } from '../api/_utils/memberConduct.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};
const T = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const day = 86400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

ok('commands are validated', () => {
  const c = parseConductCommand({ action: 'warn', targetUserId: T, reason: '  Shouting over the prayer  ', place: 'call', app: 'tribes' });
  assert.equal(c.ok, true);
  if (c.ok) {
    assert.equal(c.cmd.reason, 'Shouting over the prayer');
    assert.equal(c.cmd.place, 'call');
    assert.equal(c.cmd.app, 'tribes');
  }
  assert.equal(parseConductCommand({ action: 'ban', targetUserId: T }).ok, false);
  assert.equal(parseConductCommand({ action: 'warn', targetUserId: 'nope' }).ok, false);
});

ok('a block needs a recent warning that came after the last unblock', () => {
  assert.equal(warningStillCounts([]), null);
  assert.ok(warningStillCounts([{ action: 'warn', created_at: iso(day) }]));
  assert.equal(warningStillCounts([{ action: 'warn', created_at: iso((WARN_VALID_DAYS + 1) * day) }]), null);
  assert.equal(
    warningStillCounts([
      { action: 'unblock', created_at: iso(day) },
      { action: 'warn', created_at: iso(3 * day) },
    ]),
    null,
    'warnings before an unblock start over'
  );
  assert.ok(
    warningStillCounts([
      { action: 'warn', created_at: iso(1000) },
      { action: 'unblock', created_at: iso(day) },
    ])
  );
});

ok('Canaan refuses blocked members: call pass, chat messages, Tribes posts/comments', () => {
  const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  const voice = core.indexOf("if (chatType === 'voice-token') {");
  assert.ok(core.slice(voice, voice + 700).includes('isMemberBlocked'));
  const msgs = core.indexOf("if (chatType === 'messages') {\n                // Blocked");
  assert.ok(msgs > 0 && core.slice(msgs, msgs + 600).includes('isMemberBlocked'));
  assert.match(core, /feedType === 'posts' \|\| feedType === 'comments'\)\) \{\s*const \{ isMemberBlocked/);
  assert.match(core, /chatType === 'member-conduct'/);
  assert.match(core, /subResource === 'member-conduct'/);
  assert.equal(MEMBER_BLOCKED_CODE, 'member_blocked');
});

ok('block takes them out of every live Ka Link and tells them; Canaan has an Unblock page', () => {
  const lk = readFileSync(join(root, 'api/_utils/livekitVoice.ts'), 'utf8');
  assert.match(lk, /export async function removeFromAllHuddles/);
  assert.match(lk, /HUDDLE_CONDUCT_TOPIC = 'plcc\.conduct'/);
  const app = readFileSync(join(root, 'App.tsx'), 'utf8');
  assert.match(app, /\/admin\/blocked-members/);
  const sql = readFileSync(join(root, 'supabase/migrations/member_conduct.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.member_blocks/);
  assert.match(sql, /REVOKE ALL ON public\.member_conduct_log FROM anon, authenticated/);
});

console.log(`\n${passed} passed`);
