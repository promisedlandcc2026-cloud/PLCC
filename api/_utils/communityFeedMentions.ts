/**
 * PLCC Community Phase 4C — Feed @mention tokens + sync helpers.
 * Structured token: @[Display Name](mention:uuid)
 * Do not trust client display names as authority — UUID + eligibility gate.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { filterCommunityNotifyEligibleUserIds, isCommunityNotifyEligibleUser } from './communityMembership.js';
import { isUniqueViolation, notifyUser, type NotifyType } from './notify.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Visible mention token stored in feed content. */
export const FEED_MENTION_TOKEN_RE =
  /@\[([^\]]{1,80})\]\(mention:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export const COMMUNITY_FEED_NOTIFY_TYPES = [
  'community_feed_comment',
  'community_feed_mention_post',
  'community_feed_mention_comment',
] as const;

export type CommunityFeedNotifyType = (typeof COMMUNITY_FEED_NOTIFY_TYPES)[number];

export function isCommunityFeedNotifyType(raw: unknown): raw is CommunityFeedNotifyType {
  return COMMUNITY_FEED_NOTIFY_TYPES.includes(String(raw || '') as CommunityFeedNotifyType);
}

/** Cap badge display at 99+. */
export function formatCommunityUnreadBadge(count: number): string {
  const n = Math.floor(Number(count) || 0);
  if (n <= 0) return '';
  if (n > 99) return '99+';
  return String(n);
}

export function buildFeedMentionToken(displayName: string, userId: string): string {
  const name = String(displayName || 'Member')
    .trim()
    .replace(/[\[\]]/g, '')
    .slice(0, 80) || 'Member';
  const id = String(userId || '').trim();
  if (!UUID_RE.test(id)) throw new Error('Invalid mention user id');
  return `@[${name}](mention:${id})`;
}

/** Safe picker subtitle — identity is always UUID; hint only disambiguates same display names. */
export function formatMentionCandidateHint(c: {
  role?: string | null;
  emailHint?: string | null;
}): string {
  const role = String(c.role || '').trim();
  const hint = String(c.emailHint || '').trim();
  if (role && hint) return `${role} · ${hint}`;
  if (role) return role;
  if (hint) return hint;
  return '';
}

export function emailLocalPartHint(email: string | null | undefined): string | null {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return null;
  const local = e.split('@')[0] || '';
  return local || null;
}

/**
 * UUID-only self-mention gate for notifications.
 * Same display name with different UUIDs must still notify.
 */
export function shouldNotifyFeedMentionRecipient(opts: {
  actorId: string;
  mentionedUserId: string;
}): boolean {
  const actor = String(opts.actorId || '').trim().toLowerCase();
  const mentioned = String(opts.mentionedUserId || '').trim().toLowerCase();
  if (!actor || !mentioned || !UUID_RE.test(actor) || !UUID_RE.test(mentioned)) return false;
  return actor !== mentioned;
}

/**
 * Phase 4D.1 — when the post author is a confirmed mentioned user on this comment,
 * skip generic community_feed_comment (mention notification wins).
 * Uses confirmed persisted mention ids only — never intended/parser-only sets.
 */
export function shouldSendFeedCommentNotification(opts: {
  postAuthorId: string;
  commenterId: string;
  postDeleted: boolean;
  /** Confirmed mention relation user ids after successful persist (e.g. nextIds). */
  confirmedMentionedUserIds?: string[] | null;
}): boolean {
  if (opts.postDeleted) return false;
  const author = String(opts.postAuthorId || '').trim().toLowerCase();
  const commenter = String(opts.commenterId || '').trim().toLowerCase();
  if (!author || !commenter) return false;
  if (author === commenter) return false;
  const confirmed = new Set(
    (opts.confirmedMentionedUserIds || [])
      .map((id) => String(id || '').trim().toLowerCase())
      .filter((id) => UUID_RE.test(id))
  );
  if (confirmed.has(author)) return false;
  return true;
}

export function extractFeedMentionIds(content: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(FEED_MENTION_TOKEN_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(content || ''))) !== null) {
    const id = String(m[2] || '').toLowerCase();
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Render stored tokens as natural @Name for display (never use raw filenames). */
export function formatFeedContentForDisplay(content: string): string {
  return String(content || '').replace(FEED_MENTION_TOKEN_RE, (_full, name: string) => {
    const n = String(name || '').trim() || 'Member';
    return `@${n}`;
  });
}

export function mentionDiff(oldIds: string[], newIds: string[]): { added: string[]; removed: string[]; unchanged: string[] } {
  const oldSet = new Set(oldIds.map((id) => id.toLowerCase()));
  const newSet = new Set(newIds.map((id) => id.toLowerCase()));
  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];
  for (const id of newSet) {
    if (oldSet.has(id)) unchanged.push(id);
    else added.push(id);
  }
  for (const id of oldSet) {
    if (!newSet.has(id)) removed.push(id);
  }
  return { added, removed, unchanged };
}

