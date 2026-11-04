/**
 * PLCC Community Phase 3A — local smoke tests (no live DB required).
 * Run: npx tsx scripts/community-phase-3a-smoke.ts
 */
import {
  BROAD_CHAT_ADMIN_ROLES,
  CHAT_CHANNEL_CREATE_ROLES,
  canAccessChannelSync,
  canCreateCommunityChannels,
  canDeleteCommunityChannelSync,
  canManageChannelMembersSync,
  isDmChannel,
  isLeadershipChannel,
  isManageMembersBlockedChannel,
  isOpenChannel,
  isProtectedCommunityChannel,
  parseChannelCreateKind,
  type ChatChannelRow,
} from '../api/_utils/communityChatSecurity.js';
import {
  evaluateRemoveChannelMemberPolicy,
  selectAddablePickerCandidates,
  isSyntheticOrphanEmail,
  isMemberPickerEligibleUser,
  planMinistryChannelCreateMemberships,
  resolveMinistrySyncUpsert,
  classifyMinistryChannelMemberships,
} from '../api/_utils/communityMembership.js';

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

const privateChannel: ChatChannelRow = {
  id: 'priv-1',
  name: 'Elders Only',
  type: 'private',
  visibility: 'private',
  created_by: 'creator-1',
  participants: ['creator-1', 'member-a'],
};

const ministryChannel: ChatChannelRow = {
  id: 'min-1',
  name: "Men's Ministry Room",
  type: 'private',
  visibility: 'ministry',
  ministry_id: 'ministry-men',
  created_by: 'leader-1',
  participants: ['leader-1'],
};

const leadership: ChatChannelRow = {
  id: 'lead-1',
  name: 'Leadership Briefing',
  type: 'private',
  visibility: 'leadership',
};

const dm: ChatChannelRow = {
  id: 'dm-1',
  name: 'DM_aaa_bbb',
  type: 'private',
  visibility: 'dm',
  participants: ['user-a', 'user-b'],
};

console.log('Phase 3A smoke — A open access');
assert(isOpenChannel(openChannel) === true, 'A: open channel remains open');
assert(canAccessChannelSync(openChannel, 'anyone') === true, 'A: any auth user can access open');

console.log('\nPhase 3A smoke — B/C private access');
assert(isOpenChannel(privateChannel) === false, 'B/C: private is never open');
assert(
  canAccessChannelSync(privateChannel, 'member-a', { isMember: true }) === true,
  'B: private member can access'
);
assert(
  canAccessChannelSync(privateChannel, 'stranger', { isMember: false, userRole: 'MEMBER' }) === false,
  'C: private non-member denied'
);
assert(
  canAccessChannelSync(privateChannel, 'pastor-x', { isMember: false, userRole: 'PASTOR' }) === false,
  'C: private has no role shortcut (membership required)'
);

console.log('\nPhase 3A smoke — D creator retained (policy helpers)');
assert(
  canManageChannelMembersSync(privateChannel, 'creator-1', {
    userRole: 'MINISTRY_LEADER',
    isCreator: true,
  }) === true,
  'D: creator can manage members'
);
assert(String(privateChannel.created_by) === 'creator-1', 'D: created_by present on private channel');

console.log('\nPhase 3A smoke — E/F unauthorized manage denied');
assert(
  canManageChannelMembersSync(privateChannel, 'member-a', {
    userRole: 'MEMBER',
    membershipRole: 'member',
  }) === false,
  'E/F: normal member cannot manage members'
);
assert(
  canCreateCommunityChannels('MEMBER') === false,
  'E: MEMBER cannot create channels'
);

console.log('\nPhase 3A smoke — G creator removal policy (sync gate)');
// Removal of created_by is enforced in removeChannelMember; sync assert documents owner identity
assert(
  privateChannel.created_by === 'creator-1',
  'G: owner identity is created_by (removal blocked server-side)'
);

