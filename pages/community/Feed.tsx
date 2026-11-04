/**
 * PLCC Community Phase 4A/4B/4C/4D — Community Feed
 * Persistent church-family posts. Not Huddle, Prayer Wall, or Events calendar.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Heart,
  ImagePlus,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Share2,
  Trash2,
  Send,
  X,
} from 'lucide-react';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';
import CommunityIdentityNav from '../../components/Community/CommunityIdentityNav';
import FeedMentionComposer, {
  collectMentionedUserIds,
} from '../../components/Community/FeedMentionComposer';
import {
  buildFeedPostShareAbsoluteUrl,
  canUseNativeShare,
  formatFeedContentForDisplay,
  parseFeedDeepLinkQuery,
} from '../../api/_utils/communityFeedMentions.js';
import {
  FEED_CLIENT_ACCEPTED_TYPES,
  prepareFeedImageFile,
  type PreparedFeedImage,
} from '../../lib/feedImagePrepare';
import {
  FEED_CATEGORIES,
  FEED_CATEGORY_LABELS,
  FEED_FILTER_CHIP_LABELS,
  FEED_PAGE_SIZE,
  FEED_POST_MAX_CHARS,
  FEED_REACTIONS,
  FEED_REACTION_EMOJI,
  type FeedCategory,
  type FeedReactionKey,
} from '../../api/_utils/communityFeed.js';

type ListCategoryFilter = FeedCategory | 'all';
const LIST_FILTERS: ListCategoryFilter[] = ['all', ...FEED_CATEGORIES];
type FeedAuthor = { id: string; name: string; avatar_url: string | null };

type FeedReactionSummary = {
  key: FeedReactionKey;
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

type FeedComment = {
  id: string;
  content: string;
  contentDisplay?: string;
  created_at: string;
  updated_at: string;
  edited?: boolean;
  author: FeedAuthor;
  reactions: FeedReactionSummary[];
  canEdit?: boolean;
  canRemove?: boolean;
};

type FeedPost = {
  id: string;
  category: FeedCategory;
  categoryLabel: string;
  content: string;
  contentDisplay?: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
  author: FeedAuthor;
  reactions: FeedReactionSummary[];
  commentCount: number;
  commentsPreview: FeedComment[];
  imageUrl?: string | null;
  imageAlt?: string | null;
  pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: string | null;
  canEdit?: boolean;
  canRemove?: boolean;
  canPin?: boolean;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function AuthorAvatar({
  author,
  size = 'post',
}: {
  author: FeedAuthor;
  /** Posts ~40px; comments ~36px. */
  size?: 'post' | 'comment';
}) {
  const [failed, setFailed] = useState(false);
  const name = String(author?.name || '').trim() || 'Member';
  const initial = name.charAt(0).toUpperCase() || '?';
  const dim = size === 'comment' ? 'w-9 h-9' : 'w-10 h-10';
  const radius = size === 'comment' ? 'rounded-full' : 'rounded-xl';
  const src = author?.avatar_url && !failed ? author.avatar_url : null;

  if (src) {
    return (
      <img
        src={src}
        alt={`${name} profile photo`}
        width={size === 'comment' ? 36 : 40}
        height={size === 'comment' ? 36 : 40}
        onError={() => setFailed(true)}
        className={`${dim} ${radius} object-cover border border-burgundy/10 shrink-0 bg-burgundy/5`}
        data-feed-author-avatar={size}
      />
    );
  }

  return (
    <div
      className={`${dim} ${radius} bg-burgundy/10 text-burgundy font-black flex items-center justify-center border border-burgundy/10 shrink-0 text-[13px]`}
      role="img"
      aria-label={`${name} profile photo`}
      data-feed-author-avatar-fallback={size}
    >
      {initial}
    </div>
  );
}

