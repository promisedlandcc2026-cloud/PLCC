/**
 * PLCC Community Phase 4A/4B — Community Feed helpers (pure + batched assembly).
 * Persistent church-family feed — not Live Huddle, not Prayer Wall, not Events calendar.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBroadChatAdmin } from './communityChatSecurity.js';
import { isCommunityNotifyEligibleUser } from './communityMembership.js';

export const FEED_PAGE_SIZE = 20;
export const FEED_POST_MAX_CHARS = 3000;
export const FEED_COMMENT_MAX_CHARS = 2000;
export const FEED_COMMENTS_PREVIEW = 5;
/** Show "Edited" when updated_at is at least this many ms after created_at. */
export const FEED_EDITED_DELTA_MS = 2000;

/** Phase 4B — private community-files paths under feed/{authorId}/{uuid}.ext */
export const FEED_IMAGE_BUCKET = 'community-files';
export const FEED_IMAGE_SIGNED_URL_TTL_SEC = 60 * 60;
export const FEED_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FEED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type FeedImageMime = (typeof FEED_IMAGE_MIMES)[number];

export const FEED_CATEGORIES = [
  'general',
  'prayer',
  'praise',
  'ministry_update',
  'event',
  'encouragement',
] as const;

export type FeedCategory = (typeof FEED_CATEGORIES)[number];

export const FEED_CATEGORY_LABELS: Record<FeedCategory, string> = {
  general: 'General',
  prayer: 'Prayer',
  praise: 'Praise',
  ministry_update: 'Ministry Update',
  event: 'Event',
  encouragement: 'Encouragement',
};

export const FEED_REACTIONS = ['love', 'pray', 'praise', 'like'] as const;
export type FeedReactionKey = (typeof FEED_REACTIONS)[number];

export const FEED_REACTION_EMOJI: Record<FeedReactionKey, string> = {
  love: '❤️',
  pray: '🙏',
  praise: '🙌',
  like: '👍',
};

export type FeedReactionTargetType = 'post' | 'comment';

/**
 * Reaction model (Phase 4A):
 * UNIQUE (target_type, target_id, user_id, reaction).
 * A member may apply multiple different reactions on one target.
 * Toggling the same reaction removes it (toggle-off).
 */

export function isFeedCategory(raw: unknown): raw is FeedCategory {
  return FEED_CATEGORIES.includes(String(raw || '').trim() as FeedCategory);
}

export function isFeedReactionKey(raw: unknown): raw is FeedReactionKey {
  return FEED_REACTIONS.includes(String(raw || '').trim() as FeedReactionKey);
}

export function parseFeedCategory(raw: unknown): FeedCategory | null {
  const v = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  return isFeedCategory(v) ? v : null;
}

/**
 * Phase 4D.1 — optional list filter query.
 * missing / "all" / empty → no filter (All).
 * invalid value → reject (caller returns 400).
 */
export function parseFeedListCategoryFilter(raw: unknown):
  | { ok: true; category: FeedCategory | null }
  | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === '' || String(raw).trim().toLowerCase() === 'all') {
    return { ok: true, category: null };
  }
  const parsed = parseFeedCategory(raw);
  if (!parsed) return { ok: false, error: 'Invalid category filter' };
  return { ok: true, category: parsed };
}

/** Filter chip labels (plural where product copy prefers it). */
export const FEED_FILTER_CHIP_LABELS: Record<FeedCategory | 'all', string> = {
  all: 'All',
  general: 'General',
  prayer: 'Prayer',
  praise: 'Praise',
  ministry_update: 'Ministry Updates',
  event: 'Events',
  encouragement: 'Encouragement',
};

export function validateFeedPostContent(
  raw: unknown,
  opts?: { allowEmptyWithImage?: boolean }
): { ok: true; content: string } | { ok: false; error: string } {
  const content = String(raw ?? '').trim();
  if (!content) {
    if (opts?.allowEmptyWithImage) return { ok: true, content: '' };
    return { ok: false, error: 'Post cannot be empty' };
  }
  if (content.length > FEED_POST_MAX_CHARS) {
    return { ok: false, error: `Post must be ${FEED_POST_MAX_CHARS} characters or fewer` };
  }
  return { ok: true, content };
}