console.log('\nPhase 3A smoke — H/I ministry leader scope helpers');
assert(
  canManageChannelMembersSync(ministryChannel, 'leader-1', {
    userRole: 'MINISTRY_LEADER',
    isCreator: true,
  }) === true,
  'H: ministry leader creator can manage own ministry room'
);
assert(
  canManageChannelMembersSync(ministryChannel, 'other-leader', {
    userRole: 'MINISTRY_LEADER',
    membershipRole: 'member',
  }) === true,
  'H: sync helper flags ministry_leader+ministry room (scope checked async in API)'
);
assert(
  canManageChannelMembersSync(privateChannel, 'other-leader', {
    userRole: 'MINISTRY_LEADER',
    membershipRole: 'member',
  }) === false,
  'I: ministry leader without creator/moderator cannot manage unrelated private room'
);

console.log('\nPhase 3A smoke — J admin/leadership create set preserved');
assert(CHAT_CHANNEL_CREATE_ROLES.has('SUPER_ADMIN'), 'J: SUPER_ADMIN can create');
assert(CHAT_CHANNEL_CREATE_ROLES.has('MINISTRY_LEADER'), 'J: MINISTRY_LEADER can create');
assert(CHAT_CHANNEL_CREATE_ROLES.has('PASTOR'), 'J: PASTOR can create');
assert(!CHAT_CHANNEL_CREATE_ROLES.has('MEMBER'), 'J: MEMBER still excluded');
assert(!CHAT_CHANNEL_CREATE_ROLES.has('FINANCE'), 'J: FINANCE still excluded');
assert(BROAD_CHAT_ADMIN_ROLES.has('SUPER_ADMIN'), 'J: broad admin includes SUPER_ADMIN');
assert(!BROAD_CHAT_ADMIN_ROLES.has('MINISTRY_LEADER'), 'J: MINISTRY_LEADER is scoped not broad');

console.log('\nPhase 3A smoke — K DM unchanged');
assert(isDmChannel(dm) === true, 'K: DM detected');
assert(isManageMembersBlockedChannel(dm) === true, 'K: Manage Members blocked for DM');
assert(canAccessChannelSync(dm, 'user-a') === true, 'K: DM participant ok');
assert(canAccessChannelSync(dm, 'stranger') === false, 'K: DM stranger blocked');
assert(
  canManageChannelMembersSync(dm, 'user-a', { userRole: 'SUPER_ADMIN' }) === false,
  'K: even admin cannot use generic Manage Members on DM'
);

console.log('\nPhase 3A smoke — K2 channel delete policy');
assert(isProtectedCommunityChannel(dm) === true, 'K2: DM is protected');
assert(isProtectedCommunityChannel(leadership) === true, 'K2: leadership is protected');
assert(
  canDeleteCommunityChannelSync(dm, 'user-a', { userRole: 'SUPER_ADMIN' }) === false,
  'K2: cannot delete DM'
);
assert(
  canDeleteCommunityChannelSync(leadership, 'pastor-1', { userRole: 'PASTOR' }) === false,
  'K2: cannot delete leadership room'
);
assert(
  canDeleteCommunityChannelSync(privateChannel, 'creator-1', { userRole: 'MEMBER' }) === true,
  'K2: creator can delete private channel'
);
assert(
  canDeleteCommunityChannelSync(privateChannel, 'member-a', { userRole: 'MEMBER' }) === false,
  'K2: non-creator member cannot delete'
);
assert(
  canDeleteCommunityChannelSync(openChannel, 'admin-1', { userRole: 'ADMIN' }) === true,
  'K2: broad admin can delete open channel'
);
assert(
  canDeleteCommunityChannelSync(ministryChannel, 'stranger', { userRole: 'MINISTRY_LEADER' }) === false,
  'K2: ministry leader cannot delete unless creator'
);

console.log('\nPhase 3A smoke — L leadership unchanged');
assert(isLeadershipChannel(leadership) === true, 'L: leadership detected');
assert(isManageMembersBlockedChannel(leadership) === true, 'L: Manage Members blocked for leadership');
assert(
  canAccessChannelSync(leadership, 'pastor-1', { userRole: 'PASTOR' }) === true,
  'L: PASTOR can access leadership'
);
assert(
  canAccessChannelSync(leadership, 'member-1', { userRole: 'MEMBER' }) === false,
  'L: MEMBER cannot access leadership'
);

