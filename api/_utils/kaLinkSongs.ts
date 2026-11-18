/**
 * Ka Link song library (#12 — Nov 2026): music for the short waiting times
 * before the altar starts, or for an interlude.
 *
 *  - Pastor / Admin / Super Admin and Ka Link team Admins upload songs in Canaan
 *    (More → Ka Link Music). Files go to the private Storage bucket ka-link-songs.
 *  - In a Ka Link, moderators pick a song or "Play all"; Ka Link plays it into the
 *    room through the existing waiting-music track, so everyone hears it.
 *  - Only upload music the church owns or is licensed to stream (e.g. CCLI).
 * Migration: supabase/migrations/ka_link_songs.sql
 */

export const KA_LINK_SONGS_BUCKET = 'ka-link-songs';
export const MAX_SONG_BYTES = 25 * 1024 * 1024;
export const MAX_LIBRARY_SONGS = 300;

const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
};

export function songExtensionForMime(mime: unknown): string | null {
  return AUDIO_TYPES[String(mime || '').toLowerCase().trim()] || null;
}

export function cleanSongText(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** "Way Maker.mp3" → "Way Maker" (title suggestion when none was typed). */
export function titleFromFilename(name: unknown): string {
  return cleanSongText(String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' '), 120) || 'Untitled song';
}

export function songStoragePath(songId: string, ext: string): string {
  return `songs/${songId}.${ext}`;
}

/** Validate an upload request. Pure (unit tested). */
export function validateSongUpload(body: any):
  | { ok: true; title: string; artist: string | null; ext: string; mime: string; size: number }
  | { ok: false; error: string } {
  const mime = String(body?.mime || '').toLowerCase();
  const ext = songExtensionForMime(mime);
  if (!ext) return { ok: false, error: 'Choose an audio file (MP3, M4A, AAC, WAV or OGG).' };
  const size = Number(body?.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'That file looks empty.' };
  if (size > MAX_SONG_BYTES) return { ok: false, error: 'Songs must be 25 MB or smaller.' };
  const title = cleanSongText(body?.title, 120) || titleFromFilename(body?.filename);
  const artist = cleanSongText(body?.artist, 120) || null;
  return { ok: true, title, artist, ext, mime, size };
}

export function isSongsTableMissing(error: any): boolean {
  return /ka_link_songs|42P01|does not exist/i.test(String(error?.message || error?.code || ''));
}
