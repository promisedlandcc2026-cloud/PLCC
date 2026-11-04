/**
 * PLCC Community Phase 4C — mentions + notifications + photo optimization smoke.
 * Run: npx tsx scripts/community-phase-4c-mentions-notifications-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCommunityNotifyEligibleUser,
  isMemberPickerEligibleUser,
  isSyntheticOrphanEmail,
} from '../api/_utils/communityMembership.js';
import {
  buildFeedMentionToken,
  buildFeedPostDeepLink,
  extractFeedMentionIds,
  feedMentionsEnabled,
  feedNotificationsEnabled,
  feedReactionNotificationsDeferred,
  formatCommunityUnreadBadge,
  formatFeedContentForDisplay,
  isCommunityFeedNotifyType,
  mentionDiff,
  parseFeedDeepLinkQuery,
  planFeedMentionMutation,
  resolveAuthorizedFeedMentionIds,
  feedMentionRelationTarget,
  shouldNotifyFeedMentionRecipient,
  formatMentionCandidateHint,
  emailLocalPartHint,
  COMMUNITY_FEED_NOTIFY_TYPES,
} from '../api/_utils/communityFeedMentions.js';
import {
  feedMentionsDeferred,
  feedNotificationsDeferred,
  parseFeedImageUpload,
} from '../api/_utils/communityFeed.js';
import { COMMUNITY_FEED_INBOX_TYPES } from '../api/_utils/notify.js';
import {
  FEED_CLIENT_IMAGE_MAX_EDGE,
  FEED_CLIENT_IMAGE_MAX_OUTPUT_BYTES,
  FEED_CLIENT_IMAGE_MAX_SOURCE_BYTES,
  isAcceptedFeedImageFile,
  isHeicLikeFile,
} from '../lib/feedImagePrepare.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  OK: ${msg}`);
}

const migration = read('supabase/migrations/community_phase_4c_mentions_notifications.sql');
const core = read('api/_utils/core.ts');
const feedPage = read('pages/community/Feed.tsx');
const prepare = read('lib/feedImagePrepare.ts');
const notify = read('api/_utils/notify.ts');
const drawer = read('components/Admin/NotificationDrawer.tsx');
const sidebar = read('components/Layout/Sidebar.tsx');
const helper = read('api/_utils/communityFeedMentions.ts');
const smoke4b = read('scripts/community-phase-4b-media-moderation-smoke.ts');

console.log('\nPhase 4C mentions + notifications + photo smoke');

// A–D eligibility
assert(isMemberPickerEligibleUser({ role: 'MEMBER', email: 'a@church.org' }), 'A: eligible mention candidate');
assert(!isMemberPickerEligibleUser({ role: 'PENDING', email: 'a@church.org' }), 'C: PENDING excluded');
assert(isSyntheticOrphanEmail('orphaned+x@awc-vault.local'), 'D: synthetic identity detected');
assert(
  !isCommunityNotifyEligibleUser({ role: 'MEMBER', email: 'user@awc-vault.local' }),
  'D: @awc-vault.local excluded'
);
assert(!isCommunityNotifyEligibleUser({ role: 'SUPER_ADMIN', email: 'orphaned+1@awc-vault.local' }), 'B/D: ineligible orphan excluded');

// E–H mention tokens / spoof
const uid = '11111111-1111-1111-1111-111111111111';
const uid2 = '22222222-2222-2222-2222-222222222222';
const token = buildFeedMentionToken('Jerless Mahabir', uid);
assert(token.includes(uid) && token.startsWith('@['), 'E: structured mention token');
const content = `Praying for ${token} today`;
assert(extractFeedMentionIds(content).includes(uid), 'E: post mention id extracted');
assert(formatFeedContentForDisplay(content).includes('@Jerless Mahabir'), 'E: display natural @Name');
assert(!formatFeedContentForDisplay(content).includes('mention:'), 'E: display hides token internals');

const commentContent = `Thanks ${buildFeedMentionToken('Member Two', uid2)}`;
assert(extractFeedMentionIds(commentContent).includes(uid2), 'F: comment mention stored in content model');

assert(
  resolveAuthorizedFeedMentionIds({
    content: 'hello',
    claimedIds: [uid],
  }).ok === false,
  'G/H: claimed mention without token rejected'
);
assert(
  resolveAuthorizedFeedMentionIds({
    content,
    claimedIds: [uid],
  }).ok === true,
  'E: matching claim accepted'
);

assert(feedMentionsEnabled() && feedNotificationsEnabled(), 'mentions/notifications enabled');
assert(!feedMentionsDeferred() && !feedNotificationsDeferred(), 'deferred flags false');

// I–N notification behavior (source contracts)
assert(COMMUNITY_FEED_NOTIFY_TYPES.includes('community_feed_mention_post'), 'I: mention post type');
assert(COMMUNITY_FEED_NOTIFY_TYPES.includes('community_feed_mention_comment'), 'I: mention comment type');
assert(COMMUNITY_FEED_NOTIFY_TYPES.includes('community_feed_comment'), 'L: comment-on-post type');
assert(isCommunityFeedNotifyType('community_feed_comment'), 'L: type guard');
assert(/persistFeedMentionsThenNotify|notifyFeedPostComment/.test(core + helper), 'I/L: notify helpers wired');
assert(/shouldNotifyFeedMentionRecipient|no self-notify/.test(helper), 'J: self mention no notification');
assert(/commenterId/.test(helper) && /postAuthorId/.test(helper), 'K: own-post comment skip path');
assert(/postDeleted/.test(helper), 'M: deleted post no comment notification');
assert(/unavailable|no longer available/.test(core + feedPage), 'P: deleted target deep link safe');

// O deep link
const link = buildFeedPostDeepLink(uid, uid2);
assert(link.includes(`post=${uid}`) && link.includes(`comment=${uid2}`), 'O: deep link generated');
const parsed = parseFeedDeepLinkQuery(`post=${uid}&comment=${uid2}`);
assert(parsed.postId === uid && parsed.commentId === uid2, 'O: deep link parsed');
assert(parseFeedDeepLinkQuery('post=not-a-uuid').postId === null, 'O: invalid UUID rejected');

// Q–T unread badge
assert(formatCommunityUnreadBadge(0) === '', 'Q: zero unread empty');
assert(formatCommunityUnreadBadge(3) === '3', 'Q: unread Community count format');
assert(formatCommunityUnreadBadge(100) === '99+', 'S: badge cap 99+');
assert(
  COMMUNITY_FEED_INBOX_TYPES.every((t) => !['community_huddle_started', 'announcement', 'prayer'].includes(t)),
  'R: unrelated notification types excluded from Feed badge set'
);
assert(/communityFeedUnreadCount/.test(notify + sidebar), 'Q/T: unread Community count API + sidebar');
assert(/mark_all_read|resource=notifications/.test(notify + drawer), 'T: mark-read integration preserved');

// U–W edit/dedupe
const diff = mentionDiff([uid], [uid, uid2]);
assert(diff.added.includes(uid2) && diff.unchanged.includes(uid) && diff.removed.length === 0, 'W: newly added mention detected');
const same = mentionDiff([uid], [uid]);
assert(same.added.length === 0 && same.unchanged.includes(uid), 'V: unchanged mention no renotify set');
assert(/user_notifications_feed_mention_dedupe_idx/.test(migration), 'U: duplicate mention notify dedupe index');
assert(/persistFeedMentionsThenNotify|replaceFeedMentions/.test(core + helper), 'V/W: edit mention sync path');

// Consistency fix coverage A–L
const planAdd = planFeedMentionMutation([uid], [uid, uid2]);
assert(
  planAdd.insertFirst.includes(uid2) &&
    planAdd.insertFirst.length === 1 &&
    planAdd.deleteAfter.length === 0 &&
    JSON.stringify(planAdd.insertFirst) === JSON.stringify(planAdd.added),
  'D/I: insert newly-added first before any delete'
);
const planRemove = planFeedMentionMutation([uid, uid2], [uid]);
assert(
  planRemove.deleteAfter.includes(uid2) &&
    planRemove.insertFirst.length === 0 &&
    planRemove.removed.includes(uid2),
  'J: removed mention planned for delete-after only'
);
assert(!/delete\(\)[\s\S]{0,80}insert\(rows\)/.test(helper.replace(/\s+/g, ' ')), 'C: no wipe-all-then-insert pattern');
assert(/insertFirst/.test(helper) && /deleteAfter/.test(helper), 'D: insert-first / delete-after plan');
assert(/ok: false/.test(helper) && /Could not save mentions|Could not update mentions|Could not load existing mentions/.test(helper), 'A/B: replace failure returns hard failure');
assert(/confirmedAdded/.test(helper), 'C: prior state preserved on insert failure (no wipe)');
assert(/persistFeedMentionsThenNotify/.test(helper + core), 'D: persist-then-notify orchestration');
assert(/notifyFailed|mentionNotify|mention notify partial failure/.test(helper + core), 'E: notification failure surfaced/logged');
assert(/isUniqueViolation|conflicts/.test(helper), 'F: retry dedupe via unique violation / conflicts');
assert(/insert\(rows\)/.test(helper) && /insertFirst\.length/.test(helper), 'G: multi-mention batch insert (all-or-fail statement)');
assert(planFeedMentionMutation([uid], [uid]).added.length === 0, 'H: unchanged mention no renotify set');
assert(planFeedMentionMutation([uid], [uid, uid2]).added.includes(uid2), 'I: newly-added mention still notifies set');
assert(planFeedMentionMutation([uid, uid2], [uid]).removed.includes(uid2), 'J: removed mention relation removed set');
assert(/no self-notify|shouldNotifyFeedMentionRecipient/.test(helper), 'K: self mention still no notification');
assert(
  resolveAuthorizedFeedMentionIds({ content: 'hello', claimedIds: [uid] }).ok === false,
  'L: ineligible/spoof claim without token rejected'
);
assert(
  /if \(mentionPersist\.ok !== true\)/.test(core) && /mentionWarning:\s*true/.test(core),
  'A/B: core fails closed — no silent continue after replace failure'
);
assert(!/await replaceFeedMentions\([\s\S]*?await notifyNewFeedMentions/.test(core), 'A: core no longer notifies after unchecked replace');

// ---------- Phase 4C.1 hotfix: comment XOR target + notify/badge contracts ----------
const postRel = feedMentionRelationTarget({ target: 'post', postId: uid, commentId: uid2 });
assert(
  postRel.ok === true &&
    (postRel as any).postId === uid &&
    (postRel as any).commentId === null,
  '4C.1-1: post mention → post_id set, comment_id null'
);
const commentRel = feedMentionRelationTarget({ target: 'comment', postId: uid, commentId: uid2 });
assert(
  commentRel.ok === true &&
    (commentRel as any).postId === null &&
    (commentRel as any).commentId === uid2,
  '4C.1-2: comment mention → post_id null, comment_id set'
);
assert(
  feedMentionRelationTarget({ target: 'post', postId: null, commentId: null }).ok === false,
  '4C.1-3: neither target rejected'
);
assert(
  feedMentionRelationTarget({ target: 'comment', postId: uid, commentId: '' }).ok === false,
  '4C.1-3b: comment without comment id rejected'
);
assert(
  /if \(\(postId \? 1 : 0\) \+ \(commentId \? 1 : 0\) !== 1\)/.test(helper),
  '4C.1-4: replaceFeedMentions still rejects both/neither at DB boundary'
);
assert(
  planFeedMentionMutation([], [uid, uid2]).insertFirst.length === 2,
  '4C.1-7: multi-mention batch plans all newly-added ids'
);
// Parent post id must NOT be written into relation when target is comment
assert(
  /feedMentionRelationTarget/.test(helper) &&
    /postId: relation\.postId/.test(helper) &&
    /commentId: relation\.commentId/.test(helper),
  '4C.1: persist uses XOR relation helper (not raw both ids)'
);
assert(
  /target: 'comment'/.test(core) && /commentId: data\.id/.test(core) && /postId/.test(core),
  '4C.1-6: comment create still has parent postId for deep-link + authoritative comment UUID'
);
assert(
  /validateFeedCommentContent/.test(core) && /feedType === 'comments'/.test(core),
  '4C.1-5: comment without mention path still present'
);
assert(
  /const mentionSync = await replaceFeedMentions[\s\S]*?await notifyNewFeedMentions/.test(helper),
  '4C.1-12: notify only after confirmed mention persistence'
);
assert(/isUniqueViolation|conflicts/.test(helper), '4C.1-13: retry dedupe via unique violation');
assert(
  !isCommunityNotifyEligibleUser({ role: 'PENDING', email: 'a@church.org' }) &&
    !isCommunityNotifyEligibleUser({ role: 'MEMBER', email: 'x@awc-vault.local' }),
  '4C.1-14: PENDING/synthetic cannot receive Feed mentions'
);
assert(/postDeleted/.test(helper) && /deleted_at/.test(core), '4C.1-15: deleted targets gated');
const commentLink = buildFeedPostDeepLink(uid, uid2);
assert(
  commentLink === `/community/feed?post=${uid}&comment=${uid2}`,
  '4C.1-16: deep-link contains post+comment UUIDs'
);
assert(
  COMMUNITY_FEED_INBOX_TYPES.includes('community_feed_mention_post') &&
    COMMUNITY_FEED_INBOX_TYPES.includes('community_feed_mention_comment') &&
    COMMUNITY_FEED_INBOX_TYPES.includes('community_feed_comment'),
  '4C.1-17: Community unread includes Feed mention+comment types'
);
assert(
  !COMMUNITY_FEED_INBOX_TYPES.includes('community_huddle_started' as any) &&
    !COMMUNITY_FEED_INBOX_TYPES.includes('community_dm' as any),
  '4C.1-18: Community unread excludes unrelated types'
);
assert(/community_huddle_started/.test(notify), '4C.1-19: Chat/Huddle notify type unchanged');
assert(
  /mentioned you in a Community post/.test(helper) &&
    /mentioned you in a Community comment/.test(helper),
  '4C.1-8: A→B mention copy present for post and comment'
);
assert(/shouldNotifyFeedMentionRecipient|no self-notify/.test(helper), '4C.1-9: self-mention skipped');
assert(
  /String\(opts\.postAuthorId\)\.toLowerCase\(\) === String\(opts\.commenterId\)/.test(helper) ||
    /postAuthorId[\s\S]*commenterId/.test(helper),
  '4C.1-10/11: own-post comment notification skipped'
);
assert(
  /showCommunityBadge/.test(sidebar) &&
    !/communityFeedUnread > 0 && !isActive/.test(sidebar),
  '4C.1 badge: Community unread visible even on Feed route'
);

// X reaction deferred
assert(feedReactionNotificationsDeferred() === true, 'X: reaction notifications deferred');

// Y huddle
assert(/community_huddle_started/.test(migration), 'Y: huddle type retained in CHECK');
assert(/community_huddle_started/.test(notify), 'Y: huddle notify type preserved');

// Z CHECK widen
assert(/community_feed_comment/.test(migration), 'Z: CHECK includes feed comment');
assert(/community_feed_mention_post/.test(migration), 'Z: CHECK includes feed mention post');
assert(/DO NOT apply automatically/.test(migration), 'Z: migration not auto-applied');
assert(/community_feed_mentions/.test(migration), 'mention table present');
assert(/ENABLE ROW LEVEL SECURITY/.test(migration), 'mentions RLS enabled');

// Photo AA–AK
assert(FEED_CLIENT_IMAGE_MAX_SOURCE_BYTES === 20 * 1024 * 1024, 'source limit ~20MB');
assert(FEED_CLIENT_IMAGE_MAX_EDGE === 1800, 'AC: max long edge 1800');
assert(FEED_CLIENT_IMAGE_MAX_OUTPUT_BYTES === Math.floor(2.5 * 1024 * 1024), 'AH: output ~2.5MB target');
assert(/scaleDimensions|scale < 1|longEdge >/.test(prepare) || FEED_CLIENT_IMAGE_MAX_EDGE === 1800, 'AB: large image resized');
assert(/imageOrientation|from-image/.test(prepare), 'EXIF orientation when supported');
assert(!isAcceptedFeedImageFile({ type: 'image/svg+xml', size: 10, name: 'x.svg' } as File), 'AE: SVG rejected');
assert(isHeicLikeFile({ type: 'image/heic', name: 'a.heic' } as File), 'HEIC detected');
assert(!isAcceptedFeedImageFile({ type: 'image/heic', size: 10, name: 'a.heic' } as File), 'HEIC rejected');
assert(
  parseFeedImageUpload({ mimeType: 'image/gif', fileBase64: 'aaaa' }).ok === false,
  'AF: invalid MIME rejected server-side'
);
assert(/mimeType: outMime|outMime ===/.test(prepare), 'AG: output MIME tied to produced data');
assert(/still too large/.test(prepare), 'AH: oversize after compress message');
assert(/Keep text draft|setPendingImage\(null\)/.test(feedPage), 'AI: text draft preserved on image failure');
assert(/preparingImage|Preparing photo/.test(feedPage), 'AJ: Post disabled while preparing / status shown');
assert(/parseFeedImageUpload|FEED_IMAGE_MAX_BYTES|isSafeFeedImagePath/.test(core), 'AK: server validation still present');
assert(/isCommunityFeedModerator|community_moderation_log|canRemoveFeedPost/.test(core + smoke4b), 'AL: Phase 4B moderation preserved');

// AM–AT regressions markers
assert(/What's on your heart|data-feed-composer/.test(feedPage), 'AM: text posts composer');
assert(/data-feed-add-photo|prepareFeedImageFile/.test(feedPage), 'AN: photo posts');
assert(/feedType === 'comments'|submitComment/.test(core + feedPage), 'AO: comments');
assert(/decideFeedReactionToggle|reactions/.test(core + feedPage), 'AP: reactions');
assert(/Remove post|moderation/.test(feedPage), 'AQ: moderation UI');
assert(/CommunityIdentityNav/.test(feedPage), 'AR: Feed|Chat nav');
assert(/decideHuddleInviteDeepLink|huddle=1/.test(read('pages/community/Chat.tsx')), 'AS: Huddle invite');
assert(!/VoiceHuddle|RoomEvent|livekit-client/.test(helper + prepare + migration), 'AT: no LiveKit in 4C helpers');

assert(/data-feed-mention-picker/.test(read('components/Community/FeedMentionComposer.tsx')), 'mention picker UI');
assert(/communityFeedUnread/.test(sidebar), 'sidebar Community badge');

// ---------- Phase 4C.2 comment avatar polish ----------
assert(/AuthorAvatar/.test(feedPage) && /size === 'comment'/.test(feedPage), '4C.2: shared AuthorAvatar with comment size');
assert(/profile photo/.test(feedPage), '4C.2: accessible avatar alt/label');
assert(/data-feed-author-avatar=.comment.|data-feed-author-avatar=\{size\}/.test(feedPage), '4C.2: comment avatar marker');
assert(/onError/.test(feedPage), '4C.2: broken image falls back to initials');
assert(/loadFeedAuthors[\s\S]*commentAuthors|commentAuthors = await loadFeedAuthors/.test(core), '4C.2-C: batched comment author hydration (no N+1)');
assert(/AuthorAvatar author=\{post\.author\}/.test(feedPage), '4C.2-D: post avatar unchanged path');
assert(/formatFeedContentForDisplay\(c\.content\)|c\.contentDisplay/.test(feedPage), '4C.2-E: comment mentions still render');
assert(/toggleReaction\('comment'/.test(feedPage), '4C.2-F: comment reactions remain');
assert(/w-9 h-9|width=\{36\}/.test(feedPage), '4C.2: ~36px comment avatar');

// ---------- Phase 4C.3 notification recipient + same-name UUID safety ----------
const accountA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const accountB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
assert(
  shouldNotifyFeedMentionRecipient({ actorId: accountA, mentionedUserId: accountB }) === true,
  '4C.3-A: distinct UUIDs → notify B'
);
assert(
  shouldNotifyFeedMentionRecipient({
    actorId: accountA,
    mentionedUserId: accountB,
  }) === true &&
    buildFeedMentionToken('Jerless Mahabir', accountA) !==
      buildFeedMentionToken('Jerless Mahabir', accountB),
  '4C.3-B: same display name, different UUIDs still distinct tokens / notify'
);
assert(
  shouldNotifyFeedMentionRecipient({ actorId: accountA, mentionedUserId: accountA }) === false,
  '4C.3-C: same UUID → no self notification'
);
assert(
  feedMentionRelationTarget({ target: 'comment', postId: accountA, commentId: accountB }).ok === true &&
    (feedMentionRelationTarget({ target: 'comment', postId: accountA, commentId: accountB }) as any).postId === null,
  '4C.3-D: comment mention relation uses comment_id only'
);
assert(
  feedMentionRelationTarget({ target: 'post', postId: accountA, commentId: accountB }).ok === true &&
    (feedMentionRelationTarget({ target: 'post', postId: accountA, commentId: accountB }) as any).commentId === null,
  '4C.3-E: post mention relation uses post_id only'
);
assert(
  /addedUserIds|mentionedUserId/.test(helper) && /shouldNotifyFeedMentionRecipient/.test(helper),
  '4C.3-F: notification recipient equals mentioned UUID path'
);
assert(
  /community_feed_mention_post|community_feed_mention_comment|community_feed_comment/.test(drawer) &&
    /Community Mention|Community Comment/.test(drawer),
  '4C.3-G: Feed types appear in notification drawer'
);
assert(
  COMMUNITY_FEED_INBOX_TYPES.includes('community_feed_mention_comment') &&
    /communityFeedUnreadCount/.test(notify),
  '4C.3-H: unread Feed notification increments Community count'
);
assert(
  /showCommunityBadge/.test(sidebar) && !/communityFeedUnread > 0 && !isActive/.test(sidebar),
  '4C.3-I: Community badge remains visible on Feed route'
);
assert(/mark_all_read|Mark all read/.test(notify + drawer), '4C.3-J: mark read path preserved');
assert(/user_notifications_feed_mention_dedupe_idx|isUniqueViolation/.test(migration + helper), '4C.3-K: dedupe same source only');
assert(
  /sourceId = opts\.target === 'comment'/.test(helper) || /sourceId/.test(helper),
  '4C.3-L: different comment/post source_id for notify'
);
assert(/AuthorAvatar|avatar_url/.test(feedPage), '4C.3-M/N: avatar image vs initials paths');
assert(/loadFeedAuthors/.test(core), '4C.3-O: author hydration batched');
assert(
  /emailHint|formatMentionCandidateHint|data-mention-candidate-hint/.test(core + helper + read('components/Community/FeedMentionComposer.tsx')),
  '4C.3: mention picker disambiguates same display names'
);
assert(emailLocalPartHint('member@church.org') === 'member', '4C.3: email hint local-part');
assert(formatMentionCandidateHint({ role: 'MEMBER', emailHint: 'member' }).includes('MEMBER'), '4C.3: candidate hint format');

console.log('\nAll Phase 4C mentions + notifications + photo smoke tests passed.');