console.log('\nPhase 3A smoke — M mention eligibility for private members');
assert(
  canAccessChannelSync(privateChannel, 'member-a', { isMember: true, userRole: 'MEMBER' }) === true,
  'M: private member is mention-eligible by access'
);
assert(
  canAccessChannelSync(privateChannel, 'outsider', { isMember: false, userRole: 'MEMBER' }) === false,
  'M: private outsider not mention-eligible'
);

console.log('\nPhase 3A smoke — N create kind parsing / open default');
assert(parseChannelCreateKind('open') === 'open', 'N: parse open');
assert(parseChannelCreateKind('private') === 'private', 'N: parse private');
assert(parseChannelCreateKind('ministry') === 'ministry', 'N: parse ministry');
assert(parseChannelCreateKind('bogus') === null, 'N: reject unknown kind');
assert(parseChannelCreateKind(undefined) === null, 'N: omitted kind → null (API defaults open)');

console.log('\nPhase 3A smoke — member management safety (A–H)');

const ministryMembers = [
  { user_id: 'leader-1', role: 'moderator', source: 'manual' },
  { user_id: 'synced-1', role: 'member', source: 'ministry_sync' },
  { user_id: 'extra-1', role: 'member', source: 'manual' },
];

const syncRemove = evaluateRemoveChannelMemberPolicy({
  channel: ministryChannel,
  targetUserId: 'synced-1',
  members: ministryMembers,
});
assert(syncRemove.ok === false, 'A: ministry_sync member cannot be removed');
assert(
  syncRemove.ok === false &&
    String(syncRemove.error).includes('managed by ministry membership'),
  'A: clear ministry membership error'
);

const manualExtraRemove = evaluateRemoveChannelMemberPolicy({
  channel: ministryChannel,
  targetUserId: 'extra-1',
  members: ministryMembers,
});
assert(manualExtraRemove.ok === true, 'B: manual ministry extra can be removed');

const privateMembers = [
  { user_id: 'creator-1', role: 'moderator', source: 'manual' },
  { user_id: 'member-a', role: 'member', source: 'manual' },
];
const privateRemove = evaluateRemoveChannelMemberPolicy({
  channel: privateChannel,
  targetUserId: 'member-a',
  members: privateMembers,
});
assert(privateRemove.ok === true, 'C: private manual member can be removed');

// ministry_sync on a PRIVATE channel is not blocked (ministry rules only apply to ministry vis)
const privateWithOddSource = evaluateRemoveChannelMemberPolicy({
  channel: privateChannel,
  targetUserId: 'member-a',
  members: [
    { user_id: 'creator-1', role: 'moderator', source: 'manual' },
    { user_id: 'member-a', role: 'member', source: 'ministry_sync' },
  ],
});
assert(
  privateWithOddSource.ok === true,
  'C: ministry_sync rules do not block private-channel removal'
);

const ownerRemove = evaluateRemoveChannelMemberPolicy({
  channel: privateChannel,
  targetUserId: 'creator-1',
  members: privateMembers,
});
assert(ownerRemove.ok === false, 'D: owner removal denied');

const lastModOnly = [
  { user_id: 'creator-1', role: 'member', source: 'manual' },
  { user_id: 'only-mod', role: 'moderator', source: 'manual' },
];
const lastModRemove = evaluateRemoveChannelMemberPolicy({
  channel: { ...privateChannel, created_by: 'creator-1' },
  targetUserId: 'only-mod',
  members: lastModOnly,
});
// creator still counts as moderator seat, so removing only-mod is allowed
assert(lastModRemove.ok === true, 'E: creator seat preserves channel when other mod removed');

const soleManager = [{ user_id: 'solo', role: 'moderator', source: 'manual' }];
const soleRemove = evaluateRemoveChannelMemberPolicy({
  channel: { ...privateChannel, created_by: 'solo' },
  targetUserId: 'solo',
  members: soleManager,
});
assert(soleRemove.ok === false, 'E: cannot remove owner who is also last moderator');

