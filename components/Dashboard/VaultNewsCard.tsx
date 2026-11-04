import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, Mail, Megaphone, MessageCircle, Share2, ShieldCheck, Smartphone, X } from 'lucide-react';
import { useNav } from '../../App';
import { fetchWithTimeout, getAuthHeaders } from '../../lib/api';
import { prepareFeedImageFile, VAULT_NEWS_IMAGE_MAX_EDGE } from '../../lib/feedImagePrepare';

type NewsKind = 'church' | 'database' | 'celebration' | 'sympathy' | 'live_huddle';

type NewsItem = {
  id: string;
  created_at?: string;
  title: string;
  body: string;
  kind: NewsKind;
  author_name?: string | null;
  author_role?: string | null;
  image_url?: string | null;
};

const POST_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'MINISTRY_LEADER']);
const HOME_NEWS_LIMIT = 3;
const OLDER_NEWS_PAGE = 10;

const NEWS_BANNER_CLASS = 'w-full h-40 sm:h-48 object-cover';

const KIND_LABEL: Record<NewsKind, string> = {
  church: 'Church',
  database: 'Database',
  celebration: 'Celebration',
  sympathy: 'Sympathy',
  live_huddle: 'Live Huddle',
};

function roleLabel(role: string | null | undefined): string {
  const r = String(role || '').toUpperCase();
  if (r === 'SUPER_ADMIN') return 'Super Admin';
  if (r === 'MINISTRY_LEADER') return 'Ministry Leader';
  if (r === 'PASTOR') return 'Pastor';
  return r
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function formatWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function newsShareText(item: NewsItem): string {
  const kind = KIND_LABEL[item.kind] || 'Church';
  const who = [item.author_name || 'Leader', item.author_role ? roleLabel(item.author_role) : '']
    .filter(Boolean)
    .join(' · ');
  const home =
    typeof window !== 'undefined' ? `${window.location.origin}/#/dashboard` : 'https://plcc-vault.vercel.app/#/dashboard';
  const photo = String(item.image_url || '').trim();
  return [
    `Vault News · ${kind}`,
    item.title,
    '',
    item.body,
    ...(photo.startsWith('https://') ? ['', photo] : []),
    '',
    `— ${who}`,
    'Promised Land Christian Center',
    home,
  ].join('\n');
}

function asNewsKind(value: string): NewsKind {
  return value in KIND_LABEL ? (value as NewsKind) : 'church';
}

function mergeNews(current: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const seen = new Set(current.map((item) => item.id));
  const next = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  return next;
}

function newsImageUrl(item: NewsItem): string {
  const url = String(item.image_url || '').trim();
  return url.startsWith('https://') ? url : '';
}

function emailShareHref(item: NewsItem): string {
  const subject = `Vault News: ${item.title}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(newsShareText(item))}`;
}

function whatsappShareHref(item: NewsItem): string {
  return `https://wa.me/?text=${encodeURIComponent(newsShareText(item))}`;
}

function messagesShareHref(item: NewsItem): string {
  return `sms:?&body=${encodeURIComponent(newsShareText(item))}`;
}

function savedHuddleChannels(): string[] {
  const now = Math.floor(Date.now() / 1000);
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith('awc_huddle_fallback_')) continue;
      const raw = localStorage.getItem(key) || '';
      const payload = raw.split('.')[0];
      if (!payload) continue;
      const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
      const json = JSON.parse(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/') + pad)
      ) as { channelId?: string; exp?: number };
      const channelId = String(json.channelId || '').trim();
      if (!channelId || !Number.isFinite(Number(json.exp)) || Number(json.exp) <= now) continue;
      ids.push(channelId);
    }
  } catch {
    return ids;
  }
  return [...new Set(ids)];
}

