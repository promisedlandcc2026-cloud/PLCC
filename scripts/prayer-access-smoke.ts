/**
 * Prayer Wall rules.
 * Run: npx tsx scripts/prayer-access-smoke.ts
 */
import {
  buildMemberPrayerInsert,
  buildVisitorPrayerInsert,
  canChangePrayerStatus,
  canDeletePrayer,
  filterPrayersForViewer,
  isIntercessorPrayer,
  parsePrayerListWindow,
  pickIntercessorsRoom,
  toIntercessorListItem,
  buildIntercessorChatMessage,
  isMissingPrayerWatchColumn,
  parsePrayerMark,
  prayerMarkPatch,
  pickShareWith,
  canPublishPrayer,
  applyTeamSharing,
  isMissingShareWithColumn,
} from '../api/_utils/prayerAccess.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const me = { id: 'u-1', displayName: 'Grace Johnson' };

let r = buildMemberPrayerInsert({ content: '  Pray for my mom  ' }, me);
assert(r.ok && r.row.status === 'Published' && r.row.is_confidential === false, 'member public prayer goes straight on the wall');
assert(r.ok && r.row.member_name === 'Grace Johnson' && r.row.user_id === 'u-1', 'name and account come from the sign-in');
assert(r.ok && r.row.content === 'Pray for my mom' && r.row.category === 'Other', 'content trimmed, category defaults to Other');

r = buildMemberPrayerInsert({ content: 'x', member_name: 'Pastor', user_id: 'someone-else', status: 'Published', prayed_count: 999 }, me);
assert(r.ok && r.row.member_name === 'Grace Johnson' && r.row.user_id === 'u-1' && !('prayed_count' in r.row), 'member cannot post as someone else or set counts');

r = buildMemberPrayerInsert({ content: 'private', is_confidential: true }, me);
assert(r.ok && r.row.status === 'Confidential' && r.row.is_confidential === true, 'private prayer goes to the Pastor');

r = buildMemberPrayerInsert({ content: 'quiet', is_anonymous: true }, me);
assert(r.ok && r.row.member_name === 'Anonymous' && r.row.is_anonymous === true, 'post without my name');

r = buildMemberPrayerInsert({ content: 'x', category: 'Healing' }, me);
assert(r.ok && r.row.category === 'Healing', 'valid category kept');
r = buildMemberPrayerInsert({ content: 'x', category: 'DROP TABLE' }, me);
assert(r.ok && r.row.category === 'Other', 'unknown category becomes Other');

assert(!buildMemberPrayerInsert({ content: '   ' }, me).ok, 'empty prayer refused');
r = buildMemberPrayerInsert({ content: 'a'.repeat(5000) }, me);
assert(r.ok && String(r.row.content).length === 2000, 'long prayer trimmed to 2000');

let v = buildVisitorPrayerInsert({ member_name: 'Visitor Vic', content: 'Pray for a job', status: 'Published' });
assert(v.ok && v.row.status === 'Vetting' && !('user_id' in v.row), 'visitor prayer waits for the prayer team');
v = buildVisitorPrayerInsert({ member_name: 'Vic', content: 'private', is_confidential: true });
assert(v.ok && v.row.status === 'Confidential', 'visitor private prayer goes to the Pastor');
assert(!buildVisitorPrayerInsert({ content: 'no name' }).ok, 'visitor needs a name');
assert(!buildVisitorPrayerInsert({ member_name: 'Bot', content: 'spam', website: 'http://x' }).ok, 'bot field blocks spam');

const rows = [
  { id: 1, status: 'Published', is_confidential: false, user_id: 'u-2' },
  { id: 2, status: 'Published', is_confidential: null, user_id: 'u-2' },
  { id: 3, status: 'Confidential', is_confidential: true, user_id: 'u-2' },
  { id: 4, status: 'Vetting', is_confidential: false, user_id: 'u-2' },
  { id: 5, status: 'Confidential', is_confidential: true, user_id: 'u-1' },
  { id: 6, status: 'Published', is_confidential: true, user_id: 'u-2' },
];
const memberSees = filterPrayersForViewer(rows, 'MEMBER', 'u-1').map((x) => x.id);
assert(JSON.stringify(memberSees) === '[1,2,5]', `member sees the wall plus own prayers only (${memberSees})`);
assert(filterPrayersForViewer(rows, 'PASTOR', 'u-9').length === 6, 'pastor sees everything');
assert(filterPrayersForViewer(rows, 'SECRETARY', 'u-9').length === 6, 'secretary (prayer team) sees everything');
assert(filterPrayersForViewer(rows, 'FINANCE', 'u-9').length === 2, 'finance sees only the public wall');