const CommunityFeedPage: React.FC = () => {
  const { userId, isAuthenticated } = useNav();
  const location = useLocation();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [listCategory, setListCategory] = useState<ListCategoryFilter>('all');

  const [category, setCategory] = useState<FeedCategory>('general');
  const [composer, setComposer] = useState('');
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PreparedFeedImage | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement | null>(null);
  const lightboxTriggerRef = useRef<HTMLElement | null>(null);
  const scrolledCommentRef = useRef<string | null>(null);
  const [modMenuFor, setModMenuFor] = useState<string | null>(null);
  const [shareMenuFor, setShareMenuFor] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const [expandedComments, setExpandedComments] = useState<Record<string, FeedComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentBusy, setCommentBusy] = useState<Record<string, boolean>>({});
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [reactionBusy, setReactionBusy] = useState<string | null>(null);

  const loadFeed = useCallback(
    async (opts?: { append?: boolean; nextOffset?: number; category?: ListCategoryFilter }) => {
      const append = Boolean(opts?.append);
      const nextOffset = opts?.nextOffset ?? 0;
      const categoryFilter = opts?.category ?? listCategory;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const headers = await getAuthHeaders();
        let url = `/api/vault?resource=community&subResource=feed&subResource=posts&limit=${FEED_PAGE_SIZE}&offset=${nextOffset}`;
        if (categoryFilter && categoryFilter !== 'all') {
          url += `&category=${encodeURIComponent(categoryFilter)}`;
        }
        const res = await fetch(url, { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || 'Could not load Community Feed');
        }
        const page = (data.posts || []) as FeedPost[];
        setPosts((prev) => (append ? [...prev, ...page] : page));
        setHasMore(Boolean(data.hasMore));
        setOffset(nextOffset + page.length);
      } catch (e: any) {
        setError(e?.message || 'Could not load Community Feed');
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [listCategory]
  );

  const applyListCategory = useCallback(
    (next: ListCategoryFilter) => {
      if (next === listCategory && !parseFeedDeepLinkQuery(location.search).postId) return;
      setListCategory(next);
      setHighlightPostId(null);
      setHighlightCommentId(null);
      scrolledCommentRef.current = null;
      setOffset(0);
      setHasMore(false);
      if (parseFeedDeepLinkQuery(location.search).postId) {
        navigate('/community/feed', { replace: true });
      }
    },
    [listCategory, location.search, navigate]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      setError('Sign in to view the Community Feed.');
      return;
    }
    const { postId, commentId } = parseFeedDeepLinkQuery(location.search);
    if (postId) {
      void (async () => {
        setLoading(true);
        setDeepLinkError(null);
        setError(null);
        try {
          const headers = await getAuthHeaders();
          const res = await fetch(
            `/api/vault?resource=community&subResource=feed&subResource=posts&id=${encodeURIComponent(postId)}`,
            { headers }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.unavailable) {
            setDeepLinkError(
              data?.error || 'This Community item is no longer available.'
            );
            setPosts([]);
            setHasMore(false);
            return;
          }
          const list = Array.isArray(data.posts) ? (data.posts as FeedPost[]) : [];
          setPosts(list);
          setHasMore(false);
          setOffset(0);
          setHighlightPostId(postId);
          setHighlightCommentId(commentId);
          scrolledCommentRef.current = null;
          if (commentId && list[0]) {
            setExpandedComments((prev) => ({ ...prev, [postId]: list[0].commentsPreview || [] }));
            void loadAllComments(postId);
          }
        } catch (e: any) {
          setDeepLinkError(e?.message || 'This Community item is no longer available.');
        } finally {
          setLoading(false);
        }
      })();
      return;
    }
    void loadFeed({ nextOffset: 0, category: listCategory });
  }, [isAuthenticated, loadFeed, location.search, listCategory]);

  useEffect(() => {
    if (!highlightCommentId) return;
    if (scrolledCommentRef.current === highlightCommentId) return;
    const el = document.getElementById(`feed-comment-${highlightCommentId}`);
    if (!el) return;
    scrolledCommentRef.current = highlightCommentId;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      el.scrollIntoView();
    }
  }, [highlightCommentId, expandedComments, posts]);

  useEffect(() => {
    if (!lightbox) return;
    const trigger = lightboxTriggerRef.current;
    const t = window.setTimeout(() => {
      lightboxCloseRef.current?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setLightbox(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      if (trigger && typeof trigger.focus === 'function') {
        try {
          trigger.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [lightbox]);

  useEffect(() => {
    if (!shareFeedback) return;
    const t = window.setTimeout(() => setShareFeedback(null), 2000);
    return () => window.clearTimeout(t);
  }, [shareFeedback]);

  const openLightbox = (url: string, alt: string, trigger: HTMLElement | null) => {
    lightboxTriggerRef.current = trigger;
    setLightbox({ url, alt });
  };

  const closeLightbox = () => setLightbox(null);

  const copyPostLink = async (postId: string) => {
    const url = buildFeedPostShareAbsoluteUrl(
      typeof window !== 'undefined' ? window.location.origin : '',
      postId
    );
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setShareFeedback('Link copied');
      setShareMenuFor(null);
    } catch {
      setShareFeedback('Could not copy link');
    }
  };

  const nativeSharePost = async (postId: string) => {
    const url = buildFeedPostShareAbsoluteUrl(
      typeof window !== 'undefined' ? window.location.origin : '',
      postId
    );
    if (!url || !canUseNativeShare()) return;
    try {
      await navigator.share({ title: 'PLCC Community', url, text: 'Community post' });
      setShareMenuFor(null);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      await copyPostLink(postId);
    }
  };
  const submitPost = async () => {
    if (posting || preparingImage) return;
    setComposerError(null);
    const text = composer.trim();
    if (!text && !pendingImage) {
      setComposerError('Write something or add a photo before posting.');
      return;
    }
    setPosting(true);
    try {
      const headers = await getAuthHeaders();
      const body: Record<string, unknown> = {
        category,
        content: text,
        mentionedUserIds: collectMentionedUserIds(text),
      };
      if (pendingImage) {
        body.image = {
          mimeType: pendingImage.mimeType,
          fileBase64: pendingImage.fileBase64,
        };
      }
      const res = await fetch('/api/vault?resource=community&subResource=feed&subResource=posts', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not create post');
      setComposer('');
      setCategory('general');
      setPendingImage(null);
      setPosts((prev) => [data.post as FeedPost, ...prev]);
    } catch (e: any) {
      setComposerError(e?.message || 'Could not create post');
    } finally {
      setPosting(false);
    }
  };

  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    setComposerError(null);
    setPreparingImage(true);
    try {
      const prepared = await prepareFeedImageFile(file);
      setPendingImage(prepared);
    } catch (e: any) {
      setComposerError(e?.message || 'Could not prepare photo');
      // Keep text draft — only clear pending image
      setPendingImage(null);
    } finally {
      setPreparingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveEditPost = async (postId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=feed&subResource=posts', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: postId,
          content: editDraft,
          mentionedUserIds: collectMentionedUserIds(editDraft),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not update post');
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                content: data.post.content,
                contentDisplay: data.post.contentDisplay,
                updated_at: data.post.updated_at,
                edited: true,
              }
            : p
        )
      );
      setEditingPostId(null);
      setEditDraft('');
    } catch (e: any) {
      setError(e?.message || 'Could not update post');
    }
  };

  const deletePost = async (postId: string, moderated: boolean) => {
    const msg = moderated
      ? 'Remove this post from Community?\n\nThis is a moderation action. The post will be hidden from the Feed.'
      : 'Remove this post?';
    if (!window.confirm(msg)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=community&subResource=feed&subResource=posts&id=${encodeURIComponent(postId)}`,
        {
          method: 'DELETE',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: postId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not delete post');
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setModMenuFor(null);
    } catch (e: any) {
      setError(e?.message || 'Could not delete post');
    }
  };

  /** After pin/unpin: reset pagination and reload active category (pinned-first order). */
  const reloadFeedAfterPinChange = async () => {
    setOffset(0);
    setHasMore(false);
    setHighlightPostId(null);
    setHighlightCommentId(null);
    scrolledCommentRef.current = null;
    setModMenuFor(null);
    if (parseFeedDeepLinkQuery(location.search).postId) {
      navigate('/community/feed', { replace: true });
    }
    await loadFeed({ nextOffset: 0, category: listCategory });
  };

  const pinOrUnpinPost = async (postId: string, action: 'pin' | 'unpin') => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=feed&subResource=posts', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Could not ${action} post`);
      await reloadFeedAfterPinChange();
    } catch (e: any) {
      setError(e?.message || `Could not ${action} post`);
      setModMenuFor(null);
    }
  };

  const deleteComment = async (postId: string, commentId: string, moderated: boolean) => {
    const msg = moderated
      ? 'Remove this comment from Community?\n\nThis is a moderation action.'
      : 'Remove this comment?';
    if (!window.confirm(msg)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=community&subResource=feed&subResource=comments&id=${encodeURIComponent(commentId)}`,
        {
          method: 'DELETE',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: commentId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not delete comment');
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                commentCount: Math.max(0, p.commentCount - 1),
                commentsPreview: (p.commentsPreview || []).filter((c) => c.id !== commentId),
              }
            : p
        )
      );
      setExpandedComments((prev) =>
        prev[postId]
          ? { ...prev, [postId]: prev[postId].filter((c) => c.id !== commentId) }
          : prev
      );
      setModMenuFor(null);
    } catch (e: any) {
      setError(e?.message || 'Could not delete comment');
    }
  };

  const toggleReaction = async (
    targetType: 'post' | 'comment',
    targetId: string,
    reaction: FeedReactionKey,
    postId?: string
  ) => {
    const busyKey = `${targetType}:${targetId}:${reaction}`;
    if (reactionBusy === busyKey) return;
    setReactionBusy(busyKey);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        '/api/vault?resource=community&subResource=feed&subResource=reactions',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetType, targetId, reaction }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not update reaction');
      const next = data.reactions as FeedReactionSummary[];
      if (targetType === 'post') {
        setPosts((prev) => prev.map((p) => (p.id === targetId ? { ...p, reactions: next } : p)));
      } else if (postId) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id !== postId
              ? p
              : {
                  ...p,
                  commentsPreview: (p.commentsPreview || []).map((c) =>
                    c.id === targetId ? { ...c, reactions: next } : c
                  ),
                }
          )
        );
        setExpandedComments((prev) => {
          if (!prev[postId]) return prev;
          return {
            ...prev,
            [postId]: prev[postId].map((c) => (c.id === targetId ? { ...c, reactions: next } : c)),
          };
        });
      }
    } catch (e: any) {
      setError(e?.message || 'Could not update reaction');
    } finally {
      setReactionBusy(null);
    }
  };

  const loadAllComments = async (postId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=community&subResource=feed&subResource=comments&postId=${encodeURIComponent(postId)}`,
        { headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not load comments');
      setExpandedComments((prev) => ({ ...prev, [postId]: data.comments || [] }));
    } catch (e: any) {
      setError(e?.message || 'Could not load comments');
    }
  };

  const submitComment = async (postId: string) => {
    if (commentBusy[postId]) return;
    const text = String(commentDrafts[postId] || '').trim();
    if (!text) return;
    setCommentBusy((prev) => ({ ...prev, [postId]: true }));
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        '/api/vault?resource=community&subResource=feed&subResource=comments',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postId,
            content: text,
            mentionedUserIds: collectMentionedUserIds(text),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not add comment');
      const comment = data.comment as FeedComment;
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                commentCount: p.commentCount + 1,
                commentsPreview: [...(p.commentsPreview || []), comment].slice(-5),
              }
            : p
        )
      );
      setExpandedComments((prev) =>
        prev[postId] ? { ...prev, [postId]: [...prev[postId], comment] } : prev
      );
    } catch (e: any) {
      setError(e?.message || 'Could not add comment');
    } finally {
      setCommentBusy((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const canPost = (composer.trim().length > 0 || Boolean(pendingImage)) && !posting && !preparingImage;

  return (
    <div
      className="h-full min-h-0 overflow-y-auto bg-[#FDFDFB]"
      data-community-feed="true"
    >
      <div className="max-w-2xl mx-auto px-3 sm:px-5 py-5 sm:py-8 space-y-5">
        <CommunityIdentityNav active="feed" variant="full" />

        {deepLinkError ? (
          <div
            className="rounded-2xl border border-burgundy/15 bg-white px-4 py-5 text-center space-y-3"
            role="status"
            data-feed-unavailable="true"
          >
            <p className="text-[14px] font-semibold text-burgundy">{deepLinkError}</p>
            <button
              type="button"
              className="h-10 px-4 rounded-xl bg-gold text-burgundy text-[11px] font-black uppercase tracking-widest"
              onClick={() => {
                setDeepLinkError(null);
                navigate('/community/feed', { replace: true });
                void loadFeed({ nextOffset: 0, category: listCategory });
              }}
            >
              Back to Feed
            </button>
          </div>
        ) : null}
        <section
          className="rounded-2xl border border-gold/20 bg-white p-4 sm:p-5 shadow-sm space-y-3"
          data-feed-composer="true"
          aria-label="Create a Community Feed post"
        >
          <p className="text-[11px] text-gray-400 font-medium leading-relaxed">
            Prayer-category posts stay on the Feed — they are not Prayer Wall requests. Event-category
            posts are updates only — they do not create calendar events.
          </p>
          <label htmlFor="feed-category" className="block text-[10px] font-black uppercase tracking-widest text-burgundy/70">
            Category
          </label>
          <select
            id="feed-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedCategory)}
            className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-semibold text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {FEED_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FEED_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>

          <label htmlFor="feed-composer" className="sr-only">
            What&apos;s on your heart?
          </label>
          <FeedMentionComposer
            ariaLabel="What's on your heart?"
            value={composer}
            onChange={(next) => setComposer(next.slice(0, FEED_POST_MAX_CHARS))}
            rows={4}
            placeholder="What's on your heart?"
            maxLength={FEED_POST_MAX_CHARS}
            disabled={posting || preparingImage}
            className="w-full rounded-xl border border-gray-200 bg-[#FDFDFB] px-3 py-3 text-[14px] text-burgundy placeholder:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold resize-y min-h-[6rem]"
            data-testid="feed-composer"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept={[...FEED_CLIENT_ACCEPTED_TYPES, '.jpg', '.jpeg', '.png', '.webp'].join(',')}
            className="sr-only"
            id="feed-photo-input"
            onChange={(e) => void onPickPhoto(e.target.files?.[0] || null)}
          />

          {preparingImage ? (
            <p className="text-[12px] font-semibold text-burgundy/70" aria-live="polite" data-feed-photo-preparing="true">
              Preparing photo… Optimizing for Community
            </p>
          ) : null}

          {pendingImage ? (
            <div className="relative rounded-xl overflow-hidden border border-burgundy/10 bg-burgundy/[0.03]">
              <img
                src={pendingImage.previewUrl}
                alt="Selected photo preview"
                className="w-full max-h-72 object-contain bg-black/5"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={preparingImage || posting}
                  className="h-9 px-3 rounded-lg bg-white/95 text-burgundy text-[10px] font-black uppercase tracking-widest border border-burgundy/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-40"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  disabled={preparingImage || posting}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/95 text-burgundy border border-burgundy/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-40"
                  aria-label="Remove photo"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={preparingImage || posting}
                className="h-11 px-3 rounded-xl border border-burgundy/15 text-burgundy font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2 hover:bg-gold-cream/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-40"
                data-feed-add-photo="true"
              >
                {preparingImage ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <ImagePlus size={14} aria-hidden />
                )}
                Add Photo
              </button>
              <span className="text-[11px] font-semibold text-gray-300">
                {composer.length}/{FEED_POST_MAX_CHARS}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void submitPost()}
              disabled={!canPost}
              className="h-11 px-5 rounded-xl bg-gold text-burgundy font-black text-[11px] uppercase tracking-widest disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy inline-flex items-center gap-2"
            >
              {posting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
              Post
            </button>
          </div>
          {composerError ? (
            <p className="text-[12px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2" role="alert">
              {composerError}
            </p>
          ) : null}
        </section>

        {error ? (
          <p
            className="text-[12px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2"
            role="alert"
            data-feed-error="true"
          >
            {error}
          </p>
        ) : null}

        {shareFeedback ? (
          <p
            className="text-[12px] font-semibold text-burgundy bg-gold-cream border border-gold/30 rounded-xl px-3 py-2"
            role="status"
            data-feed-share-feedback="true"
          >
            {shareFeedback}
          </p>
        ) : null}

        {!deepLinkError ? (
          <div
            className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
            role="toolbar"
            aria-label="Filter Feed by category"
            data-feed-category-filters="true"
          >
            {LIST_FILTERS.map((key) => {
              const selected = listCategory === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyListCategory(key)}
                  aria-pressed={selected}
                  data-feed-category-filter={key}
                  className={`shrink-0 h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    selected
                      ? 'bg-burgundy text-white border-burgundy'
                      : 'bg-white text-burgundy/80 border-burgundy/15 hover:border-gold/40'
                  }`}
                >
                  {FEED_FILTER_CHIP_LABELS[key]}
                </button>
              );
            })}
          </div>
        ) : null}

        {loading ? (
          <div
            className="flex items-center justify-center gap-2 py-16 text-gray-300 text-xs font-black uppercase tracking-widest"
            data-feed-loading="true"
          >
            <Loader2 className="animate-spin" size={16} aria-hidden /> Loading Feed
          </div>
        ) : posts.length === 0 ? (
          listCategory !== 'all' ? (
            <div
              className="rounded-2xl border border-dashed border-gold/30 bg-gold-cream/30 px-6 py-10 text-center space-y-3"
              data-feed-empty="true"
              data-feed-empty-filter="true"
            >
              <p className="font-black text-burgundy text-base">
                No posts in {FEED_FILTER_CHIP_LABELS[listCategory]} yet.
              </p>
              <button
                type="button"
                onClick={() => applyListCategory('all')}
                className="h-10 px-4 rounded-xl bg-gold text-burgundy text-[11px] font-black uppercase tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
                data-feed-empty-show-all="true"
              >
                Show All
              </button>
            </div>
          ) : (
            <div
              className="rounded-2xl border border-dashed border-gold/30 bg-gold-cream/30 px-6 py-12 text-center space-y-2"
              data-feed-empty="true"
            >
              <Heart className="mx-auto text-gold" size={28} aria-hidden />
              <p className="font-black text-burgundy text-lg">Community starts here.</p>
              <p className="text-[13px] text-gray-500 font-medium max-w-sm mx-auto leading-relaxed">
                Share an encouragement, praise report, prayer need, or update.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-4" data-feed-list="true">
            {posts.map((post) => {
              const isMine = Boolean(userId && post.author?.id === userId);
              const canEdit = post.canEdit ?? isMine;
              const canRemove = post.canRemove ?? isMine;
              const canPin = Boolean(post.canPin);
              const isPinned = Boolean(post.pinned || post.pinned_at);
              const isModRemove = canRemove && !canEdit;
              const showModMenu = canPin || isModRemove;
              const comments = expandedComments[post.id] || post.commentsPreview || [];
              return (
                <article
                  key={post.id}
                  id={`feed-post-${post.id}`}
                  className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm space-y-3 ${
                    highlightPostId === post.id
                      ? 'border-gold ring-2 ring-gold/40'
                      : 'border-burgundy/10'
                  }`}
                  data-feed-card="true"
                  data-feed-pinned={isPinned ? 'true' : undefined}
                  data-feed-highlight={highlightPostId === post.id ? 'true' : undefined}
                >
                  <div className="flex items-start gap-3">
                    <AuthorAvatar author={post.author} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-burgundy text-[14px] truncate">
                          {post.author?.name || 'Member'}
                        </p>
                        <span className="inline-flex items-center rounded-lg bg-gold-cream text-burgundy border border-gold/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
                          {post.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-semibold">
                        {formatWhen(post.created_at)}
                        {post.edited ? ' · Edited' : ''}
                      </p>
                      {isPinned ? (
                        <p
                          className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-burgundy/70"
                          data-feed-pinned-label="true"
                        >
                          <Pin size={12} aria-hidden className="shrink-0 text-gold" />
                          <span>Pinned by leadership</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="relative flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setShareMenuFor((cur) => (cur === post.id ? null : post.id))
                        }
                        className="p-2 rounded-lg text-gray-300 hover:text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        aria-label="Share post"
                        aria-haspopup="menu"
                        aria-expanded={shareMenuFor === post.id}
                        data-feed-share="true"
                      >
                        <Share2 size={14} aria-hidden />
                      </button>
                      {shareMenuFor === post.id ? (
                        <div
                          role="menu"
                          className="absolute right-0 top-full mt-1 z-20 min-w-[10.5rem] rounded-xl border border-burgundy/10 bg-white shadow-lg py-1"
                          data-feed-share-menu="true"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="w-full text-left px-3 py-2 text-[12px] font-semibold text-burgundy hover:bg-gold-cream/50 inline-flex items-center gap-2"
                            onClick={() => void copyPostLink(post.id)}
                            data-feed-share-copy="true"
                          >
                            <Link2 size={12} aria-hidden />
                            Copy link
                          </button>
                          {canUseNativeShare() ? (
                            <button
                              type="button"
                              role="menuitem"
                              className="w-full text-left px-3 py-2 text-[12px] font-semibold text-burgundy hover:bg-gold-cream/50 inline-flex items-center gap-2"
                              onClick={() => void nativeSharePost(post.id)}
                              data-feed-share-native="true"
                            >
                              <Share2 size={12} aria-hidden />
                              Share…
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPostId(post.id);
                            setEditDraft(post.content);
                          }}
                          className="p-2 rounded-lg text-gray-300 hover:text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                          aria-label="Edit post"
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                      ) : null}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void deletePost(post.id, false)}
                          className="p-2 rounded-lg text-gray-300 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                          aria-label="Delete post"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      ) : null}
                      {showModMenu ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setModMenuFor((cur) => (cur === `post:${post.id}` ? null : `post:${post.id}`))
                            }
                            className="p-2 rounded-lg text-gray-300 hover:text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                            aria-label="Moderation options"
                            aria-haspopup="menu"
                            aria-expanded={modMenuFor === `post:${post.id}`}
                            data-feed-mod-menu="post"
                          >
                            <MoreHorizontal size={16} aria-hidden />
                          </button>
                          {modMenuFor === `post:${post.id}` ? (
                            <div
                              role="menu"
                              className="absolute right-0 top-full mt-1 z-20 min-w-[11rem] rounded-xl border border-burgundy/10 bg-white shadow-lg py-1"
                            >
                              {canPin && !isPinned ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full text-left px-3 py-2 text-[12px] font-semibold text-burgundy hover:bg-gold-cream/50"
                                  onClick={() => void pinOrUnpinPost(post.id, 'pin')}
                                  data-feed-pin="true"
                                >
                                  Pin post
                                </button>
                              ) : null}
                              {canPin && isPinned ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full text-left px-3 py-2 text-[12px] font-semibold text-burgundy hover:bg-gold-cream/50"
                                  onClick={() => void pinOrUnpinPost(post.id, 'unpin')}
                                  data-feed-unpin="true"
                                >
                                  Unpin post
                                </button>
                              ) : null}
                              {isModRemove ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full text-left px-3 py-2 text-[12px] font-semibold text-red-700 hover:bg-red-50"
                                  onClick={() => void deletePost(post.id, true)}
                                >
                                  Remove post
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {editingPostId === post.id ? (
                    <div className="space-y-2">
                      <FeedMentionComposer
                        value={editDraft}
                        onChange={(next) => setEditDraft(next.slice(0, FEED_POST_MAX_CHARS))}
                        rows={4}
                        maxLength={FEED_POST_MAX_CHARS}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        ariaLabel="Edit post text"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEditPost(post.id)}
                          className="h-9 px-3 rounded-lg bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPostId(null);
                            setEditDraft('');
                          }}
                          className="h-9 px-3 rounded-lg border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {post.content ? (
                        <p className="text-[15px] text-burgundy/90 leading-relaxed whitespace-pre-wrap break-words">
                          {post.contentDisplay || formatFeedContentForDisplay(post.content)}
                        </p>
                      ) : null}
                      {post.imageUrl ? (
                        <button
                          type="button"
                          onClick={(e) =>
                            openLightbox(
                              post.imageUrl!,
                              post.imageAlt || `Photo shared by ${post.author?.name || 'Member'}`,
                              e.currentTarget
                            )
                          }
                          className="block w-full rounded-xl overflow-hidden border border-burgundy/10 bg-black/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                          aria-label="View larger photo"
                          data-feed-image="true"
                        >
                          <img
                            src={post.imageUrl}
                            alt={post.imageAlt || `Photo shared by ${post.author?.name || 'Member'}`}
                            className="w-full max-h-[28rem] object-contain"
                            loading="lazy"
                          />
                        </button>
                      ) : null}
                    </>
                  )}

                  <div className="flex flex-wrap gap-2" role="group" aria-label="Post reactions">
                    {FEED_REACTIONS.map((key) => {
                      const summary =
                        post.reactions?.find((r) => r.key === key) || {
                          key,
                          emoji: FEED_REACTION_EMOJI[key],
                          count: 0,
                          reactedByMe: false,
                        };
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => void toggleReaction('post', post.id, key)}
                          className={`inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border text-[12px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                            summary.reactedByMe
                              ? 'bg-gold-cream border-gold/40 text-burgundy'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gold/30'
                          }`}
                          aria-label={`${FEED_REACTION_EMOJI[key]} ${key}${summary.reactedByMe ? ', selected' : ''}`}
                          aria-pressed={summary.reactedByMe}
                        >
                          <span aria-hidden>{summary.emoji}</span>
                          <span>{summary.count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-gray-50 pt-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-300 inline-flex items-center gap-1.5">
                        <MessageSquare size={12} aria-hidden />
                        {post.commentCount} comment{post.commentCount === 1 ? '' : 's'}
                      </p>
                      {post.commentCount > (post.commentsPreview?.length || 0) && !expandedComments[post.id] ? (
                        <button
                          type="button"
                          onClick={() => void loadAllComments(post.id)}
                          className="text-[11px] font-bold text-burgundy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                        >
                          View comments
                        </button>
                      ) : null}
                    </div>

                    <ul className="space-y-3">
                      {comments.map((c) => {
                        const cMine = Boolean(userId && c.author?.id === userId);
                        const cCanEdit = c.canEdit ?? cMine;
                        const cCanRemove = c.canRemove ?? cMine;
                        const cModRemove = cCanRemove && !cCanEdit;
                        return (
                        <li
                          key={c.id}
                          id={`feed-comment-${c.id}`}
                          className="flex gap-2.5 items-start"
                          data-feed-comment="true"
                        >
                          <AuthorAvatar author={c.author || { id: '', name: 'Member', avatar_url: null }} size="comment" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[12px] font-black text-burgundy leading-snug">
                                {c.author?.name || 'Member'}
                                <span className="font-semibold text-gray-300"> · {formatWhen(c.created_at)}</span>
                                {c.edited ? <span className="font-semibold text-gray-300"> · Edited</span> : null}
                              </p>
                              {cModRemove ? (
                                <div className="relative shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setModMenuFor((cur) =>
                                        cur === `comment:${c.id}` ? null : `comment:${c.id}`
                                      )
                                    }
                                    className="p-1 rounded-md text-gray-300 hover:text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                                    aria-label="Comment moderation options"
                                    data-feed-mod-menu="comment"
                                  >
                                    <MoreHorizontal size={14} aria-hidden />
                                  </button>
                                  {modMenuFor === `comment:${c.id}` ? (
                                    <div
                                      role="menu"
                                      className="absolute right-0 top-full mt-1 z-20 min-w-[11rem] rounded-xl border border-burgundy/10 bg-white shadow-lg py-1"
                                    >
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="w-full text-left px-3 py-2 text-[12px] font-semibold text-red-700 hover:bg-red-50"
                                        onClick={() => void deleteComment(post.id, c.id, true)}
                                      >
                                        Remove comment
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <p
                              className={`text-[13px] text-burgundy/90 whitespace-pre-wrap break-words mt-0.5 ${
                                highlightCommentId === c.id ? 'bg-gold-cream/60 rounded-lg px-1.5 py-1' : ''
                              }`}
                              data-feed-comment-highlight={highlightCommentId === c.id ? 'true' : undefined}
                            >
                              {c.contentDisplay || formatFeedContentForDisplay(c.content)}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {FEED_REACTIONS.map((key) => {
                                const summary =
                                  c.reactions?.find((r) => r.key === key) || {
                                    key,
                                    emoji: FEED_REACTION_EMOJI[key],
                                    count: 0,
                                    reactedByMe: false,
                                  };
                                if (summary.count === 0 && !summary.reactedByMe) {
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() => void toggleReaction('comment', c.id, key, post.id)}
                                      className="text-[11px] px-1.5 py-0.5 rounded-md text-gray-300 hover:text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                                      aria-label={`React ${key}`}
                                    >
                                      {summary.emoji}
                                    </button>
                                  );
                                }
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => void toggleReaction('comment', c.id, key, post.id)}
                                    className={`text-[11px] px-1.5 py-0.5 rounded-md border ${
                                      summary.reactedByMe
                                        ? 'border-gold/40 bg-gold-cream text-burgundy'
                                        : 'border-gray-100 text-gray-400'
                                    }`}
                                    aria-pressed={summary.reactedByMe}
                                    aria-label={`${key} ${summary.count}`}
                                  >
                                    {summary.emoji} {summary.count}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </li>
                        );
                      })}
                    </ul>

                    <div className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0">
                        <label className="sr-only" htmlFor={`comment-${post.id}`}>
                          Add a comment
                        </label>
                        <FeedMentionComposer
                          value={commentDrafts[post.id] || ''}
                          onChange={(next) =>
                            setCommentDrafts((prev) => ({
                              ...prev,
                              [post.id]: next.slice(0, 2000),
                            }))
                          }
                          rows={2}
                          maxLength={2000}
                          placeholder="Add a comment…"
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold resize-none"
                          ariaLabel="Add a comment"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void submitComment(post.id)}
                        disabled={!String(commentDrafts[post.id] || '').trim() || commentBusy[post.id]}
                        className="h-10 px-3 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        aria-label="Post comment"
                      >
                        {commentBusy[post.id] ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                          'Reply'
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {hasMore ? (
              <button
                type="button"
                onClick={() =>
                  void loadFeed({ append: true, nextOffset: offset, category: listCategory })
                }
                disabled={loadingMore}
                className="w-full h-12 rounded-xl border border-gold/25 bg-white text-burgundy font-black text-[11px] uppercase tracking-widest disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                data-feed-load-more="true"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          data-feed-lightbox="true"
          onClick={closeLightbox}
        >
          <button
            ref={lightboxCloseRef}
            type="button"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/95 text-burgundy inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            aria-label="Close photo viewer"
            data-feed-lightbox-close="true"
            onClick={closeLightbox}
          >
            <X size={18} aria-hidden />
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.alt}
            className="max-w-full max-h-[90vh] object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
};

export default CommunityFeedPage;