export function validateFeedCommentContent(raw: unknown):
  | { ok: true; content: string }
  | { ok: false; error: string } {
  const content = String(raw ?? '').trim();
  if (!content) return { ok: false, error: 'Comment cannot be empty' };
  if (content.length > FEED_COMMENT_MAX_CHARS) {
    return { ok: false, error: `Comment must be ${FEED_COMMENT_MAX_CHARS} characters or fewer` };
  }
  return { ok: true, content };
}

export function isFeedImageMime(raw: unknown): raw is FeedImageMime {
  return FEED_IMAGE_MIMES.includes(String(raw || '').trim().toLowerCase() as FeedImageMime);
}

/**
 * Parse client image payload. Rejects SVG/GIF and arbitrary storage paths.
 * Server always generates storage object names — never trust client paths/filenames.
 */
export function parseFeedImageUpload(opts: {
  mimeType?: unknown;
  fileBase64?: unknown;
  /** Rejected if present — clients must not supply storage paths. */
  imagePath?: unknown;
  storagePath?: unknown;
}):
  | { ok: true; mime: FeedImageMime; buffer: Buffer; bytes: number; ext: string }
  | { ok: false; error: string } {
  if (opts.imagePath != null && String(opts.imagePath).trim()) {
    return { ok: false, error: 'Do not supply image storage paths' };
  }
  if (opts.storagePath != null && String(opts.storagePath).trim()) {
    return { ok: false, error: 'Do not supply image storage paths' };
  }
  const mimeRaw = String(opts.mimeType || '').trim().toLowerCase();
  if (mimeRaw === 'image/svg+xml' || mimeRaw.includes('svg')) {
    return { ok: false, error: 'Please choose a JPG, PNG, or WebP image.' };
  }
  if (!isFeedImageMime(mimeRaw)) {
    return { ok: false, error: 'Please choose a JPG, PNG, or WebP image.' };
  }
  let raw = String(opts.fileBase64 || '').trim();
  if (!raw) return { ok: false, error: 'Image data is required' };
  const dataUrl = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrl) {
    const dataMime = String(dataUrl[1] || '').trim().toLowerCase();
    if (dataMime && dataMime !== mimeRaw) {
      return { ok: false, error: 'Please choose a JPG, PNG, or WebP image.' };
    }
    raw = dataUrl[2];
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    return { ok: false, error: 'Invalid image data' };
  }
  if (!buffer.length) return { ok: false, error: 'Invalid image data' };
  if (buffer.length > FEED_IMAGE_MAX_BYTES) {
    return { ok: false, error: 'That photo is too large.' };
  }
  const ext = mimeRaw === 'image/png' ? 'png' : mimeRaw === 'image/webp' ? 'webp' : 'jpg';
  return { ok: true, mime: mimeRaw, buffer, bytes: buffer.length, ext };
}