const VaultNewsCard: React.FC = () => {
  const navigate = useNavigate();
  const { userRole } = useNav();
  const canPost = POST_ROLES.has(String(userRole || '').toUpperCase());
  const [database, setDatabase] = useState<'checking' | 'healthy' | 'unavailable'>('checking');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [olderOpen, setOlderOpen] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [newsNote, setNewsNote] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<NewsKind>('church');
  const [imagePreview, setImagePreview] = useState('');
  const [imageData, setImageData] = useState('');
  const [clearPhoto, setClearPhoto] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formError, setFormError] = useState('');
  const [savedChannels, setSavedChannels] = useState<string[]>([]);
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState('');
  const [openPhoto, setOpenPhoto] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (!openPhoto) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPhoto(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPhoto]);

  const fetchNewsPage = useCallback(async (offset: number, limit: number) => {
    const headers = await getAuthHeaders().catch(() => ({}));
    const res = await fetchWithTimeout(
      `/api/vault?resource=vault-news&offset=${offset}&limit=${limit}`,
      { headers },
      12_000
    ).catch(() => null);
    if (!res) return null;
    return res.json().catch(() => null);
  }, []);

  const applyNewsPage = useCallback((data: { database?: string; needsSetup?: boolean; news?: NewsItem[]; hasMore?: boolean } | null, replace: boolean) => {
    if (!data) {
      setNewsNote('News is unavailable while the database is down.');
      return false;
    }
    if (data.database === 'unavailable') {
      setNewsNote('News is unavailable while the database is down.');
      if (replace) setNews([]);
      setHasMore(false);
      return false;
    }
    const rows = Array.isArray(data.news) ? data.news : [];
    setNeedsSetup(Boolean(data.needsSetup));
    setHasMore(Boolean(data.hasMore));
    setNews((prev) => (replace ? rows : mergeNews(prev, rows)));
    setNewsNote('');
    return true;
  }, []);

  const load = useCallback(async () => {
    setSavedChannels(savedHuddleChannels());
    setOlderOpen(false);
    const headers = await getAuthHeaders().catch(() => ({}));
    const [healthRes, newsData] = await Promise.all([
      fetchWithTimeout('/api/vault?resource=health', { headers }, 8_000).catch(() => null),
      fetchNewsPage(0, HOME_NEWS_LIMIT),
    ]);
    if (!healthRes) {
      setDatabase('unavailable');
    } else {
      const health = await healthRes.json().catch(() => null);
      setDatabase(health?.database === 'healthy' ? 'healthy' : 'unavailable');
    }
    applyNewsPage(newsData, true);
  }, [applyNewsPage, fetchNewsPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareViaMessengers = async (item: NewsItem) => {
    const text = newsShareText(item);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: item.title, text });
        setShareNote('');
        return;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote('Copied. Paste it into Messages or Messenger if the app did not open.');
    } catch {
      setShareNote('Open Messages and paste this news if the app did not open.');
    }
    window.location.href = messagesShareHref(item);
  };

  const openSavedHuddle = () => {
    const channels = savedHuddleChannels();
    setSavedChannels(channels);
    if (channels.length === 1) {
      navigate(`/community/chat?channel=${encodeURIComponent(channels[0])}&huddle=1`);
      return;
    }
    if (channels.length > 1) {
      navigate('/community/chat');
    }
  };

  const resetComposer = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setKind('church');
    setImagePreview('');
    setImageData('');
    setClearPhoto(false);
    setFormError('');
  };

  const loadOlder = async () => {
    if (loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const data = await fetchNewsPage(news.length, OLDER_NEWS_PAGE);
      if (applyNewsPage(data, false)) setOlderOpen(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  const startCorrect = (item: NewsItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setKind(asNewsKind(item.kind));
    setImagePreview(newsImageUrl(item));
    setImageData('');
    setClearPhoto(false);
    setFormError('');
    setConfirmRemoveId(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const removeNews = async (id: string) => {
    if (posting) return;
    setPosting(true);
    setFormError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetchWithTimeout(
        `/api/vault?resource=vault-news&id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        },
        12_000
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error || 'Could not take that news post down.');
        return;
      }
      setConfirmRemoveId(null);
      if (editingId === id) resetComposer();
      if (olderOpen) {
        setNews((prev) => prev.filter((item) => item.id !== id));
      } else {
        const latest = await fetchNewsPage(0, HOME_NEWS_LIMIT);
        applyNewsPage(latest, true);
      }
    } catch {
      setFormError('Could not take that news post down.');
    } finally {
      setPosting(false);
    }
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) {
      setImagePreview('');
      setImageData('');
      setClearPhoto(true);
      return;
    }
    try {
      const prepared = await prepareFeedImageFile(file, { maxEdge: VAULT_NEWS_IMAGE_MAX_EDGE });
      setImagePreview(prepared.previewUrl);
      setImageData(`data:${prepared.mimeType};base64,${prepared.fileBase64}`);
      setClearPhoto(false);
      setFormError('');
    } catch (err: unknown) {
      setImagePreview('');
      setImageData('');
      setFormError(err instanceof Error ? err.message : 'Choose a JPG, PNG, or WebP image.');
    }
  };

  const postNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (posting) return;
    setFormError('');
    setPosting(true);
    try {
      const headers = await getAuthHeaders();
      const editing = editingId;
      const res = await fetchWithTimeout(
        '/api/vault?resource=vault-news',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(editing ? { id: editing } : {}),
            title,
            body,
            kind,
            ...(imageData ? { imageBase64: imageData } : {}),
            ...(editing && clearPhoto && !imageData ? { removeImage: true } : {}),
          }),
        },
        imageData ? 25_000 : 12_000
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error || 'Could not save that news item.');
        return;
      }
      if (editing && data?.item) {
        setNews((prev) => prev.map((item) => (item.id === data.item.id ? data.item : item)));
        resetComposer();
      } else {
        resetComposer();
        setOlderOpen(false);
        const latest = await fetchNewsPage(0, HOME_NEWS_LIMIT);
        applyNewsPage(latest, true);
      }
    } catch {
      setFormError('Could not save that news item.');
    } finally {
      setPosting(false);
    }
  };

  const healthy = database === 'healthy';
  const down = database === 'unavailable';

  return (
    <section className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-burgundy text-gold flex items-center justify-center shrink-0">
            <Megaphone size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-[#0d1a14] tracking-tight">Vault News</h2>
            <p className="text-[11px] text-gray-500 font-medium">
              Church life, celebrations, sympathy, and database notes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
              database === 'checking'
                ? 'bg-gray-100 text-gray-500'
                : healthy
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-900'
            }`}
          >
            <ShieldCheck size={12} />
            {database === 'checking'
              ? 'Checking database'
              : healthy
                ? 'Database healthy'
                : 'Database unavailable'}
          </span>
        </div>
      </div>

      {down && (
        <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-100">
          {savedChannels.length > 0 ? (
            <button
              type="button"
              onClick={openSavedHuddle}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest hover:brightness-110"
            >
              Use saved huddle permission
            </button>
          ) : (
            <p className="text-xs font-medium text-amber-950 leading-relaxed">
              No saved huddle permission on this device. Open a huddle once while the database is
              healthy, and this button can open it for the next 12 hours.
            </p>
          )}
          {savedChannels.length > 1 && (
            <p className="mt-2 text-[11px] text-amber-900 font-medium">
              Several huddles are saved on this device. Chat will open so you can choose one, then
              Start Huddle.
            </p>
          )}
        </div>
      )}

      {canPost && (
        <form ref={formRef} onSubmit={(e) => void postNews(e)} className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="sm:col-span-2 block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                placeholder="A short headline"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Kind</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as NewsKind)}
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy bg-white"
              >
                <option value="church">Church</option>
                <option value="database">Database</option>
                <option value="celebration">Celebration</option>
                <option value="sympathy">Sympathy</option>
                <option value="live_huddle">Live Huddle</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Note</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              required
              rows={3}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy resize-y"
              placeholder="An engagement, a sympathy note, or a database update"
            />
          </label>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Photo</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-[#0d1a14] cursor-pointer hover:border-burgundy/30">
                <ImagePlus size={14} />
                {imagePreview ? 'Change photo' : 'Add a photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    void onPickImage(file);
                  }}
                />
              </label>
              {imagePreview && (
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview('');
                    setImageData('');
                    setClearPhoto(true);
                  }}
                  className="inline-flex items-center gap-1 min-h-[44px] px-3 text-[10px] font-black uppercase tracking-widest text-gray-500"
                >
                  <X size={14} />
                  Remove photo
                </button>
              )}
            </div>
            {imagePreview && (
              <img
                src={imagePreview}
                alt=""
                className={`mt-3 rounded-2xl border border-gray-100 ${NEWS_BANNER_CLASS}`}
              />
            )}
          </div>
          {formError && <p className="text-xs font-bold text-rose-700">{formError}</p>}
          {needsSetup && (
            <p className="text-xs font-medium text-amber-900">
              Run supabase/migrations/vault_news.sql in the Supabase SQL editor before the first post can save.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={posting}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gold text-burgundy text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {posting ? (editingId ? 'Saving…' : 'Posting…') : editingId ? 'Save changes' : 'Post news'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetComposer}
                disabled={posting}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="text-[11px] font-medium text-gray-400">
            {editingId
              ? 'Saving a correction does not ring the bell again.'
              : 'Signed-in members, including phone sign-ins, see this in the bell.'}
          </p>
        </form>
      )}

      <div className="px-5 py-4 space-y-3">
        {newsNote && <p className="text-xs font-medium text-gray-500">{newsNote}</p>}
        {!newsNote && news.length === 0 && (
          <p className="text-sm font-medium text-gray-500">No news yet.</p>
        )}
        {news.map((item) => (
          <article key={item.id} className="rounded-2xl border border-gray-100 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-burgundy/70">
                {KIND_LABEL[item.kind] || 'Church'}
              </span>
              <span className="text-[10px] font-semibold text-gray-400">{formatWhen(item.created_at)}</span>
            </div>
            {newsImageUrl(item) && (
              <button
                type="button"
                onClick={() => setOpenPhoto({ url: newsImageUrl(item), title: item.title })}
                className="mt-2 mb-2 block w-full overflow-hidden rounded-2xl border border-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
                aria-label={`View photo: ${item.title}`}
              >
                <img src={newsImageUrl(item)} alt={item.title} className={NEWS_BANNER_CLASS} />
              </button>
            )}
            <h3 className="text-sm font-black text-[#0d1a14] tracking-tight">{item.title}</h3>
            <p className="mt-1 text-sm text-gray-600 font-medium leading-relaxed whitespace-pre-wrap">{item.body}</p>
            <p className="mt-2 text-[11px] font-bold text-gray-400">
              {item.author_name || 'Leader'}
              {item.author_role ? ` · ${roleLabel(item.author_role)}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2" data-news-share>
              <button
                type="button"
                onClick={() => {
                  setShareNote('');
                  setShareOpenId((current) => (current === item.id ? null : item.id));
                }}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-[#0d1a14] hover:border-burgundy/30"
                aria-expanded={shareOpenId === item.id}
              >
                <Share2 size={14} />
                Share
              </button>
              {shareOpenId === item.id && (
                <>
                  <a
                    href={emailShareHref(item)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-[#0d1a14] text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    <Mail size={14} />
                    Email
                  </a>
                  <a
                    href={whatsappShareHref(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-[#128C7E] text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    <MessageCircle size={14} />
                    WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => void shareViaMessengers(item)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-gold text-burgundy text-[10px] font-black uppercase tracking-widest"
                  >
                    <Smartphone size={14} />
                    Messengers
                  </button>
                </>
              )}
            </div>
            {shareOpenId === item.id && shareNote && (
              <p className="mt-2 text-[11px] font-medium text-gray-500">{shareNote}</p>
            )}
            {canPost && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirmRemoveId === item.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void removeNews(item.id)}
                      disabled={posting}
                      className="inline-flex items-center min-h-[40px] px-3 rounded-xl bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      Take down
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(null)}
                      disabled={posting}
                      className="inline-flex items-center min-h-[40px] px-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startCorrect(item)}
                      className="inline-flex items-center min-h-[40px] px-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-[#0d1a14] hover:border-burgundy/30"
                    >
                      Correct
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(item.id)}
                      className="inline-flex items-center min-h-[40px] px-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-rose-700 hover:border-rose-200"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
        {(hasMore || olderOpen) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {hasMore && (
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                className="inline-flex items-center min-h-[44px] px-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-[#0d1a14] disabled:opacity-50"
              >
                {loadingOlder ? 'Loading…' : 'Older news'}
              </button>
            )}
            {olderOpen && (
              <button
                type="button"
                onClick={() => void load()}
                disabled={loadingOlder}
                className="inline-flex items-center min-h-[44px] px-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 disabled:opacity-50"
              >
                Back to latest
              </button>
            )}
          </div>
        )}
      </div>
      {openPhoto &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#0d1a14]/70"
            onClick={() => setOpenPhoto(null)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={openPhoto.title}
              className="relative w-full max-w-4xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpenPhoto(null)}
                className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#0d1a14] text-white"
                aria-label="Close photo"
              >
                <X size={18} />
              </button>
              <img
                src={openPhoto.url}
                alt={openPhoto.title}
                className="w-full max-h-[85vh] object-contain rounded-2xl bg-black"
              />
            </div>
          </div>,
          document.body
        )}
    </section>
  );
};

export default VaultNewsCard;
