/**
 * Issues smoke (Nov 19 2026): Ka Link / Tribes report problems, leaders read
 * "who, why, fix". Ported from AWC Vault. No Supabase or LiveKit needed.
 * Run: npx tsx scripts/community-phase-issues-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLiveKitHuddleAudit,
  canViewPlccIssues,
  chatIssueSeverity,
  describeChatIssue,
  parseChatIssueReport,
} from '../api/_utils/plccIssues.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const CH = '11111111-2222-4333-8444-555555555555';
const fakeDb = (teamRole: string | null) =>
  ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: teamRole ? { team_role: teamRole } : null }) }) }),
    }),
  }) as any;

async function main() {
await ok('reports are validated and Ka Link / Tribes sources kept', () => {
  const r = parseChatIssueReport({ area: 'huddle', code: 'huddle_join_stalled', source: 'tribes-app', channelId: CH, extra: { hidden: true, junk: 1 } });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.report.source, 'tribes-app');
    assert.deepEqual(r.report.extra, { hidden: true });
  }
  assert.equal(parseChatIssueReport({ area: 'nope', code: 'x' }).ok, false);
  assert.equal(parseChatIssueReport({ area: 'app', code: 'bad code!' }).ok, false);
});

await ok('plain-English titles say Ka Link and Canaan', () => {
  assert.match(describeChatIssue('PLCC app issue: huddle_joined', { code: 'huddle_joined' }), /Ka Link/);
  assert.match(describeChatIssue('x', { code: 'huddle_token_failed' }), /Canaan/);
  assert.match(describeChatIssue('x', { code: 'huddle_join_stalled' }), /stuck/);
  assert.equal(chatIssueSeverity({ area: 'app', code: 'app_crash', status: null }), 'critical');
  assert.equal(chatIssueSeverity({ area: 'huddle', code: 'huddle_left', status: null }), 'info');
});

await ok('leaders, Ka Link admins and the owner can open Issues; members cannot', async () => {
  process.env.CHAT_ISSUES_OWNER_EMAILS = 'owner@example.org';
  assert.equal(await canViewPlccIssues(fakeDb(null), { id: 'u1', email: 'owner@example.org' }), true);
  assert.equal(await canViewPlccIssues(fakeDb(null), { id: 'u1b', email: 'someone@example.org', role: 'MEMBER' }), false);
  delete process.env.CHAT_ISSUES_OWNER_EMAILS;
  assert.equal(await canViewPlccIssues(fakeDb(null), { id: 'u2', role: 'PASTOR' }), true);
  assert.equal(await canViewPlccIssues(fakeDb('admin'), { id: 'u3', role: 'MEMBER' }), true);
  assert.equal(await canViewPlccIssues(fakeDb('reader'), { id: 'u4', role: 'MEMBER' }), false);
  assert.equal(await canViewPlccIssues(fakeDb(null), null), false);
});

await ok('LiveKit join/leave becomes a server-truth row with the reason', () => {
  const a = buildLiveKitHuddleAudit({
    eventName: 'participant_left',
    channelId: CH,
    participant: { identity: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', name: 'Marion', joinedAt: 1000, disconnectReason: 14 },
    createdAt: 1600,
  });
  assert.ok(a);
  assert.equal(a!.resourceType, 'plcc_huddle_event');
  assert.equal(a!.details.reason, 'CONNECTION_TIMEOUT');
  assert.equal(a!.details.durationSec, 600);
  assert.equal(a!.severity, 'warning');
  assert.equal(buildLiveKitHuddleAudit({ eventName: 'track_published', channelId: CH, participant: { identity: 'x' } }), null);
});

await ok('wired: Canaan routes issue-report/issues, webhook logs joins, sign-in problems merged', () => {
  const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  assert.match(core, /chatType === 'issue-report' \|\| chatType === 'issues'[\s\S]{0,120}plccIssues/);
  assert.match(core, /subResource === 'issue-report' \|\| subResource === 'issues'/);
  const hook = readFileSync(join(root, 'api/livekit-webhook.ts'), 'utf8');
  assert.match(hook, /buildLiveKitHuddleAudit\(/);
  const lib = readFileSync(join(root, 'api/_utils/plccIssues.ts'), 'utf8');
  assert.match(lib, /from\('sign_in_failures'\)/);
});

console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