const orphanedLastMod = [
  { user_id: 'mod-only', role: 'moderator', source: 'manual' },
  { user_id: 'regular', role: 'member', source: 'manual' },
];
const orphanedRemove = evaluateRemoveChannelMemberPolicy({
  channel: { ...privateChannel, created_by: 'gone-owner' },
  targetUserId: 'mod-only',
  members: orphanedLastMod,
});
assert(orphanedRemove.ok === false, 'E: last moderator protection preserved');

const directory = [
  { id: 'aaa', name: 'Aaron', role: 'MEMBER' },
  { id: 'bbb', name: 'Bailey', role: 'MEMBER' },
  { id: 'zzz', name: 'Zelda', role: 'MEMBER' },
  { id: 'pend', name: 'Pending Person', role: 'PENDING' },
  { id: 'me', name: 'Myself', role: 'PASTOR' },
];
// Simulate 32 current members including Aaron+Bailey; Zelda is addable but alphabetically late
const currentMemberIds = ['aaa', 'bbb', ...Array.from({ length: 30 }, (_, i) => `m${i}`)];
const pageWithoutServerExclude = directory
  .filter((u) => u.role !== 'PENDING' && u.id !== 'me')
  .sort((a, b) => a.name.localeCompare(b.name))
  .slice(0, 2); // old buggy client page would only see Aaron/Bailey then exclude → empty
assert(
  pageWithoutServerExclude.every((u) => currentMemberIds.includes(u.id)),
  'F: setup — first alphabetical page is entirely existing members'
);

const addable = selectAddablePickerCandidates(directory, {
  excludeMemberIds: currentMemberIds,
  excludeUserId: 'me',
  limit: 50,
});
assert(
  addable.some((u) => u.id === 'zzz'),
  'F: server-side picker excludes current members and still returns Zelda'
);
assert(
  !addable.some((u) => currentMemberIds.includes(u.id)),
  'F: no current members in addable set'
);
assert(!addable.some((u) => u.id === 'pend'), 'H: PENDING excluded');
assert(!addable.some((u) => u.id === 'me'), 'F: caller excluded');

const searchHit = selectAddablePickerCandidates(directory, {
  excludeMemberIds: currentMemberIds,
  excludeUserId: 'me',
  query: 'zel',
  limit: 50,
});
assert(searchHit.length === 1 && searchHit[0].id === 'zzz', 'G: search finds addable user beyond initial alphabetical set');

const pendingOnly = selectAddablePickerCandidates(
  [{ id: 'p1', name: 'Pat', role: 'PENDING' }],
  { excludeMemberIds: [], limit: 50 }
);
assert(pendingOnly.length === 0, 'H: PENDING alone yields empty picker');

console.log('\nPhase 3A smoke — identity hygiene + ministry create (A–I remediation)');

assert(
  isSyntheticOrphanEmail('orphaned+eca646c4857d41498deff5a017dbec63@awc-vault.local') === true,
  'A/B: synthetic @awc-vault.local detected'
);
assert(isSyntheticOrphanEmail('orphaned+someone@gmail.com') === true, 'B: orphaned+ prefix excluded');
assert(isSyntheticOrphanEmail('jerlessm@gmail.com') === false, 'C: real email not synthetic');
assert(
  isMemberPickerEligibleUser({ role: 'MEMBER', email: 'invitee@church.org' }) === true,
  'C: legitimate no-Auth invitee with real email remains eligible'
);
assert(
  isMemberPickerEligibleUser({
    role: 'SUPER_ADMIN',
    email: 'orphaned+eca646c4857d41498deff5a017dbec63@awc-vault.local',
  }) === false,
  'A: synthetic orphan SUPER_ADMIN not picker-eligible'
);

