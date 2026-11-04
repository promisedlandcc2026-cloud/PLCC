import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

type Flyer = {
  id: string;
  title: string;
  imageUrl: string;
  destinationUrl: string;
  shareMessage?: string | null;
  slug: string | null;
  isActive: boolean;
  shareUrl: string | null;
  whatsappUrl: string | null;
  smsUrl: string | null;
  createdAt?: string | null;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function absoluteImageUrl(url: string): string {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (typeof window !== 'undefined' && u.startsWith('/')) {
    return `${window.location.origin}${u}`;
  }
  return u;
}

/** Quick picks for the destination box (it starts empty so pastes never merge). */
const DESTINATION_PRESETS = [
  { label: 'PLCC Connect', url: 'https://plcc-connect.vercel.app/welcome' },
  { label: 'Grand Family Celebration RSVP', url: '/#/events/86ac9498-ee56-4c6a-baae-079832b0ea73/rsvp' },
];

/**
 * WhatsApp skips link-preview images that are too big (roughly 300–600 KB),
 * so flyers are resized to ≤1200 px and saved as JPEG under ~280 KB.
 */
const PREVIEW_MAX_EDGE = 1200;
const PREVIEW_MAX_BYTES = 280 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

async function compressFlyerImage(file: File): Promise<File> {
  try {
    const img = await loadImage(file);
    let scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    for (let pass = 0; pass < 4; pass += 1) {
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.fillStyle = '#ffffff'; // JPEG has no transparency
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (const quality of [0.86, 0.78, 0.7, 0.6]) {
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, 'image/jpeg', quality)
        );
        if (blob && blob.size <= PREVIEW_MAX_BYTES) {
          const name = file.name.replace(/\.[a-z0-9]+$/i, '') || 'flyer';
          return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
        }
      }
      scale *= 0.8;
    }
  } catch {
    /* fall through: upload the original */
  }
  return file;
}

function flyerShareText(flyer: Flyer): string {
  const url = flyer.shareUrl || '';
  const msg = String(flyer.shareMessage || '').trim();
  if (msg) return msg.includes(url) ? msg : `${msg}\n\n${url}`;
  return `${flyer.title}\n${url}`;
}

