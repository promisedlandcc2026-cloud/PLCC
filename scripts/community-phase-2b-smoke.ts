/**
 * PLCC Community Phase 2B — local smoke tests (no live DB required for access logic).
 * Run: npx tsx scripts/community-phase-2b-smoke.ts
 *
 * Intentionally does NOT import identity/RPC helpers — those are out of Phase 2B scope.
 */
import {
  canAccessChannelSync,
  isOpenChannel,
  slugifyChannelName,
  type ChatChannelRow,
} from '../api/_utils/communityChatSecurity.js';
import { isInboxSchemaMissingError } from '../api/_utils/notify.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const openChannel: ChatChannelRow = {
  id: 'open-1',
  name: 'General',
  type: 'public',
  visibility: 'open',
};

const leadership: ChatChannelRow = {
  id: 'lead-1',
  name: 'Leadership Briefing',
  type: 'private',
  visibility: 'leadership',
};

const ministry: ChatChannelRow = {
  id: 'min-1',
  name: "Men's Ministry Room",
  type: 'private',
  visibility: 'ministry',
  ministry_id: 'm1',
  participants: ['user-a'],
};

const dm: ChatChannelRow = {
  id: 'dm-1',
  name: 'DM_aaa_bbb',
  type: 'private',
  visibility: 'dm',
  participants: ['user-a', 'user-b'],
};

console.log('Phase 2B smoke — access logic');

assert(isOpenChannel(openChannel) === true, 'open channel is open');
assert(isOpenChannel(leadership) === false, 'leadership is never open');

assert(
  canAccessChannelSync(openChannel, 'anyone') === true,
  'any auth user can access open channel'
);

assert(
  canAccessChannelSync(leadership, 'member-1', { userRole: 'MEMBER' }) === false,
  'MEMBER cannot access leadership'
);
assert(
  canAccessChannelSync(leadership, 'pastor-1', { userRole: 'PASTOR' }) === true,
  'PASTOR can access leadership via role'
);
assert(
  canAccessChannelSync(leadership, 'member-1', { isMember: true, userRole: 'MEMBER' }) === true,
  'explicit membership grants leadership access'
);

assert(
  canAccessChannelSync(ministry, 'user-b') === false,
  'non-member cannot access ministry room'
);
assert(
  canAccessChannelSync(ministry, 'user-a') === true,
  'participant can access ministry room'
);
assert(
  canAccessChannelSync(ministry, 'user-c', { isMember: true }) === true,
  'room member can access ministry room'
);

assert(canAccessChannelSync(dm, 'user-a') === true, 'DM participant A ok');
assert(canAccessChannelSync(dm, 'user-c') === false, 'DM stranger blocked');

assert(slugifyChannelName('Leadership Briefing') === 'leadership-briefing', 'slugify works');

// Legacy public without visibility column
assert(
  canAccessChannelSync({ id: 'legacy', type: 'public', name: 'Prayer' }, 'u1') === true,
  'legacy public still accessible'
);

console.log('\nPhase 2B smoke — mention eligibility (sync access rules)');

// Open: anyone can be mentioned (access sync is the gate)
assert(
  canAccessChannelSync(openChannel, 'sheevon-id', { userRole: 'MEMBER' }) === true,
  'open channel: later-alphabet member is mention-eligible by access'
);

// Leadership: MEMBER without membership cannot be mentioned
assert(
  canAccessChannelSync(leadership, 'sheevon-id', { userRole: 'MEMBER' }) === false,
  'leadership: non-leader excluded from mention eligibility'
);
assert(
  canAccessChannelSync(leadership, 'pastor-1', { userRole: 'PASTOR' }) === true,
  'leadership: pastor mention-eligible'
);

// Ministry: only room members
assert(
  canAccessChannelSync(ministry, 'outsider', { userRole: 'MEMBER' }) === false,
  'ministry: outsider not mention-eligible'
);
assert(
  canAccessChannelSync(ministry, 'user-a', { userRole: 'MEMBER' }) === true,
  'ministry: participant mention-eligible'
);

// DM: only participants
assert(canAccessChannelSync(dm, 'user-b') === true, 'DM: other participant mention-eligible');
assert(canAccessChannelSync(dm, 'stranger') === false, 'DM: stranger not mention-eligible');

console.log('\nPhase 2B smoke — notification inbox error classification (K)');
assert(
  isInboxSchemaMissingError({
    message: "Could not find the table 'public.user_notifications' in the schema cache",
  }) === true,
  'K: missing-table / schema-cache → compatibility empty inbox allowed'
);
assert(
  isInboxSchemaMissingError({ code: '42P01', message: 'relation "user_notifications" does not exist' }) === true,
  'K: Postgres undefined_table → compatibility empty inbox allowed'
);
assert(
  isInboxSchemaMissingError({
    message: 'new row for relation "user_notifications" violates check constraint',
  }) === false,
  'K: constraint/query errors must NOT soft-empty as success'
);
assert(
  isInboxSchemaMissingError({ message: 'JWT expired' }) === false,
  'K: auth errors must NOT soft-empty as success'
);
assert(
  isInboxSchemaMissingError({ message: 'permission denied for table user_notifications' }) === false,
  'K: permission errors must NOT soft-empty as success'
);

console.log('\nAll Phase 2B access smoke tests passed.');