assert(!canChangePrayerStatus('MEMBER'), 'member cannot approve or hide prayers');
assert(canChangePrayerStatus('MINISTRY_LEADER'), 'ministry leader can approve');
assert(canDeletePrayer('MEMBER', 'u-1', { user_id: 'u-1' }), 'member can delete own prayer');
assert(!canDeletePrayer('MEMBER', 'u-1', { user_id: 'u-2' }), "member cannot delete someone else's prayer");
assert(!canDeletePrayer('MEMBER', 'u-1', null), 'missing prayer cannot be deleted by a member');
assert(canDeletePrayer('ADMIN', 'u-9', { user_id: 'u-2' }), 'admin can delete any prayer');

// Intercessors
assert(pickIntercessorsRoom([{ id: 1, name: 'General' }]) === null, 'no Intercessors room yet');
assert(pickIntercessorsRoom([{ id: 1, name: 'Intercessor Channel', visibility: 'private' }])?.id === 1, 'finds Intercessor Channel');
assert(pickIntercessorsRoom([{ id: 9, name: 'intercessors dm', visibility: 'dm' }, { id: 2, name: 'Intercessor Channel' }])?.id === 2, 'never picks a DM');
assert(pickIntercessorsRoom([{ id: 3, name: 'Intercessor Channel' }, { id: 4, name: 'PLCC Intercessors' }])?.id === 3, 'oldest room wins');

assert(isIntercessorPrayer({ status: 'Published', is_confidential: false }), 'wall prayers go to the Intercessors');
assert(isIntercessorPrayer({ status: 'Vetting', is_confidential: null }), 'visitor prayers waiting for review go to the Intercessors');
assert(!isIntercessorPrayer({ status: 'Confidential', is_confidential: true }), 'Pastor-only prayers never go to the Intercessors');
assert(!isIntercessorPrayer({ status: 'Published', is_confidential: true }), 'a confidential flag always wins');
assert(!isIntercessorPrayer({ status: 'Archived' }), 'archived prayers are left out');

const now = new Date('2026-10-19T16:00:00Z');
let w = parsePrayerListWindow(undefined, undefined, now);
assert(w.to.getTime() === now.getTime() && (now.getTime() - w.from.getTime()) === 14 * 86400000, 'default window is the last 14 days');
w = parsePrayerListWindow('2026-10-16T00:00:00Z', '2026-10-20T00:00:00Z', now);
assert(w.from.toISOString() === '2026-10-16T00:00:00.000Z', 'custom window kept');
w = parsePrayerListWindow('2020-01-01', '2026-10-19', now);
assert((w.to.getTime() - w.from.getTime()) === 120 * 86400000, 'window capped at 120 days');
w = parsePrayerListWindow('2026-10-25', '2026-10-19', now);
assert(w.from < w.to, 'reversed dates are fixed');
w = parsePrayerListWindow('not a date', 'nope', now);
assert(!Number.isNaN(w.from.getTime()) && !Number.isNaN(w.to.getTime()), 'bad dates fall back safely');

const item = toIntercessorListItem({ id: 'p1', member_name: 'Grace', is_anonymous: true, content: 'Healing', status: 'Vetting', created_at: 'x', category: 'Healing' });
assert(item.name === 'Anonymous' && item.onWall === false && item.category === 'Healing', 'anonymous stays anonymous on the printout');
assert(!('user_id' in item) && !('is_confidential' in item), 'printout carries no account details');

let msg = buildIntercessorChatMessage({ member_name: 'Grace', category: 'Healing', content: 'Pray for my mom', status: 'Published' });
assert(msg === 'New prayer request from Grace (Healing)\n\nPray for my mom', 'chat message for a wall prayer');
msg = buildIntercessorChatMessage({ member_name: 'Vic', category: 'Other', content: 'Job', status: 'Vetting' });
assert(msg.startsWith('New prayer request from Vic\n') && msg.endsWith('Not on the Prayer Wall yet.'), 'visitor prayer is marked in chat');
msg = buildIntercessorChatMessage({ member_name: 'Grace', is_anonymous: true, content: 'quiet', status: 'Published' });
assert(msg.includes('from Anonymous') && !msg.includes('Grace'), 'anonymous stays anonymous in chat');