/** Author-owned object path under community-files. */
export function buildFeedImageStoragePath(authorId: string, objectId: string, ext: string): string {
  const safeAuthor = String(authorId || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeObj = String(objectId || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeExt = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
  return `feed/${safeAuthor}/${safeObj}.${safeExt}`;
}

export function isSafeFeedImagePath(path: unknown, authorId?: string): boolean {
  const p = String(path || '');
  if (!p || p.includes('..') || p.includes('\\') || p.startsWith('/')) return false;
  if (!/^feed\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(p)) return false;
  if (authorId) {
    const expected = `feed/${String(authorId).replace(/[^a-zA-Z0-9-]/g, '')}/`;
    if (!p.startsWith(expected)) return false;
  }
  return true;
}

export function feedImageAltText(authorName: string | null | undefined): string {
  const name = String(authorName || '').trim() || 'Member';
  return `Photo shared by ${name}`;
}

/**
 * Church-wide Community Feed moderators = broad chat admin leadership roles
 * (same set as isBroadChatAdmin — not ministry-scoped MINISTRY_LEADER alone).
 * Authority always comes from server-resolved users.role, never the browser.
 */
export function isCommunityFeedModerator(role: string | null | undefined): boolean {
  return isBroadChatAdmin(role);
}

/**
 * Phase 4D.2 — pin/unpin church-wide Feed posts.
 * Same leadership set as Feed moderators; author ownership alone is insufficient.
 */
export function canPinFeedPost(opts: { viewerRole?: string | null }): boolean {
  return isCommunityFeedModerator(opts.viewerRole);
}

/** Derived pin state from nullable pinned_at (authoritative DB field). */
export function isFeedPostPinned(pinnedAt: string | Date | null | undefined): boolean {
  if (pinnedAt == null || pinnedAt === '') return false;
  return true;
}

export function canRemoveFeedPost(opts: {
  viewerId: string;
  authorId: string;
  viewerRole?: string | null;
}): boolean {
  if (String(opts.viewerId) === String(opts.authorId)) return true;
  return isCommunityFeedModerator(opts.viewerRole);
}

export function canRemoveFeedComment(opts: {
  viewerId: string;
  authorId: string;
  viewerRole?: string | null;
}): boolean {
  return canRemoveFeedPost(opts);
}

/** Moderators remove; they never edit another member's words. */
export function canEditFeedPost(opts: { viewerId: string; authorId: string }): boolean {
  return String(opts.viewerId) === String(opts.authorId);
}

export function isFeedEdited(createdAt: string | Date, updatedAt: string | Date): boolean {
  const c = new Date(createdAt).getTime();
  const u = new Date(updatedAt).getTime();
  if (!Number.isFinite(c) || !Number.isFinite(u)) return false;
  return u - c >= FEED_EDITED_DELTA_MS;
}

export function feedPostsDoNotMutatePrayerModule(): boolean {
  return true;
}

export function feedPostsDoNotMutateEventModule(): boolean {
  return true;
}

export function feedUsesPlainTextRendering(): boolean {
  return true;
}

export function feedImagesDeferred(): boolean {
  return false;
}

/**
 * Soft-deleted posts keep storage objects for audit/recovery.
 * Normal Feed APIs must not return signed URLs for deleted posts.
 */
export function feedDeletedMediaSurfacesInNormalApis(): boolean {
  return false;
}

/** Phase 4C enables mentions — kept as helpers for smoke contracts. */
export function feedMentionsDeferred(): boolean {
  return false;
}

export function feedNotificationsDeferred(): boolean {
  return false;
}

/** Reuse Community notify/picker eligibility — no second definition. */
export function isCommunityFeedEligibleUser(u: {
  role?: string | null;
  email?: string | null;
}): boolean {
  return isCommunityNotifyEligibleUser(u);
}

export function clampFeedPageSize(raw: unknown, fallback = FEED_PAGE_SIZE): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(50, Math.floor(n));
}

export function clampFeedOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export type FeedReactionSummary = {
  key: FeedReactionKey;
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export function aggregateFeedReactions(
  rows: { reaction: string; user_id: string }[],
  viewerId: string | null | undefined
): FeedReactionSummary[] {
  const counts = new Map<FeedReactionKey, { count: number; mine: boolean }>();
  for (const key of FEED_REACTIONS) {
    counts.set(key, { count: 0, mine: false });
  }
  const viewer = String(viewerId || '').trim();
  for (const row of rows || []) {
    if (!isFeedReactionKey(row.reaction)) continue;
    const cur = counts.get(row.reaction)!;
    cur.count += 1;
    if (viewer && String(row.user_id) === viewer) cur.mine = true;
  }
  return FEED_REACTIONS.map((key) => {
    const cur = counts.get(key)!;
    return {
      key,
      emoji: FEED_REACTION_EMOJI[key],
      count: cur.count,
      reactedByMe: cur.mine,
    };
  });
}

/**
 * Pure toggle decision for UNIQUE (target, user, reaction).
 * If a matching row exists → remove; else → insert.
 */
export function decideFeedReactionToggle(opts: {
  existingSameReaction: boolean;
}): 'insert' | 'delete' {
  return opts.existingSameReaction ? 'delete' : 'insert';
}

export function sortFeedPostsNewestFirst<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function sortFeedCommentsChronological<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function countByKey(rows: { key: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows || []) {
    const k = String(r.key || '');
    if (!k) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export type FeedAuthorMap = Record<
  string,
  { id: string; name: string; avatar_url: string | null }
>;

export async function loadFeedAuthors(
  supabase: SupabaseClient,
  authorIds: string[]
): Promise<FeedAuthorMap> {
  const unique = [...new Set(authorIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const map: FeedAuthorMap = {};
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, avatar_url')
    .in('id', unique);
  if (error) {
    console.error('[CommunityFeed] load authors failed:', error.message);
    return map;
  }
  for (const u of data || []) {
    const id = String((u as any).id || '');
    if (!id) continue;
    const name =
      String((u as any).name || '').trim() ||
      String((u as any).email || '').split('@')[0] ||
      'Member';
    map[id] = {
      id,
      name,
      avatar_url: (u as any).avatar_url || null,
    };
  }
  return map;
}

/** Batched reaction rows for many targets (avoids N+1). */
export async function loadFeedReactionsForTargets(
  supabase: SupabaseClient,
  targetType: FeedReactionTargetType,
  targetIds: string[]
): Promise<{ target_id: string; reaction: string; user_id: string }[]> {
  const unique = [...new Set(targetIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from('feed_reactions')
    .select('target_id, reaction, user_id')
    .eq('target_type', targetType)
    .in('target_id', unique);
  if (error) {
    console.error('[CommunityFeed] load reactions failed:', error.message);
    return [];
  }
  return (data || []) as any[];
}

/** Batched comment counts for posts (avoids N+1). */
export async function loadFeedCommentCounts(
  supabase: SupabaseClient,
  postIds: string[]
): Promise<Record<string, number>> {
  const unique = [...new Set(postIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const out: Record<string, number> = {};
  for (const id of unique) out[id] = 0;
  if (unique.length === 0) return out;
  const { data, error } = await supabase
    .from('feed_comments')
    .select('post_id')
    .in('post_id', unique)
    .is('deleted_at', null);
  if (error) {
    console.error('[CommunityFeed] load comment counts failed:', error.message);
    return out;
  }
  for (const row of data || []) {
    const pid = String((row as any).post_id || '');
    if (!pid) continue;
    out[pid] = (out[pid] || 0) + 1;
  }
  return out;
}

/** Hard upper bound for Feed card comment preview rows (posts × preview). */
export function maxFeedCommentPreviewRows(
  postCount: number,
  perPostLimit = FEED_COMMENTS_PREVIEW
): number {
  const n = Number(postCount);
  const posts = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const lim =
    Number.isFinite(perPostLimit) && perPostLimit > 0
      ? Math.floor(perPostLimit)
      : FEED_COMMENTS_PREVIEW;
  return posts * lim;
}

export type FeedCommentPreviewRow = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

/**
 * Pure partition: newest `perPostLimit` comments per post, then chronological
 * display order within each preview. Total comment counts stay separate.
 */
export function selectNewestFeedCommentPreviewsPerPost<
  T extends { post_id: string; created_at: string; id?: string }
>(
  rows: T[],
  postIds: string[],
  perPostLimit = FEED_COMMENTS_PREVIEW
): Record<string, T[]> {
  const unique = [...new Set(postIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const allowed = new Set(unique);
  const grouped: Record<string, T[]> = {};
  for (const id of unique) grouped[id] = [];

  for (const row of rows || []) {
    const pid = String(row.post_id || '').trim();
    if (!pid || !allowed.has(pid)) continue;
    grouped[pid].push(row);
  }

  const out: Record<string, T[]> = {};
  for (const id of unique) {
    const newestFirst = [...grouped[id]].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    out[id] = sortFeedCommentsChronological(newestFirst.slice(0, perPostLimit));
  }
  return out;
}

/**
 * Bounded batched preview load (avoids N+1 and unbounded history).
 *
 * Strategy: one embed query on feed_posts for the page's post IDs with
 * foreignTable order=created_at DESC + limit=FEED_COMMENTS_PREVIEW per post.
 * Soft-deleted comments excluded. Max rows ≈ postCount × 5 (100 for a full page).
 * Display order: selected newest 5, rendered chronological via partition helper.
 */
export async function loadFeedCommentPreviews(
  supabase: SupabaseClient,
  postIds: string[],
  perPostLimit = FEED_COMMENTS_PREVIEW
): Promise<Record<string, FeedCommentPreviewRow[]>> {
  const unique = [...new Set(postIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const empty: Record<string, FeedCommentPreviewRow[]> = {};
  for (const id of unique) empty[id] = [];
  if (unique.length === 0) return empty;

  const { data, error } = await supabase
    .from('feed_posts')
    .select(
      `
      id,
      feed_comments (
        id,
        post_id,
        author_id,
        content,
        created_at,
        updated_at
      )
    `
    )
    .in('id', unique)
    .is('feed_comments.deleted_at', null)
    .order('created_at', { ascending: false, foreignTable: 'feed_comments' })
    .limit(perPostLimit, { foreignTable: 'feed_comments' });

  if (error) {
    console.error('[CommunityFeed] load comment previews failed:', error.message);
    return empty;
  }

  const flat: FeedCommentPreviewRow[] = [];
  for (const post of data || []) {
    const pid = String((post as any).id || '');
    const comments = Array.isArray((post as any).feed_comments)
      ? (post as any).feed_comments
      : [];
    for (const c of comments) {
      flat.push({
        id: String(c.id),
        post_id: String(c.post_id || pid),
        author_id: String(c.author_id || ''),
        content: String(c.content || ''),
        created_at: String(c.created_at || ''),
        updated_at: String(c.updated_at || ''),
      });
    }
  }

  return selectNewestFeedCommentPreviewsPerPost(flat, unique, perPostLimit);
}

export function assembleFeedPostCard(opts: {
  post: any;
  author: { id: string; name: string; avatar_url: string | null } | null;
  reactions: { reaction: string; user_id: string }[];
  commentCount: number;
  viewerId: string | null;
  viewerRole?: string | null;
  commentsPreview?: any[];
  imageUrl?: string | null;
}) {
  const p = opts.post;
  const author =
    opts.author || {
      id: p.author_id,
      name: 'Member',
      avatar_url: null,
    };
  const hasImage = Boolean(p.image_path && opts.imageUrl);
  const viewerId = opts.viewerId ? String(opts.viewerId) : '';
  const pinned = isFeedPostPinned(p.pinned_at);
  const canPin = canPinFeedPost({ viewerRole: opts.viewerRole });
  return {
    id: p.id,
    category: p.category,
    categoryLabel: FEED_CATEGORY_LABELS[p.category as FeedCategory] || p.category,
    content: p.content,
    created_at: p.created_at,
    updated_at: p.updated_at,
    edited: isFeedEdited(p.created_at, p.updated_at),
    author,
    reactions: aggregateFeedReactions(opts.reactions, opts.viewerId),
    commentCount: opts.commentCount,
    commentsPreview: opts.commentsPreview || [],
    imageUrl: hasImage ? opts.imageUrl : null,
    imageAlt: hasImage ? feedImageAltText(author.name) : null,
    pinned,
    pinned_at: pinned ? p.pinned_at || null : null,
    pinned_by: pinned ? p.pinned_by || null : null,
    canEdit: Boolean(viewerId && canEditFeedPost({ viewerId, authorId: p.author_id })),
    canRemove: Boolean(
      viewerId &&
        canRemoveFeedPost({
          viewerId,
          authorId: p.author_id,
          viewerRole: opts.viewerRole,
        })
    ),
    canPin,
    /** Explicit: Prayer category is Feed-only, not Prayer Wall. */
    isPrayerWallRecord: false,
    /** Explicit: Event category is Feed-only, not calendar Event. */
    isEventCalendarRecord: false,
  };
}

/**
 * Pure ordering helper for tests / docs (matches list API):
 * pinned_at DESC NULLS LAST, then created_at DESC.
 */
export function sortFeedPostsPinnedFirst<T extends { pinned_at?: string | null; created_at: string; id?: string }>(
  posts: T[]
): T[] {
  return [...posts].sort((a, b) => {
    const aPinned = isFeedPostPinned(a.pinned_at);
    const bPinned = isFeedPostPinned(b.pinned_at);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    if (aPinned && bPinned) {
      const pa = new Date(String(a.pinned_at)).getTime();
      const pb = new Date(String(b.pinned_at)).getTime();
      if (pb !== pa) return pb - pa;
    }
    const ca = new Date(a.created_at).getTime();
    const cb = new Date(b.created_at).getTime();
    if (cb !== ca) return cb - ca;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

export function feedQueryStrategyDoc(): string {
  return [
    '1) page feed_posts (pinned_at DESC NULLS LAST, then created_at DESC; deleted_at IS NULL)',
    '2) batch authors by author_id IN (...)',
    '3) batch feed_reactions for post ids',
    '4) batch comment counts for post ids (total visible, independent of preview)',
    '5) one bounded embed preview: feed_comments per post order created_at DESC limit FEED_COMMENTS_PREVIEW (max posts×5; no one-query-per-post)',
  ].join(' | ');
}
