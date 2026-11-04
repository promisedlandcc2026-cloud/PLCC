/**
 * Phase 3D — Live Huddle screen-share helpers (pure; shared by UI + smokes).
 * Same LiveKit room as voice/video — screen share is opt-in per participant.
 */

/** Screen share is off on join; never auto-prompt getDisplayMedia. */
export const HUDDLE_SCREEN_SHARE_DEFAULT_ON = false;

/**
 * Capture prefs: readable docs/slides over cinematic FPS.
 * System/tab audio stays off for Phase 3D (mic remains the huddle audio path).
 * Safari: omit explicit resolution (WebKit bug can force low-res when set).
 * Chrome: exclude this tab so sharing the huddle itself cannot recurse.
 */
export const HUDDLE_SCREEN_SHARE_CAPTURE = {
  audio: false,
  contentHint: 'detail' as const,
  resolution: {
    width: 1920,
    height: 1080,
    frameRate: 15,
  },
  selfBrowserSurface: 'exclude' as const,
  preferCurrentTab: false,
} as const;

export type HuddleScreenShareCaptureOptions = {
  audio: false;
  contentHint: 'detail';
  resolution?: { width: number; height: number; frameRate: number };
  selfBrowserSurface: 'exclude';
  preferCurrentTab: false;
};

/**
 * Presenter preview of their own capture nests the huddle into infinity
 * (Droste / hall-of-mirrors) when they share this tab or the whole screen.
 * Remote viewers still receive the real ScreenShare track.
 */
export function huddleLocalScreenShareUsesPlaceholder(isLocal: boolean): boolean {
  return Boolean(isLocal);
}

export function isLikelySafari(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): boolean {
  const s = String(ua || '');
  return /safari/i.test(s) && !/chrome|crios|chromium|android/i.test(s);
}

/** Runtime capture options — Safari omits resolution; others use ≤15fps detail profile. */
export function buildScreenShareCaptureOptions(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): HuddleScreenShareCaptureOptions {
  const antiLoop = {
    selfBrowserSurface: 'exclude' as const,
    preferCurrentTab: false as const,
  };
  if (isLikelySafari(ua)) {
    return {
      audio: false,
      contentHint: 'detail',
      ...antiLoop,
    };
  }
  return {
    audio: false,
    contentHint: HUDDLE_SCREEN_SHARE_CAPTURE.contentHint,
    resolution: { ...HUDDLE_SCREEN_SHARE_CAPTURE.resolution },
    ...antiLoop,
  };
}

export type ScreenShareCandidate = {
  identity: string;
  name: string;
  isLocal: boolean;
  /** Monotonic first-seen time for deterministic primary selection. */
  firstSeenAt: number;
};

export const SCREEN_SHARE_UNSUPPORTED_HINT =
  'Screen sharing is not available in this browser or device.';

/** Friendlier copy for phones — iOS Safari has no usable getDisplayMedia screen share. */
export function screenShareUnsupportedHint(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): string {
  if (/iphone|ipod|ipad/i.test(ua)) {
    return 'Screen sharing is not available on iPhone/iPad. Use a computer (Chrome or Safari) to share your screen.';
  }
  if (/android/i.test(ua)) {
    return 'Screen sharing is limited on phones. Use a computer browser to share your screen.';
  }
  return SCREEN_SHARE_UNSUPPORTED_HINT;
}

/** Feature-detect getDisplayMedia without assuming mobile support. */
export function isScreenShareSupported(
  mediaDevices: { getDisplayMedia?: unknown } | null | undefined =
    typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
): boolean {
  return Boolean(mediaDevices && typeof mediaDevices.getDisplayMedia === 'function');
}

export function formatScreenShareError(err: unknown): string {
  const name = String((err as any)?.name || '');
  const msg = String((err as any)?.message || err || '');
  const lower = `${name} ${msg}`.toLowerCase();

  if (
    lower.includes('abort') ||
    lower.includes('cancel') ||
    (lower.includes('notallowed') && !lower.includes('device'))
  ) {
    return 'Screen sharing was cancelled.';
  }
  if (
    lower.includes('notsupported') ||
    lower.includes('not supported') ||
    lower.includes('undefined is not') ||
    lower.includes('getdisplaymedia')
  ) {
    return 'Screen sharing is not available in this browser or device.';
  }
  return "We couldn't start screen sharing. You're still connected to the huddle.";
}