const FlyerSharePage: React.FC = () => {
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [lastCreated, setLastCreated] = useState<Flyer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=share-flyers', { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not load flyer share links.');
        setFlyers([]);
        return;
      }
      setFlyers(Array.isArray(data.flyers) ? data.flyers : []);
    } catch {
      setError('Could not load flyer share links.');
      setFlyers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFlyerImage = async (picked: File): Promise<string | null> => {
    const small = await compressFlyerImage(picked);
    const dataUrl = await fileToDataUrl(small);
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/vault?resource=events&subResource=upload-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageBase64: dataUrl, contentType: small.type || 'image/jpeg' }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.ok && data?.url) return String(data.url);
    return null;
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      let finalImage = imageUrl.trim();
      if (file) {
        const uploaded = await uploadFlyerImage(file);
        if (!uploaded) {
          setFormError('Flyer upload failed. Try a smaller JPEG or PNG.');
          return;
        }
        finalImage = uploaded;
        setImageUrl(uploaded);
      }
      if (!title.trim()) {
        setFormError('Title is required.');
        return;
      }
      if (!finalImage) {
        setFormError('Upload a flyer image first.');
        return;
      }
      if (!destinationUrl.trim()) {
        setFormError('Paste a destination link (RSVP or event page).');
        return;
      }

      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/vault?resource=share-flyers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title.trim(),
          imageUrl: finalImage,
          destinationUrl: destinationUrl.trim(),
          shareMessage: shareMessage.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error || 'Could not save flyer.');
        return;
      }
      const flyer = data.flyer as Flyer;
      setLastCreated(flyer);
      setShowForm(false);
      setTitle('');
      setFile(null);
      setImageUrl('');
      setDestinationUrl('');
      setShareMessage('');
      await load();
    } catch {
      setFormError('Could not save flyer.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (id: string) => {
    if (busy) return;
    if (!window.confirm('Deactivate this flyer share link? Existing links will stop working.')) {
      return;
    }
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=share-flyers&id=${encodeURIComponent(id)}`,
        { method: 'DELETE', headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not deactivate flyer.');
        return;
      }
      if (lastCreated?.id === id) setLastCreated(null);
      await load();
    } catch {
      setError('Could not deactivate flyer.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (flyer: Flyer) => {
    const url = flyer.shareUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(flyer.id);
      setTimeout(() => setCopiedId((cur) => (cur === flyer.id ? null : cur)), 2000);
    } catch {
      setError('Could not copy link.');
    }
  };

  /**
   * Share the flyer IMAGE plus the message (with link) in one go, using the
   * phone's / computer's share sheet → WhatsApp. wa.me links can only carry text,
   * so this is the only way to attach the picture itself.
   */
  const shareWithImage = async (flyer: Flyer) => {
    setNotice(null);
    const text = flyerShareText(flyer);
    try {
      const res = await fetch(absoluteImageUrl(flyer.imageUrl), { mode: 'cors' });
      if (!res.ok) throw new Error('image');
      const blob = await res.blob();
      const type = blob.type || 'image/jpeg';
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const imageFile = new File([blob], `awc-flyer.${ext}`, { type });
      const payload: ShareData = { files: [imageFile], text };
      if (navigator.canShare?.(payload) && navigator.share) {
        await navigator.share(payload);
        return;
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // user closed the share sheet
    }
    // Share sheet can't send files here (e.g. some desktop browsers):
    // copy the message and open WhatsApp; the link shows the flyer preview.
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
    if (flyer.whatsappUrl) window.open(flyer.whatsappUrl, '_blank', 'noopener,noreferrer');
    setNotice(
      'This browser can\'t attach images to WhatsApp, so the message was copied and WhatsApp opened with the link — the flyer appears as the link preview. For the image as a photo, use this button on your phone.'
    );
  };

  const copyMessage = async (flyer: Flyer) => {
    try {
      await navigator.clipboard.writeText(flyerShareText(flyer));
      setCopiedId(`msg-${flyer.id}`);
      setTimeout(() => setCopiedId((cur) => (cur === `msg-${flyer.id}` ? null : cur)), 2000);
    } catch {
      setError('Could not copy message.');
    }
  };

  const shareButtons = (flyer: Flyer, size: 'lg' | 'sm') => {
    const pad = size === 'lg' ? 'px-4 py-2.5 text-sm' : 'px-3 py-2 text-xs';
    const icon = size === 'lg' ? 16 : 14;
    return (
      <>
        <button
          type="button"
          onClick={() => void shareWithImage(flyer)}
          className={`inline-flex items-center gap-1.5 ${pad} rounded-xl bg-green-700 text-white font-bold`}
        >
          <Share2 size={icon} />
          WhatsApp (image + message)
        </button>
        {flyer.whatsappUrl && (
          <a
            href={flyer.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 ${pad} rounded-xl border border-green-700 text-green-800 font-bold`}
          >
            WhatsApp (link only)
          </a>
        )}
        <button
          type="button"
          onClick={() => void copyMessage(flyer)}
          className={`inline-flex items-center gap-1.5 ${pad} rounded-xl border border-gray-200 text-[#0d1a14] font-bold`}
        >
          {copiedId === `msg-${flyer.id}` ? <Check size={icon} /> : <Copy size={icon} />}
          Copy message
        </button>
        {flyer.smsUrl && (
          <a
            href={flyer.smsUrl}
            className={`inline-flex items-center gap-1.5 ${pad} rounded-xl bg-sky-700 text-white font-bold`}
          >
            <MessageSquare size={icon} />
            Text / SMS
          </a>
        )}
      </>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <AskAdminTitleLink
            title="Flyer share"
            className="text-3xl font-extrabold text-[#0d1a14] tracking-tight"
          />
          <p className="text-gray-500 mt-2 max-w-xl">
            Upload a flyer, paste where people should go, then copy one link for WhatsApp or text.
            Recipients see the flyer preview, then open your destination.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setFormError(null);
            setLastCreated(null);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-burgundy text-gold font-bold shadow-lg hover:scale-[1.02] transition-transform"
        >
          <Plus size={18} />
          New flyer link
        </button>
      </div>

      {notice && (
        <p className="text-sm font-medium text-[#0d1a14] bg-gold-cream/60 border border-gold/30 px-4 py-3 rounded-xl">
          {notice}
        </p>
      )}

      {lastCreated?.shareUrl && (
        <div className="rounded-[2rem] border border-gold/30 bg-gold-cream/40 p-6 space-y-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Share link ready
          </p>
          <p className="font-bold text-[#0d1a14]">{lastCreated.title}</p>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="flex-1 bg-white/80 p-4 rounded-2xl border border-gold/20 font-mono text-xs text-burgundy break-all">
              {lastCreated.shareUrl}
            </div>
            <button
              type="button"
              onClick={() => void copyLink(lastCreated)}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-burgundy text-gold font-bold"
            >
              {copiedId === lastCreated.id ? <Check size={18} /> : <Copy size={18} />}
              Copy link
            </button>
          </div>
          <div className="flex flex-wrap gap-3">{shareButtons(lastCreated, 'lg')}</div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold text-[#0d1a14]">Create flyer share link</h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm font-bold text-gray-400 hover:text-burgundy"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. PLCC Grand Family Celebration 2026"
              className="w-full px-5 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none font-bold text-[#0d1a14]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              Destination link
            </label>
            <input
              type="text"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="/#/events/…/rsvp or https://…"
              className="w-full px-5 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none font-mono text-sm text-[#0d1a14]"
            />
            <div className="flex flex-wrap gap-2">
              {DESTINATION_PRESETS.map((p) => (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => setDestinationUrl(p.url)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    destinationUrl === p.url
                      ? 'bg-burgundy text-gold border-burgundy'
                      : 'border-gray-200 text-[#0d1a14] hover:border-gold'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Paste the link people should open after the flyer preview, or tap a quick pick.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="flyer-share-message"
              className="text-[11px] font-bold text-gray-400 uppercase tracking-widest"
            >
              Message (sent with the flyer)
            </label>
            <textarea
              id="flyer-share-message"
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              rows={6}
              maxLength={1500}
              placeholder={'e.g. Good morning, PLCC Family! Today is the last day for our other platforms. Get PLCC Connect here:'}
              className="w-full px-5 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none text-sm text-[#0d1a14] leading-relaxed"
            />
            <p className="text-xs text-gray-400">
              Optional. The share link is added to the end automatically. WhatsApp *bold* and _italics_ work.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              Flyer image
            </label>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl p-8 cursor-pointer hover:border-gold/50 transition-colors">
              <Upload className="text-burgundy" size={28} />
              <span className="font-bold text-[#0d1a14] text-sm">
                {file ? file.name : 'Choose flyer image'}
              </span>
              <span className="text-xs text-gray-400">
                JPEG, PNG, or WebP — resized automatically so WhatsApp shows it
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (f) {
                    void fileToDataUrl(f).then((url) => setImageUrl(url));
                  }
                }}
              />
            </label>
            {(imageUrl || file) && (
              <div className="rounded-2xl overflow-hidden border border-gray-100 max-w-xs">
                <img
                  src={imageUrl.startsWith('data:') ? imageUrl : absoluteImageUrl(imageUrl)}
                  alt="Flyer preview"
                  className="w-full h-auto object-cover"
                />
              </div>
            )}
          </div>

          {formError && (
            <p className="text-sm font-semibold text-red-600 bg-red-50 px-4 py-3 rounded-xl">
              {formError}
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-burgundy text-gold font-bold disabled:opacity-60"
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Link2 size={18} />}
            Save & get share link
          </button>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-[#0d1a14]">Saved flyers</h2>
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 font-medium">
            <Loader2 className="animate-spin" size={18} /> Loading…
          </div>
        )}
        {error && (
          <p className="text-sm font-semibold text-red-600 bg-red-50 px-4 py-3 rounded-xl">
            {error}
          </p>
        )}
        {!loading && !error && flyers.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-gray-200 p-10 text-center text-gray-400">
            <ImageIcon className="mx-auto mb-3 opacity-40" size={36} />
            <p className="font-medium">No active flyer share links yet.</p>
          </div>
        )}
        <ul className="space-y-4">
          {flyers.map((flyer) => (
            <li
              key={flyer.id}
              className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row gap-4"
            >
              <div className="w-28 h-36 shrink-0 rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                {flyer.imageUrl ? (
                  <img
                    src={absoluteImageUrl(flyer.imageUrl)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ImageIcon size={24} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="font-extrabold text-[#0d1a14] truncate">{flyer.title}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{flyer.destinationUrl}</p>
                {flyer.shareUrl && (
                  <p className="text-xs text-burgundy font-mono break-all">{flyer.shareUrl}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void copyLink(flyer)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-burgundy text-gold text-xs font-bold"
                  >
                    {copiedId === flyer.id ? <Check size={14} /> : <Copy size={14} />}
                    Copy link
                  </button>
                  {shareButtons(flyer, 'sm')}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deactivate(flyer.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-100 text-red-600 text-xs font-bold hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                    Deactivate
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default FlyerSharePage;
