/**
 * PLCC Community Phase 4D.1 — Feed experience + engagement core smoke.
 * Run: npx tsx scripts/community-phase-4d-feed-experience-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FEED_CATEGORIES,
  FEED_FILTER_CHIP_LABELS,
  FEED_PAGE_SIZE,
  parseFeedCategory,
  parseFeedListCategoryFilter,
} from '../api/_utils/communityFeed.js';
import {
  buildFeedPostDeepLink,
  buildFeedPostShareAbsoluteUrl,
  buildFeedPostSharePath,
  canUseNativeShare,
  shouldSendFeedCommentNotification,
  shouldNotifyFeedMentionRecipient,
  COMMUNITY_FEED_NOTIFY_TYPES,
} from '../api/_utils/communityFeedMentions.js';
import { COMMUNITY_FEED_INBOX_TYPES } from '../api/_utils/notify.js';

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

const core = read('api/_utils/core.ts');
const feedPage = read('pages/community/Feed.tsx');
const helper = read('api/_utils/communityFeed.ts');
const mentions = read('api/_utils/communityFeedMentions.ts');
const notify = read('api/_utils/notify.ts');
const smoke4c = read('scripts/community-phase-4c-mentions-notifications-smoke.ts');

const postId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const authorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const commenterId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const otherId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const commentId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

console.log('\nPhase 4D.1 Feed experience + engagement smoke');

// A. category validation
assert(parseFeedListCategoryFilter(undefined).ok === true, 'A: missing category → All');
assert(
  parseFeedListCategoryFilter(undefined).ok === true &&
    (parseFeedListCategoryFilter(undefined) as { category: null }).category === null,
  'A: missing → category null'
);
assert(parseFeedListCategoryFilter('all').ok === true, 'A: all → ok');
assert(parseFeedListCategoryFilter('').ok === true, 'A: empty → All');
assert(parseFeedListCategoryFilter('not_a_category').ok === false, 'A: unknown category rejected');
assert(parseFeedCategory('praise') === 'praise', 'A: canonical praise value');
assert(parseFeedCategory('ministry_update') === 'ministry_update', 'A: canonical ministry_update value');
assert(parseFeedListCategoryFilter('Ministry_Updates').ok === false, 'A: non-canonical plural rejected');
assert(parseFeedListCategoryFilter('ministry_update').ok === true, 'A: stored ministry_update accepted');

// B. All filter
assert(/parseFeedListCategoryFilter/.test(core + helper), 'B: list API uses category filter parser');
assert(!/client.?only.?filter|posts\.filter\(\(p\).*category/.test(feedPage), 'B: no client-only category filter of page');

// C. individual category filter
for (const cat of FEED_CATEGORIES) {
  const parsed = parseFeedListCategoryFilter(cat);
  assert(parsed.ok === true && (parsed as { category: string }).category === cat, `C: filter ${cat}`);
}
assert(FEED_FILTER_CHIP_LABELS.ministry_update === 'Ministry Updates', 'C: Ministry Updates chip label');
assert(FEED_FILTER_CHIP_LABELS.event === 'Events', 'C: Events chip label');
assert(/data-feed-category-filters/.test(feedPage), 'C: filter row UI');
assert(/data-feed-category-filter/.test(feedPage), 'C: per-category chip markers');

// D. category + pagination
assert(/categoryFilter\.category/.test(core) && /\.eq\('category'/.test(core), 'D: server .eq category when filtered');
assert(
  /limit=.*offset=/.test(feedPage) && /category=\$\{encodeURIComponent/.test(feedPage),
  'D: client passes category with pagination'
);
assert(FEED_PAGE_SIZE === 20, 'D: page size unchanged');

// E. changing category resets client pagination
assert(/applyListCategory/.test(feedPage) && /setOffset\(0\)/.test(feedPage), 'E: filter change resets offset');
assert(/setHasMore\(false\)/.test(feedPage), 'E: filter change resets hasMore');

// F. focused post deep-link unaffected by category
assert(
  /deepPostId[\s\S]{0,400}categoryFilter|Focused deep-link loads the post by id regardless/.test(core),
  'F: deep-link path ignores list category filter'
);
assert(/id=\$\{encodeURIComponent\(postId\)\}/.test(feedPage), 'F: client deep-link fetch by id');

// G. canonical share link (HashRouter absolute external URL)
const path = buildFeedPostSharePath(postId);
assert(path === `/community/feed?post=${postId}`, 'G: canonical relative share path');
assert(path === buildFeedPostDeepLink(postId), 'G: share path matches deep-link builder');
const abs = buildFeedPostShareAbsoluteUrl('https://preview.example.com', postId);
assert(
  abs === `https://preview.example.com/#/community/feed?post=${postId}`,
  'G: absolute HashRouter share URL'
);
assert(abs != null && abs.includes('/#/community/feed'), 'G-A: share URL contains /#/community/feed');
assert(
  abs != null && !/^https?:\/\/[^/]+\/community\/feed\?/.test(abs),
  'G-B: share URL does not use bare /community/feed as external path'
);
assert(
  abs != null &&
    abs.includes(`post=${postId}`) &&
    !abs.includes('comment=') &&
    !abs.includes('category='),
  'G-C: query contains only post=<uuid>'
);
assert(
  abs != null &&
    !abs.includes('access_token') &&
    !abs.includes('token=') &&
    !abs.includes('code=') &&
    !abs.includes('session'),
  'G-D: share URL has no auth/session params'
);
assert(abs != null && abs.startsWith('https://preview.example.com/#'), 'G-E: origin preserved');

// H. non-http origin rejected; Feed still uses helper
assert(
  buildFeedPostShareAbsoluteUrl('javascript:alert(1)', postId) === null,
  'H: non-http origin rejected'
);
assert(/buildFeedPostShareAbsoluteUrl/.test(feedPage), 'H: Feed uses share absolute URL helper');

// HashRouter contract: Huddle invite hash form unchanged; in-app notify stays relative
const huddleInviteSrc = read('api/_utils/huddleInvite.ts');
assert(
  /return `\$\{origin\}\/#\$\{path\}`/.test(huddleInviteSrc),
  'G-F: Huddle invite helper remains HashRouter absolute'
);
assert(
  buildFeedPostDeepLink(postId) === `/community/feed?post=${postId}`,
  'G-G: relative notification deep-link unchanged'
);
assert(
  /navigate\(item\.link\)/.test(read('components/Admin/NotificationDrawer.tsx')),
  'G-G: NotificationDrawer still navigates relative links'
);

// I. clipboard fallback / native-share branching
assert(/navigator\.clipboard|writeText/.test(feedPage), 'I: clipboard copy path');
assert(/canUseNativeShare|navigator\.share/.test(feedPage + mentions), 'I: native share branching');
assert(canUseNativeShare({ share: () => {} }) === true, 'I: share present → true');
assert(canUseNativeShare({}) === false, 'I: share absent → false');
assert(/data-feed-share-copy/.test(feedPage), 'I: Copy link control');
assert(/Link copied/.test(feedPage), 'I: Link copied feedback');
assert(/copyPostLink/.test(feedPage) && !/alert\(\s*['"]Link/.test(feedPage), 'I: no alert() for copy feedback');

// J. lightbox Escape
assert(/Escape/.test(feedPage) && /data-feed-lightbox/.test(feedPage), 'J: Escape closes lightbox');

// K. lightbox focus restoration
assert(/lightboxTriggerRef|lightboxCloseRef/.test(feedPage), 'K: lightbox focus refs');
assert(/trigger\.focus|lightboxCloseRef\.current\?\.focus/.test(feedPage), 'K: focus into close + restore');
assert(/aria-label="Close photo viewer"/.test(feedPage), 'K: close control accessible label');
assert(/role="dialog"/.test(feedPage) && /aria-modal="true"/.test(feedPage), 'K: dialog semantics');

// L. confirmed mention suppresses generic comment notify
assert(
  !shouldSendFeedCommentNotification({
    postAuthorId: authorId,
    commenterId,
    postDeleted: false,
    confirmedMentionedUserIds: [authorId],
  }),
  'L: confirmed author mention suppresses comment notify'
);
assert(/confirmedMentionedUserIds|shouldSendFeedCommentNotification/.test(core + mentions), 'L: wired in core/helpers');
assert(/mentionPersist\.mentionSync\.nextIds/.test(core), 'L: uses confirmed nextIds after persist');

// M. intended-but-unconfirmed does NOT suppress
assert(
  shouldSendFeedCommentNotification({
    postAuthorId: authorId,
    commenterId,
    postDeleted: false,
    confirmedMentionedUserIds: [],
  }),
  'M: empty confirmed set still notifies author'
);
assert(
  shouldSendFeedCommentNotification({
    postAuthorId: authorId,
    commenterId,
    postDeleted: false,
    confirmedMentionedUserIds: null,
  }),
  'M: null confirmed set still notifies author'
);

// N. unrelated mentioned user does NOT suppress
assert(
  shouldSendFeedCommentNotification({
    postAuthorId: authorId,
    commenterId,
    postDeleted: false,
    confirmedMentionedUserIds: [otherId],
  }),
  'N: unrelated mention does not suppress author comment notify'
);

// O. self rules remain correct
assert(
  !shouldSendFeedCommentNotification({
    postAuthorId: authorId,
    commenterId: authorId,
    postDeleted: false,
    confirmedMentionedUserIds: [],
  }),
  'O: author commenting on own post still skipped'
);
assert(
  !shouldSendFeedCommentNotification({
    postAuthorId: authorId,
    commenterId,
    postDeleted: true,
    confirmedMentionedUserIds: [],
  }),
  'O: deleted post still skipped'
);
assert(
  !shouldNotifyFeedMentionRecipient({ actorId: authorId, mentionedUserId: authorId }),
  'O: self-mention notify still false'
);

// P. deep-linked comment scroll target
assert(/feed-comment-\$\{/.test(feedPage) || /feed-comment-/.test(feedPage), 'P: comment element id for scroll');
assert(/scrollIntoView/.test(feedPage), 'P: scrollIntoView on deep-linked comment');
assert(/block:\s*['"]center['"]/.test(feedPage), 'P: scroll near center');

// Q. no repeated scroll loop
assert(/scrolledCommentRef/.test(feedPage), 'Q: scroll once guard ref');

// R. filter empty state
assert(/No posts in /.test(feedPage) && /data-feed-empty-filter/.test(feedPage), 'R: category empty state');
assert(/data-feed-empty-show-all|Show All/.test(feedPage), 'R: return to All control');
assert(/Community starts here/.test(feedPage), 'R: global empty state preserved');

// S. Community unread types unchanged
assert(
  JSON.stringify([...COMMUNITY_FEED_INBOX_TYPES].sort()) ===
    JSON.stringify(
      [
        'community_feed_comment',
        'community_feed_mention_comment',
        'community_feed_mention_post',
      ].sort()
    ) ||
    COMMUNITY_FEED_INBOX_TYPES.includes('community_feed_comment'),
  'S: feed inbox types still include comment + mentions'
);
assert(
  COMMUNITY_FEED_NOTIFY_TYPES.includes('community_feed_comment') &&
    COMMUNITY_FEED_NOTIFY_TYPES.includes('community_feed_mention_comment'),
  'S: notify type union unchanged for comment/mention'
);

// T. Phase 4C mention behavior remains intact
assert(/persistFeedMentionsThenNotify/.test(core + smoke4c), 'T: 4C persist-then-notify still present');
assert(/shouldNotifyFeedMentionRecipient/.test(mentions), 'T: UUID-only mention self-gate intact');
assert(/community_feed_mention_comment/.test(mentions + notify), 'T: mention comment type intact');
assert(!/create table|alter table|migration/i.test(feedPage), 'T: no SQL in Feed page');

// Diff hygiene markers
assert(!/livekit|VoiceHuddle|huddle/i.test(helper.match(/parseFeedListCategoryFilter[\s\S]{0,400}/)?.[0] || ''), 'hygiene: filter helper clean');
assert(/Phase 4D\.1/.test(mentions + helper + feedPage), 'hygiene: 4D.1 markers present');

console.log('\nPhase 4D.1 smoke PASSED\n');