/**
 * Validate client-supplied mention IDs against structured tokens in content.
 * Client cannot notify arbitrary users without a matching token.
 */
export function resolveAuthorizedFeedMentionIds(opts: {
  content: string;
  claimedIds?: unknown;
}): { ok: true; ids: string[] } | { ok: false; error: string } {
  const fromContent = extractFeedMentionIds(opts.content);
  const contentSet = new Set(fromContent.map((id) => id.toLowerCase()));

  if (opts.claimedIds != null) {
    if (!Array.isArray(opts.claimedIds)) {
      return { ok: false, error: 'Invalid mentions' };
    }
    for (const raw of opts.claimedIds) {
      const id = String(raw || '').trim().toLowerCase();
      if (!id) continue;
      if (!UUID_RE.test(id)) return { ok: false, error: 'Invalid mention id' };
      if (!contentSet.has(id)) {
        return { ok: false, error: 'Mention must appear in post content' };
      }
    }
  }

  return { ok: true, ids: fromContent };
}

export function buildFeedPostDeepLink(postId: string, commentId?: string | null): string {
  const pid = String(postId || '').trim();
  if (!UUID_RE.test(pid)) return '/community/feed';
  const base = `/community/feed?post=${encodeURIComponent(pid)}`;
  const cid = String(commentId || '').trim();
  if (cid && UUID_RE.test(cid)) return `${base}&comment=${encodeURIComponent(cid)}`;
  return base;
}

/** Canonical share path — post only; never append tokens/secrets. */
export function buildFeedPostSharePath(postId: string): string {
  return buildFeedPostDeepLink(postId);
}

/**
 * Absolute external share URL for HashRouter.
 * Form: https://host/#/community/feed?post=<uuid>
 * Rejects non-http(s) origins; never embeds auth/session values.
 * In-app notification links stay relative via buildFeedPostDeepLink (unchanged).
 */
