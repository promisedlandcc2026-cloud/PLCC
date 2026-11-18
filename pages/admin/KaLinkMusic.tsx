import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Music, Pause, Pencil, Play, Trash2, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

/**
 * Ka Link Music (#12 — Nov 2026): the song library moderators play in Ka Link
 * during waiting times and interludes. Pastor / Admin / Super Admin and Ka Link
 * team Admins can manage it.
 */

type Song = { id: string; title: string; artist: string | null; durationSeconds: number | null; sizeBytes: number | null; url: string | null };

const SONGS_URL = '/api/vault?resource=community&subResource=chat&subResource=ka-link-songs';

async function callSongs(body: Record<string, unknown>) {
  const res = await fetch(SONGS_URL, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body) });
  const data = await parseApiJson<any>(res);
  if (!res.ok || data?.ok !== true) {
    const err = new Error(data?.error || 'Something went wrong. Please try again.') as Error & { setupNeeded?: boolean; status?: number };
    err.setupNeeded = Boolean(data?.setupNeeded);
    err.status = res.status;
    throw err;
  }
  return data;
}

function mins(sec: number | null): string {
  if (!sec) return '';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Read the length of an audio file in the browser before uploading. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration) : null);
    a.onerror = () => done(null);
    a.src = url;
    window.setTimeout(() => done(null), 8000);
  });
}

const KaLinkMusicPage: React.FC = () => {
  const navigate = useNavigate();
  const [songs, setSongs] = useState<Song[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [uploads, setUploads] = useState<Array<{ name: string; state: 'uploading' | 'done' | 'failed'; message?: string }>>([]);
  const [editing, setEditing] = useState<{ id: string; title: string; artist: string } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await callSongs({ action: 'list' });
      setSongs(Array.isArray(data.songs) ? data.songs : []);
      setCanManage(data.canManage === true);
      setSetupNeeded(false);
    } catch (e: any) {
      setSetupNeeded(Boolean(e?.setupNeeded));
      setError(e?.message || 'Could not load the song library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => audioRef.current?.pause();
  }, [load]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 20);
    setUploads(list.map((f) => ({ name: f.name, state: 'uploading' })));
    for (let i = 0; i < list.length; i += 1) {
      const file = list[i];
      const mark = (state: 'done' | 'failed', message?: string) =>
        setUploads((prev) => prev.map((u, j) => (j === i ? { ...u, state, message } : u)));
      try {
        const durationSeconds = await readDuration(file);
        const start = await callSongs({
          action: 'upload-url',
          filename: file.name,
          mime: file.type || 'audio/mpeg',
          size: file.size,
        });
        const put = await fetch(String(start.signedUrl), {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'audio/mpeg' },
          body: file,
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        await callSongs({ action: 'confirm', songId: start.songId, durationSeconds });
        mark('done');
      } catch (e: any) {
        mark('failed', e?.message || 'Upload failed');
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    await load();
  };

  const togglePreview = (song: Song) => {
    if (!song.url) return;
    if (previewId === song.id) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(song.url);
    a.onended = () => setPreviewId(null);
    void a.play().catch(() => setPreviewId(null));
    audioRef.current = a;
    setPreviewId(song.id);
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await callSongs({ action: 'update', songId: editing.id, title: editing.title, artist: editing.artist });
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    }
  };

  const remove = async (song: Song) => {
    if (!window.confirm(`Delete “${song.title}” from the Ka Link music library?`)) return;
    try {
      await callSongs({ action: 'delete', songId: song.id });
      if (previewId === song.id) audioRef.current?.pause();
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not delete.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-6 space-y-5">
      <button type="button" onClick={() => navigate('/more')} className="flex items-center gap-2 text-sm font-bold text-gray-500">
        <ArrowLeft size={16} aria-hidden /> Back
      </button>
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black text-[#0d1a14]">
          <Music className="text-burgundy" aria-hidden /> Ka Link Music
        </h1>
        <p className="text-gray-500 mt-1">
          Songs moderators can play in Ka Link before the altar starts or during an interlude. Everyone in the room hears them.
        </p>
      </header>

      {setupNeeded ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          The music library isn’t set up yet. Run <code>supabase/migrations/ka_link_songs.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      ) : null}
      {error && !setupNeeded ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">{error}</div>
      ) : null}

      {canManage ? (
        <section className="bg-white rounded-3xl border border-black/5 p-5 shadow-sm space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg"
            multiple
            className="hidden"
            onChange={(e) => void uploadFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploads.some((u) => u.state === 'uploading')}
            className="w-full min-h-[52px] rounded-2xl bg-burgundy text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Upload size={18} aria-hidden /> Upload songs
          </button>
          <p className="text-xs text-gray-500 text-center">
            MP3, M4A, AAC, WAV or OGG · up to 25 MB each · only music the church owns or is licensed to stream (e.g. CCLI).
          </p>
          {uploads.length ? (
            <ul className="space-y-1">
              {uploads.map((u, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {u.state === 'uploading' ? (
                    <Loader2 size={14} className="animate-spin text-gray-400" aria-hidden />
                  ) : u.state === 'done' ? (
                    <Check size={14} className="text-emerald-600" aria-hidden />
                  ) : (
                    <X size={14} className="text-red-600" aria-hidden />
                  )}
                  <span className="truncate flex-1">{u.name}</span>
                  {u.message ? <span className="text-xs text-red-600">{u.message}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : !loading && !setupNeeded ? (
        <p className="text-sm text-gray-500">Only the Pastor, Admins and Ka Link team Admins can add or remove songs.</p>
      ) : null}

      <section className="bg-white rounded-3xl border border-black/5 p-5 shadow-sm">
        <h2 className="text-lg font-black text-[#0d1a14]">Library <span className="text-sm font-bold text-gray-400">({songs.length})</span></h2>
        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading…</p>
        ) : songs.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No songs yet. Until you add some, Ka Link plays the default waiting music.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {songs.map((song) => (
              <li key={song.id} className="py-3">
                {editing?.id === song.id ? (
                  <div className="space-y-2">
                    <input
                      value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      className="w-full min-h-[44px] rounded-xl border border-black/10 px-3 text-sm"
                      placeholder="Title"
                      aria-label="Title"
                    />
                    <input
                      value={editing.artist}
                      onChange={(e) => setEditing({ ...editing, artist: e.target.value })}
                      className="w-full min-h-[44px] rounded-xl border border-black/10 px-3 text-sm"
                      placeholder="Artist (optional)"
                      aria-label="Artist"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveEdit()} className="min-h-[40px] px-4 rounded-xl bg-burgundy text-white text-sm font-bold">Save</button>
                      <button type="button" onClick={() => setEditing(null)} className="min-h-[40px] px-4 rounded-xl bg-gray-100 text-sm font-bold">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => togglePreview(song)}
                      disabled={!song.url}
                      className="min-h-[40px] min-w-[40px] rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center disabled:opacity-40"
                      aria-label={previewId === song.id ? `Pause ${song.title}` : `Preview ${song.title}`}
                    >
                      {previewId === song.id ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-[#0d1a14] truncate">{song.title}</p>
                      <p className="text-xs text-gray-500 truncate">{[song.artist, mins(song.durationSeconds)].filter(Boolean).join(' · ')}</p>
                    </div>
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing({ id: song.id, title: song.title, artist: song.artist || '' })}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center"
                          aria-label={`Rename ${song.title}`}
                        >
                          <Pencil size={15} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(song)}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-red-50 text-red-600 flex items-center justify-center"
                          aria-label={`Delete ${song.title}`}
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default KaLinkMusicPage;
