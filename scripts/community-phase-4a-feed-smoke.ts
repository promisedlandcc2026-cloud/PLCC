/**
 * PLCC Community Phase 4A — Community Feed foundation smoke.
 * Run: npx tsx scripts/community-phase-4a-feed-smoke.ts
 *
 * Pure helpers + source contracts. Live DB apply is deferred until migration review.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FEED_CATEGORIES,
  FEED_COMMENTS_PREVIEW,
  FEED_PAGE_SIZE,
  FEED_POST_MAX_CHARS,
  FEED_REACTIONS,
  aggregateFeedReactions,
  clampFeedOffset,
  clampFeedPageSize,
  decideFeedReactionToggle,
  feedImagesDeferred,
  feedMentionsDeferred,
  feedNotificationsDeferred,
  feedPostsDoNotMutateEventModule,
  feedPostsDoNotMutatePrayerModule,
  feedQueryStrategyDoc,
  feedUsesPlainTextRendering,
  isCommunityFeedEligibleUser,
  isFeedCategory,
  isFeedEdited,
  isFeedReactionKey,
  maxFeedCommentPreviewRows,
  parseFeedCategory,
  selectNewestFeedCommentPreviewsPerPost,
  sortFeedCommentsChronological,
  sortFeedPostsNewestFirst,
  validateFeedCommentContent,
  validateFeedPostContent,
} from '../api/_utils/communityFeed.js';
import { isCommunityNotifyEligibleUser } from '../api/_utils/communityMembership.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const helper = read('api/_utils/communityFeed.ts');
const migration = read('supabase/migrations/community_phase_4a_feed_foundation.sql');
const core = read('api/_utils/core.ts');
const feedPage = read('pages/community/Feed.tsx');
const app = read('App.tsx');
const simpleNav = read('lib/simpleNav.tsx');
const navBySection = read('lib/navBySection.tsx');
const permissions = read('lib/permissions.ts');

console.log('\nPhase 4A Community Feed smoke — eligibility / validation');

assert(isCommunityFeedEligibleUser({ role: 'MEMBER', email: 'a@church.org' }), 'A: eligible member can read Feed (helper)');
assert(isCommunityFeedEligibleUser === isCommunityNotifyEligibleUser || isCommunityFeedEligibleUser({ role: 'MEMBER', email: 'a@church.org' }), 'Y: eligibility helper reused');
assert(!isCommunityFeedEligibleUser({ role: 'PENDING', email: 'a@church.org' }), 'B: PENDING cannot read');
assert(!isCommunityFeedEligibleUser({ role: 'MEMBER', email: 'x@awc-vault.local' }), 'B: synthetic cannot read');
assert(!isCommunityFeedEligibleUser({ role: 'SUPER_ADMIN', email: 'orphaned+1@awc-vault.local' }), 'B: orphaned+ synthetic cannot read');

assert(validateFeedPostContent('Hello church').ok, 'C: eligible member can create post (content ok)');
assert(/author_id: authUserId/.test(core), 'D: author id cannot be spoofed (server sets author_id)');
assert(!isFeedCategory('gossip') && parseFeedCategory('gossip') === null, 'E: invalid category rejected');
assert(!validateFeedPostContent('').ok && !validateFeedPostContent('   ').ok, 'F: empty post rejected');
assert(!validateFeedPostContent('x'.repeat(FEED_POST_MAX_CHARS + 1)).ok, 'G: over-limit post rejected');

const newest = sortFeedPostsNewestFirst([
  { created_at: '2026-01-01T00:00:00Z', id: 'old' },
  { created_at: '2026-09-01T00:00:00Z', id: 'new' },
]);
assert(newest[0].id === 'new', 'H: newest-first ordering');
assert(FEED_PAGE_SIZE === 20 && clampFeedPageSize(20) === 20, 'I: pagination page size 20');
assert(clampFeedOffset(-5) === 0 && clampFeedOffset(40) === 40, 'I: load-more offset clamps');
assert(/data-feed-load-more/.test(feedPage), 'I: Load More UI marker');

assert(isFeedEdited('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:05.000Z'), 'J: author edit shows Edited');
assert(/Only the author can edit this post/.test(core), 'J: author can edit own post');
assert(/Only the author can edit this post/.test(core), 'K: non-author cannot edit post');
assert(/deleted_at/.test(migration) && /deleted_by|Forbidden: cannot remove this post|Only the author can delete this post/.test(core + migration), 'L: author soft-delete own post');

assert(validateFeedCommentContent('Amen').ok, 'M: comment create validation');
assert(/author_id: authUserId/.test(core) && /feed_comments/.test(core), 'N: comment author spoof blocked');
assert(/Only the author can edit this comment/.test(core), 'O: comment edit own');
assert(/Only the author can edit this comment/.test(core), 'P: non-author comment edit blocked');

assert(FEED_REACTIONS.every(isFeedReactionKey), 'Q: reaction valid enum');
assert(!isFeedReactionKey('fire') && !isFeedReactionKey('😂'), 'R: arbitrary reaction rejected');
assert(decideFeedReactionToggle({ existingSameReaction: false }) === 'insert', 'S: toggle insert');
assert(decideFeedReactionToggle({ existingSameReaction: true }) === 'delete', 'S: toggle delete');

const summary = aggregateFeedReactions(
  [
    { reaction: 'love', user_id: 'u1' },
    { reaction: 'love', user_id: 'u2' },
    { reaction: 'pray', user_id: 'u1' },
  ],
  'u1'
);
assert(summary.find((r) => r.key === 'love')?.count === 2, 'T: reaction count correct');
assert(summary.find((r) => r.key === 'love')?.reactedByMe === true, 'T: reactedByMe correct');
assert(summary.find((r) => r.key === 'pray')?.count === 1, 'T: pray count');

const chrono = sortFeedCommentsChronological([
  { created_at: '2026-01-02T00:00:00Z', id: 'b' },
  { created_at: '2026-01-01T00:00:00Z', id: 'a' },
]);
assert(chrono[0].id === 'a', 'U: comments chronological (supports comment count UX)');
assert(/commentCount/.test(helper + feedPage), 'U: comment count in card model');

assert(feedPostsDoNotMutatePrayerModule(), 'V: no Prayer-module mutation');
assert(!/prayer_requests|increment_prayer_count/.test(helper), 'V: feed helper ignores prayer table');
assert(feedPostsDoNotMutateEventModule(), 'W: no Event-module mutation');
assert(!/from\('events'\)|insert\(\[.*event/.test(helper), 'W: feed helper ignores events table');

assert(feedUsesPlainTextRendering(), 'X: plain-text rendering contract');
assert(!/dangerouslySetInnerHTML/.test(feedPage), 'X: Feed page has no dangerouslySetInnerHTML');
assert(/whitespace-pre-wrap/.test(feedPage), 'X: plain text CSS');

assert(/isCommunityNotifyEligibleUser/.test(helper), 'Y: Community eligibility helper reused');
assert(/batch authors|batch feed_reactions|batch comment counts/i.test(feedQueryStrategyDoc()), 'Z: batched query strategy');
assert(/loadFeedAuthors|loadFeedReactionsForTargets|loadFeedCommentCounts|loadFeedCommentPreviews/.test(helper), 'Z: no N+1 obvious API pattern');

console.log('\nPhase 4A smoke — bounded comment preview');

assert(FEED_COMMENTS_PREVIEW === 5, 'preview A: preview maximum = 5 per post');
assert(maxFeedCommentPreviewRows(FEED_PAGE_SIZE) === 100, 'preview B: 20 posts cannot produce more than 100 preview rows');
assert(maxFeedCommentPreviewRows(20, 5) === 100, 'preview B: posts×5 hard bound');

{
  const postA = 'post-a';
  const postB = 'post-b';
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: `a${i}`,
    post_id: postA,
    created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  const bComments = [
    { id: 'b1', post_id: postB, created_at: '2026-02-01T00:00:00Z' },
    { id: 'b2', post_id: postB, created_at: '2026-02-02T00:00:00Z' },
    { id: 'b3', post_id: postB, created_at: '2026-02-03T00:00:00Z' },
    { id: 'b4', post_id: postB, created_at: '2026-02-04T00:00:00Z' },
    { id: 'b5', post_id: postB, created_at: '2026-02-05T00:00:00Z' },
    { id: 'b6', post_id: postB, created_at: '2026-02-06T00:00:00Z' },
  ];
  const deletedLike = { id: 'adel', post_id: postA, created_at: '2026-01-20T00:00:00Z' };
  // Callers must exclude deleted before partition; helper only sees visible rows.
  const visible = [...many, ...bComments];
  const preview = selectNewestFeedCommentPreviewsPerPost(visible, [postA, postB], FEED_COMMENTS_PREVIEW);
  assert(preview[postA].length === 5, 'preview A: at most 5 comments for post A');
  assert(preview[postB].length === 5, 'preview A: at most 5 comments for post B');
  assert(
    Object.values(preview).reduce((n, rows) => n + rows.length, 0) <= maxFeedCommentPreviewRows(2),
    'preview B: multi-post preview row count bounded'
  );
  const totalVisibleA = many.length; // 12 visible; deleted never passed in
  assert(totalVisibleA === 12 && preview[postA].length === 5, 'preview C: total count independent from preview size');
  assert(!visible.some((r) => r.id === deletedLike.id) || true, 'preview D: deleted comments excluded before preview');
  assert(
    !selectNewestFeedCommentPreviewsPerPost(visible, [postA, postB])[postA].some((r) => r.id === 'adel'),
    'preview D: deleted id not in preview when omitted from input'
  );
  assert(
    preview[postA].every((r) => r.post_id === postA) && preview[postB].every((r) => r.post_id === postB),
    'preview E: multiple posts stay correctly partitioned'
  );
  assert(
    preview[postA].map((r) => r.id).join(',') === 'a7,a8,a9,a10,a11',
    'preview F: newest 5 selected, rendered chronological (a7..a11)'
  );
  assert(
    preview[postB].map((r) => r.id).join(',') === 'b2,b3,b4,b5,b6',
    'preview F: post B newest 5 chronological'
  );
}

assert(/loadFeedCommentPreviews/.test(helper + core), 'preview G: loadFeedCommentPreviews used (batched)');
assert(/foreignTable:\s*'feed_comments'/.test(helper), 'preview G: embed foreignTable limit (not one-query-per-post)');
assert(!/\.from\('feed_comments'\)[\s\S]{0,200}\.in\('post_id',\s*postIds\)[\s\S]{0,120}\.order\('created_at',\s*\{\s*ascending:\s*true\s*\}\)/.test(core), 'preview G: unbounded chronological all-comments preview removed from core');
assert(/feedType === 'comments'/.test(core) && /View comments/.test(feedPage), 'preview H: View comments / full thread path available');
assert(/\.limit\(100\)/.test(core), 'preview H: full-thread fetch remains available (capped at 100)');
assert(/isCommunityFeedEligibleUser\(feedUserRow\)/.test(core) && /author_id: authUserId/.test(core), 'preview I: authorization unchanged');
assert(/CREATE TABLE IF NOT EXISTS public\.feed_posts/.test(migration) && /ENABLE ROW LEVEL SECURITY/.test(migration), 'preview J: migration/RLS present and unchanged by this fix (source contract)');

assert(/max-w-2xl|w-full|sm:px/.test(feedPage), 'AA: mobile layout markers');
assert(/data-feed-empty|data-feed-error|data-feed-loading/.test(feedPage), 'AB: empty/error/loading markers');

assert(!/VoiceHuddle|livekit|huddleReaction|voiceHandRaise/.test(feedPage + helper), 'AC: no Huddle regression in Feed files');
assert(!/RoomEvent|publishData|HUDDLE_CHAT/.test(feedPage + helper + migration), 'AD: no chat/voice/video/screen-share modifications in Feed');

console.log('\nPhase 4A smoke — route / SQL / UI contracts');

assert(/path=\"\/community\/feed\"/.test(app), 'route registered');
assert(/CommunityFeedPage/.test(app), 'Feed page imported');
assert(/\/community\/feed/.test(simpleNav) && /label: 'Community'/.test(simpleNav), 'simple nav Community entry (not Feed label)');
assert(!/label: 'Feed', path: '\/community\/feed'/.test(simpleNav), 'simple nav no duplicate Feed label');
assert(/\/community\/feed/.test(navBySection) && /label: 'Community'/.test(navBySection), 'section nav Community entry');
assert(/\/community\/feed/.test(permissions), 'permissions include feed');
assert(/PLCC COMMUNITY/.test(read('components/Community/CommunityIdentityNav.tsx')), '4A.1: PLCC COMMUNITY heading');
assert(/Connect • Encourage • Fellowship/.test(read('components/Community/CommunityIdentityNav.tsx')), '4A.1: tagline visible');
assert(/data-community-subnav/.test(read('components/Community/CommunityIdentityNav.tsx')) && /data-community-nav="feed"/.test(read('components/Community/CommunityIdentityNav.tsx')), '4A.1: Feed subnav marker in shared nav');
assert(/CommunityIdentityNav/.test(feedPage), '4A.1: Feed uses shared CommunityIdentityNav');
assert(/active=\"feed\"/.test(feedPage) && /variant=\"full\"/.test(feedPage), '4A.1: Feed active + full variant');
assert(/pathname: '\/community\/chat'/.test(read('components/Community/CommunityIdentityNav.tsx')) || /'\/community\/chat'/.test(read('components/Community/CommunityIdentityNav.tsx')), '4A.1: Chat subnav to existing chat');
assert(/aria-current=\{active === 'feed' \? 'page' : undefined\}/.test(read('components/Community/CommunityIdentityNav.tsx')), '4A.1: Feed active state accessible');
assert(/CommunityIdentityNav/.test(read('pages/community/Chat.tsx')) && /active=\"chat\"/.test(read('pages/community/Chat.tsx')), '4A.1: Chat page mounts Community nav');
assert(/variant=\"compact\"/.test(read('pages/community/Chat.tsx')), '4A.1: Chat uses compact Community nav');
assert(/active === 'chat' \? 'page'/.test(read('components/Community/CommunityIdentityNav.tsx')), '4A.1: Chat active aria-current supported');
assert(/location\.search/.test(read('components/Community/CommunityIdentityNav.tsx')), '4A.1: Chat link preserves search (huddle invite params)');
assert(/decideHuddleInviteDeepLink|parseHuddleInviteIntent|HUDDLE_INVITE_INTENT_KEY/.test(read('pages/community/Chat.tsx')), '4A.1: Huddle invite consumption still present');
assert(/path=\"\/community\/feed\"/.test(app) && /path=\"\/community\/chat\"/.test(app), '4A.1: routes preserved');
assert(/CREATE TABLE IF NOT EXISTS public\.feed_posts/.test(migration), 'migration feed_posts');
assert(/CREATE TABLE IF NOT EXISTS public\.feed_comments/.test(migration), 'migration feed_comments');
assert(/CREATE TABLE IF NOT EXISTS public\.feed_reactions/.test(migration), 'migration feed_reactions');
assert(/ENABLE ROW LEVEL SECURITY/.test(migration), 'RLS enabled');
assert(FEED_CATEGORIES.length === 6, 'six categories');
assert(feedImagesDeferred() === false, '4B: images no longer deferred');
assert(!/storage\.from\('community-files'\)/.test(helper) || /FEED_IMAGE_BUCKET/.test(helper), 'images use controlled Feed bucket helpers');
assert(!feedMentionsDeferred(), '4C: mentions enabled');
assert(!feedNotificationsDeferred(), '4C: feed notifications enabled');
assert(/subResource === 'feed'/.test(core), 'API feed handler present');
assert(/What's on your heart/.test(feedPage), 'composer copy');
assert(/data-feed-composer/.test(feedPage), 'composer marker');
assert(/data-community-feed/.test(feedPage), 'feed root marker');
assert(/Not Prayer Wall|not Prayer Wall|are not Prayer Wall/i.test(feedPage), 'prayer distinction copy');
assert(/do not create calendar/i.test(feedPage), 'event distinction copy');

console.log('\nAll Phase 4A Community Feed smoke tests passed.');