// Prayer Watch marks
const pid = '11111111-1111-4111-8111-111111111111';
assert(parsePrayerMark({ action: 'prayed', id: pid, value: true })?.action === 'prayed', 'prayed mark parsed');
assert(parsePrayerMark({ action: 'answered', id: pid, value: false })?.value === false, 'answered can be undone');
assert(parsePrayerMark({ action: 'delete', id: pid, value: true }) === null, 'unknown action refused');
assert(parsePrayerMark({ action: 'prayed', id: 'not-a-uuid', value: true }) === null, 'bad id refused');
assert(parsePrayerMark({ action: 'prayed', id: pid, value: 'yes' }) === null, 'value must be true/false');
const now2 = new Date('2026-10-20T19:00:00Z');
let patch = prayerMarkPatch({ action: 'prayed', id: pid, value: true }, 'u-1', now2);
assert(patch.intercessor_prayed_at === now2.toISOString() && patch.intercessor_prayed_by === 'u-1' && Object.keys(patch).length === 2, 'prayed writes only its two columns');
patch = prayerMarkPatch({ action: 'answered', id: pid, value: false }, 'u-1', now2);
assert(patch.answered_at === null && patch.answered_by === null, 'un-answering clears the mark');
assert(isMissingPrayerWatchColumn('column prayer_requests.answered_at does not exist'), 'detects missing setup');
assert(!isMissingPrayerWatchColumn('permission denied'), 'other errors are not setup errors');
const li = toIntercessorListItem({ id: 'p', content: 'x', intercessor_prayed_at: '2026-10-20T19:00:00Z', answered_at: null });
assert(li.prayedAt === '2026-10-20T19:00:00Z' && li.answeredAt === null, 'list item carries marks');

// Three sharing choices
assert(pickShareWith({}) === 'wall', 'default is Prayer Wall + Intercessors');
assert(pickShareWith({ is_confidential: true }) === 'pastor', 'old private flag = Pastor only');
assert(pickShareWith({ share_with: 'intercessors', is_confidential: false }) === 'intercessors', 'Intercessors only picked');
assert(pickShareWith({ share_with: 'everyone' }) === 'wall', 'unknown choice falls back to the wall');
let sw = buildMemberPrayerInsert({ content: 'x', share_with: 'intercessors' }, me);
assert(sw.ok && sw.row.status === 'Confidential' && sw.row.is_confidential === true && sw.row.share_with === 'intercessors', 'member Intercessors-only is private');
assert(sw.ok && isIntercessorPrayer(sw.row), 'Intercessors-only goes to the Intercessors');
assert(sw.ok && filterPrayersForViewer([{ ...sw.row, user_id: 'u-2' }], 'MEMBER', 'u-9').length === 0, 'Intercessors-only never shows on the public wall');
sw = buildMemberPrayerInsert({ content: 'x', share_with: 'pastor' }, me);
assert(sw.ok && sw.row.share_with === 'pastor' && !isIntercessorPrayer(sw.row), 'Pastor-only never goes to the Intercessors');
sw = buildMemberPrayerInsert({ content: 'x', share_with: 'wall' }, me);
assert(sw.ok && sw.row.status === 'Published' && sw.row.share_with === 'wall' && isIntercessorPrayer(sw.row), 'wall prayer goes to both');
let vw = buildVisitorPrayerInsert({ member_name: 'Vic', content: 'x', share_with: 'intercessors' });
assert(vw.ok && vw.row.status === 'Confidential' && vw.row.share_with === 'intercessors', 'visitor can choose Intercessors only');
vw = buildVisitorPrayerInsert({ member_name: 'Vic', content: 'x', share_with: 'wall' });
assert(vw.ok && vw.row.status === 'Vetting', 'visitor wall prayer still waits for review');
assert(!canPublishPrayer({ share_with: 'intercessors' }), 'Intercessors-only cannot be approved onto the wall');
assert(canPublishPrayer({ share_with: 'wall' }) && canPublishPrayer({}), 'wall prayers can be approved');
const tb = applyTeamSharing({ content: 'x', share_with: 'intercessors', status: 'Published' });
assert(tb.status === 'Confidential' && tb.is_confidential === true, 'prayer team Intercessors-only is private');
assert(!('share_with' in applyTeamSharing({ content: 'x', share_with: 'bogus' })), 'bogus team choice dropped');
const tw = applyTeamSharing({ content: 'x', share_with: 'wall' });
assert(tw.status === 'Published' && tw.is_confidential === false, "prayer team's wall request goes straight on the wall");
assert(applyTeamSharing({ content: 'x', share_with: 'wall', status: 'Vetting' }).status === 'Vetting', 'an explicit status is kept');
assert(toIntercessorListItem({ id: 'p', content: 'x', share_with: 'intercessors', status: 'Confidential' }).privateToIntercessors === true, 'list marks private ones');
assert(buildIntercessorChatMessage({ member_name: 'G', content: 'x', share_with: 'intercessors', status: 'Confidential' }).includes('Private to the Intercessors'), 'chat says private');
assert(isMissingShareWithColumn('Could not find the share_with column of prayer_requests in the schema cache'), 'detects missing share_with');

console.log('\nPrayer Wall checks passed.');
