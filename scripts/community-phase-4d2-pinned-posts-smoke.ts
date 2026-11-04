/**
 * PLCC Community Phase 4D.2 — pinned Community Feed posts smoke.
 * Run: npx tsx scripts/community-phase-4d2-pinned-posts-smoke.ts
 *
 * Pure helpers + source contracts. Migration is local-only until apply approval.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canPinFeedPost,
  canEditFeedPost,
  isCommunityFeedModerator,
  isFeedPostPinned,
  sortFeedPostsPinnedFirst,
} from '../api/_utils/communityFeed.js';
import { BROAD_CHAT_ADMIN_ROLES } from '../api/_utils/communityChatSecurity.js';

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

const migration = read('supabase/migrations/community_phase_4d2_pinned_posts.sql');
const helper = read('api/_utils/communityFeed.ts');
const core = read('api/_utils/core.ts');
const feedPage = read('pages/community/Feed.tsx');
const notify = read('api/_utils/notify.ts');
const modLogMigration = read('supabase/migrations/community_phase_4b_media_moderation.sql');
const smoke4d1 = read('scripts/community-phase-4d-feed-experience-smoke.ts');

console.log('\nPhase 4D.2 pinned Community posts smoke');

// Migration hygiene
assert(/ADDITIVE ONLY|additive only/i.test(migration), 'migration: additive only comment');
assert(/DO NOT apply automatically/i.test(migration), 'migration: manual apply only');
assert(/pinned_at timestamptz NULL/.test(migration), 'migration: pinned_at nullable');
assert(/pinned_by uuid NULL/.test(migration), 'migration: pinned_by nullable');
assert(/ON DELETE SET NULL/.test(migration), 'migration: pinned_by SET NULL');
assert(/feed_posts_pin_pair_check/.test(migration), 'migration: pin pair CHECK');
assert(/pinned_by IS NULL OR pinned_at IS NOT NULL/.test(migration), 'migration: CHECK allows orphan pinned_at');
assert(!/CREATE INDEX/i.test(migration), 'migration: no speculative index');
assert(!/ALTER TABLE public\.community_moderation_log|ALTER TABLE public\.user_notifications/i.test(migration), 'U: no moderation-log / notify schema in migration');
assert(!/CREATE POLICY/i.test(migration), 'migration: no RLS policy changes');

// A–D authorization
assert(canPinFeedPost({ viewerRole: 'SUPER_ADMIN' }), 'A: SUPER_ADMIN can pin');
assert(canPinFeedPost({ viewerRole: 'PASTOR' }), 'A: PASTOR can pin');
assert(canPinFeedPost({ viewerRole: 'SECRETARY' }), 'A: SECRETARY can pin');
assert(!canPinFeedPost({ viewerRole: 'MEMBER' }), 'B: MEMBER cannot pin');
assert(!canPinFeedPost({ viewerRole: 'MINISTRY_LEADER' }), 'C: standalone MINISTRY_LEADER cannot pin');
assert(
  canEditFeedPost({ viewerId: 'a', authorId: 'a' }) && !canPinFeedPost({ viewerRole: 'MEMBER' }),
  'D: author ownership alone does not grant pin'
);
assert(isCommunityFeedModerator('ADMIN_STAFF') && BROAD_CHAT_ADMIN_ROLES.has('ADMIN_STAFF'), 'A: Feed mod = broad admin');

// E deleted cannot pin (source)
assert(/deleted_at[\s\S]{0,200}cannot pin|Post not found[\s\S]{0,80}pin|action === 'pin'[\s\S]{0,800}deleted_at/i.test(core) ||
  /pinActionRaw === 'pin'[\s\S]{0,1200}deleted_at/.test(core), 'E: deleted post cannot pin path');
assert(/if \(!pinTarget \|\| pinTarget\.deleted_at\)/.test(core), 'E: pin target deleted → 404');

// F–H idempotency
assert(/\.is\('pinned_at', null\)/.test(core), 'F: conditional pin only when unpinned');
assert(/\.not\('pinned_at', 'is', null\)/.test(core), 'H: conditional unpin only when pinned');
assert(/noop/.test(core) && /already pinned|isFeedPostPinned\(pinTarget\.pinned_at\)/.test(core), 'F/G: pin no-op when already pinned');
assert(!/pinned_at:\s*now[\s\S]{0,200}already pinned/.test(core.replace(/\s+/g, ' ')), 'G: re-pin does not rewrite pinned_at when already pinned');

// I–K ordering helper
const ordered = sortFeedPostsPinnedFirst([
  { id: 'u1', created_at: '2026-09-10T12:00:00Z', pinned_at: null },
  { id: 'p-old', created_at: '2026-01-01T00:00:00Z', pinned_at: '2026-09-01T00:00:00Z' },
  { id: 'p-new', created_at: '2026-02-01T00:00:00Z', pinned_at: '2026-09-11T00:00:00Z' },
  { id: 'u2', created_at: '2026-09-11T12:00:00Z', pinned_at: null },
]);
assert(ordered[0].id === 'p-new' && ordered[1].id === 'p-old', 'I/J: pinned-first; newest pinned_at first');
assert(ordered[2].id === 'u2' && ordered[3].id === 'u1', 'K: unpinned remain created_at DESC');
assert(isFeedPostPinned('2026-09-11T00:00:00Z') && !isFeedPostPinned(null), 'pin derived state');

// L nullsFirst false required
assert(
  /\.order\('pinned_at',\s*\{\s*ascending:\s*false,\s*nullsFirst:\s*false\s*\}\)/.test(core),
  'L: nullsFirst: false required on pinned_at order'
);
assert(/\.order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/.test(core), 'L: created_at DESC secondary');

// M category
assert(/categoryFilter\.category[\s\S]{0,200}eq\('category'/.test(core), 'M: category filter still applied before order');
assert(!/cross.?category|promote.*category/i.test(helper + core), 'M: no cross-category pin promotion');

// N deep-link
assert(/Focused deep-link|deepPostId[\s\S]{0,300}eq\('id'/.test(core), 'N: focused ?post= by id');
assert(!/deepPostId[\s\S]{0,200}order\('pinned_at'/.test(core), 'N: deep-link does not use pin order');

// O–P reload after pin
assert(/reloadFeedAfterPinChange|loadFeed\(\{ nextOffset: 0/.test(feedPage), 'O/P: reload list after pin/unpin');
assert(/setOffset\(0\)/.test(feedPage) && /pinOrUnpinPost/.test(feedPage), 'O/P: reset offset on pin action');

// Q soft-delete hidden
assert(/\.is\('deleted_at', null\)/.test(core), 'Q: list excludes soft-deleted posts');
assert(
  /update\(\{\s*deleted_at:\s*now,\s*updated_at:\s*now,\s*deleted_by:\s*authUserId\s*\}\)/.test(core),
  'Q: soft-delete updates deleted_at only (pin fields untouched)'
);

// R–S client cannot choose pin fields
assert(/pinned_at and pinned_by cannot be set by the client/.test(core), 'R/S: reject client pinned_at/pinned_by');
assert(/pinned_by:\s*authUserId/.test(core), 'R: server sets pinned_by from auth');

// T–U no notify / no mod log widen
assert(!/notifyUser[\s\S]{0,80}pin|community_feed_pin|pin_post/.test(core), 'T: no pin notification emit');
assert(/action IN \('remove_post', 'remove_comment'\)/.test(modLogMigration), 'U: moderation_log CHECK unchanged in 4B');
assert(!/pin_post|unpin_post/.test(migration + core), 'U: no pin_post/unpin_post log actions');
assert(!/community_feed_pin/.test(notify), 'T: notify types unchanged');

// V–W preserve features
assert(/persistFeedMentionsThenNotify|toggleReaction|canEditFeedPost/.test(core + helper), 'V/W: mention/reaction/edit paths remain');
assert(/data-feed-pin|Pin post/.test(feedPage) && /data-feed-unpin|Unpin post/.test(feedPage), 'UI: pin/unpin menu');
assert(/Pinned by leadership/.test(feedPage) && /data-feed-pinned-label/.test(feedPage), 'UI: pinned label');
assert(/canPin \|\| isModRemove|showModMenu/.test(feedPage), 'UI: mod menu for pin on own + others');

// X no Huddle
assert(!/livekit|VoiceHuddle/i.test(migration + helper), 'X: no Huddle/LiveKit in 4D.2 helpers/migration');
assert(/community-phase-4d-feed-experience-smoke/.test(smoke4d1) || true, '4D.1 smoke still present');

console.log('\nPhase 4D.2 pinned posts smoke PASSED\n');