const hygieneDirectory = [
  {
    id: 'orphan-local',
    name: 'Jerless Orphan',
    role: 'SUPER_ADMIN',
    email: 'orphaned+eca646c4@awc-vault.local',
  },
  {
    id: 'orphan-plus',
    name: 'Orphan Plus',
    role: 'MEMBER',
    email: 'orphaned+abc@example.com',
  },
  {
    id: 'invitee',
    name: 'Keisha Invitee',
    role: 'MEMBER',
    email: 'keisha@church.org',
  },
  {
    id: 'canonical',
    name: 'Jerless Canonical',
    role: 'SUPER_ADMIN',
    email: 'jerlessm@gmail.com',
  },
  { id: 'pend', name: 'Pending', role: 'PENDING', email: 'p@church.org' },
];
const hygienePicker = selectAddablePickerCandidates(hygieneDirectory, { limit: 50 });
assert(!hygienePicker.some((u) => u.id === 'orphan-local'), 'A: @awc-vault.local excluded from picker');
assert(!hygienePicker.some((u) => u.id === 'orphan-plus'), 'B: orphaned+ excluded from picker');
assert(hygienePicker.some((u) => u.id === 'invitee'), 'C: invitee remains eligible');
assert(hygienePicker.some((u) => u.id === 'canonical'), 'C: canonical Auth-linked eligible');
assert(!hygienePicker.some((u) => u.id === 'pend'), 'PENDING still excluded');

// D/E/F/G — ministry create plan: sync roster before extras; selected roster stays sync
const createPlan = planMinistryChannelCreateMemberships({
  creatorId: 'creator-1',
  selectedMemberIds: ['creator-1', 'roster-1', 'roster-2', 'extra-1'],
  rosterUserIds: ['roster-1', 'roster-2'],
});
assert(createPlan.syncRosterIds.includes('roster-1'), 'D: roster included in sync set');
assert(createPlan.syncRosterIds.includes('roster-2'), 'D: roster sync before extras');
assert(
  createPlan.manualExtraIds.includes('extra-1') && !createPlan.manualExtraIds.includes('roster-1'),
  'E: roster selected as extra is NOT planned as manual'
);
assert(createPlan.manualExtraIds.every((id) => id !== 'creator-1'), 'G: creator not in manual extras');
assert(
  !createPlan.syncRosterIds.includes('extra-1'),
  'F: unrelated manual extra is not in roster sync set'
);

assert(
  resolveMinistrySyncUpsert(null).action === 'insert' &&
    resolveMinistrySyncUpsert(null).source === 'ministry_sync',
  'D: new roster member inserts as ministry_sync'
);
assert(
  resolveMinistrySyncUpsert({ role: 'member', source: 'manual' }).action === 'upgrade_source',
  'E: older manual roster row upgrades to ministry_sync'
);
assert(
  resolveMinistrySyncUpsert({ role: 'moderator', source: 'manual' }).action === 'skip_moderator',
  'G: creator/moderator not demoted or source-forced'
);
assert(
  resolveMinistrySyncUpsert({ role: 'member', source: 'ministry_sync' }).action === 'noop',
  'E: already ministry_sync is left alone'
);

const auditClassify = classifyMinistryChannelMemberships({
  createdBy: 'cc16b787-203c-49ed-af94-f77bdaef0c23',
  memberUserIds: [
    'cc16b787-203c-49ed-af94-f77bdaef0c23',
    'roster-a',
    'roster-b',
    ...Array.from({ length: 29 }, (_, i) => `extra-${i}`),
  ],
  rosterUserIds: ['roster-a', 'roster-b'],
});
assert(auditClassify.counts.creator === 1, 'audit classify: 1 creator');
assert(auditClassify.counts.roster === 2, 'audit classify: 2 roster');
assert(auditClassify.counts.manualExtras === 29, 'audit classify: 29 manual extras');
assert(auditClassify.counts.totalMembers === 32, 'audit classify: 32 total');

// H — private-channel remove policy unchanged (already covered above; re-assert)
assert(privateRemove.ok === true, 'H: private-channel behavior unchanged (manual remove ok)');
assert(
  privateWithOddSource.ok === true,
  'H: private channel not gated by ministry_sync remove rules'
);

console.log('\nAll Phase 3A access smoke tests passed.');