/** Participant count is room membership — screen-share state must not change it. */
export function huddleCountIgnoresScreenShare(
  roomParticipantCount: number,
  _sharesOn: number
): number {
  return Math.max(0, Number(roomParticipantCount) || 0);
}

/**
 * Primary presentation when multiple shares exist:
 * earliest firstSeenAt, then identity for stability.
 */
export function pickPrimaryScreenShare<T extends ScreenShareCandidate>(
  shares: T[]
): T | null {
  if (!shares || shares.length === 0) return null;
  return [...shares].sort((a, b) => {
    const t = (a.firstSeenAt || 0) - (b.firstSeenAt || 0);
    if (t !== 0) return t;
    return String(a.identity).localeCompare(String(b.identity));
  })[0];
}

/** Sync first-seen map when shares appear/disappear. */
export function syncScreenShareFirstSeen(
  prev: Map<string, number>,
  activeIdentities: string[],
  now: number = Date.now()
): Map<string, number> {
  const next = new Map<string, number>();
  const active = new Set(activeIdentities.map((id) => String(id || '').trim()).filter(Boolean));
  for (const id of active) {
    next.set(id, prev.get(id) ?? now);
  }
  return next;
}

export function tokenPlanAllowsScreenSharePublish(grant: {
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

export function formatScreenShareLabel(name: string, isLocal: boolean): string {
  if (isLocal) return 'You are sharing';
  const n = String(name || '').trim() || 'Member';
  return `${n} is sharing`;
}

/** LiveKit ScreenShare source string — never treat as Camera. */
export const HUDDLE_SCREEN_SHARE_SOURCE = 'screen_share';

export type ScreenSharePublicationLike = {
  source?: string | null;
  isMuted?: boolean;
  track?: unknown | null;
  trackSid?: string | null;
  kind?: string | null;
  isSubscribed?: boolean;
};

/**
 * Active screen-share publication detection.
 * Uses publication.source === screen_share — NOT track.kind === video.
 * Remote "sharing" state must NOT require pub.track yet (TrackPublished can
 * precede TrackSubscribed / adaptiveStream attach).
 */
/**
 * Ask LiveKit to subscribe every remote screen-share we can see.
 * Late joiners and reconnects often have the publication but isSubscribed=false.
 */
export function subscribeRemoteScreenShares(
  publications: Array<
    ScreenSharePublicationLike & {
      isSubscribed?: boolean;
      setSubscribed?: (subscribed: boolean) => void;
    }
  >
): number {
  let subscribed = 0;
  for (const pub of publications || []) {
    if (!isActiveScreenSharePublication(pub)) continue;
    if (pub.isSubscribed) continue;
    if (typeof pub.setSubscribed !== 'function') continue;
    try {
      pub.setSubscribed(true);
      subscribed += 1;
    } catch {
      /* publication may already be tearing down */
    }
  }
  return subscribed;
}

export function collectRemoteTrackPublications(room: {
  remoteParticipants?: Map<
    string,
    { trackPublications?: Map<string, unknown> }
  > | null;
}): unknown[] {
  const out: unknown[] = [];
  const parts = room?.remoteParticipants;
  if (!parts) return out;
  parts.forEach((p) => {
    p.trackPublications?.forEach((pub) => {
      out.push(pub);
    });
  });
  return out;
}

export function isActiveScreenSharePublication(
  pub: ScreenSharePublicationLike | null | undefined
): boolean {
  if (!pub) return false;
  if (pub.isMuted) return false;
  const source = String(pub.source || '');
  return source === HUDDLE_SCREEN_SHARE_SOURCE || source === 'screenShare';
}

/**
 * Whether a participant currently publishes screen share.
 * Prefer explicit ScreenShare publication; fall back to isScreenShareEnabled.
 * Do not require remote MediaStreamTrack for discovery (late subscribe OK).
 */
export function participantHasScreenShare(opts: {
  isScreenShareEnabled?: boolean;
  screenSharePublication?: ScreenSharePublicationLike | null;
}): boolean {
  if (isActiveScreenSharePublication(opts.screenSharePublication)) return true;
  return Boolean(opts.isScreenShareEnabled);
}

/** Dev-safe publication snapshot (no tokens/secrets). */
export function summarizeTrackPublication(
  identity: string,
  pub: ScreenSharePublicationLike & { isSubscribed?: boolean }
): {
  identity: string;
  trackSid: string;
  kind: string;
  source: string;
  isSubscribed: boolean;
  hasTrack: boolean;
} {
  return {
    identity: String(identity || ''),
    trackSid: String(pub.trackSid || ''),
    kind: String(pub.kind || ''),
    source: String(pub.source || ''),
    isSubscribed: Boolean(pub.isSubscribed),
    hasTrack: Boolean(pub.track),
  };
}

/**
 * Pure late-publish discovery model for smokes:
 * participant already connected → later ScreenShare publish → primaryShare updates.
 */
export type RemoteShareDiscoveryState = {
  connectedIdentities: string[];
  shares: ScreenShareCandidate[];
  primary: ScreenShareCandidate | null;
  presentationActive: boolean;
};

export function createRemoteShareDiscoveryState(
  connectedIdentities: string[]
): RemoteShareDiscoveryState {
  return {
    connectedIdentities: [...connectedIdentities],
    shares: [],
    primary: null,
    presentationActive: false,
  };
}

export function applyRemoteScreenSharePublished(
  state: RemoteShareDiscoveryState,
  participant: { identity: string; name: string },
  now: number = Date.now()
): RemoteShareDiscoveryState {
  const identity = String(participant.identity || '').trim();
  if (!identity) return state;
  if (!state.connectedIdentities.includes(identity)) {
    // Still allow publish discovery if already in room map; keep connected list
  }
  const existing = state.shares.find((s) => s.identity === identity);
  const shares = existing
    ? state.shares
    : [
        ...state.shares,
        {
          identity,
          name: participant.name || 'Member',
          isLocal: false,
          firstSeenAt: now,
        },
      ];
  const primary = pickPrimaryScreenShare(shares);
  return {
    ...state,
    shares,
    primary,
    presentationActive: Boolean(primary),
  };
}

export function applyRemoteScreenShareUnpublished(
  state: RemoteShareDiscoveryState,
  identity: string
): RemoteShareDiscoveryState {
  const id = String(identity || '').trim();
  const shares = state.shares.filter((s) => s.identity !== id);
  const primary = pickPrimaryScreenShare(shares);
  return {
    ...state,
    shares,
    primary,
    presentationActive: Boolean(primary),
  };
}

/**
 * Presentation board when a screen share is active.
 * Mobile: stage on top + horizontal thumbnails.
 * Desktop (md+): CSS grid stage + rail (Safari-safer than % flex + basis).
 * Empty rail: single-column stage expansion (no blank white column).
 */
export function huddlePresentationBoardClass(showRail = true): string {
  const height =
    'min-h-0 h-[min(52dvh,22rem)] sm:h-[min(56dvh,28rem)] md:h-[min(58dvh,32rem)] lg:h-[min(62dvh,36rem)]';
  // Dark board so gaps never render as white divider artifacts on the modal.
  const surface = 'min-w-0 overflow-hidden rounded-2xl bg-[#0b1410]';
  if (!showRail) {
    return `flex flex-col ${height} ${surface}`;
  }
  return `flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(10rem,24%)] gap-2 ${height} ${surface}`;
}

export function huddlePresentationStageWrapClass(_showRail = true): string {
  return 'relative w-full h-full min-w-0 min-h-[12rem] md:min-h-0 overflow-hidden rounded-2xl bg-[#0b1410]';
}

export function huddlePresentationRailClass(): string {
  return 'flex flex-row md:flex-col gap-2 w-full min-w-0 min-h-0 max-h-[30%] md:max-h-none overflow-x-auto md:overflow-x-hidden overflow-y-hidden md:overflow-y-auto p-1 md:p-1 md:h-full md:self-stretch';
}

/** Compact tile sizing: strip on mobile, full-width stack on desktop rail. */
export function huddlePresentationTileClass(): string {
  return 'w-[9.5rem] sm:w-[10.5rem] shrink-0 md:w-full md:min-w-0 md:min-h-[5rem]';
}

/** Whether the participant rail should occupy desktop column space. */
export function shouldShowHuddlePresentationRail(participantCount: number): boolean {
  return Math.max(0, Number(participantCount) || 0) > 0;
}

/* —— Phase 3D presentation fullscreen / focus mode (local UI only) —— */

export type PresentationFocusMode = 'off' | 'native' | 'fallback';

export function presentationFocusButtonLabel(active: boolean): string {
  return active ? 'Exit Full Screen' : 'Full Screen';
}

export function isPresentationFocusActive(mode: PresentationFocusMode): boolean {
  return mode === 'native' || mode === 'fallback';
}

/** Feature-detect Fullscreen API without assuming mobile/WebKit support. */
export function isFullscreenApiAvailable(
  doc: {
    fullscreenEnabled?: boolean;
    documentElement?: { requestFullscreen?: unknown; webkitRequestFullscreen?: unknown } | null;
  } | null | undefined =
    typeof document !== 'undefined' ? document : null
): boolean {
  if (!doc) return false;
  if (doc.fullscreenEnabled === false) return false;
  const el = doc.documentElement;
  if (!el) return false;
  return (
    typeof el.requestFullscreen === 'function' ||
    typeof (el as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen === 'function'
  );
}

export function getFullscreenElement(
  doc: {
    fullscreenElement?: Element | null;
    webkitFullscreenElement?: Element | null;
  } | null | undefined =
    typeof document !== 'undefined' ? (document as any) : null
): Element | null {
  if (!doc) return null;
  return (doc.fullscreenElement || doc.webkitFullscreenElement || null) as Element | null;
}

/**
 * Request browser fullscreen on an element.
 * Returns false when unavailable or rejected — callers should use focus fallback.
 */
export async function requestElementFullscreen(el: HTMLElement | null | undefined): Promise<boolean> {
  if (!el) return false;
  try {
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen();
      return true;
    }
    const webkit = (el as HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> })
      .webkitRequestFullscreen;
    if (typeof webkit === 'function') {
      await Promise.resolve(webkit.call(el));
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Exit browser fullscreen if any element is fullscreen (Escape / share-stop / leave). */
export async function exitDocumentFullscreen(
  doc: {
    fullscreenElement?: Element | null;
    webkitFullscreenElement?: Element | null;
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => void | Promise<void>;
  } | null | undefined =
    typeof document !== 'undefined' ? (document as any) : null
): Promise<void> {
  if (!doc) return;
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) return;
  try {
    if (typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen();
      return;
    }
    if (typeof doc.webkitExitFullscreen === 'function') {
      await Promise.resolve(doc.webkitExitFullscreen());
    }
  } catch {
    /* ignore — state sync still clears via fullscreenchange / React */
  }
}

/**
 * Pure enter decision for smokes / UI:
 * share must be active; native only when API available AND request succeeds.
 */
export function decideEnterPresentationFocus(opts: {
  shareActive: boolean;
  fullscreenAvailable: boolean;
  requestSucceeded: boolean;
}): PresentationFocusMode {
  if (!opts.shareActive) return 'off';
  if (opts.fullscreenAvailable && opts.requestSucceeded) return 'native';
  return 'fallback';
}

/** Share stop / leave / unmount always restores off (local UI only). */
export function nextFocusAfterShareStop(_mode: PresentationFocusMode): PresentationFocusMode {
  return 'off';
}

/** Escape / fullscreenchange when native element left fullscreen. */
export function nextFocusAfterFullscreenChange(opts: {
  wasNative: boolean;
  elementStillFullscreen: boolean;
  current: PresentationFocusMode;
}): PresentationFocusMode {
  if (opts.elementStillFullscreen) return 'native';
  if (opts.wasNative || opts.current === 'native') return 'off';
  return opts.current;
}

/** Maximized presentation board while fullscreen or app focus mode. */
export function huddlePresentationFocusBoardClass(showRail = true): string {
  const surface = 'min-w-0 min-h-0 flex-1 h-full overflow-hidden rounded-none md:rounded-2xl bg-[#0b1410]';
  if (!showRail) {
    return `flex flex-col ${surface}`;
  }
  // Narrow rail / bottom strip so tiles never dominate the stage.
  return `flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(7rem,12rem)] gap-1.5 ${surface}`;
}

export function huddlePresentationFocusStageWrapClass(): string {
  return 'relative w-full h-full min-w-0 min-h-0 flex-1 overflow-hidden bg-[#0b1410]';
}

export function huddlePresentationFocusRailClass(): string {
  return 'flex flex-row md:flex-col gap-1.5 w-full min-w-0 min-h-0 max-h-[22%] md:max-h-none overflow-x-auto md:overflow-x-hidden overflow-y-hidden md:overflow-y-auto p-1 md:h-full md:self-stretch shrink-0';
}

export function huddlePresentationFocusTileClass(): string {
  return 'w-[7.5rem] sm:w-[8.5rem] shrink-0 md:w-full md:min-w-0 md:min-h-[3.75rem]';
}
