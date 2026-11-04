/**
 * Live Huddle shared waiting music (pure; UI + smokes).
 *
 * Channel moderators and the huddle session host (whoever started / claimed the
 * empty host seat) may publish a looping HTMLAudioElement via captureStream into
 * the same LiveKit room as voice. Asset must exist at HUDDLE_MUSIC_ASSET_PATH
 * (church-supplied, licensed for streaming) — Play fails clearly when missing.
 */

/** Play Music is available when the local user is a channel mod or session host/co-host. */
export function canControlHuddleMusic(canModerate: boolean): boolean {
  return Boolean(canModerate);
}

/** LiveKit TrackPublication.name for the shared waiting track. */
export const HUDDLE_MUSIC_TRACK_NAME = 'awc-huddle-music';

/**
 * Public URL for the waiting loop.
 * Drop a licensed MP3 at public/huddle/waiting.mp3 before using Play Music.
 */
export const HUDDLE_MUSIC_ASSET_PATH = '/huddle/waiting.mp3';

/** Quieter than speech so voices stay clear without auto-duck. */
export const HUDDLE_MUSIC_DEFAULT_VOLUME = 0.18;

export type HuddleMusicPublicationLike = {
  name?: string | null;
  trackName?: string | null;
  track?: { name?: string | null } | null;
};

/** Match a LiveKit publication as huddle waiting music (by track name). */
export function isHuddleMusicPublication(
  pub: HuddleMusicPublicationLike | null | undefined
): boolean {
  if (!pub) return false;
  const name = String(pub.name || pub.trackName || pub.track?.name || '').trim();
  return name === HUDDLE_MUSIC_TRACK_NAME;
}

export function huddleMusicButtonLabel(playing: boolean): string {
  return playing ? 'Stop Music' : 'Play Music';
}

export function formatHuddleMusicError(err: unknown): string {
  const name = String((err as { name?: string })?.name || '');
  const msg = String((err as { message?: string })?.message || err || '');
  const lower = `${name} ${msg}`.toLowerCase();

  if (
    lower.includes('not installed') ||
    lower.includes('failed to load') ||
    lower.includes('no supported source') ||
    lower.includes('media_err') ||
    lower.includes('404') ||
    lower.includes('networkerror')
  ) {
    return 'Waiting music file is not installed.';
  }
  if (
    lower.includes('capturesstream') ||
    lower.includes('capturestream') ||
    lower.includes('not supported') ||
    lower.includes('mozcapturesstream')
  ) {
    return 'Background music is not available in this browser.';
  }
  if (lower.includes('already playing') || lower.includes('already active')) {
    return 'Music is already playing.';
  }
  if (lower.includes('abort') || lower.includes('cancel') || lower.includes('notallowed')) {
    return 'Could not start waiting music.';
  }
  return msg.trim() || 'Could not start waiting music.';
}

/** Whether any publication in a list is active huddle music. */
export function roomHasHuddleMusic(
  publications: Array<HuddleMusicPublicationLike | null | undefined>
): boolean {
  return (publications || []).some((p) => isHuddleMusicPublication(p));
}

/**
 * Key for attaching remote audio elements — must be unique per track so
 * mic + music from the same participant do not overwrite each other.
 */
export function huddleRemoteAudioAttachKey(
  identity: string,
  trackSid: string | null | undefined
): string {
  const id = String(identity || '').trim() || 'unknown';
  const sid = String(trackSid || '').trim();
  return sid ? `${id}:${sid}` : id;
}