export function buildFeedPostShareAbsoluteUrl(origin: string, postId: string): string | null {
  const path = buildFeedPostSharePath(postId);
  if (path === '/community/feed') return null;
  const o = String(origin || '').trim().replace(/\/$/, '');
  if (!o || !/^https?:\/\//i.test(o)) return null;
  // Defense: share path must be post-only (no token/session query keys).
  try {
    const q = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
    const params = new URLSearchParams(q);
    if (params.has('access_token') || params.has('token') || params.has('code')) {
      return null;
    }
    if (![...params.keys()].every((k) => k === 'post')) return null;
  } catch {
    return null;
  }
  return `${o}/#${path}`;
}

export function canUseNativeShare(nav: { share?: unknown } | null | undefined = typeof navigator !== 'undefined' ? navigator : null): boolean {
  return typeof nav?.share === 'function';
}

export function parseFeedDeepLinkQuery(search: string | URLSearchParams): {
  postId: string | null;
  commentId: string | null;
} {
  const params = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const postId = String(params.get('post') || '').trim();
  const commentId = String(params.get('comment') || '').trim();
  return {
    postId: UUID_RE.test(postId) ? postId : null,
    commentId: UUID_RE.test(commentId) ? commentId : null,
  };
}

export async function filterEligibleFeedMentionIds(
  supabase: SupabaseClient,
  candidateIds: string[]
): Promise<string[]> {
  return filterCommunityNotifyEligibleUserIds(supabase, candidateIds);
}

/** Pure plan: insert newly-added first; only then delete removed. Never delete-all-then-insert. */
export function planFeedMentionMutation(
  previousIds: string[],
  nextIds: string[]
): { added: string[]; removed: string[]; unchanged: string[]; insertFirst: string[]; deleteAfter: string[] } {
  const diff = mentionDiff(previousIds, nextIds);
  return {
    ...diff,
    insertFirst: diff.added,
    deleteAfter: diff.removed,
  };
}

/**
 * Map API target → DB XOR relation columns.
 * POST mention: post_id set, comment_id null.
 * COMMENT mention: post_id null, comment_id set.
 * Parent postId for comment deep-links is NOT a relation column.
 */
export function feedMentionRelationTarget(opts: {
  target: 'post' | 'comment';
  postId?: string | null;
  commentId?: string | null;
}):
  | { ok: true; postId: string | null; commentId: string | null }
  | { ok: false; error: string } {
  if (opts.target === 'post') {
    const postId = String(opts.postId || '').trim();
    if (!UUID_RE.test(postId)) {
      return { ok: false, error: 'Mention target must be exactly one of post or comment' };
    }
    return { ok: true, postId, commentId: null };
  }
  if (opts.target === 'comment') {
    const commentId = String(opts.commentId || '').trim();
    if (!UUID_RE.test(commentId)) {
      return { ok: false, error: 'Mention target must be exactly one of post or comment' };
    }
    return { ok: true, postId: null, commentId };
  }
  return { ok: false, error: 'Mention target must be exactly one of post or comment' };
}

export type ReplaceFeedMentionsSuccess = {
  ok: true;
  previousIds: string[];
  nextIds: string[];
  /** DB-confirmed newly inserted mention user ids */
  added: string[];
  /** DB-confirmed removed mention user ids */
  removed: string[];
};

export type ReplaceFeedMentionsFailure = {
  ok: false;
  error: string;
  previousIds: string[];
  nextIds: string[];
  /** Inserts that were confirmed before a later failure (if any). */
  confirmedAdded: string[];
};

export type ReplaceFeedMentionsResult = ReplaceFeedMentionsSuccess | ReplaceFeedMentionsFailure;

/**
 * Fail-closed mention sync.
 * Order: load prior → insert newly-added → delete removed.
 * Never wipe all rows before replacement is persisted.
 * Does not notify — caller must notify only after ok:true (or confirmedAdded on partial).
 */
export async function replaceFeedMentions(opts: {
  supabase: SupabaseClient;
  createdBy: string;
  postId?: string | null;
  commentId?: string | null;
  mentionedUserIds: string[];
}): Promise<ReplaceFeedMentionsResult> {
  const { supabase, createdBy } = opts;
  const postId = opts.postId ? String(opts.postId) : null;
  const commentId = opts.commentId ? String(opts.commentId) : null;
  if ((postId ? 1 : 0) + (commentId ? 1 : 0) !== 1) {
    return {
      ok: false,
      error: 'Mention target must be exactly one of post or comment',
      previousIds: [],
      nextIds: [],
      confirmedAdded: [],
    };
  }

  let prevQuery = supabase.from('community_feed_mentions').select('mentioned_user_id');
  prevQuery = postId ? prevQuery.eq('post_id', postId) : prevQuery.eq('comment_id', commentId!);
  const { data: prevRows, error: prevErr } = await prevQuery;
  if (prevErr) {
    console.error('[CommunityFeed] mention load failed:', prevErr.message);
    return {
      ok: false,
      error: 'Could not load existing mentions',
      previousIds: [],
      nextIds: [],
      confirmedAdded: [],
    };
  }

  const previousIds = (prevRows || [])
    .map((r: any) => String(r.mentioned_user_id || '').toLowerCase())
    .filter((id) => UUID_RE.test(id));

  const eligible = await filterEligibleFeedMentionIds(supabase, opts.mentionedUserIds);
  const nextIds = [...new Set(eligible.map((id) => id.toLowerCase()))];
  const plan = planFeedMentionMutation(previousIds, nextIds);
  const confirmedAdded: string[] = [];

  // 1) Insert newly-added FIRST (batch = all-or-fail for this statement)
  if (plan.insertFirst.length > 0) {
    const rows = plan.insertFirst.map((mentioned_user_id) => ({
      post_id: postId,
      comment_id: commentId,
      mentioned_user_id,
      created_by: createdBy,
    }));
    const { error: insertErr } = await supabase.from('community_feed_mentions').insert(rows);
    if (insertErr) {
      console.error('[CommunityFeed] mention insert failed:', insertErr.message);
      return {
        ok: false,
        error: 'Could not save mentions',
        previousIds,
        nextIds,
        confirmedAdded: [],
      };
    }
    confirmedAdded.push(...plan.insertFirst);
  }

  // 2) Only after inserts succeed, remove rows no longer present
  if (plan.deleteAfter.length > 0) {
    let del = supabase
      .from('community_feed_mentions')
      .delete()
      .in('mentioned_user_id', plan.deleteAfter);
    del = postId ? del.eq('post_id', postId) : del.eq('comment_id', commentId!);
    const { error: delErr } = await del;
    if (delErr) {
      console.error('[CommunityFeed] mention delete failed:', delErr.message);
      return {
        ok: false,
        error: 'Could not update mentions',
        previousIds,
        nextIds,
        confirmedAdded,
      };
    }
  }

  return {
    ok: true,
    previousIds,
    nextIds,
    added: confirmedAdded,
    removed: plan.deleteAfter,
  };
}

export type NotifyFeedMentionsResult = {
  attempted: number;
  delivered: number;
  conflicts: number;
  failed: number;
  errors: string[];
};

async function notifyFeedMentionSafe(
  supabase: SupabaseClient,
  userId: string,
  payload: { type: NotifyType; title: string; body?: string; link: string; sourceId: string }
): Promise<'delivered' | 'conflict' | 'failed'> {
  if (!userId || !UUID_RE.test(userId)) return 'failed';
  try {
    const { error } = await supabase.from('user_notifications').insert([
      {
        user_id: userId,
        type: payload.type,
        title: payload.title,
        body: payload.body || null,
        link: payload.link,
        source_id: payload.sourceId,
      },
    ]);
    if (!error) return 'delivered';
    if (isUniqueViolation(error)) return 'conflict';
    console.error('[CommunityFeed] mention notify failed:', error.message);
    return 'failed';
  } catch (err: any) {
    console.error('[CommunityFeed] mention notify error:', err?.message || err);
    return 'failed';
  }
}

/**
 * Notify only after mention persistence is confirmed.
 * Unique (user_id, type, source_id) makes retries idempotent (conflict = already delivered).
 * Returns observable fan-out stats — does not throw; caller may surface failed > 0.
 */
export async function notifyNewFeedMentions(opts: {
  supabase: SupabaseClient;
  actorId: string;
  actorName: string;
  addedUserIds: string[];
  target: 'post' | 'comment';
  postId: string;
  commentId?: string | null;
}): Promise<NotifyFeedMentionsResult> {
  const link = buildFeedPostDeepLink(opts.postId, opts.commentId);
  const sourceId = opts.target === 'comment' && opts.commentId ? opts.commentId : opts.postId;
  const type: NotifyType =
    opts.target === 'comment' ? 'community_feed_mention_comment' : 'community_feed_mention_post';
  const titleVerb =
    opts.target === 'comment'
      ? `${opts.actorName} mentioned you in a Community comment.`
      : `${opts.actorName} mentioned you in a Community post.`;

  const result: NotifyFeedMentionsResult = {
    attempted: 0,
    delivered: 0,
    conflicts: 0,
    failed: 0,
    errors: [],
  };

  for (const uid of opts.addedUserIds) {
    if (!shouldNotifyFeedMentionRecipient({ actorId: opts.actorId, mentionedUserId: uid })) {
      continue; // no self-notify (UUID compare only)
    }
    result.attempted += 1;
    const status = await notifyFeedMentionSafe(opts.supabase, uid, {
      type,
      title: titleVerb,
      link,
      sourceId,
    });
    if (status === 'delivered') result.delivered += 1;
    else if (status === 'conflict') result.conflicts += 1;
    else {
      result.failed += 1;
      result.errors.push(`notify failed for ${uid}`);
    }
  }

  return result;
}

/**
 * Persist mentions then notify newly-added users.
 * Persistence failure → no notify (except confirmedAdded from a later delete failure).
 * Notification failure after persistence → mentions kept; stats returned for logging/response.
 */
export async function persistFeedMentionsThenNotify(opts: {
  supabase: SupabaseClient;
  createdBy: string;
  actorName: string;
  /** Parent post id — required for post relations AND comment deep-links. */
  postId?: string | null;
  /** Comment id — required for comment relations only (never stored with post_id). */
  commentId?: string | null;
  mentionedUserIds: string[];
  target: 'post' | 'comment';
}): Promise<
  | {
      ok: true;
      mentionSync: ReplaceFeedMentionsSuccess;
      notify: NotifyFeedMentionsResult;
      notifyFailed: boolean;
    }
  | {
      ok: false;
      error: string;
      mentionSync: ReplaceFeedMentionsFailure;
      /** Notifies for inserts that already succeeded before a later mutation failure. */
      notify: NotifyFeedMentionsResult | null;
    }
> {
  // DB XOR: comment mentions persist comment_id only (post_id null).
  // Parent opts.postId is still used for notification deep-links.
  const relation = feedMentionRelationTarget({
    target: opts.target,
    postId: opts.postId,
    commentId: opts.commentId,
  });
  if (relation.ok !== true) {
    const err = (relation as { error: string }).error;
    return {
      ok: false,
      error: err,
      mentionSync: {
        ok: false,
        error: err,
        previousIds: [],
        nextIds: [],
        confirmedAdded: [],
      },
      notify: null,
    };
  }

  const deepLinkPostId =
    opts.target === 'post'
      ? String(relation.postId || '')
      : String(opts.postId || '').trim();
  if (opts.target === 'comment' && !UUID_RE.test(deepLinkPostId)) {
    return {
      ok: false,
      error: 'Comment mention requires parent post id for notification link',
      mentionSync: {
        ok: false,
        error: 'Comment mention requires parent post id for notification link',
        previousIds: [],
        nextIds: [],
        confirmedAdded: [],
      },
      notify: null,
    };
  }

  const mentionSync = await replaceFeedMentions({
    supabase: opts.supabase,
    createdBy: opts.createdBy,
    postId: relation.postId,
    commentId: relation.commentId,
    mentionedUserIds: opts.mentionedUserIds,
  });

  // strict:false widens boolean discriminants — narrow via ok !== true + cast.
  if (mentionSync.ok !== true) {
    const fail = mentionSync as ReplaceFeedMentionsFailure;
    let notify: NotifyFeedMentionsResult | null = null;
    // Inserts succeeded but delete failed — those new mentions are persisted; notify them, then fail.
    if (fail.confirmedAdded.length > 0) {
      notify = await notifyNewFeedMentions({
        supabase: opts.supabase,
        actorId: opts.createdBy,
        actorName: opts.actorName,
        addedUserIds: fail.confirmedAdded,
        target: opts.target,
        postId: deepLinkPostId,
        commentId: opts.target === 'comment' ? relation.commentId : null,
      });
    }
    return { ok: false, error: fail.error, mentionSync: fail, notify };
  }

  const success = mentionSync as ReplaceFeedMentionsSuccess;
  const notify = await notifyNewFeedMentions({
    supabase: opts.supabase,
    actorId: opts.createdBy,
    actorName: opts.actorName,
    addedUserIds: success.added,
    target: opts.target,
    postId: deepLinkPostId,
    commentId: opts.target === 'comment' ? relation.commentId : null,
  });

  return {
    ok: true,
    mentionSync: success,
    notify,
    notifyFailed: notify.failed > 0,
  };
}

export async function notifyFeedPostComment(opts: {
  supabase: SupabaseClient;
  postAuthorId: string;
  commenterId: string;
  commenterName: string;
  postId: string;
  commentId: string;
  postDeleted: boolean;
  /** Confirmed persisted mention user ids for this comment (Phase 4D.1 suppress). */
  confirmedMentionedUserIds?: string[] | null;
}): Promise<void> {
  if (
    !shouldSendFeedCommentNotification({
      postAuthorId: opts.postAuthorId,
      commenterId: opts.commenterId,
      postDeleted: opts.postDeleted,
      confirmedMentionedUserIds: opts.confirmedMentionedUserIds,
    })
  ) {
    return;
  }

  const { data: author } = await opts.supabase
    .from('users')
    .select('id, role, email')
    .eq('id', opts.postAuthorId)
    .maybeSingle();
  if (!author || !isCommunityNotifyEligibleUser(author)) return;

  await notifyUser(opts.supabase, opts.postAuthorId, {
    type: 'community_feed_comment',
    title: `${opts.commenterName} commented on your Community post.`,
    link: buildFeedPostDeepLink(opts.postId, opts.commentId),
    sourceId: opts.commentId,
  });
}

/** Reaction notifications deferred in Phase 4C to avoid spam. */
export function feedReactionNotificationsDeferred(): boolean {
  return true;
}

export function feedMentionsEnabled(): boolean {
  return true;
}

export function feedNotificationsEnabled(): boolean {
  return true;
}
