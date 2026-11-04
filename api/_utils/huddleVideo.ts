/**
 * Phase 3C — Live Huddle video helpers (pure; shared by UI + smokes).
 * Same LiveKit room as voice — camera is opt-in per participant.
 */

/** Camera is off on join; audio starts immediately. */
export const HUDDLE_CAMERA_DEFAULT_ON = false;

/** Sensible default capture — avoid forcing 1080p for tile grids. */
export const HUDDLE_CAMERA_CAPTURE = {
  resolution: {
    width: 1280,
    height: 720,
    frameRate: 24,
  },
} as const;

export function formatCameraPermissionError(err: unknown): string {
  const msg = String((err as any)?.message || err || '');
  const lower = msg.toLowerCase();
  if (
    lower.includes('permission') ||
    lower.includes('notallowed') ||
    lower.includes('denied') ||
    lower.includes('notallowederror')
  ) {
    return 'Camera access was denied. You’re still connected by audio.';
  }
  if (lower.includes('notfound') || lower.includes('no device') || lower.includes('device not found')) {
    return 'No camera was found. You’re still connected by audio.';
  }
  if (lower.includes('in use') || lower.includes('busy') || lower.includes('abort') || lower.includes('notreadable')) {
    return 'Camera is unavailable or already in use. You’re still connected by audio.';
  }
  return msg
    ? `Camera error: ${msg}. You’re still connected by audio.`
    : 'Camera could not start. You’re still connected by audio.';
}

/** Responsive CSS grid columns for the video tile board. */
export function huddleVideoGridClass(participantCount: number): string {
  const n = Math.max(1, Number(participantCount) || 1);
  if (n <= 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (n <= 4) return 'grid-cols-2';
  return 'grid-cols-2 sm:grid-cols-3';
}

/** Participant count is room membership — camera state must not change it. */
export function huddleCountIgnoresCameraState(
  roomParticipantCount: number,
  _camerasOn: number
): number {
  return Math.max(0, Number(roomParticipantCount) || 0);
}

export function tokenPlanAllowsVideoPublish(grant: {
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  canUpdateOwnMetadata?: boolean;
}): boolean {
  return (
    grant.canPublish === true &&
    grant.canSubscribe === true &&
    grant.canPublishData === true &&
    grant.canUpdateOwnMetadata === true
  );
}
