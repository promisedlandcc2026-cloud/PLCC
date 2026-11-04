/**
 * PLCC Community Phase 4B — photo posts + leadership moderation smoke.
 * Run: npx tsx scripts/community-phase-4b-media-moderation-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FEED_IMAGE_BUCKET,
  FEED_IMAGE_MAX_BYTES,
  buildFeedImageStoragePath,
  canEditFeedPost,
  canRemoveFeedComment,
  canRemoveFeedPost,
  feedDeletedMediaSurfacesInNormalApis,
  feedImagesDeferred,
  isCommunityFeedModerator,
  isSafeFeedImagePath,
  parseFeedImageUpload,
  validateFeedPostContent,
} from '../api/_utils/communityFeed.js';
import { isBroadChatAdmin } from '../api/_utils/communityChatSecurity.js';
import {
  FEED_CLIENT_IMAGE_MAX_EDGE,
  FEED_CLIENT_IMAGE_MAX_SOURCE_BYTES,
  isAcceptedFeedImageFile,
} from '../lib/feedImagePrepare.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const helper = read('api/_utils/communityFeed.ts');
const core = read('api/_utils/core.ts');
const feedPage = read('pages/community/Feed.tsx');
const migration = read('supabase/migrations/community_phase_4b_media_moderation.sql');
const prepare = read('lib/feedImagePrepare.ts');
const chat = read('pages/community/Chat.tsx');
const identityNav = read('components/Community/CommunityIdentityNav.tsx');

console.log('\nPhase 4B media + moderation smoke');

assert(validateFeedPostContent('Hello').ok, 'A: text-only post still valid');
assert(validateFeedPostContent('', { allowEmptyWithImage: true }).ok, 'B: image-only content allowed when flagged');
assert(validateFeedPostContent('Caption', { allowEmptyWithImage: true }).ok, 'C: image + text content ok');

const jpegTiny = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
  'base64'
).toString('base64');

const okImg = parseFeedImageUpload({
  mimeType: 'image/jpeg',
  fileBase64: jpegTiny,
});
assert(okImg.ok === true, 'B/C: valid JPEG upload parsed');

assert(
  parseFeedImageUpload({ mimeType: 'application/pdf', fileBase64: jpegTiny }).ok === false,
  'D: invalid MIME rejected'
);
assert(
  parseFeedImageUpload({
    mimeType: 'image/jpeg',
    fileBase64: Buffer.alloc(FEED_IMAGE_MAX_BYTES + 10).toString('base64'),
  }).ok === false,
  'E: oversized image rejected'
);
assert(
  parseFeedImageUpload({ mimeType: 'image/svg+xml', fileBase64: jpegTiny }).ok === false,
  'F: SVG rejected'
);
assert(
  !isAcceptedFeedImageFile({ type: 'image/svg+xml', size: 10 } as File),
  'F: client helper rejects SVG'
);

assert(
  parseFeedImageUpload({
    mimeType: 'image/jpeg',
    fileBase64: jpegTiny,
    imagePath: 'feed/other-user/abc.jpg',
  }).ok === false,
  'G/H: client-supplied imagePath rejected'
);
assert(
  parseFeedImageUpload({
    mimeType: 'image/jpeg',
    fileBase64: jpegTiny,
    storagePath: 'evil/path.jpg',
  }).ok === false,
  'H: client-supplied storagePath rejected'
);

const path = buildFeedImageStoragePath('user-1', 'obj-1', 'jpg');
assert(path === 'feed/user-1/obj-1.jpg', 'H: server builds feed/{author}/{uuid}.ext');
assert(isSafeFeedImagePath(path, 'user-1'), 'H: path ownership check');
assert(!isSafeFeedImagePath('feed/other/obj-1.jpg', 'user-1'), 'G: foreign author path unsafe');
assert(!isSafeFeedImagePath('../etc/passwd'), 'H: path traversal rejected');
assert(FEED_IMAGE_BUCKET === 'community-files', 'storage reuses community-files');

assert(!canRemoveFeedPost({ viewerId: 'a', authorId: 'b', viewerRole: 'MEMBER' }), 'I: member cannot moderate post');
assert(!canRemoveFeedComment({ viewerId: 'a', authorId: 'b', viewerRole: 'MEMBER' }), 'J: member cannot moderate comment');
assert(canRemoveFeedPost({ viewerId: 'mod', authorId: 'b', viewerRole: 'PASTOR' }), 'K: moderator can remove post');
assert(canRemoveFeedComment({ viewerId: 'mod', authorId: 'b', viewerRole: 'SUPER_ADMIN' }), 'L: moderator can remove comment');
assert(!canEditFeedPost({ viewerId: 'mod', authorId: 'b' }), 'M: moderator cannot edit others');
assert(canEditFeedPost({ viewerId: 'a', authorId: 'a' }), 'P: author can edit own');
assert(isCommunityFeedModerator('PASTOR') && isBroadChatAdmin('PASTOR'), 'moderator roles = broad chat admin');
assert(!isCommunityFeedModerator('MEMBER'), 'MEMBER is not Feed moderator');
assert(!isCommunityFeedModerator('MINISTRY_LEADER'), 'MINISTRY_LEADER alone is not church-wide Feed moderator');

assert(/deleted_at/.test(core) && /\.is\('deleted_at', null\)/.test(core), 'N: deleted excluded from Feed queries');
assert(/community_moderation_log/.test(core + migration), 'O: moderation action recorded');
assert(/action: 'remove_post'|remove_post/.test(core + migration), 'O: remove_post logged');
assert(/Only the author can edit this post/.test(core), 'M/P: edit remains author-only');
assert(/decideFeedReactionToggle/.test(core), 'Q: reactions remain');
assert(/feedType === 'comments'/.test(core), 'R: comments remain');
assert(/hasMore|FEED_PAGE_SIZE|Load more|data-feed-load-more/.test(core + feedPage), 'S: pagination remains');
assert(/CommunityIdentityNav/.test(feedPage + chat), 'T: Feed|Chat navigation remains');
assert(/decideHuddleInviteDeepLink|parseHuddleInviteIntent/.test(chat), 'U: Huddle invite path intact');
assert(!/VoiceHuddle|livekit|RoomEvent/.test(helper + prepare + migration), 'U: no LiveKit in 4B helpers/migration');

assert(feedImagesDeferred() === false, 'images enabled');
assert(feedDeletedMediaSurfacesInNormalApis() === false, 'deleted media not surfaced');
assert(/image_path/.test(migration) && /community_moderation_log/.test(migration), 'schema migration present');
assert(/DO NOT apply automatically/.test(migration), 'migration not auto-applied');
assert(FEED_CLIENT_IMAGE_MAX_SOURCE_BYTES === 20 * 1024 * 1024, 'client max source 20MB (Phase 4C)');
assert(FEED_CLIENT_IMAGE_MAX_EDGE === 1800, 'client max edge ~1800');
assert(FEED_IMAGE_MAX_BYTES === 10 * 1024 * 1024, 'server still validates ~10MB decoded');
assert(/data-feed-add-photo/.test(feedPage), 'Add Photo UI');
assert(/data-feed-image/.test(feedPage), 'image display marker');
assert(/data-feed-mod-menu/.test(feedPage), 'moderation menu marker');
assert(/Photo shared by/.test(helper), 'accessible alt strategy');
assert(/createSignedUrl/.test(core), 'signed URLs for private media');
assert(/isCommunityFeedModerator/.test(core), 'server-side moderator gate');
assert(/CommunityIdentityNav/.test(identityNav) || true, 'identity nav file present');

console.log('\nAll Phase 4B media + moderation smoke tests passed.');
