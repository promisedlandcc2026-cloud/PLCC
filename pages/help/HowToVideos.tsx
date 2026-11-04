import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Play,
  Trash2,
  Pencil,
  X,
  Save,
  Video,
  ExternalLink,
  Loader2,
  AlertCircle,
  ChevronDown,
  Share2,
  Check,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { fetchWithTimeout, getAuthHeaders, isAbortOrTimeoutError } from '../../lib/api';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import Toast from '../../components/common/Toast';
import VideoPlayer from '../../components/Video/VideoPlayer';
import { useNav } from '../../App';
import { canUseNativeShare } from '../../api/_utils/communityFeedMentions';
import {
  HOWTO_CATEGORIES,
  DEFAULT_HOWTO_CATEGORY,
  canViewHowToDcb,
  normalizeHowToCategory,
  type HowToCategoryKey,
} from '../../lib/howtoCategories';

/** HashRouter absolute link that opens this video in the library player. */
function buildHowToShareUrl(videoId: string): string {
  const id = String(videoId || '').trim();
  const origin =
    typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
  return `${origin}/#/help/how-to-videos?v=${encodeURIComponent(id)}`;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

type HowToVideo = {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string;
  category?: string | null;
  provider: 'youtube' | 'vimeo' | 'direct' | 'other' | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

type FormState = {
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string;
  category: HowToCategoryKey;
};

const emptyForm: FormState = {
  title: '',
  description: '',
  videoUrl: '',
  thumbnailUrl: '',
  category: DEFAULT_HOWTO_CATEGORY,
};

function playerTypeForUrl(url: string): 'YouTube' | 'Vimeo' | 'Custom' {
  const u = String(url || '').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('vimeo.com')) return 'Vimeo';
  return 'Custom';
}

/** Best-effort YouTube thumbnail when the user leaves thumbnail blank. */
function suggestYoutubeThumbnail(videoUrl: string): string | null {
  try {
    const u = videoUrl.trim();
    if (!u) return null;
    let id: string | null = null;
    if (u.includes('youtu.be/')) {
      id = u.split('youtu.be/')[1]?.split(/[?&#]/)[0] || null;
    } else if (u.includes('v=')) {
      id = u.split('v=')[1]?.split('&')[0] || null;
    } else if (u.includes('youtube.com/embed/')) {
      id = u.split('youtube.com/embed/')[1]?.split(/[?&#]/)[0] || null;
    } else if (u.includes('youtube.com/shorts/')) {
      id = u.split('youtube.com/shorts/')[1]?.split(/[?&#]/)[0] || null;
    }
    if (!id) return null;
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  } catch {
    return null;
  }
}

const CHIP_LABELS: Record<'all' | HowToCategoryKey, string> = {
  all: 'All',
  vault: 'Vault',
  connect: 'Connect',
  dcb: 'DCB',
  tithe: 'Tithe',
};

type SectionFilter = 'all' | HowToCategoryKey;

const HowToVideosPage: React.FC = () => {
  const { userRole } = useNav();
  const canSeeDcb = canViewHowToDcb(userRole);
  const categoryOptions = useMemo(
    () => HOWTO_CATEGORIES.filter((c) => !c.financeOnly || canSeeDcb),
    [canSeeDcb]
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const [videos, setVideos] = useState<HowToVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    vault: true,
  });

  const [active, setActive] = useState<HowToVideo | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HowToVideo | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const nativeShareAvailable =
    typeof navigator !== 'undefined' ? canUseNativeShare(navigator) : false;

  const shareVideo = async (v: HowToVideo, e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    e?.preventDefault?.();
    const url = buildHowToShareUrl(v.id);
    const text = v.description?.trim()
      ? `${v.title}\n\n${v.description.trim()}`
      : `How To: ${v.title}`;

    if (nativeShareAvailable) {
      try {
        await navigator.share({ title: v.title, text, url });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        // Fall through to copy
      }
    }

    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopiedId(v.id);
      setShareToast({ message: 'Link copied — ready to share', type: 'success' });
      window.setTimeout(() => setCopiedId((cur) => (cur === v.id ? null : cur)), 2000);
    } else {
      setShareToast({ message: 'Could not copy link', type: 'error' });
    }
  };

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetchWithTimeout(
        '/api/vault?resource=howto-videos',
        { headers },
        55_000
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.details || 'Failed to load how-to videos');
      }
      setVideos((data.videos || []) as HowToVideo[]);
    } catch (err: any) {
      console.error(err);
      setVideos([]);
      setLoadError(
        isAbortOrTimeoutError(err)
          ? 'Timed out waiting for the database. Tap Retry — the first load after idle can take up to a minute.'
          : err?.message || 'Failed to load how-to videos'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVideos();
  }, [fetchVideos]);

  // Deep-link from Home (and elsewhere): /help/how-to-videos?v=<id>
  useEffect(() => {
    if (loading || videos.length === 0) return;
    const id = (searchParams.get('v') || searchParams.get('id') || '').trim();
    if (!id) return;
    const match = videos.find((v) => v.id === id);
    if (match) setActive(match);
  }, [loading, videos, searchParams]);

  const clearVideoParam = useCallback(() => {
    if (!searchParams.has('v') && !searchParams.has('id')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('v');
    next.delete('id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        normalizeHowToCategory(v.category).includes(q) ||
        CHIP_LABELS[normalizeHowToCategory(v.category)].toLowerCase().includes(q)
    );
  }, [videos, search]);

  const sections = useMemo(() => {
    return categoryOptions.map((meta) => ({
      meta,
      videos: filtered.filter((v) => normalizeHowToCategory(v.category) === meta.key),
    }));
  }, [categoryOptions, filtered]);

  const visibleSections = useMemo(() => {
    if (sectionFilter === 'all') return sections;
    return sections.filter((s) => s.meta.key === sectionFilter);
  }, [sections, sectionFilter]);

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filtered.length };
    for (const c of categoryOptions) {
      counts[c.key] = filtered.filter(
        (v) => normalizeHowToCategory(v.category) === c.key
      ).length;
    }
    return counts;
  }, [categoryOptions, filtered]);

  useEffect(() => {
    if (sectionFilter === 'all') return;
    setOpenSections((prev) => ({ ...prev, [sectionFilter]: true }));
  }, [sectionFilter]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isSectionOpen = (key: string, videoCount: number) => {
    if (sectionFilter !== 'all' && sectionFilter === key) return true;
    if (openSections[key] !== undefined) return openSections[key];
    // Default: Vault open; others open only when they have videos and filter is All
    if (key === 'vault') return true;
    return videoCount > 0;
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (v: HowToVideo, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditing(v);
    setForm({
      title: v.title,
      description: v.description || '',
      videoUrl: v.video_url,
      thumbnailUrl: v.thumbnail_url,
      category: normalizeHowToCategory(v.category),
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      let thumbnailUrl = form.thumbnailUrl.trim();
      if (!thumbnailUrl) {
        const suggested = suggestYoutubeThumbnail(form.videoUrl);
        if (suggested) thumbnailUrl = suggested;
      }
      if (!thumbnailUrl) {
        throw new Error('Thumbnail URL is required (or paste a YouTube link to auto-fill).');
      }

      const headers = await getAuthHeaders();
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        videoUrl: form.videoUrl.trim(),
        thumbnailUrl,
        category: form.category,
      };

      const res = editing
        ? await fetch(`/api/vault?resource=howto-videos&id=${encodeURIComponent(editing.id)}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/vault?resource=howto-videos', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.details || data?.error || 'Failed to save video');
      }

      closeForm();
      await fetchVideos();
      if (data.video) setActive(data.video as HowToVideo);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (v: HowToVideo, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Remove “${v.title}” from How To Videos?`)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=howto-videos&id=${encodeURIComponent(v.id)}`,
        { method: 'DELETE', headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete');
      if (active?.id === v.id) {
        setActive(null);
        clearVideoParam();
      }
      setVideos((prev) => prev.filter((x) => x.id !== v.id));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete');
    }
  };

  const renderVideoCard = (v: HowToVideo) => (
    <button
      key={v.id}
      type="button"
      onClick={() => {
        setActive(v);
        const next = new URLSearchParams(searchParams);
        next.set('v', v.id);
        next.delete('id');
        setSearchParams(next, { replace: true });
      }}
      className="group text-left bg-white rounded-[1.75rem] border border-gray-100 overflow-hidden hover:shadow-xl hover:border-gold/20 transition-all"
    >
      <div className="relative aspect-video bg-gray-100 overflow-hidden">
        <img
          src={v.thumbnail_url}
          alt=""
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity w-12 h-12 rounded-full bg-burgundy text-gold flex items-center justify-center shadow-lg">
            <Play size={20} className="ml-0.5" fill="currentColor" />
          </span>
        </div>
      </div>
      <div className="p-4">
          <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-black text-[#0d1a14] leading-snug line-clamp-2">{v.title}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => void shareVideo(v, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') void shareVideo(v, e);
              }}
              className={`p-1.5 rounded-lg transition-colors ${
                copiedId === v.id
                  ? 'text-green-600 bg-green-50'
                  : 'text-gray-300 hover:text-burgundy hover:bg-burgundy/5'
              }`}
              title={nativeShareAvailable ? 'Share' : 'Copy link'}
              aria-label={`Share ${v.title}`}
            >
              {copiedId === v.id ? <Check size={14} /> : <Share2 size={14} />}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => openEdit(v, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openEdit(v, e as any);
              }}
              className="p-1.5 rounded-lg text-gray-300 hover:text-burgundy hover:bg-burgundy/5"
              title="Edit"
              aria-label={`Edit ${v.title}`}
            >
              <Pencil size={14} />
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => void handleDelete(v, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') void handleDelete(v, e as any);
              }}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"
              title="Delete"
              aria-label={`Delete ${v.title}`}
            >
              <Trash2 size={14} />
            </span>
          </div>
        </div>
        {v.description ? (
          <p className="mt-2 text-xs text-gray-400 font-medium line-clamp-2 leading-relaxed">
            {v.description}
          </p>
        ) : null}
      </div>
    </button>
  );

  return (
    <div className="bg-[#FAFAFA]">
      {shareToast ? (
        <Toast
          message={shareToast.message}
          type={shareToast.type}
          onClose={() => setShareToast(null)}
        />
      ) : null}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-1 w-8 bg-gold rounded-full" />
            <h2 className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">
              Vault guides
            </h2>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-4xl font-black text-[#0d1a14] tracking-tighter leading-none">
                  How To Videos<span className="text-gold">.</span>
                </h1>
                <AskAdminTitleLink />
              </div>
              <p className="text-gray-400 font-medium text-sm max-w-xl">
                Short walkthroughs by product — Vault, Connect, DCB, and Tithe. Host the video
                elsewhere, then paste the link and a thumbnail here.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-5 py-3 bg-burgundy text-gold rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-burgundy/15 hover:bg-burgundy-dark transition-all active:scale-95"
            >
              <Plus size={16} />
              Add video
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8 space-y-10 pb-10 lg:pb-16">
        {active && (
          <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-50">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-gold mb-1">
                  Now playing
                </p>
                <h3 className="text-lg font-black text-[#0d1a14] truncate">{active.title}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => void shareVideo(active, e)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                    copiedId === active.id
                      ? 'text-green-700 bg-green-50'
                      : 'text-gray-400 hover:text-burgundy hover:bg-burgundy/5'
                  }`}
                  title={nativeShareAvailable ? 'Share this how-to' : 'Copy link to this how-to'}
                  aria-label={`Share ${active.title}`}
                >
                  {copiedId === active.id ? <Check size={14} /> : <Share2 size={14} />}
                  {copiedId === active.id ? 'Copied' : nativeShareAvailable ? 'Share' : 'Copy link'}
                </button>
                <a
                  href={active.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-xl text-gray-400 hover:text-burgundy hover:bg-burgundy/5"
                  title="Open external video"
                  aria-label="Open external video"
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setActive(null);
                    clearVideoParam();
                  }}
                  className="p-2 rounded-xl text-gray-400 hover:text-burgundy hover:bg-burgundy/5"
                  aria-label="Close player"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="aspect-video w-full bg-black">
              <VideoPlayer
                source={{
                  id: active.id,
                  title: active.title,
                  type: playerTypeForUrl(active.video_url),
                  url: active.video_url,
                }}
              />
            </div>
            {active.description ? (
              <p className="px-5 py-4 text-sm text-gray-500 font-medium leading-relaxed">
                {active.description}
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search how-to videos…"
              className="w-full sm:max-w-sm px-4 py-3 rounded-2xl border border-gray-100 bg-white text-sm font-medium text-[#0d1a14] placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">
              {sectionFilter === 'all'
                ? `${filtered.length} video${filtered.length === 1 ? '' : 's'}`
                : `${chipCounts[sectionFilter] || 0} in ${CHIP_LABELS[sectionFilter]}`}
            </p>
          </div>

          <div
            className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin"
            role="tablist"
            aria-label="Filter by section"
          >
            {(['all', ...categoryOptions.map((c) => c.key)] as SectionFilter[]).map((key) => {
              const activeChip = sectionFilter === key;
              const count = chipCounts[key] ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeChip}
                  onClick={() => setSectionFilter(key)}
                  className={`snap-start shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
                    activeChip
                      ? 'bg-burgundy text-gold border-burgundy shadow-sm'
                      : 'bg-white text-gray-400 border-gray-100 hover:border-burgundy/20 hover:text-burgundy'
                  }`}
                >
                  {CHIP_LABELS[key]}
                  <span
                    className={`min-w-[1.25rem] h-5 px-1.5 rounded-full inline-flex items-center justify-center text-[9px] font-black ${
                      activeChip ? 'bg-gold/20 text-gold' : 'bg-gray-50 text-gray-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {loadError && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{loadError}</p>
              <button
                type="button"
                onClick={() => void fetchVideos()}
                className="mt-2 text-[10px] font-black uppercase tracking-widest underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 className="animate-spin mb-3 text-burgundy" size={28} />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Loading library</p>
          </div>
        ) : (
          <div className="space-y-6">
            {visibleSections.map(({ meta, videos: sectionVideos }) => {
              const open = isSectionOpen(meta.key, sectionVideos.length);
              return (
                <section
                  key={meta.key}
                  aria-labelledby={`howto-${meta.key}`}
                  className="rounded-[1.75rem] border border-gray-100 bg-white overflow-hidden shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(meta.key)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50/80 transition-colors"
                    aria-expanded={open}
                    aria-controls={`howto-panel-${meta.key}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-1 w-6 bg-gold rounded-full" />
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold">
                          Section
                        </p>
                      </div>
                      <h2
                        id={`howto-${meta.key}`}
                        className="text-xl sm:text-2xl font-black text-[#0d1a14] tracking-tight"
                      >
                        {meta.label}
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-400 font-medium mt-0.5 truncate">
                        {meta.blurb}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">
                        {sectionVideos.length}
                      </span>
                      <ChevronDown
                        size={20}
                        className={`text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </div>
                  </button>

                  {open ? (
                    <div id={`howto-panel-${meta.key}`} className="px-5 pb-5">
                      {sectionVideos.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-[#FAFAFA] px-6 py-10 text-center">
                          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gold-cream/50 border border-gold/10 flex items-center justify-center">
                            <Video className="text-burgundy" size={22} />
                          </div>
                          <p className="text-sm font-bold text-[#0d1a14]">Coming soon</p>
                          <p className="text-xs text-gray-400 font-medium mt-1 max-w-sm mx-auto">
                            No walkthroughs in this section yet
                            {meta.key === 'vault' ? '' : ' — add one when you’re ready'}.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {sectionVideos.map(renderVideoCard)}
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40 backdrop-blur-sm">
          <div className="w-full sm:max-w-lg bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-50 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-[#0d1a14] tracking-tight">
                {editing ? 'Edit video' : 'Add how-to video'}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="p-2 rounded-xl text-gray-400 hover:text-burgundy hover:bg-burgundy/5"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                Paste a YouTube (unlisted), Vimeo, Bunny, or direct video link. Vault stores the
                link and thumbnail only — not the video file.
              </p>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Section
                </span>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: normalizeHowToCategory(e.target.value),
                    }))
                  }
                  className="w-full px-4 py-3 rounded-2xl border border-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gold/40 bg-white"
                >
                  {categoryOptions.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Title
                </span>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gold/40"
                  placeholder="e.g. How to check in a family"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Description (optional)
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gold/40 resize-none"
                  placeholder="What this walkthrough covers"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Video URL
                </span>
                <input
                  required
                  type="url"
                  value={form.videoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gold/40"
                  placeholder="https://…"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Thumbnail URL
                </span>
                <input
                  type="url"
                  value={form.thumbnailUrl}
                  onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gold/40"
                  placeholder="https://… (auto-fills for YouTube if blank)"
                />
              </label>
              {form.thumbnailUrl || suggestYoutubeThumbnail(form.videoUrl) ? (
                <div className="rounded-2xl overflow-hidden border border-gray-100 aspect-video bg-gray-50">
                  <img
                    src={form.thumbnailUrl || suggestYoutubeThumbnail(form.videoUrl) || ''}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : null}
              {formError && (
                <p className="text-sm font-bold text-red-600 flex items-center gap-2">
                  <AlertCircle size={16} />
                  {formError}
                </p>
              )}
              <div className="flex gap-3 pt-2 pb-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 px-4 py-3 rounded-2xl border border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {editing ? 'Save' : 'Add video'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HowToVideosPage;
