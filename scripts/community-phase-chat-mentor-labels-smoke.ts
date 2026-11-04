/**
 * Community Chat mentor labels — unnamed logins show member name or email.
 * Run: npx tsx scripts/community-phase-chat-mentor-labels-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommunityMentorDisplayName } from '../api/_utils/communityMembership.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('Community Chat mentor display labels smoke');

assert(
  resolveCommunityMentorDisplayName({ name: 'Jane Doe', email: 'j@x.com' }) === 'Jane Doe',
  'prefers login name'
);
assert(
  resolveCommunityMentorDisplayName({
    name: '',
    memberName: 'Olivia Wanyana',
    email: 'olivia@x.com',
  }) === 'Olivia Wanyana',
  'falls back to linked Members name'
);
assert(
  resolveCommunityMentorDisplayName({
    name: null,
    memberName: null,
    email: 'atwiins031@gmail.com',
  }) === 'atwiins031@gmail.com',
  'falls back to email when unnamed'
);
assert(
  resolveCommunityMentorDisplayName({ name: '  ', memberName: '', email: null }) === 'Unnamed',
  'Unnamed when nothing available'
);

const core = read('api/_utils/core.ts');
const chat = read('pages/community/Chat.tsx');
const membership = read('api/_utils/communityMembership.ts');

assert(/listCommunityMentors/.test(core), 'mentors API uses listCommunityMentors');
assert(/listCommunityMentors/.test(membership), 'listCommunityMentors defined');
assert(/user_member_links/.test(membership) && /displayName/.test(membership), 'enriches via verified links');
assert(/phone.*does not exist|without phone|withPhone/i.test(membership), 'falls back when users.phone missing');
assert(/displayName/.test(chat), 'Chat UI renders displayName');
assert(/person\.displayName/.test(chat), 'Chat list uses person.displayName');
assert(/staffLoaded/.test(chat), 'Chat distinguishes loading vs empty members');

console.log('\nAll community chat mentor label smoke tests passed.');
