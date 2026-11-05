import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Hand,
  Link2,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Radio,
  Share2,
  Smile,
  Users,
  Video,
  VideoOff,
  X,
  WifiOff,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Music,
  MoreVertical,
  Search,
  VolumeX,
} from 'lucide-react';
import {
  ConnectionState,
  LocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from 'livekit-client';
import {
  fetchWithTimeout,
  getAuthHeaders,
  isAbortOrTimeoutError,
  parseApiJson,
  withClientTimeout,
} from '../../lib/api';
import { ensureFreshAuthSession } from '../../lib/authSession';
import { joinDailyAudio, leaveDailyAudio, type DailyRosterPerson } from '../../lib/huddle/daily';
import {
  claimChannelHuddleProvider,
  fetchDailyHuddle,
  joinHuddle as planHuddleJoin,
  registerHuddleLeave,
  rememberLiveKitQuota,
} from '../../lib/huddle';
import { connectLiveKitOnce, isLiveKitQuotaError } from '../../lib/huddle/livekit';
import { useScreenWakeLock } from '../../lib/useScreenWakeLock';
import { useNav } from '../../App';
import HuddleAttendancePanel, {
  canViewHuddleAttendanceUi,
} from './HuddleAttendancePanel';
import {
  HUDDLE_SESSION_KEEPALIVE_MS,
  huddleJoinErrorMessage,
  huddleTokenRefreshDelayMs,
  shouldAutoRejoinHuddle,
} from '../../api/_utils/huddleKeepAlive.js';
import MinutesRecorder from '../Minutes/MinutesRecorder';

/** PLCC doesn't keep meeting minutes, so the huddle hides the Minutes tools. */
const HUDDLE_MINUTES_ENABLED = false;
import {
  loadHuddleMinutesDraft,
  saveHuddleMinutesDraft,
} from '../../api/_utils/minutesRecorder.js';
import {
  buildLowerHandMetadata,
  buildRaiseHandMetadata,
  buildRaisedHandQueue,
  decideLocalHandToggle,
  decideModeratorLowerHand,
  formatHandsRaisedStatus,
  parseHandRaiseMetadata,
  type RaisedHandQueueEntry,
} from '../../api/_utils/voiceHandRaise.js';
import {
  formatCameraPermissionError,
  HUDDLE_CAMERA_CAPTURE,
  HUDDLE_CAMERA_DEFAULT_ON,
} from '../../api/_utils/huddleVideo.js';
import {
  buildHuddlePreviewShareUrl,
  buildHuddleSharePayload,
  canUseNavigatorClipboard,
  canUseNavigatorShare,
  huddleInviteLooksSafe,
} from '../../api/_utils/huddleInvite.js';
import {
  clampHuddleGalleryPage,
  huddleGalleryBreakpointFromWidth,
  huddleGalleryColumnCount,
  huddleGalleryGridClass,
  huddleGalleryPageCount,
  huddleGalleryPageSize,
  shouldUseHuddleGalleryPagination,
  sliceHuddleGalleryPage,
  filterHuddleRosterByName,
} from '../../api/_utils/huddleGallery.js';
import {
  emptyHuddleRoomRoles,
  huddleModeratorCount,
  isHuddleSessionModerator,
  MAX_HUDDLE_MODERATORS,
  parseHuddleModFromParticipantMetadata,
  parseHuddleRoomRoles,
  pickFeaturedHuddleIdentity,
  splitFeaturedHuddleRoster,
  type HuddleRoomRoles,
} from '../../api/_utils/huddleModeration.js';
import {
  appendHuddleChatMessage,
  buildHuddleChatWirePayload,
  canLocallyDismissHuddleChatMessage,
  clearHuddleChatUnread,
  copyDataPayloadBytes,
  createHuddleChatId,
  encodeHuddleChatPayload,
  formatHuddleChatTime,
  HUDDLE_CHAT_DEFAULT_OPEN,
  HUDDLE_CHAT_MAX_LENGTH,
  HUDDLE_CHAT_TOPIC,
  hydrateHuddleChatMessage,
  nextHuddleChatUnread,
  peekDataPacketType,
  removeHuddleChatMessageLocal,
  routeHuddleDataPacket,
  shouldAutoScrollHuddleChat,
  validateHuddleChatText,
  type HuddleChatMessage,
} from '../../api/_utils/huddleChat.js';
import {
  appendHuddleReactionEvent,
  buildHuddleReactionWirePayload,
  clearHuddleReactions,
  createHuddleReactionId,
  encodeHuddleReactionPayload,
  expireHuddleReactions,
  parseHuddleReactionWirePayload,
  HUDDLE_REACTION_COOLDOWN_MS,
  HUDDLE_REACTION_OPTIONS,
  HUDDLE_REACTION_TOPIC,
  HUDDLE_REACTION_TTL_MS,
  hydrateHuddleReactionEvent,
  shouldAllowHuddleReactionSend,
  type HuddleReactionEvent,
  type HuddleReactionKey,
} from '../../api/_utils/huddleReaction.js';
import {
  buildScreenShareCaptureOptions,
  decideEnterPresentationFocus,
  exitDocumentFullscreen,
  formatScreenShareError,
  formatScreenShareLabel,
  getFullscreenElement,
  HUDDLE_SCREEN_SHARE_DEFAULT_ON,
  huddleLocalScreenShareUsesPlaceholder,
  huddlePresentationBoardClass,
  huddlePresentationFocusBoardClass,
  huddlePresentationFocusRailClass,
  huddlePresentationFocusStageWrapClass,
  huddlePresentationFocusTileClass,
  huddlePresentationRailClass,
  huddlePresentationStageWrapClass,
  huddlePresentationTileClass,
  isFullscreenApiAvailable,
  isPresentationFocusActive,
  isScreenShareSupported,
  nextFocusAfterFullscreenChange,
  nextFocusAfterShareStop,
  participantHasScreenShare,
  pickPrimaryScreenShare,
  presentationFocusButtonLabel,
  requestElementFullscreen,
  screenShareUnsupportedHint,
  collectRemoteTrackPublications,
  subscribeRemoteScreenShares,
  shouldShowHuddlePresentationRail,
  summarizeTrackPublication,
  syncScreenShareFirstSeen,
  type PresentationFocusMode,
  type ScreenShareCandidate,
} from '../../api/_utils/huddleScreenShare.js';
import {
  canControlHuddleMusic,
  formatHuddleMusicError,
  HUDDLE_MUSIC_ASSET_PATH,
  HUDDLE_MUSIC_DEFAULT_VOLUME,
  HUDDLE_MUSIC_TRACK_NAME,
  huddleMusicButtonLabel,
  huddleRemoteAudioAttachKey,
  isHuddleMusicPublication,
  roomHasHuddleMusic,
} from '../../api/_utils/huddleMusic.js';

type VoiceHuddleProps = {
  isOpen: boolean;
  channelId: string;
  channelName: string;
  /** Phase 3G.1: invite deep-link opened pre-join (still requires JOIN HUDDLE). */
  openedFromInvite?: boolean;
  onClose: () => void;
  /** Direct Access video starts with the camera. A phone call stays on audio. */
  startWithCamera?: boolean;
  onPresenceChange?: (presence: {
    channelId: string;
    active: boolean;
    participantCount: number;
    connected: boolean;
  }) => void;
  /** Show inside a panel (Intercessors Prayer Watch) instead of a full-screen pop-up. */
  embedded?: boolean;
  /** Voice only: no camera or screen-share buttons (Intercessors' prayer calls). */
  audioOnly?: boolean;
  /** Prayer Watch: a simple prayer call — no Minutes, Attendance, Music, React or Hand. */
  prayerWatch?: boolean;
};

type ConnUi =
  | 'idle'
  | 'checking'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'ended';

function dailyPeopleToRoster(people: DailyRosterPerson[]): RosterRow[] {
  return people.map((person) => ({
    identity: person.identity,
    name: person.name,
    isLocal: person.isLocal,
    isSpeaking: person.isSpeaking,
    isMuted: person.isMuted,
    cameraOn: person.cameraOn,
    videoTrack: person.videoTrack,
    screenSharing: false,
    handRaised: false,
    raisedAt: null,
    isHost: false,
    isModerator: false,
  }));
}

type DailyHandState = { handRaised: boolean; raisedAt: number | null };

function applyDailyHands(rows: RosterRow[], hands: Map<string, DailyHandState>): RosterRow[] {
  return rows.map((row) => {
    const hand = hands.get(row.identity);
    if (!hand?.handRaised || hand.raisedAt == null) {
      return { ...row, handRaised: false, raisedAt: null };
    }
    return { ...row, handRaised: true, raisedAt: hand.raisedAt };
  });
}

function queueFromRoster(rows: RosterRow[]): RaisedHandQueueEntry[] {
  return rows
    .filter((row) => row.handRaised && row.raisedAt != null)
    .map((row) => ({
      identity: row.identity,
      name: row.name,
      raisedAt: row.raisedAt as number,
    }))
    .sort((a, b) => a.raisedAt - b.raisedAt || a.identity.localeCompare(b.identity))
    .map((row, index) => ({ ...row, position: index + 1 }));
}

function isDailyHandMessage(data: unknown): data is {
  type: 'awc.huddle.hand';
  identity: string;
  raised: boolean;
  raisedAt: number | null;
} {
  if (!data || typeof data !== 'object') return false;
  const row = data as { type?: string; identity?: string };
  return row.type === 'awc.huddle.hand' && Boolean(String(row.identity || '').trim());
}

type RosterRow = {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  cameraOn: boolean;
  videoTrack?: MediaStreamTrack | null;
  screenSharing: boolean;
  handRaised: boolean;
  raisedAt: number | null;
  isHost: boolean;
  isModerator: boolean;
};

function huddleFallbackStorageKey(channelId: string): string {
  return `awc_huddle_fallback_${channelId}`;
}

function saveHuddleFallbackPass(channelId: string, pass: unknown) {
  const value = String(pass || '').trim();
  if (!channelId || !value) return;
  try {
    localStorage.setItem(huddleFallbackStorageKey(channelId), value);
  } catch {
    /* private browsing */
  }
}

function readHuddleFallbackPass(channelId: string): string {
  if (!channelId) return '';
  try {
    return localStorage.getItem(huddleFallbackStorageKey(channelId)) || '';
  } catch {
    return '';
  }
}

function friendlyError(err: unknown): string {
  const msg = String((err as any)?.message || err || '');
  const lower = msg.toLowerCase();
  if (lower.includes('permission') || lower.includes('notallowed') || lower.includes('denied')) {
    return 'Microphone access was denied. Enable the mic in your browser settings and try again.';
  }
  if (lower.includes('401') || lower.includes('sign-in expired') || lower.includes('please sign in')) {
    return huddleJoinErrorMessage(401);
  }
  if (lower.includes('unauthorized') || lower.includes('403') || lower.includes('forbidden')) {
    return huddleJoinErrorMessage(403);
  }
  if (lower.includes('not configured') || lower.includes('503')) {
    return 'Huddles are not configured yet. Ask an admin to set LiveKit keys.';
  }
  if (lower.includes('network') || lower.includes('websocket') || lower.includes('disconnect')) {
    return 'Network issue. Check your connection and try rejoining.';
  }
  if (lower.includes('abort') || lower.includes('timed out') || lower.includes('timeout')) {
    return 'That request timed out. Check your connection and try again.';
  }
  return msg || 'Could not connect to the huddle.';
}

function initialFromName(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

function huddleScreenShareDebug(...args: unknown[]) {
  try {
    // Vite / bundler DEV only — never log tokens.
    if (!(import.meta as any)?.env?.DEV) return;
  } catch {
    return;
  }
  // eslint-disable-next-line no-console
  console.info('[HuddleScreenShare]', ...args);
}

function huddleChatDebug(...args: unknown[]) {
  try {
    if (!(import.meta as any)?.env?.DEV) return;
  } catch {
    return;
  }
  // eslint-disable-next-line no-console
  console.info('[HuddleChat]', ...args);
}

function remoteParticipantHasScreenShare(p: RemoteParticipant): boolean {
  const pub = p.getTrackPublication(Track.Source.ScreenShare);
  return participantHasScreenShare({
    isScreenShareEnabled: p.isScreenShareEnabled,
    screenSharePublication: pub
      ? {
          source: pub.source,
          isMuted: pub.isMuted,
          track: pub.track,
          trackSid: pub.trackSid,
          kind: pub.kind,
          isSubscribed: pub.isSubscribed,
        }
      : null,
  });
}

function localParticipantHasScreenShare(local: {
  isScreenShareEnabled: boolean;
  getTrackPublication: (s: Track.Source) => TrackPublication | undefined;
}): boolean {
  const pub = local.getTrackPublication(Track.Source.ScreenShare);
  return participantHasScreenShare({
    isScreenShareEnabled: local.isScreenShareEnabled,
    screenSharePublication: pub
      ? {
          source: pub.source,
          isMuted: pub.isMuted,
          track: pub.track,
          trackSid: pub.trackSid,
          kind: pub.kind,
          isSubscribed: true,
        }
      : null,
  });
}

function logRemotePublications(room: Room) {
  room.remoteParticipants.forEach((p) => {
    p.trackPublications.forEach((pub) => {
      huddleScreenShareDebug(
        'remote publications',
        summarizeTrackPublication(p.identity, {
          source: pub.source,
          isMuted: pub.isMuted,
          track: pub.track,
          trackSid: pub.trackSid,
          kind: pub.kind,
          isSubscribed: pub.isSubscribed,
        })
      );
    });
  });
}

/** Camera tile — local mirrored; remotes not mirrored. Separate from screen share. */
const HuddleTile: React.FC<{
  row: RosterRow;
  room: Room | null;
  compact?: boolean;
  focusCompact?: boolean;
  featured?: boolean;
  showModBadge?: boolean;
  showHostBadge?: boolean;
  canModerateMute?: boolean;
  canManageMods?: boolean;
  /** False once the huddle has the most moderators allowed. */
  canAddMod?: boolean;
  onMuteRemote?: (identity: string, muted: boolean) => void;
  onAddMod?: (identity: string, name: string) => void;
  onPassMod?: (identity: string, name: string) => void;
}> = ({
  row,
  room,
  compact,
  focusCompact,
  featured,
  showModBadge,
  showHostBadge,
  canModerateMute,
  canManageMods,
  canAddMod = true,
  onMuteRemote,
  onAddMod,
  onPassMod,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (row.videoTrack && row.cameraOn) {
      el.srcObject = new MediaStream([row.videoTrack]);
      void el.play().catch(() => {});
      return () => {
        el.srcObject = null;
      };
    }
    if (!room) {
      el.srcObject = null;
      return undefined;
    }

    let track: LocalTrack | RemoteTrack | null = null;
    if (row.isLocal) {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      track = (pub?.track as LocalTrack | undefined) || null;
    } else {
      const p = room.remoteParticipants.get(row.identity);
      const pub = p?.getTrackPublication(Track.Source.Camera);
      track = (pub?.track as RemoteTrack | undefined) || null;
    }

    if (track && row.cameraOn) {
      track.attach(el);
      return () => {
        try {
          track?.detach(el);
        } catch {
          /* ignore */
        }
      };
    }
    el.srcObject = null;
    return undefined;
  }, [room, row.identity, row.isLocal, row.cameraOn, row.videoTrack]);

  const showAddMod =
    canManageMods && canAddMod && !row.isLocal && !row.isModerator && Boolean(onAddMod);
  const showPassMod =
    canManageMods && !row.isLocal && !row.isHost && (row.isModerator || canAddMod) && Boolean(onPassMod);
  const showMuteControl = Boolean(canModerateMute && !row.isLocal && onMuteRemote);

  // Gallery: small tidy squares, like the phone huddle. Moderator tools sit behind one button.
  if (!featured && !compact) {
    return (
      <div
        className={`relative aspect-square rounded-xl overflow-hidden border bg-[#0c110f] ${
          row.isSpeaking ? 'border-gold ring-2 ring-gold/50' : 'border-white/10'
        }`}
        data-huddle-tile="gallery"
        data-huddle-host={row.isHost ? 'true' : undefined}
        data-huddle-mod={row.isModerator ? 'true' : undefined}
      >
        {row.cameraOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={row.isLocal}
            className={`absolute inset-0 w-full h-full object-cover ${row.isLocal ? 'scale-x-[-1]' : ''}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-burgundy to-[#101814]">
            <span
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm sm:text-base font-black ${
                row.isSpeaking ? 'bg-gold text-burgundy' : 'bg-gold-cream/20 text-gold border border-gold/30'
              }`}
              aria-hidden
            >
              {initialFromName(row.name)}
            </span>
          </div>
        )}

        {showHostBadge || showModBadge ? (
          <span
            className={`absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
              showHostBadge ? 'bg-gold text-burgundy' : 'bg-burgundy/85 text-gold'
            }`}
          >
            <ShieldCheck size={9} aria-hidden /> {showHostBadge ? 'Host' : 'Mod'}
          </span>
        ) : null}

        {showMuteControl || showAddMod || showPassMod ? (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="absolute top-1 right-1 z-10 w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            aria-label={`Moderator options for ${row.name}`}
            data-huddle-tile-menu="true"
          >
            <MoreVertical size={14} aria-hidden />
          </button>
        ) : row.handRaised ? (
          <span className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-gold text-burgundy flex items-center justify-center" aria-label="Hand raised">
            <Hand size={14} aria-hidden />
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 z-10 px-1.5 pb-1.5 pt-4 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-[11px] leading-tight font-bold text-white line-clamp-2 break-words" title={row.name}>
            {row.name}
            {row.isLocal && row.name !== 'You' ? ' (you)' : ''}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {row.isMuted ? (
              <MicOff size={11} className="shrink-0 text-red-300" aria-label="Muted" />
            ) : (
              <Mic size={11} className={`shrink-0 ${row.isSpeaking ? 'text-gold' : 'text-white/80'}`} aria-label="Mic on" />
            )}
            {row.handRaised ? <Hand size={11} className="shrink-0 text-gold" aria-label="Hand raised" /> : null}
          </div>
        </div>

        {menuOpen ? (
          <div
            className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm p-1.5 flex flex-col justify-center gap-1"
            role="menu"
            aria-label={`Options for ${row.name}`}
          >
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full text-white/70 hover:text-white flex items-center justify-center"
              aria-label="Close options"
            >
              <X size={13} aria-hidden />
            </button>
            <p className="px-1 pr-6 text-[10px] font-bold text-white/70 truncate">{row.name}</p>
            {showMuteControl ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onMuteRemote?.(row.identity, !row.isMuted);
                }}
                className={`h-7 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1 ${
                  row.isMuted ? 'bg-white text-[#0d1a14]' : 'bg-red-500 text-white'
                }`}
                aria-label={row.isMuted ? `Unmute ${row.name}` : `Mute ${row.name}`}
              >
                {row.isMuted ? <Mic size={11} aria-hidden /> : <MicOff size={11} aria-hidden />}
                {row.isMuted ? 'Unmute' : 'Mute'}
              </button>
            ) : null}
            {showAddMod ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onAddMod?.(row.identity, row.name);
                }}
                className="h-7 rounded-lg bg-gold text-burgundy text-[9px] font-black uppercase tracking-widest"
                aria-label={`Add ${row.name} as Mod`}
                data-huddle-mod-action="add"
              >
                Make Mod
              </button>
            ) : null}
            {showPassMod ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onPassMod?.(row.identity, row.name);
                }}
                className="h-7 rounded-lg bg-white/15 text-white text-[9px] font-black uppercase tracking-widest"
                aria-label={`Pass Host to ${row.name}`}
                data-huddle-mod-action="pass"
              >
                Make Host
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border bg-[#0c110f] ${
        featured ? 'aspect-video sm:aspect-[21/9] min-h-[180px] sm:min-h-[220px]' : 'aspect-video'
      } ${
        compact
          ? focusCompact
            ? huddlePresentationFocusTileClass()
            : huddlePresentationTileClass()
          : ''
      } ${
        row.isSpeaking
          ? 'border-gold ring-2 ring-gold/50 shadow-[0_0_0_1px_rgba(201, 163, 90,0.35)]'
          : 'border-white/10'
      }`}
      data-huddle-tile={featured ? 'featured' : compact ? 'rail' : 'gallery'}
      data-huddle-host={row.isHost ? 'true' : undefined}
      data-huddle-mod={row.isModerator ? 'true' : undefined}
    >
      {row.cameraOn ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={row.isLocal}
          className={`absolute inset-0 w-full h-full object-cover ${
            row.isLocal ? 'scale-x-[-1]' : ''
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-burgundy to-[#101814]">
          <div
            className={`rounded-2xl flex items-center justify-center font-black ${
              featured
                ? 'w-16 h-16 sm:w-20 sm:h-20 text-xl sm:text-2xl'
                : compact
                  ? 'w-10 h-10 text-sm'
                  : 'w-14 h-14 sm:w-16 sm:h-16 text-lg sm:text-xl'
            } ${
              row.isSpeaking ? 'bg-gold text-burgundy' : 'bg-gold-cream/20 text-gold border border-gold/30'
            }`}
            aria-hidden
          >
            {initialFromName(row.name)}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-2 sm:p-2.5 bg-gradient-to-t from-black/75 via-black/40 to-transparent">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] sm:text-[12px] font-bold text-white truncate">
                {row.name}
                {row.isLocal && row.name !== 'You' ? ' (you)' : ''}
              </span>
              {showHostBadge ? (
                <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-burgundy bg-gold px-1.5 py-0.5 rounded">
                  Host
                </span>
              ) : null}
              {showModBadge ? (
                <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-gold bg-burgundy/80 px-1.5 py-0.5 rounded">
                  <ShieldCheck size={10} aria-hidden /> Mod
                </span>
              ) : null}
              {row.handRaised ? (
                <span className="text-[8px] font-black uppercase tracking-widest text-burgundy bg-gold px-1.5 py-0.5 rounded">
                  ✋ Hand
                </span>
              ) : null}
              {row.screenSharing ? (
                <span className="text-[8px] font-black uppercase tracking-widest text-white bg-burgundy/90 px-1.5 py-0.5 rounded border border-gold/40">
                  Sharing
                </span>
              ) : null}
            </div>
            <div className="text-[9px] font-semibold text-white/70 uppercase tracking-wider mt-0.5">
              {row.isMuted ? 'Muted' : row.isSpeaking ? 'Speaking' : 'Listening'}
              {!row.cameraOn ? ' · Camera off' : ' · Camera'}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {row.isMuted ? (
              <span className="w-7 h-7 rounded-lg bg-red-500/90 text-white flex items-center justify-center" title="Muted">
                <MicOff size={12} aria-hidden />
              </span>
            ) : null}
            {!row.cameraOn ? (
              <span className="w-7 h-7 rounded-lg bg-black/50 text-white/80 flex items-center justify-center" title="Camera off">
                <VideoOff size={12} aria-hidden />
              </span>
            ) : null}
            {canModerateMute && !row.isLocal && onMuteRemote ? (
              <button
                type="button"
                onClick={() => onMuteRemote(row.identity, !row.isMuted)}
                className="text-[8px] font-black uppercase tracking-widest px-1.5 py-1 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                aria-label={row.isMuted ? `Unmute ${row.name}` : `Mute ${row.name}`}
              >
                {row.isMuted ? 'Unmute' : 'Mute'}
              </button>
            ) : null}
            {showAddMod ? (
              <button
                type="button"
                onClick={() => onAddMod?.(row.identity, row.name)}
                className="text-[8px] font-black uppercase tracking-widest px-1.5 py-1 rounded-lg bg-gold/90 text-burgundy hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                aria-label={`Add ${row.name} as Mod`}
                data-huddle-mod-action="add"
              >
                Add Mod
              </button>
            ) : null}
            {showPassMod ? (
              <button
                type="button"
                onClick={() => onPassMod?.(row.identity, row.name)}
                className="text-[8px] font-black uppercase tracking-widest px-1.5 py-1 rounded-lg bg-white/15 text-white hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                aria-label={`Pass Host to ${row.name}`}
                data-huddle-mod-action="pass"
              >
                Pass Mod
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Primary screen-share stage — never mirrored. Distinct from camera tiles. */
const ScreenShareStage: React.FC<{
  room: Room;
  share: ScreenShareCandidate;
}> = ({ room, share }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [attachTick, setAttachTick] = useState(0);
  const usePlaceholder = huddleLocalScreenShareUsesPlaceholder(share.isLocal);

  useEffect(() => {
    if (usePlaceholder) return;
    const el = videoRef.current;
    if (!el) return;

    let track: LocalTrack | RemoteTrack | null = null;
    const p = room.remoteParticipants.get(share.identity);
    const pub = p?.getTrackPublication(Track.Source.ScreenShare) as RemoteTrackPublication | undefined;
    track = (pub?.track as RemoteTrack | undefined) || null;
    // Ensure desire to subscribe if publication exists but track not yet present.
    if (pub && !pub.isSubscribed) {
      try {
        pub.setSubscribed(true);
      } catch {
        /* ignore */
      }
    }

    if (track) {
      track.attach(el);
      return () => {
        try {
          track?.detach(el);
        } catch {
          /* ignore */
        }
      };
    }
    el.srcObject = null;
    return undefined;
  }, [room, share.identity, share.isLocal, attachTick, usePlaceholder]);

  // Late TrackSubscribed (adaptiveStream / post-TrackPublished) must re-attach.
  useEffect(() => {
    if (share.isLocal) return;
    const onSubscribed = (
      _track: RemoteTrack,
      pub: TrackPublication,
      participant: RemoteParticipant
    ) => {
      if (participant.identity !== share.identity) return;
      if (pub.source !== Track.Source.ScreenShare) return;
      huddleScreenShareDebug('TrackSubscribed', {
        identity: participant.identity,
        source: pub.source,
        trackSid: pub.trackSid,
      });
      setAttachTick((n) => n + 1);
    };
    const onUnsubscribed = (
      _track: RemoteTrack,
      pub: TrackPublication,
      participant: RemoteParticipant
    ) => {
      if (participant.identity !== share.identity) return;
      if (pub.source !== Track.Source.ScreenShare) return;
      huddleScreenShareDebug('TrackUnsubscribed', {
        identity: participant.identity,
        source: pub.source,
        trackSid: pub.trackSid,
      });
      setAttachTick((n) => n + 1);
    };
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    };
  }, [room, share.identity, share.isLocal]);

  return (
    <div className="relative w-full h-full min-h-[12rem] overflow-hidden bg-[#0b1410]">
      {usePlaceholder ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-[#0c110f]"
          data-huddle-local-share-placeholder="true"
        >
          <MonitorOff size={40} className="text-gold" aria-hidden />
          <p className="text-lg sm:text-xl font-black text-gold">You are sharing your screen</p>
          <p className="text-sm text-white/70 max-w-md">
            Everyone else can see it. Share a window or slides — not this huddle — so it does not loop.
          </p>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain bg-[#0b1410]"
        />
      )}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2 pointer-events-none z-[1]">
        <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-burgundy bg-gold px-2 py-1 rounded-lg">
          <Monitor size={12} aria-hidden /> Screen share
        </span>
        <span className="text-[11px] sm:text-[12px] font-bold text-white bg-black/55 px-2.5 py-1 rounded-lg truncate max-w-[60%]">
          {formatScreenShareLabel(share.name, share.isLocal)}
        </span>
      </div>
    </div>
  );
};

const VoiceHuddle: React.FC<VoiceHuddleProps> = ({
  isOpen,
  channelId,
  channelName,
  openedFromInvite = false,
  onClose,
  startWithCamera = false,
  onPresenceChange,
  embedded = false,
  audioOnly = false,
  prayerWatch = false,
}) => {
  const { userRole } = useNav();
  const canViewAttendance = canViewHuddleAttendanceUi(userRole);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [handsPanelOpen, setHandsPanelOpen] = useState(false);
  const [conn, setConn] = useState<ConnUi>('idle');
  const [activeProvider, setActiveProvider] = useState<'livekit' | 'daily' | null>(null);
  const [needsRejoin, setNeedsRejoin] = useState(false);
  const [phoneLayout, setPhoneLayout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicActive, setMusicActive] = useState(false);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(HUDDLE_MUSIC_DEFAULT_VOLUME);
  const [huddleActive, setHuddleActive] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(HUDDLE_CAMERA_DEFAULT_ON);
  const [screenSharing, setScreenSharing] = useState(HUDDLE_SCREEN_SHARE_DEFAULT_ON);
  const [canModerate, setCanModerate] = useState(false);
  const [roomRoles, setRoomRoles] = useState<HuddleRoomRoles>(() => emptyHuddleRoomRoles());
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [modActionBusy, setModActionBusy] = useState(false);
  const [raisedQueue, setRaisedQueue] = useState<RaisedHandQueueEntry[]>([]);
  const [primaryShare, setPrimaryShare] = useState<ScreenShareCandidate | null>(null);
  const [ending, setEnding] = useState(false);
  const [minutesPanelOpen, setMinutesPanelOpen] = useState(false);
  const [minutesRecorderError, setMinutesRecorderError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [handBusy, setHandBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [screenShareSupported, setScreenShareSupported] = useState(() =>
    isScreenShareSupported()
  );
  const screenShareBlockedHint = screenShareUnsupportedHint();
  const [presentationFocus, setPresentationFocus] = useState<PresentationFocusMode>('off');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(HUDDLE_CHAT_DEFAULT_OPEN);
  const [chatMessages, setChatMessages] = useState<HuddleChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatUnread, setChatUnread] = useState(0);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatSendError, setChatSendError] = useState<string | null>(null);
  const [chatPinnedToBottom, setChatPinnedToBottom] = useState(true);
  const [chatNewBelow, setChatNewBelow] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [activeReactions, setActiveReactions] = useState<HuddleReactionEvent[]>([]);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [lastReactionSentAt, setLastReactionSentAt] = useState<number | null>(null);
  const [galleryPage, setGalleryPage] = useState(1);
  const [gallerySearch, setGallerySearch] = useState('');
  const [muteAllBusy, setMuteAllBusy] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [shareSupported] = useState(() => canUseNavigatorShare());

  const roomRef = useRef<Room | null>(null);
  const dailyCallRef = useRef<Awaited<ReturnType<typeof joinDailyAudio>> | null>(null);
  const dailyHandsRef = useRef<Map<string, DailyHandState>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicTrackRef = useRef<LocalAudioTrack | null>(null);
  /** Web Audio graph for music (iPhone Safari has no captureStream). */
  const musicCtxRef = useRef<AudioContext | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const screenShareSeenRef = useRef<Map<string, number>>(new Map());
  const screenShareEndedUnsubRef = useRef<(() => void) | null>(null);
  const presentationFocusRootRef = useRef<HTMLDivElement | null>(null);
  const presentationFocusModeRef = useRef<PresentationFocusMode>('off');
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatOpenRef = useRef(HUDDLE_CHAT_DEFAULT_OPEN);
  const chatPinnedRef = useRef(true);
  const canModerateRef = useRef(false);
  const roomRolesRef = useRef<HuddleRoomRoles>(emptyHuddleRoomRoles());
  const channelCanModerateRef = useRef(false);
  const ingestChatMessageRef = useRef<(msg: HuddleChatMessage) => void>(() => {});
  const ingestReactionRef = useRef<(rxn: HuddleReactionEvent) => void>(() => {});
  const reactionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const refreshRosterRef = useRef<(room: Room) => void>(() => {});
  const mountedRef = useRef(true);
  const joinInFlightRef = useRef(false);
  const joinHuddleRef = useRef<() => Promise<void>>(async () => {});
  const stayInHuddleRef = useRef(false);
  const userLeftRef = useRef(false);
  const endedForEveryoneRef = useRef(false);
  const keepAliveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRejoinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectRoomRef = useRef<() => Promise<void>>(async () => {});
  const onPresenceChangeRef = useRef(onPresenceChange);
  useEffect(() => {
    onPresenceChangeRef.current = onPresenceChange;
  }, [onPresenceChange]);

  const clearScreenShareEndedListener = useCallback(() => {
    try {
      screenShareEndedUnsubRef.current?.();
    } catch {
      /* ignore */
    }
    screenShareEndedUnsubRef.current = null;
  }, []);

  const exitPresentationFocus = useCallback(async () => {
    presentationFocusModeRef.current = 'off';
    setPresentationFocus('off');
    setRailCollapsed(false);
    await exitDocumentFullscreen();
  }, []);

  const enterPresentationFocus = useCallback(async () => {
    if (!primaryShare) return;
    const el = presentationFocusRootRef.current;
    const available = isFullscreenApiAvailable();
    let requestSucceeded = false;
    if (available && el) {
      requestSucceeded = await requestElementFullscreen(el);
    }
    const next = decideEnterPresentationFocus({
      shareActive: true,
      fullscreenAvailable: available,
      requestSucceeded,
    });
    presentationFocusModeRef.current = next;
    setPresentationFocus(next);
  }, [primaryShare]);

  const togglePresentationFocus = useCallback(async () => {
    if (isPresentationFocusActive(presentationFocusModeRef.current)) {
      await exitPresentationFocus();
      return;
    }
    await enterPresentationFocus();
  }, [enterPresentationFocus, exitPresentationFocus]);

  // Keep React state synced with Escape / browser fullscreenchange.
  useEffect(() => {
    const onFsChange = () => {
      const root = presentationFocusRootRef.current;
      const fsEl = getFullscreenElement();
      const still = Boolean(root && fsEl && fsEl === root);
      const next = nextFocusAfterFullscreenChange({
        wasNative: presentationFocusModeRef.current === 'native',
        elementStillFullscreen: still,
        current: presentationFocusModeRef.current,
      });
      presentationFocusModeRef.current = next;
      setPresentationFocus(next);
      if (next === 'off') setRailCollapsed(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange as EventListener);
    };
  }, []);

  // Share stop → exit fullscreen/focus; restore normal grid (no stale black canvas).
  useEffect(() => {
    if (primaryShare) return;
    if (!isPresentationFocusActive(presentationFocusModeRef.current)) return;
    const cleared = nextFocusAfterShareStop(presentationFocusModeRef.current);
    presentationFocusModeRef.current = cleared;
    setPresentationFocus(cleared);
    setRailCollapsed(false);
    void exitDocumentFullscreen();
  }, [primaryShare]);

  useEffect(() => {
    presentationFocusModeRef.current = presentationFocus;
  }, [presentationFocus]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    chatPinnedRef.current = chatPinnedToBottom;
  }, [chatPinnedToBottom]);

  useEffect(() => {
    canModerateRef.current = canModerate;
  }, [canModerate]);

  useEffect(() => {
    roomRolesRef.current = roomRoles;
  }, [roomRoles]);

  const resetHuddleChatState = useCallback(() => {
    setChatOpen(HUDDLE_CHAT_DEFAULT_OPEN);
    chatOpenRef.current = HUDDLE_CHAT_DEFAULT_OPEN;
    setChatMessages([]);
    setChatDraft('');
    setChatUnread(0);
    setChatBusy(false);
    setChatSendError(null);
    setChatPinnedToBottom(true);
    chatPinnedRef.current = true;
    setChatNewBelow(false);
    setHandsPanelOpen(false);
  }, []);

  const clearReactionTimers = useCallback(() => {
    reactionTimersRef.current.forEach((t) => {
      try {
        clearTimeout(t);
      } catch {
        /* ignore */
      }
    });
    reactionTimersRef.current.clear();
  }, []);

  const resetHuddleReactionState = useCallback(() => {
    clearReactionTimers();
    setActiveReactions(clearHuddleReactions());
    setReactionPickerOpen(false);
    setReactionBusy(false);
    setReactionError(null);
    setLastReactionSentAt(null);
  }, [clearReactionTimers]);

  const scheduleReactionExpiry = useCallback((rxn: HuddleReactionEvent) => {
    const existing = reactionTimersRef.current.get(rxn.id);
    if (existing) {
      try {
        clearTimeout(existing);
      } catch {
        /* ignore */
      }
    }
    const delay = Math.max(0, rxn.expiresAt - Date.now());
    const timer = setTimeout(() => {
      reactionTimersRef.current.delete(rxn.id);
      setActiveReactions((prev) => expireHuddleReactions(prev, Date.now()));
    }, delay || HUDDLE_REACTION_TTL_MS);
    reactionTimersRef.current.set(rxn.id, timer);
  }, []);

  const ingestReaction = useCallback(
    (rxn: HuddleReactionEvent) => {
      setActiveReactions((prev) => {
        const next = appendHuddleReactionEvent(prev, rxn);
        return next;
      });
      scheduleReactionExpiry(rxn);
    },
    [scheduleReactionExpiry]
  );

  useEffect(() => {
    ingestReactionRef.current = ingestReaction;
  }, [ingestReaction]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const bp = huddleGalleryBreakpointFromWidth(viewportWidth);
    const size = huddleGalleryPageSize(bp);
    const stripCount = roster.length;
    const pages = huddleGalleryPageCount(stripCount, size);
    setGalleryPage((prev) => clampHuddleGalleryPage(prev, pages));
  }, [roster.length, viewportWidth]);

  const scrollPanelIntoView = useCallback((selector: string) => {
    requestAnimationFrame(() => {
      try {
        document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch {
        /* ignore */
      }
    });
  }, []);

  const openAttendancePanel = useCallback(() => {
    if (viewportWidth < 640) {
      setChatOpen(false);
      chatOpenRef.current = false;
      setHandsPanelOpen(false);
    }
    setAttendanceOpen(true);
    scrollPanelIntoView('[data-huddle-attendance-dock]');
  }, [viewportWidth, scrollPanelIntoView]);

  const closeAttendancePanel = useCallback(() => {
    setAttendanceOpen(false);
  }, []);

  const toggleAttendancePanel = useCallback(() => {
    if (attendanceOpen) closeAttendancePanel();
    else openAttendancePanel();
  }, [attendanceOpen, closeAttendancePanel, openAttendancePanel]);

  const openHuddleChat = useCallback(() => {
    if (viewportWidth < 640) {
      setAttendanceOpen(false);
    }
    setHandsPanelOpen(false);
    setChatOpen(true);
    chatOpenRef.current = true;
    setChatUnread(clearHuddleChatUnread());
    setChatNewBelow(false);
    // Mobile: panel used to open below the fold and look like Chat "did nothing".
    scrollPanelIntoView('[data-huddle-chat-panel]');
  }, [viewportWidth, scrollPanelIntoView]);

  const closeHuddleChat = useCallback(() => {
    setChatOpen(false);
    chatOpenRef.current = false;
  }, []);

  const toggleHuddleChat = useCallback(() => {
    if (chatOpenRef.current) closeHuddleChat();
    else openHuddleChat();
  }, [closeHuddleChat, openHuddleChat]);

  const openHandsPanel = useCallback(() => {
    if (viewportWidth < 640) {
      setAttendanceOpen(false);
    }
    setChatOpen(false);
    chatOpenRef.current = false;
    setHandsPanelOpen(true);
    scrollPanelIntoView('[data-huddle-hands-panel]');
  }, [viewportWidth, scrollPanelIntoView]);

  const closeHandsPanel = useCallback(() => {
    setHandsPanelOpen(false);
  }, []);

  const toggleHandsPanel = useCallback(() => {
    if (handsPanelOpen) closeHandsPanel();
    else openHandsPanel();
  }, [handsPanelOpen, closeHandsPanel, openHandsPanel]);

  const clearAttachedAudio = useCallback(() => {
    audioElsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
      } catch {
        /* ignore */
      }
    });
    audioElsRef.current.clear();
  }, []);

  const detachRemoteAudioByKey = useCallback((key: string) => {
    const el = audioElsRef.current.get(key);
    if (!el) return;
    try {
      el.pause();
      el.srcObject = null;
    } catch {
      /* ignore */
    }
    audioElsRef.current.delete(key);
  }, []);

  const attachRemoteAudio = useCallback(
    (identity: string, track: RemoteTrack, trackSid?: string | null) => {
      if (track.kind !== Track.Kind.Audio) return;
      // Local publisher already hears via HTMLAudioElement — avoid double playback.
      const room = roomRef.current;
      if (room && identity === room.localParticipant.identity) return;
      const key = huddleRemoteAudioAttachKey(identity, trackSid || track.sid);
      let el = audioElsRef.current.get(key);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        el.setAttribute('playsinline', 'true');
        el.volume = 1;
        audioElsRef.current.set(key, el);
      }
      track.attach(el);
      void el.play().catch(() => {
        setAudioBlocked(true);
      });
    },
    []
  );

  const stopHuddleMusic = useCallback(async () => {
    const room = roomRef.current;
    const localTrack = musicTrackRef.current;
    musicTrackRef.current = null;
    if (room && localTrack) {
      try {
        await room.localParticipant.unpublishTrack(localTrack, true);
      } catch {
        try {
          localTrack.stop();
        } catch {
          /* ignore */
        }
      }
    } else if (localTrack) {
      try {
        localTrack.stop();
      } catch {
        /* ignore */
      }
    }
    const audioEl = musicAudioRef.current;
    musicAudioRef.current = null;
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
      } catch {
        /* ignore */
      }
    }
    const ctx = musicCtxRef.current;
    musicCtxRef.current = null;
    musicGainRef.current = null;
    if (ctx) {
      void ctx.close().catch(() => undefined);
    }
    setMusicPlaying(false);
    setMusicVolume(HUDDLE_MUSIC_DEFAULT_VOLUME);
  }, []);

  const collectRoomPublications = useCallback((room: Room): TrackPublication[] => {
    const out: TrackPublication[] = [];
    room.localParticipant.trackPublications.forEach((pub) => out.push(pub));
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => out.push(pub));
    });
    return out;
  }, []);

  const canPlayHuddleMusic = canControlHuddleMusic(canModerate);

  const toggleHuddleMusic = useCallback(async () => {
    if (!canControlHuddleMusic(canModerate)) return;
    const room = roomRef.current;
    const dailyCall = dailyCallRef.current;
    if (!room && !dailyCall) return;
    setMusicBusy(true);
    setMusicError(null);
    try {
      if (musicPlaying) {
        if (dailyCall) {
          try {
            await dailyCall.stopCustomTrack(HUDDLE_MUSIC_TRACK_NAME);
          } catch {
            /* already stopped */
          }
        }
        await stopHuddleMusic();
        if (room) setMusicActive(roomHasHuddleMusic(collectRoomPublications(room)));
        else setMusicActive(false);
        return;
      }
      if (room && roomHasHuddleMusic(collectRoomPublications(room))) {
        throw new Error('Music is already playing.');
      }
      const audioEl = new Audio(HUDDLE_MUSIC_ASSET_PATH);
      audioEl.loop = true;
      audioEl.volume = musicVolume;
      audioEl.crossOrigin = 'anonymous';
      audioEl.preload = 'auto';
      audioEl.setAttribute('playsinline', '');
      musicAudioRef.current = audioEl;

      /*
       * Route the music through Web Audio and send that stream to the room.
       * iPhone/iPad Safari has no HTMLMediaElement.captureStream, so this is the
       * path that works there (and everywhere else). The AudioContext and play()
       * are started right here, before any await, so iOS still counts the tap.
       */
      type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const Ctx =
        typeof window !== 'undefined'
          ? window.AudioContext || (window as WebkitWindow).webkitAudioContext
          : undefined;
      let mediaTrack: MediaStreamTrack | null = null;
      if (Ctx) {
        try {
          const ctx = new Ctx();
          const source = ctx.createMediaElementSource(audioEl);
          const gain = ctx.createGain();
          gain.gain.value = musicVolume;
          const dest = ctx.createMediaStreamDestination();
          source.connect(gain);
          gain.connect(dest); // what the room hears
          gain.connect(ctx.destination); // so the host hears it too
          musicCtxRef.current = ctx;
          musicGainRef.current = gain;
          audioEl.volume = 1; // level is set by the gain node (iOS ignores element volume)
          void ctx.resume().catch(() => undefined);
          mediaTrack = dest.stream.getAudioTracks()[0] || null;
        } catch {
          mediaTrack = null;
          const ctx = musicCtxRef.current;
          musicCtxRef.current = null;
          musicGainRef.current = null;
          if (ctx) void ctx.close().catch(() => undefined);
        }
      }

      const playing = audioEl.play();
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (err?: Error) => {
          if (done) return;
          done = true;
          audioEl.removeEventListener('playing', onPlaying);
          audioEl.removeEventListener('error', onError);
          if (err) reject(err);
          else resolve();
        };
        const onPlaying = () => finish();
        const onError = () => finish(new Error('Waiting music file is not installed.'));
        audioEl.addEventListener('playing', onPlaying, { once: true });
        audioEl.addEventListener('error', onError, { once: true });
        playing.then(() => finish()).catch((err: unknown) => {
          const name = String((err as { name?: string })?.name || '');
          finish(
            name === 'NotSupportedError'
              ? new Error('Waiting music file is not installed.')
              : err instanceof Error
                ? err
                : new Error('Could not start waiting music.')
          );
        });
      });

      if (!mediaTrack) {
        const capture =
          typeof (audioEl as HTMLMediaElement & { captureStream?: () => MediaStream })
            .captureStream === 'function'
            ? (audioEl as HTMLMediaElement & { captureStream: () => MediaStream }).captureStream()
            : typeof (audioEl as HTMLMediaElement & { mozCaptureStream?: () => MediaStream })
                  .mozCaptureStream === 'function'
              ? (
                  audioEl as HTMLMediaElement & { mozCaptureStream: () => MediaStream }
                ).mozCaptureStream()
              : null;
        mediaTrack = capture?.getAudioTracks()[0] || null;
      }
      if (!mediaTrack) {
        audioEl.pause();
        throw new Error('captureStream not supported');
      }
      const localTrack = new LocalAudioTrack(mediaTrack, undefined, true);
      if (dailyCall) {
        await dailyCall.startCustomTrack({
          track: mediaTrack,
          trackName: HUDDLE_MUSIC_TRACK_NAME,
          mode: 'music',
        });
      } else if (room) {
        await room.localParticipant.publishTrack(localTrack, {
          name: HUDDLE_MUSIC_TRACK_NAME,
          source: Track.Source.Unknown,
        });
      }
      musicTrackRef.current = localTrack;
      setMusicPlaying(true);
      setMusicActive(true);
    } catch (e) {
      await stopHuddleMusic();
      setMusicError(formatHuddleMusicError(e));
    } finally {
      setMusicBusy(false);
    }
  }, [canModerate, collectRoomPublications, musicPlaying, musicVolume, stopHuddleMusic]);

  const setHuddleMusicVolume = useCallback((next: number) => {
    const clamped = Math.min(0.6, Math.max(0.05, Number(next) || HUDDLE_MUSIC_DEFAULT_VOLUME));
    setMusicVolume(clamped);
    const gain = musicGainRef.current;
    if (gain) {
      gain.gain.value = clamped;
      return;
    }
    const audioEl = musicAudioRef.current;
    if (audioEl) {
      try {
        audioEl.volume = clamped;
      } catch {
        /* ignore */
      }
    }
  }, []);

  const unlockHuddleAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioBlocked(false);
      // Re-attempt play on attached elements after gesture unlock.
      audioElsRef.current.forEach((el) => {
        void el.play().catch(() => {
          /* still blocked */
        });
      });
    } catch {
      setAudioBlocked(true);
    }
  }, []);

  const applyRoomRoles = useCallback((roles: HuddleRoomRoles, localIdentity?: string | null) => {
    roomRolesRef.current = roles;
    setRoomRoles(roles);
    const id = String(localIdentity || roomRef.current?.localParticipant?.identity || '').trim();
    const sessionMod = Boolean(id && isHuddleSessionModerator(roles, id));
    setCanModerate(sessionMod || channelCanModerateRef.current);
  }, []);

  const refreshRoster = useCallback(
    (room: Room) => {
      const rows: RosterRow[] = [];
      const snapshots: { identity: string; name: string; metadata?: string | null }[] = [];
      const shareCandidates: ScreenShareCandidate[] = [];
      const roles = roomRolesRef.current;

      const pushFrom = (
        identity: string,
        name: string,
        isLocal: boolean,
        isSpeaking: boolean,
        isMuted: boolean,
        cameraEnabled: boolean,
        sharing: boolean,
        metadata: string | null | undefined
      ) => {
        const hand = parseHandRaiseMetadata(metadata);
        const isHost = Boolean(roles.hostId && roles.hostId === identity);
        const isModerator =
          isHost ||
          isHuddleSessionModerator(roles, identity) ||
          parseHuddleModFromParticipantMetadata(metadata) ||
          (isLocal && canModerateRef.current);
        rows.push({
          identity,
          name,
          isLocal,
          isSpeaking,
          isMuted,
          cameraOn: cameraEnabled,
          screenSharing: sharing,
          handRaised: hand.handRaised,
          raisedAt: hand.raisedAt,
          isHost,
          isModerator,
        });
        snapshots.push({ identity, name, metadata });
        if (sharing) {
          shareCandidates.push({
            identity,
            name,
            isLocal,
            firstSeenAt: screenShareSeenRef.current.get(identity) ?? Date.now(),
          });
        }
      };

      const local = room.localParticipant;
      if (local) {
        const micPub = local.getTrackPublication(Track.Source.Microphone);
        const camPub = local.getTrackPublication(Track.Source.Camera);
        pushFrom(
          local.identity,
          local.name || 'You',
          true,
          local.isSpeaking,
          !micPub || micPub.isMuted || !local.isMicrophoneEnabled,
          Boolean(local.isCameraEnabled && camPub && !camPub.isMuted),
          localParticipantHasScreenShare(local),
          local.metadata
        );
      }
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        const camPub = p.getTrackPublication(Track.Source.Camera);
        pushFrom(
          p.identity,
          p.name || 'Member',
          false,
          p.isSpeaking,
          Boolean(micPub?.isMuted) || !p.isMicrophoneEnabled,
          Boolean(p.isCameraEnabled && camPub && !camPub.isMuted && camPub.track),
          remoteParticipantHasScreenShare(p),
          p.metadata
        );
      });

      screenShareSeenRef.current = syncScreenShareFirstSeen(
        screenShareSeenRef.current,
        shareCandidates.map((s) => s.identity)
      );
      const withTimes = shareCandidates.map((s) => ({
        ...s,
        firstSeenAt: screenShareSeenRef.current.get(s.identity) ?? s.firstSeenAt,
      }));

      // Host first, then co-hosts, then local, then name — keeps rail predictable.
      rows.sort((a, b) => {
        if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
        if (a.isModerator !== b.isModerator) return a.isModerator ? -1 : 1;
        if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setRoster(rows);
      setParticipantCount(rows.length);
      setRaisedQueue(buildRaisedHandQueue(snapshots));
      const nextPrimary = pickPrimaryScreenShare(withTimes);
      setPrimaryShare(nextPrimary);
      setMusicActive(roomHasHuddleMusic(collectRoomPublications(room)));
      huddleScreenShareDebug('primaryShare', nextPrimary
        ? { identity: nextPrimary.identity, name: nextPrimary.name, isLocal: nextPrimary.isLocal }
        : null);
      logRemotePublications(room);
      const me = rows.find((r) => r.isLocal);
      if (me) {
        setCameraOn(me.cameraOn);
        setScreenSharing(me.screenSharing);
        setMuted(me.isMuted);
      }

      const connected =
        room.state === ConnectionState.Connected || room.state === ConnectionState.Reconnecting;
      onPresenceChangeRef.current?.({
        channelId,
        active: rows.length > 0,
        participantCount: rows.length,
        connected,
      });
    },
    [channelId, collectRoomPublications]
  );

  useEffect(() => {
    refreshRosterRef.current = refreshRoster;
  }, [refreshRoster]);

  const stopLocalScreenShare = useCallback(async (room: Room) => {
    clearScreenShareEndedListener();
    try {
      await room.localParticipant.setScreenShareEnabled(false);
    } catch {
      /* ignore */
    }
  }, [clearScreenShareEndedListener]);

  const clearHuddleKeepAlive = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearTimeout(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    if (sessionKeepAliveRef.current) {
      clearInterval(sessionKeepAliveRef.current);
      sessionKeepAliveRef.current = null;
    }
    if (autoRejoinTimerRef.current) {
      clearTimeout(autoRejoinTimerRef.current);
      autoRejoinTimerRef.current = null;
    }
  }, []);

  const requestVoiceToken = useCallback(async () => {
    const post = async () => {
      const headers = await getAuthHeaders();
      return fetchWithTimeout(
        '/api/vault?resource=community&subResource=chat&subResource=voice-token',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId }),
        },
        20_000
      );
    };
    let res: Response | null = null;
    let data: any = {};
    try {
      await ensureFreshAuthSession();
      res = await post();
      if (res.status === 401) {
        await ensureFreshAuthSession();
        res = await post();
      }
      data = await res.json().catch(() => ({}));
      saveHuddleFallbackPass(channelId, data?.fallbackPass);
    } catch {
      res = null;
    }
    const savedPass = readHuddleFallbackPass(channelId);
    const databaseDown =
      savedPass &&
      (!res || res.status === 401 || res.status === 503 || res.status >= 500);
    if (databaseDown) {
      try {
      const headers = await getAuthHeaders().catch(() => ({}));
      const fallbackRes = await fetchWithTimeout(
        '/api/vault?resource=community&subResource=chat&subResource=voice-token-fallback',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, fallbackPass: savedPass }),
        },
        20_000
      );
      const fallbackData = await fallbackRes.json().catch(() => ({}));
      if (fallbackRes.ok && fallbackData?.token) {
        return { res: fallbackRes, data: fallbackData };
      }
      } catch {
        /* LiveKit backup could not be reached */
      }
    }
    if (!res) {
      return {
        res: new Response(null, { status: 503 }),
        data: {
          error: savedPass
            ? 'Could not open the huddle while the church database is down.'
            : 'The church database is temporarily unavailable.',
        },
      };
    }
    return { res, data };
  }, [channelId]);

  const startHuddleKeepAlive = useCallback(
    (expiresInSec: number) => {
      clearHuddleKeepAlive();
      const delay = huddleTokenRefreshDelayMs(expiresInSec);
      keepAliveTimerRef.current = setTimeout(() => {
        if (!stayInHuddleRef.current || !roomRef.current) return;
        void (async () => {
          try {
            const { res, data } = await requestVoiceToken();
            if (!res.ok || !data?.token) return;
            const room = roomRef.current as Room & {
              engine?: { regionUrlProvider?: { updateToken?: (token: string) => void } };
            };
            try {
              room?.engine?.regionUrlProvider?.updateToken?.(String(data.token));
            } catch {
              /* next reconnect uses a fresh mint via join */
            }
            if (typeof data.expiresIn === 'number') {
              startHuddleKeepAlive(Number(data.expiresIn));
            }
          } catch {
            /* stay connected on the current token */
          }
        })();
      }, delay);
      sessionKeepAliveRef.current = setInterval(() => {
        if (!stayInHuddleRef.current) return;
        void ensureFreshAuthSession();
      }, HUDDLE_SESSION_KEEPALIVE_MS);
    },
    [clearHuddleKeepAlive, requestVoiceToken]
  );

  const attachRemoteScreenShares = useCallback((room: Room) => {
    subscribeRemoteScreenShares(
      collectRemoteTrackPublications(room) as Array<{
        source?: string | null;
        isMuted?: boolean;
        isSubscribed?: boolean;
        setSubscribed?: (subscribed: boolean) => void;
      }>
    );
  }, []);

  const disconnectRoom = useCallback(async () => {
    const dailyCall = dailyCallRef.current;
    dailyCallRef.current = null;
    dailyHandsRef.current.clear();
    if (dailyCall) await leaveDailyAudio(dailyCall);
    clearHuddleKeepAlive();
    // Stop music while roomRef still points at the live Room (unpublish needs it).
    await stopHuddleMusic();
    const room = roomRef.current;
    roomRef.current = null;
    clearAttachedAudio();
    clearScreenShareEndedListener();
    screenShareSeenRef.current = new Map();
    presentationFocusModeRef.current = 'off';
    setPresentationFocus('off');
    setRailCollapsed(false);
    setMusicActive(false);
    setMusicError(null);
    await exitDocumentFullscreen();
    resetHuddleChatState();
    resetHuddleReactionState();
    setGalleryPage(1);
    setInviteStatus(null);
    setInviteBusy(false);
    if (!room) return;
    // Disconnect first — awaiting camera/screenshare disable first burned the timeout
    // budget and could leave a LiveKit ghost ("1 in huddle" after Leave).
    try {
      void room.localParticipant.setScreenShareEnabled(false).catch(() => {});
      void room.localParticipant.setCameraEnabled(false).catch(() => {});
      await withClientTimeout(
        room.disconnect(true),
        2_500,
        'Room disconnect timed out'
      );
    } catch {
      try {
        room.disconnect(true);
      } catch {
        /* ignore */
      }
    }
  }, [
    clearAttachedAudio,
    clearHuddleKeepAlive,
    clearScreenShareEndedListener,
    resetHuddleChatState,
    resetHuddleReactionState,
    stopHuddleMusic,
  ]);

  useEffect(() => {
    disconnectRoomRef.current = disconnectRoom;
    registerHuddleLeave(() => disconnectRoomRef.current());
    return () => registerHuddleLeave(null);
  }, [disconnectRoom]);

  const checkStatus = useCallback(async () => {
    if (!channelId) return;
    // Never clobber 'ended' — a post-end status poll was flipping the modal back to Ready/Start.
    setConn((prev) =>
      prev === 'connected' ||
      prev === 'reconnecting' ||
      prev === 'connecting' ||
      prev === 'ended'
        ? prev
        : 'checking'
    );
    setError(null);
    try {
      const headers = await getAuthHeaders();
      // Bound status: DB ACL + LiveKit can stall when Supabase is unhealthy.
      // Keep above 8s so nano/cold spikes do not hard-fail the prejoin modal.
      const res = await fetchWithTimeout(
        `/api/vault?resource=community&subResource=chat&subResource=voice-huddle-status&channelId=${encodeURIComponent(channelId)}`,
        { headers },
        25_000
      );
      let data: any = {};
      try {
        data = await parseApiJson(res);
      } catch (parseErr) {
        setError(
          parseErr instanceof Error
            ? parseErr.message
            : 'Status check is slow (database busy). You can still Start or Join Huddle.'
        );
        setConn((prev) =>
          prev === 'connected' || prev === 'reconnecting' || prev === 'ended' ? prev : 'idle'
        );
        return;
      }
      if (!res.ok) {
        // Soft warning — do not lock Start/Join behind Unavailable.
        setError(
          res.status === 401 || res.status === 403
            ? data?.error || 'Could not refresh huddle status. You can still Start or Join Huddle.'
            : 'Could not refresh who is already in the huddle. You can still Start or Join Huddle.'
        );
        setConn((prev) =>
          prev === 'connected' || prev === 'reconnecting' || prev === 'ended' ? prev : 'idle'
        );
        return;
      }
      saveHuddleFallbackPass(channelId, data.fallbackPass);
      setHuddleActive(Boolean(data.active));
      setParticipantCount(Number(data.participantCount || 0));
      if (typeof data.canModerate === 'boolean') {
        setCanModerate(Boolean(data.canModerate));
      }
      if (typeof data.channelCanModerate === 'boolean') {
        channelCanModerateRef.current = Boolean(data.channelCanModerate);
      }
      setConn((prev) =>
        prev === 'connected' || prev === 'reconnecting' || prev === 'connecting' || prev === 'ended'
          ? prev
          : 'idle'
      );
    } catch (e) {
      const saved = Boolean(readHuddleFallbackPass(channelId));
      if (isAbortOrTimeoutError(e)) {
        setError(
          saved
            ? 'The church database is slow. Start Huddle will use the permission saved from your last visit.'
            : 'The church database is slow. You can still try Start or Join Huddle.'
        );
      } else {
        setError(
          saved
            ? 'The church database is temporarily unavailable. Start Huddle will use the permission saved from your last visit.'
            : 'The church database is temporarily unavailable. You can still try Start or Join Huddle.'
        );
      }
      setConn((prev) =>
        prev === 'connected' || prev === 'reconnecting' || prev === 'ended' ? prev : 'idle'
      );
    }
  }, [channelId]);

  const joinHuddle = useCallback(async () => {
    if (!channelId) return;
    if (joinInFlightRef.current) return;
    // Already connected / connecting — don't mint a second token (same identity kicks the first).
    if (roomRef.current) return;
    joinInFlightRef.current = true;
    userLeftRef.current = false;
    setNeedsRejoin(false);
    setConn('connecting');
    setError(null);
    setCameraError(null);
    setScreenShareError(null);
    const headerSource = () => getAuthHeaders();
    const openDaily = async (creds: { token: string; url: string }) => {
      if (dailyCallRef.current) {
        const previous = dailyCallRef.current;
        dailyCallRef.current = null;
        await leaveDailyAudio(previous);
      }
      const call = await joinDailyAudio(creds, {
        onRoster: (people) => {
          if (!mountedRef.current) return;
          const present = new Set(people.map((person) => person.identity));
          for (const id of dailyHandsRef.current.keys()) {
            if (!present.has(id)) dailyHandsRef.current.delete(id);
          }
          const rows = applyDailyHands(dailyPeopleToRoster(people), dailyHandsRef.current);
          setRoster(rows);
          setParticipantCount(rows.length);
          setRaisedQueue(queueFromRoster(rows));
        },
        onConnected: () => {
          if (!mountedRef.current) return;
          setConn('connected');
          setNeedsRejoin(false);
        },
        onReconnecting: () => {
          if (!mountedRef.current) return;
          setConn('reconnecting');
        },
        onLeft: () => {
          if (!mountedRef.current) return;
          if (stayInHuddleRef.current && !userLeftRef.current && !endedForEveryoneRef.current) {
            setNeedsRejoin(true);
          }
          setActiveProvider((current) => (current === 'daily' ? null : current));
          setConn((prev) => (prev === 'ended' ? 'ended' : 'idle'));
        },
        onError: (message) => {
          if (!mountedRef.current) return;
          setError(message);
        },
        onAppMessage: (data, fromId) => {
          if (!mountedRef.current) return;
          if (isDailyHandMessage(data)) {
            const identity = String(data.identity || '').trim();
            if (data.raised && Number(data.raisedAt) > 0) {
              dailyHandsRef.current.set(identity, {
                handRaised: true,
                raisedAt: Number(data.raisedAt),
              });
            } else {
              dailyHandsRef.current.delete(identity);
            }
            setRoster((prev) => applyDailyHands(prev, dailyHandsRef.current));
            return;
          }
          const parsed = parseHuddleReactionWirePayload(data);
          if (!parsed) return;
          const active = dailyCallRef.current;
          const localId = String(active?.participants()?.local?.session_id || '');
          if (localId && fromId === localId) return;
          const sender = active?.participants()?.[fromId];
          const event = hydrateHuddleReactionEvent({
            payload: parsed,
            senderIdentity: fromId || 'member',
            senderName: String(sender?.user_name || 'Member'),
            localIdentity: localId,
            ttlMs: HUDDLE_REACTION_TTL_MS,
          });
          if (event) ingestReactionRef.current(event);
        },
      });
      dailyCallRef.current = call;
      setActiveProvider('daily');
      setMuted(true);
      setCameraOn(false);
      setScreenSharing(false);
      setHuddleActive(true);
      setConn('connected');
      setNeedsRejoin(false);
      stayInHuddleRef.current = true;
      endedForEveryoneRef.current = false;
    };
    try {
      const planned = await planHuddleJoin(channelId, {}, headerSource);
      if (planned.provider === 'blocked') {
        setError(planned.error);
        setConn('error');
        stayInHuddleRef.current = false;
        return;
      }
      if (planned.provider === 'daily') {
        await openDaily(planned);
        return;
      }
      const { res, data } = await requestVoiceToken();
      if (!res.ok) {
        setError(huddleJoinErrorMessage(res.status, data?.error, data?.code));
        setConn('error');
        stayInHuddleRef.current = false;
        return;
      }
      if (!data.token || !data.url) {
        setError('Huddle token response was incomplete');
        setConn('error');
        return;
      }
      setCanModerate(Boolean(data.canModerate));
      channelCanModerateRef.current = Boolean(data.channelCanModerate);
      const seededRoles: HuddleRoomRoles = {
        v: 1,
        hostId: data.hostId ? String(data.hostId) : null,
        coHostIds: Array.isArray(data.coHostIds)
          ? data.coHostIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
          : [],
      };
      // Prefer live room metadata after connect; seed from token for first paint.
      applyRoomRoles(seededRoles, null);

      // Only tear down a prior local connection — never delete the shared LiveKit room.
      if (roomRef.current) {
        await disconnectRoom();
      }
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      const onChange = () => {
        if (!mountedRef.current) return;
        refreshRoster(room);
      };

      const onRoomMetadata = (metadata: string) => {
        if (!mountedRef.current) return;
        applyRoomRoles(parseHuddleRoomRoles(metadata), room.localParticipant?.identity);
        refreshRoster(room);
      };

      room
        .on(RoomEvent.ParticipantConnected, onChange)
        .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          p.trackPublications.forEach((pub) => {
            const key = huddleRemoteAudioAttachKey(p.identity, pub.trackSid);
            detachRemoteAudioByKey(key);
          });
          // Legacy identity-only key (pre-music attach).
          detachRemoteAudioByKey(p.identity);
          onChange();
        })
        .on(RoomEvent.ParticipantMetadataChanged, onChange)
        .on(RoomEvent.RoomMetadataChanged, onRoomMetadata)
        .on(RoomEvent.ActiveSpeakersChanged, onChange)
        .on(RoomEvent.TrackMuted, (pub: TrackPublication, participant: RemoteParticipant | typeof room.localParticipant) => {
          if (participant?.isLocal && pub.source === Track.Source.Microphone) setMuted(true);
          onChange();
        })
        .on(RoomEvent.TrackUnmuted, (pub: TrackPublication, participant: RemoteParticipant | typeof room.localParticipant) => {
          if (participant?.isLocal && pub.source === Track.Source.Microphone) setMuted(false);
          onChange();
        })
        .on(RoomEvent.LocalTrackPublished, onChange)
        .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
          if (pub.source === Track.Source.ScreenShare) {
            clearScreenShareEndedListener();
            setScreenSharing(false);
          }
          if (isHuddleMusicPublication(pub)) {
            setMusicPlaying(false);
            musicTrackRef.current = null;
          }
          onChange();
        })
        // Critical: existing remote participants may publish ScreenShare after join.
        .on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          huddleScreenShareDebug('TrackPublished', {
            identity: participant.identity,
            source: pub.source,
            kind: pub.kind,
            trackSid: pub.trackSid,
            isSubscribed: pub.isSubscribed,
            hasTrack: Boolean(pub.track),
          });
          if (pub.source === Track.Source.ScreenShare && !pub.isSubscribed) {
            try {
              pub.setSubscribed(true);
            } catch {
              /* ignore */
            }
          }
          onChange();
        })
        .on(RoomEvent.TrackUnpublished, (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          huddleScreenShareDebug('TrackUnpublished', {
            identity: participant.identity,
            source: pub.source,
            kind: pub.kind,
            trackSid: pub.trackSid,
          });
          onChange();
        })
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: TrackPublication, participant: RemoteParticipant) => {
          huddleScreenShareDebug('TrackSubscribed', {
            identity: participant.identity,
            source: pub.source,
            kind: track.kind,
            trackSid: pub.trackSid,
          });
          if (track.kind === Track.Kind.Audio) {
            attachRemoteAudio(participant.identity, track, pub.trackSid);
          }
          onChange();
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: TrackPublication, participant: RemoteParticipant) => {
          huddleScreenShareDebug('TrackUnsubscribed', {
            identity: participant.identity,
            source: pub.source,
            kind: track.kind,
            trackSid: pub.trackSid,
          });
          if (track.kind === Track.Kind.Audio) {
            const key = huddleRemoteAudioAttachKey(participant.identity, pub.trackSid || track.sid);
            try {
              track.detach();
            } catch {
              /* ignore */
            }
            detachRemoteAudioByKey(key);
          }
          onChange();
        })
        // Phase 3E: register DataReceived with other room handlers (not a late useEffect).
        // livekit-client 2.22.3: (payload, participant?, kind?, topic?, encryptionType?)
        .on(
          RoomEvent.DataReceived,
          (
            payload: Uint8Array,
            participant?: RemoteParticipant,
            kind?: unknown,
            topic?: string
          ) => {
            const byteLen = payload?.byteLength ?? 0;
            const typePeek = peekDataPacketType(payload);
            huddleChatDebug('DataReceived', {
              participantIdentity: participant?.identity || null,
              participantPresent: Boolean(participant?.identity),
              byteLength: byteLen,
              kind: kind ?? null,
              topic: topic ?? null,
              jsonType: typePeek,
            });

            const routed = routeHuddleDataPacket({
              payload: copyDataPayloadBytes(payload),
              participant: participant
                ? { identity: participant.identity, name: participant.name || 'Member' }
                : null,
              localIdentity: room.localParticipant.identity,
              localCanModerate: canModerateRef.current,
              topic: topic ?? null,
            });

            if (routed.route === 'huddle_chat') {
              huddleChatDebug('route huddle_chat', {
                decodeOk: true,
                senderIdentity: routed.message.senderIdentity,
                isLocal: routed.message.isLocal,
                id: routed.message.id,
              });
              // Ignore local echo if SFU ever delivers own publishes.
              if (routed.message.senderIdentity === room.localParticipant.identity) {
                return;
              }
              ingestChatMessageRef.current(routed.message);
              return;
            }

            if (routed.route === 'huddle_reaction') {
              // Local publishes render after successful publishData.
              if (routed.reaction.senderIdentity === room.localParticipant.identity) {
                return;
              }
              ingestReactionRef.current(routed.reaction);
              return;
            }

            // Phase 4E.1: mod_mute data packets are ignored (server mute only).
            huddleChatDebug('route ignore', {
              reason: routed.reason,
              jsonType: typePeek,
              topic: topic ?? null,
              byteLength: byteLen,
            });
          }
        )
        .on(RoomEvent.Reconnected, () => {
          if (!mountedRef.current) return;
          attachRemoteScreenShares(room);
          refreshRoster(room);
        })
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (!mountedRef.current) return;
          if (state === ConnectionState.Connected) {
            setConn('connected');
            attachRemoteScreenShares(room);
          } else if (state === ConnectionState.Reconnecting) setConn('reconnecting');
          else if (state === ConnectionState.Disconnected) {
            setConn((prev) => (prev === 'ended' ? 'ended' : 'idle'));
          }
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!mountedRef.current) return;
          setAudioBlocked(!room.canPlaybackAudio);
        })
        .on(RoomEvent.Disconnected, () => {
          if (!mountedRef.current) return;
          // Only clear local UI — do not invent "huddle empty" (others may remain).
          clearAttachedAudio();
          clearScreenShareEndedListener();
          screenShareSeenRef.current = new Map();
          setConn((prev) => (prev === 'ended' ? 'ended' : 'idle'));
          setRoster([]);
          setRaisedQueue([]);
          resetHuddleReactionState();
          setPrimaryShare(null);
          setCameraOn(false);
          setScreenSharing(false);
          if (roomRef.current === room) {
            roomRef.current = null;
          }
          onPresenceChangeRef.current?.({
            channelId,
            // Local leave only — Chat ignores counts when connected=false.
            active: true,
            participantCount: 0,
            connected: false,
          });
          void checkStatus();
          if (
            shouldAutoRejoinHuddle({
              stayInHuddle: stayInHuddleRef.current,
              endedForEveryone: endedForEveryoneRef.current,
              userInitiatedLeave: userLeftRef.current,
            })
          ) {
            setNeedsRejoin(true);
          }
        });

      await connectLiveKitOnce(room, String(data.url), String(data.token));
      // Safari / DuckDuckGo: unlock remote audio playback from the Join gesture.
      try {
        await room.startAudio();
        setAudioBlocked(!room.canPlaybackAudio);
      } catch {
        setAudioBlocked(true);
      }
      applyRoomRoles(
        parseHuddleRoomRoles(room.metadata),
        room.localParticipant?.identity
      );
      // Attach any remote audio already present (late joiners).
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.track && pub.kind === Track.Kind.Audio) {
            attachRemoteAudio(p.identity, pub.track as RemoteTrack, pub.trackSid);
          }
          // Existing remote ScreenShare (joined while someone already sharing).
          if (pub.source === Track.Source.ScreenShare && !pub.isSubscribed) {
            try {
              (pub as RemoteTrackPublication).setSubscribed(true);
            } catch {
              /* ignore */
            }
          }
        });
      });
      attachRemoteScreenShares(room);
      logRemotePublications(room);
      const cleared = buildLowerHandMetadata(room.localParticipant.metadata);
      if (cleared !== (room.localParticipant.metadata || '')) {
        try {
          await room.localParticipant.setMetadata(cleared);
        } catch {
          /* ignore */
        }
      }
      // Join muted. The member turns their own mic on when they are ready.
      await room.localParticipant.setMicrophoneEnabled(false);
      if (!HUDDLE_CAMERA_DEFAULT_ON || !startWithCamera) {
        try {
          await room.localParticipant.setCameraEnabled(false);
        } catch {
          /* ignore */
        }
      }
      if (!HUDDLE_SCREEN_SHARE_DEFAULT_ON) {
        try {
          await room.localParticipant.setScreenShareEnabled(false);
        } catch {
          /* ignore */
        }
      }
      setMuted(true);
      setCameraOn(false);
      setScreenSharing(false);
      setHuddleActive(true);
      setActiveProvider('livekit');
      setNeedsRejoin(false);
      refreshRoster(room);
      setConn('connected');
      stayInHuddleRef.current = true;
      endedForEveryoneRef.current = false;
      startHuddleKeepAlive(Number(data.expiresIn) || 0);
      const claimed = await claimChannelHuddleProvider(channelId, 'livekit', headerSource);
      if (!claimed.ok && claimed.provider === 'daily') {
        await disconnectRoom();
        const daily = await fetchDailyHuddle(channelId, headerSource);
        if ('error' in daily) {
          setError(daily.error);
          setConn('error');
          stayInHuddleRef.current = false;
          return;
        }
        await openDaily(daily);
      }
    } catch (e) {
      if (isLiveKitQuotaError(e)) {
        rememberLiveKitQuota();
        await disconnectRoom();
        const daily = await fetchDailyHuddle(channelId, headerSource);
        if ('error' in daily) {
          stayInHuddleRef.current = false;
          setError(daily.error);
          setConn('error');
          return;
        }
        try {
          await openDaily(daily);
        } catch (dailyErr) {
          stayInHuddleRef.current = false;
          setError(friendlyError(dailyErr));
          setConn('error');
        }
        return;
      }
      stayInHuddleRef.current = false;
      await disconnectRoom();
      setError(friendlyError(e));
      setConn('error');
    } finally {
      joinInFlightRef.current = false;
    }
  }, [
    applyRoomRoles,
    attachRemoteAudio,
    detachRemoteAudioByKey,
    attachRemoteScreenShares,
    channelId,
    checkStatus,
    clearAttachedAudio,
    clearScreenShareEndedListener,
    disconnectRoom,
    refreshRoster,
    requestVoiceToken,
    resetHuddleReactionState,
    startHuddleKeepAlive,
    startWithCamera,
  ]);

  useEffect(() => {
    joinHuddleRef.current = joinHuddle;
  }, [joinHuddle]);

  const toggleMute = async () => {
    const dailyCall = dailyCallRef.current;
    if (dailyCall) {
      const next = !muted;
      try {
        await dailyCall.setLocalAudio(!next);
        setMuted(next);
      } catch (e) {
        setError(friendlyError(e));
      }
      return;
    }
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    const turningOn = !next;
    try {
      if (turningOn) {
        const sources = room.localParticipant.permissions?.canPublishSources;
        const micAllowed =
          !sources ||
          sources.length === 0 ||
          sources.some(
            (source) =>
              source === Track.Source.Microphone ||
              String(source).toUpperCase().includes('MICROPHONE')
          );
        if (!micAllowed) {
          const headers = await getAuthHeaders();
          const res = await fetch(
            '/api/vault?resource=community&subResource=chat&subResource=voice-mic-restore',
            {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ channelId }),
            }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data?.error || 'Could not turn your microphone on');
            return;
          }
        }
      }
      try {
        await room.localParticipant.setMicrophoneEnabled(turningOn);
      } catch (enableErr) {
        if (!turningOn) throw enableErr;
        const headers = await getAuthHeaders();
        const res = await fetch(
          '/api/vault?resource=community&subResource=chat&subResource=voice-mic-restore',
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId }),
          }
        );
        if (!res.ok) throw enableErr;
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      setMuted(!turningOn);
      refreshRoster(room);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const toggleCamera = async () => {
    const dailyCall = dailyCallRef.current;
    if (dailyCall) {
      setCameraBusy(true);
      setCameraError(null);
      const next = !cameraOn;
      try {
        dailyCall.setLocalVideo(next);
        setCameraOn(next);
      } catch (e) {
        setCameraError(formatCameraPermissionError(e));
        setCameraOn(false);
      } finally {
        setCameraBusy(false);
      }
      return;
    }
    const room = roomRef.current;
    if (!room) return;
    setCameraBusy(true);
    setCameraError(null);
    try {
      if (!cameraOn) {
        await room.localParticipant.setCameraEnabled(true, {
          resolution: HUDDLE_CAMERA_CAPTURE.resolution,
        });
        setCameraOn(true);
      } else {
        await room.localParticipant.setCameraEnabled(false);
        setCameraOn(false);
      }
      refreshRoster(room);
    } catch (e) {
      setCameraError(formatCameraPermissionError(e));
      // Remain in huddle on audio — do not disconnect.
      try {
        setCameraOn(Boolean(room.localParticipant.isCameraEnabled));
      } catch {
        setCameraOn(false);
      }
    } finally {
      setCameraBusy(false);
    }
  };

  const toggleScreenShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!screenShareSupported) {
      setScreenShareError(screenShareBlockedHint);
      return;
    }
    setScreenShareBusy(true);
    setScreenShareError(null);
    try {
      if (!screenSharing) {
        const pub = await room.localParticipant.setScreenShareEnabled(
          true,
          buildScreenShareCaptureOptions()
        );
        const track = pub?.track as LocalTrack | undefined;
        clearScreenShareEndedListener();
        if (track) {
          const onEnded = () => {
            // Browser/OS native Stop Sharing — clear stale UI without leaving huddle.
            clearScreenShareEndedListener();
            setScreenSharing(false);
            if (roomRef.current) refreshRoster(roomRef.current);
          };
          track.on('ended', onEnded);
          screenShareEndedUnsubRef.current = () => {
            try {
              track.off('ended', onEnded);
            } catch {
              /* ignore */
            }
          };
        }
        setScreenSharing(Boolean(room.localParticipant.isScreenShareEnabled));
      } else {
        await stopLocalScreenShare(room);
        setScreenSharing(false);
      }
      refreshRoster(room);
    } catch (e) {
      setScreenShareError(formatScreenShareError(e));
      // Remain in huddle — do not touch mic/camera/room.
      try {
        setScreenSharing(Boolean(room.localParticipant.isScreenShareEnabled));
      } catch {
        setScreenSharing(false);
      }
    } finally {
      setScreenShareBusy(false);
    }
  };

  useEffect(() => {
    if (activeProvider !== 'daily') return;
    setRaisedQueue(queueFromRoster(roster));
  }, [activeProvider, roster]);

  const localHandRaised = useMemo(() => {
    const me = roster.find((r) => r.isLocal);
    return Boolean(me?.handRaised);
  }, [roster]);

  const toggleOwnHand = async () => {
    const dailyCall = dailyCallRef.current;
    if (dailyCall) {
      const identity = String(dailyCall.participants()?.local?.session_id || '');
      if (!identity) return;
      setHandBusy(true);
      setError(null);
      const raised = !dailyHandsRef.current.get(identity)?.handRaised;
      const raisedAt = raised ? Date.now() : null;
      if (raised && raisedAt) dailyHandsRef.current.set(identity, { handRaised: true, raisedAt });
      else dailyHandsRef.current.delete(identity);
      try {
        dailyCall.sendAppMessage(
          { type: 'awc.huddle.hand', identity, raised, raisedAt },
          '*'
        );
        setRoster((prev) => applyDailyHands(prev, dailyHandsRef.current));
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setHandBusy(false);
      }
      return;
    }
    const room = roomRef.current;
    if (!room) return;
    const local = room.localParticipant;
    const decision = decideLocalHandToggle({
      actorIdentity: local.identity,
      targetIdentity: local.identity,
    });
    if (decision.ok === false) {
      setError(decision.error);
      return;
    }
    setHandBusy(true);
    setError(null);
    try {
      const current = parseHandRaiseMetadata(local.metadata);
      const nextMeta = current.handRaised
        ? buildLowerHandMetadata(local.metadata)
        : buildRaiseHandMetadata(local.metadata, Date.now());
      await local.setMetadata(nextMeta);
      refreshRoster(room);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setHandBusy(false);
    }
  };

  const moderatorLowerHand = async (targetIdentity: string) => {
    const dailyCall = dailyCallRef.current;
    if (dailyCall) {
      if (!canModerate) return;
      const identity = String(targetIdentity || '').trim();
      if (!identity) return;
      setHandBusy(true);
      setError(null);
      dailyHandsRef.current.delete(identity);
      try {
        dailyCall.sendAppMessage(
          { type: 'awc.huddle.hand', identity, raised: false, raisedAt: null },
          '*'
        );
        setRoster((prev) => applyDailyHands(prev, dailyHandsRef.current));
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setHandBusy(false);
      }
      return;
    }
    const room = roomRef.current;
    if (!room || !channelId) return;
    const decision = decideModeratorLowerHand({
      actorIdentity: room.localParticipant.identity,
      targetIdentity,
      actorIsRoomModerator: canModerate,
    });
    if (decision.ok === false) {
      setError(decision.error);
      return;
    }
    setHandBusy(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        '/api/vault?resource=community&subResource=chat&subResource=voice-hand-lower',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, targetIdentity }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not lower hand');
        return;
      }
      refreshRoster(room);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setHandBusy(false);
    }
  };

  const leaveHuddle = async () => {
    userLeftRef.current = true;
    stayInHuddleRef.current = false;
    setNeedsRejoin(false);
    setActiveProvider(null);
    const room = roomRef.current;
    // Alone + mod Leave should delete the LiveKit room — otherwise status stays
    // "Huddle in progress · 1 in huddle" (ghost / slow departure) until End.
    const alone =
      Boolean(room) &&
      (typeof room.numParticipants === 'number'
        ? room.numParticipants <= 1
        : roster.length <= 1);
    const endRoomOnLeave = canModerate && alone && Boolean(channelId);
    // Best-effort lower-hand only — never await LiveKit metadata/camera before leave
    // (slow Supabase/LiveKit made Leave + Close hang until refresh).
    if (room) {
      void room.localParticipant
        .setMetadata(buildLowerHandMetadata(room.localParticipant.metadata))
        .catch(() => {});
    }
    await disconnectRoom();
    setRoster([]);
    setRaisedQueue([]);
    setPrimaryShare(null);
    setParticipantCount(0);
    setCameraOn(false);
    setScreenSharing(false);
    setCameraError(null);
    setScreenShareError(null);
    setConn(endRoomOnLeave ? 'ended' : 'idle');
    setHuddleActive(false);
    setAudioBlocked(false);
    setCanModerate(false);
    channelCanModerateRef.current = false;
    applyRoomRoles(emptyHuddleRoomRoles(), null);

    if (endRoomOnLeave && channelId) {
      void (async () => {
        try {
          const headers = await getAuthHeaders();
          await fetchWithTimeout(
            '/api/vault?resource=community&subResource=chat&subResource=voice-huddle-end',
            {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ channelId }),
            },
            12_000
          );
          onPresenceChangeRef.current?.({
            channelId,
            active: false,
            participantCount: 0,
            connected: false,
          });
        } catch {
          /* local UI already cleared */
        } finally {
          void checkStatus();
        }
      })();
      return;
    }

    // Refresh badge in background — do not block Leave/Close on DB status.
    void checkStatus();
  };

  const endForEveryone = async () => {
    if (!canModerate || !channelId || ending) return;
    userLeftRef.current = true;
    stayInHuddleRef.current = false;
    endedForEveryoneRef.current = true;
    setEnding(true);
    setError(null);
    let serverOk = false;

    // Tear down locally in parallel with the server end — UI must not wait on DB ACL.
    const localTeardown = (async () => {
      setConn('ended');
      await disconnectRoom();
      setRoster([]);
      setRaisedQueue([]);
      setPrimaryShare(null);
      setHuddleActive(false);
      setParticipantCount(0);
      setCameraOn(false);
      setScreenSharing(false);
      setAudioBlocked(false);
      setCanModerate(false);
      channelCanModerateRef.current = false;
      applyRoomRoles(emptyHuddleRoomRoles(), null);
      onPresenceChangeRef.current?.({
        channelId,
        active: false,
        participantCount: 0,
        connected: false,
      });
    })();

    try {
      try {
        const headers = await getAuthHeaders();
        const res = await fetchWithTimeout(
          '/api/vault?resource=community&subResource=chat&subResource=voice-huddle-end',
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId }),
          },
          12_000
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error || 'Could not end huddle for everyone on the server');
        } else {
          serverOk = true;
        }
      } catch (e) {
        setError(
          friendlyError(e) ||
            'End request timed out. You will leave locally — others may still be connected.'
        );
      }

      await localTeardown;
      setEnding(false);

      if (HUDDLE_MINUTES_ENABLED && serverOk && !prayerWatch && typeof window !== 'undefined') {
        const draft = loadHuddleMinutesDraft();
        const hasDraft = Boolean(draft?.transcript?.trim());
        const go = window.confirm(
          hasDraft
            ? 'Open Meeting Minutes to review the recording transcript, sign, and email the PDF to ministry leaders?'
            : 'Open Meeting Minutes to type or paste notes (you can also record there), then sign and email the PDF?'
        );
        if (go) {
          const q = new URLSearchParams({
            action: 'create',
            huddle: '1',
            title: (channelName || 'Live Huddle').replace(/^#/, ''),
            dept: 'Leadership',
          });
          if (hasDraft) q.set('fromDraft', '1');
          window.location.hash = `#/communication/minutes?${q.toString()}`;
        }
      }

      // Always dismiss after End — otherwise the modal stays on Ready/Start Huddle.
      onClose();
    } catch (e) {
      setError(friendlyError(e));
      try {
        await localTeardown;
      } catch {
        /* ignore */
      }
      setEnding(false);
    }
  };

  const muteRemote = async (identity: string, muted = true) => {
    if (!canModerate || !channelId) return;
    const target = String(identity || '').trim();
    if (!target) return;
    setError(null);
    try {
      const dailyCall = dailyCallRef.current;
      if (dailyCall) {
        await dailyCall.updateParticipant(target, { setAudio: !muted });
        return;
      }
      const headers = await getAuthHeaders();
      const res = await fetch(
        '/api/vault?resource=community&subResource=chat&subResource=voice-participant-mute',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, targetIdentity: target, muted }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || (muted ? 'Could not mute participant' : 'Could not unmute participant'));
        return;
      }
      if (!data?.participantFound) {
        setError('Participant is not in the active huddle');
        return;
      }
      if (muted && !data?.muted && !data?.micPublishRevoked) {
        setError('Could not mute that microphone');
        return;
      }
      const room = roomRef.current;
      if (room) refreshRoster(room);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  /** Moderators: mute every listener whose mic is on (hosts and mods keep theirs). */
  const muteEveryone = async () => {
    if (!canModerate || muteAllBusy) return;
    const targets = roster.filter((p) => !p.isLocal && !p.isMuted && !p.isHost && !p.isModerator);
    if (targets.length === 0) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Mute ${targets.length} ${targets.length === 1 ? 'person' : 'people'}? Hosts and moderators stay unmuted.`)
    ) {
      return;
    }
    setMuteAllBusy(true);
    try {
      // Small batches so a big room doesn't flood the server.
      for (let i = 0; i < targets.length; i += 10) {
        await Promise.all(targets.slice(i, i + 10).map((p) => muteRemote(p.identity, true)));
      }
    } finally {
      setMuteAllBusy(false);
    }
  };

  const runHuddleModAction = async (
    action: 'add' | 'pass',
    identity: string,
    name: string
  ) => {
    if (!canModerate || !channelId || modActionBusy) return;
    const targetUserId = String(identity || '').trim();
    if (!targetUserId) return;
    const label = action === 'add' ? 'Add Mod' : 'Pass Mod';
    const confirmMsg =
      action === 'add'
        ? `Add ${name} as a session co-host (Mod) for this huddle?`
        : `Pass Host to ${name}? You’ll stay as Mod (co-host).`;
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return;
    setModActionBusy(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        '/api/vault?resource=community&subResource=chat&subResource=voice-huddle-mod',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, targetUserId, action }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Could not ${label.toLowerCase()}`);
        return;
      }
      const nextRoles: HuddleRoomRoles = {
        v: 1,
        hostId: data.hostId ? String(data.hostId) : null,
        coHostIds: Array.isArray(data.coHostIds)
          ? data.coHostIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
          : roomRolesRef.current.coHostIds,
      };
      applyRoomRoles(nextRoles, roomRef.current?.localParticipant?.identity);
      if (typeof data.canModerate === 'boolean') {
        setCanModerate(Boolean(data.canModerate) || channelCanModerateRef.current);
      }
      const room = roomRef.current;
      if (room) refreshRoster(room);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setModActionBusy(false);
    }
  };

  const addHuddleMod = (identity: string, name: string) => {
    void runHuddleModAction('add', identity, name);
  };

  const passHuddleMod = (identity: string, name: string) => {
    void runHuddleModAction('pass', identity, name);
  };

  const copyHuddleLink = useCallback(async () => {
    if (!channelId || inviteBusy) return;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : '';
    // Prefer /api/share-huddle so WhatsApp pastes show the channel card image.
    const url = buildHuddlePreviewShareUrl({ origin, channelId });
    if (!url || !huddleInviteLooksSafe(url)) {
      setInviteStatus('Could not build a safe Huddle link.');
      return;
    }
    setInviteBusy(true);
    setInviteStatus(null);
    try {
      if (canUseNavigatorClipboard()) {
        await navigator.clipboard.writeText(url);
        setInviteStatus('Huddle link copied');
      } else if (typeof window !== 'undefined') {
        window.prompt('Copy Huddle link', url);
        setInviteStatus('Huddle link ready to copy');
      } else {
        setInviteStatus('Clipboard unavailable.');
      }
    } catch {
      setInviteStatus('Could not copy link. You’re still in the huddle.');
    } finally {
      setInviteBusy(false);
    }
  }, [channelId, inviteBusy]);

  const shareHuddleLink = useCallback(async () => {
    if (!channelId || inviteBusy) return;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : '';
    const payload = buildHuddleSharePayload({
      origin,
      channelId,
      channelName,
    });
    if (!payload || !huddleInviteLooksSafe(payload.url)) {
      setInviteStatus('Could not build a safe Huddle link.');
      return;
    }
    if (!canUseNavigatorShare()) {
      await copyHuddleLink();
      return;
    }
    setInviteBusy(true);
    setInviteStatus(null);
    try {
      await navigator.share(payload);
      setInviteStatus('Huddle link shared');
    } catch (e) {
      const name = String((e as Error)?.name || '');
      if (name === 'AbortError') {
        /* user cancelled */
      } else {
        setInviteStatus('Could not share. Try Copy Huddle Link.');
      }
    } finally {
      setInviteBusy(false);
    }
  }, [channelId, channelName, copyHuddleLink, inviteBusy]);

  const scrollChatToBottom = useCallback(() => {
    const el = chatListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setChatPinnedToBottom(true);
    chatPinnedRef.current = true;
    setChatNewBelow(false);
  }, []);

  const onChatListScroll = useCallback(() => {
    const el = chatListRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = shouldAutoScrollHuddleChat({ distanceFromBottom: distance });
    setChatPinnedToBottom(near);
    chatPinnedRef.current = near;
    if (near) setChatNewBelow(false);
  }, []);

  const ingestChatMessage = useCallback((msg: HuddleChatMessage) => {
    setChatMessages((prev) => appendHuddleChatMessage(prev, msg));
    setChatUnread((prev) =>
      nextHuddleChatUnread({
        chatOpen: chatOpenRef.current,
        isLocalMessage: msg.isLocal,
        prevUnread: prev,
      })
    );
    if (!msg.isLocal && chatOpenRef.current && !chatPinnedRef.current) {
      setChatNewBelow(true);
    }
  }, []);

  useEffect(() => {
    ingestChatMessageRef.current = ingestChatMessage;
  }, [ingestChatMessage]);

  const sendHuddleReaction = useCallback(
    async (key: HuddleReactionKey) => {
      const room = roomRef.current;
      const dailyCall = dailyCallRef.current;
      if ((!room && !dailyCall) || (conn !== 'connected' && conn !== 'reconnecting')) return;
      if (reactionBusy) return;
      if (
        !shouldAllowHuddleReactionSend({
          lastSentAt: lastReactionSentAt,
          cooldownMs: HUDDLE_REACTION_COOLDOWN_MS,
        })
      ) {
        return;
      }
      const payload = buildHuddleReactionWirePayload({
        reaction: key,
        id: createHuddleReactionId(),
        sentAt: Date.now(),
      });
      if (!payload) {
        setReactionError('Could not send reaction.');
        return;
      }
      setReactionBusy(true);
      setReactionError(null);
      try {
        if (dailyCall) {
          dailyCall.sendAppMessage(payload, '*');
          const localId = String(dailyCall.participants()?.local?.session_id || 'you');
          const localRxn = hydrateHuddleReactionEvent({
            payload,
            senderIdentity: localId,
            senderName: 'You',
            localIdentity: localId,
            ttlMs: HUDDLE_REACTION_TTL_MS,
          });
          if (localRxn) ingestReaction(localRxn);
          setLastReactionSentAt(Date.now());
          setReactionPickerOpen(false);
          return;
        }
        if (!room) return;
        const encoded = encodeHuddleReactionPayload(payload);
        const data = new Uint8Array(encoded.byteLength);
        data.set(encoded);
        await room.localParticipant.publishData(data, {
          reliable: true,
          topic: HUDDLE_REACTION_TOPIC,
        });
        const localRxn = hydrateHuddleReactionEvent({
          payload,
          senderIdentity: room.localParticipant.identity,
          senderName: room.localParticipant.name || 'You',
          localIdentity: room.localParticipant.identity,
          ttlMs: HUDDLE_REACTION_TTL_MS,
        });
        if (localRxn) ingestReaction(localRxn);
        setLastReactionSentAt(Date.now());
        setReactionPickerOpen(false);
      } catch (e) {
        setReactionError("Couldn't send reaction. You're still in the huddle.");
        void e;
      } finally {
        setReactionBusy(false);
      }
    },
    [conn, ingestReaction, lastReactionSentAt, reactionBusy]
  );

  useEffect(() => {
    if (!chatOpen || !chatPinnedToBottom) return;
    const el = chatListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatOpen, chatPinnedToBottom]);

  const sendHuddleChat = useCallback(async () => {
    const room = roomRef.current;
    if (!room || (conn !== 'connected' && conn !== 'reconnecting')) return;
    if (chatBusy) return;
    const checked = validateHuddleChatText(chatDraft);
    if (!checked.ok) {
      setChatSendError(
        checked.reason === 'too_long'
          ? `Messages must be ${HUDDLE_CHAT_MAX_LENGTH} characters or fewer.`
          : 'Message cannot be empty.'
      );
      return;
    }
    const payload = buildHuddleChatWirePayload({
      id: createHuddleChatId(),
      text: checked.text,
      sentAt: Date.now(),
    });
    if (!payload) return;
    setChatBusy(true);
    setChatSendError(null);
    try {
      const encoded = encodeHuddleChatPayload(payload);
      const data = new Uint8Array(encoded.byteLength);
      data.set(encoded);
      // livekit-client 2.22.3: publishData(data, { reliable, topic, destinationIdentities })
      await room.localParticipant.publishData(data, {
        reliable: true,
        topic: HUDDLE_CHAT_TOPIC,
      });
      huddleChatDebug('publishData ok', {
        byteLength: data.byteLength,
        topic: HUDDLE_CHAT_TOPIC,
        id: payload.id,
      });
      const localMsg = hydrateHuddleChatMessage({
        payload,
        senderIdentity: room.localParticipant.identity,
        senderName: room.localParticipant.name || 'You',
        localIdentity: room.localParticipant.identity,
        localCanModerate: canModerateRef.current,
      });
      if (localMsg) ingestChatMessage(localMsg);
      setChatDraft('');
      setChatPinnedToBottom(true);
      chatPinnedRef.current = true;
      setChatNewBelow(false);
    } catch (e) {
      huddleChatDebug('publishData failed', String((e as Error)?.message || e));
      setChatSendError("Couldn't send message. You're still in the huddle.");
      void e;
    } finally {
      setChatBusy(false);
    }
  }, [chatBusy, chatDraft, conn, ingestChatMessage]);

  const dismissChatMessageLocal = useCallback(
    (messageId: string) => {
      if (!canLocallyDismissHuddleChatMessage({ localCanModerate: canModerateRef.current })) {
        return;
      }
      setChatMessages((prev) => removeHuddleChatMessageLocal(prev, messageId));
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!isOpen) {
      void disconnectRoomRef.current();
      setConn('idle');
      setError(null);
      setCameraError(null);
      setScreenShareError(null);
      setRoster([]);
      setRaisedQueue([]);
      resetHuddleReactionState();
      setPrimaryShare(null);
      setCameraOn(false);
      setScreenSharing(false);
      document.body.style.overflow = '';
      document.body.classList.remove('awc-huddle-open');
      return () => {
        mountedRef.current = false;
      };
    }

    // Embedded (Prayer Watch): the page keeps scrolling so the requests stay readable.
    if (!embedded) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('awc-huddle-open');
    }
    void checkStatus();
    return () => {
      mountedRef.current = false;
      document.body.style.overflow = '';
      document.body.classList.remove('awc-huddle-open');
      // Channel switch or modal close — local disconnect only (never ends the room).
      void disconnectRoomRef.current();
    };
    // resetHuddleReactionState is stable; omit from deps so cleanup never re-fires mid-call.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [isOpen, channelId, checkStatus]);

  // Unmount safety net (Strict Mode / route leave).
  useEffect(() => {
    return () => {
      void disconnectRoomRef.current();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px), (pointer: coarse)');
    const apply = () => setPhoneLayout(media.matches);
    apply();
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    const onPageHide = () => {
      userLeftRef.current = true;
      stayInHuddleRef.current = false;
      void disconnectRoomRef.current();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  useEffect(() => {
    if (conn !== 'connected' || roster.length > 1) return;
    const timer = window.setTimeout(() => {
      userLeftRef.current = true;
      stayInHuddleRef.current = false;
      setNeedsRejoin(false);
      setActiveProvider(null);
      setHuddleActive(false);
      setConn('idle');
      void disconnectRoomRef.current();
    }, 10 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [conn, roster.length]);

  const statusLabel = useMemo(() => {
    switch (conn) {
      case 'checking':
        return 'Checking huddle…';
      case 'connecting':
        return 'Connecting…';
      case 'connected':
        return 'Connected';
      case 'reconnecting':
        return 'Reconnecting…';
      case 'ended':
        return 'Huddle ended';
      case 'error':
        return 'Unavailable';
      default:
        return huddleActive ? 'Huddle in progress' : 'Ready';
    }
  }, [conn, huddleActive]);

  // Re-check getDisplayMedia when joining — mount-time detect can miss mediaDevices.
  useEffect(() => {
    if (conn !== 'connected' && conn !== 'connecting') return;
    setScreenShareSupported(isScreenShareSupported());
  }, [conn]);

  useScreenWakeLock(isOpen && (conn === 'connected' || conn === 'reconnecting'));

  if (!isOpen) return null;

  const inCall = conn === 'connected' || conn === 'reconnecting';
  const onDaily = activeProvider === 'daily';
  const ctaLabel =
    openedFromInvite && huddleActive ? 'Join Huddle' : huddleActive ? 'Join Huddle' : 'Start Huddle';
  const preJoinChannelLabel = (channelName || 'Channel').replace(/^#/, '');
  const preJoinBody =
    openedFromInvite && huddleActive
      ? 'A live church conversation is happening now. Join with mic first — leave camera off until you need it.'
      : huddleActive || participantCount >= 2
        ? 'Others are connecting. Join with mic first — leave camera off until you need it (keeps larger huddles stable).'
        : 'Join the prayer call with your voice. Keep this screen open while you pray.';
  const handsCount = raisedQueue.length;
  const dockedSidePanels = attendanceOpen || chatOpen || handsPanelOpen;
  const dockedRightPanel = chatOpen || handsPanelOpen;
  const presenting = Boolean(primaryShare && roomRef.current);
  const focusActive = isPresentationFocusActive(presentationFocus);
  const showPresentationRail =
    shouldShowHuddlePresentationRail(roster.length) && !(focusActive && railCollapsed);
  const featuredIdentity = pickFeaturedHuddleIdentity({
    roles: roomRoles,
    rosterIdentities: roster.map((r) => r.identity),
  });
  const { featured: featuredParticipant, others: stripRoster } = splitFeaturedHuddleRoster(
    roster,
    featuredIdentity
  );
  const useGalleryPagination = shouldUseHuddleGalleryPagination({
    screenShareActive: presenting,
  });
  const galleryBreakpoint = huddleGalleryBreakpointFromWidth(viewportWidth);
  const galleryPageSizeVal = huddleGalleryPageSize(galleryBreakpoint);
  const galleryColumns = huddleGalleryColumnCount(galleryBreakpoint);
  // Everyone is a small square; the host just goes first (no big featured tile).
  const galleryAll = featuredParticipant ? [featuredParticipant, ...stripRoster] : stripRoster;
  const searchedStrip = filterHuddleRosterByName(galleryAll, gallerySearch);
  const galleryPages = huddleGalleryPageCount(searchedStrip.length, galleryPageSizeVal);
  const safeGalleryPage = clampHuddleGalleryPage(galleryPage, galleryPages);
  const galleryRoster = useGalleryPagination
    ? sliceHuddleGalleryPage(searchedStrip, safeGalleryPage, galleryPageSizeVal)
    : searchedStrip;
  const modCount = huddleModeratorCount(roomRoles);
  const canAddMod = modCount < MAX_HUDDLE_MODERATORS;
  const unmutedListeners = roster.filter((p) => !p.isLocal && !p.isMuted && !p.isHost && !p.isModerator);
  const galleryGridClass = huddleGalleryGridClass(galleryColumns);
  const railRoster = presenting ? roster : stripRoster;
  const controlBtnClass =
    'h-11 min-w-[5.5rem] sm:min-w-0 flex-1 sm:flex-none rounded-xl font-bold text-[10px] uppercase tracking-wide inline-flex items-center justify-center gap-1.5 border px-3 transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold';
  const controlIdleClass = focusActive
    ? 'bg-white/10 text-white border-white/15 hover:bg-white/15'
    : 'bg-white text-[#0d1a14] border-gray-200 hover:bg-gray-50';
  const controlActiveClass = focusActive
    ? 'bg-gold text-burgundy border-gold'
    : 'bg-[#0d1a14] text-gold border-[#0d1a14]';
  const controlWarnClass = focusActive
    ? 'bg-rose-500/20 text-rose-100 border-rose-400/40'
    : 'bg-rose-50 text-rose-700 border-rose-200';
  const controlHandClass = focusActive
    ? 'bg-gold/20 text-gold border-gold/40'
    : 'bg-amber-50 text-amber-950 border-amber-200';
  const focusBtnLabel = presentationFocusButtonLabel(focusActive);

  // Portal to body: AppShell <main overflow> traps position:fixed on iOS, so the
  // bottom tab bar (z-70) sat on top of Join Huddle and ate taps.
  const huddleTree = (
    <div
      className={embedded && !focusActive ? 'relative flex h-full w-full' : `fixed inset-0 z-[250] flex ${
        focusActive
          ? 'items-stretch justify-stretch bg-[#0b1410] p-0'
          : 'items-end sm:items-center justify-center bg-burgundy/80 backdrop-blur-md p-0 sm:p-4 md:p-6'
      }`}
      data-huddle-focus-shell={presentationFocus}
      data-huddle-portal="body"
    >
      <div
        ref={presentationFocusRootRef}
        className={`relative w-full bg-white flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 ${
          embedded && !focusActive
            ? 'h-full max-h-none rounded-3xl border border-gold/20 shadow-sm'
            : focusActive
            ? 'h-[100dvh] max-h-[100dvh] max-w-none rounded-none border-0 shadow-none bg-[#0b1410]'
            : `sm:rounded-3xl rounded-t-3xl shadow-2xl border border-gold/20 max-h-[96dvh] ${
                inCall
                  ? dockedSidePanels
                    ? 'sm:max-w-6xl lg:max-w-7xl'
                    : presenting
                      ? 'sm:max-w-5xl lg:max-w-6xl'
                      : 'sm:max-w-4xl lg:max-w-5xl'
                  : attendanceOpen
                    ? 'sm:max-w-3xl lg:max-w-4xl'
                    : 'sm:max-w-md'
              }`
        }`}
        data-huddle-presentation-focus={presentationFocus}
        data-huddle-chat-docked={inCall && chatOpen ? 'true' : 'false'}
        data-huddle-attendance-docked={attendanceOpen ? 'true' : 'false'}
        data-huddle-hands-docked={handsPanelOpen ? 'true' : 'false'}
      >
        {/* Transient reactions: visual-only overlay (no aria-live chatter). Picker has text labels. */}
        {inCall && activeReactions.length > 0 ? (
          <div
            className="pointer-events-none absolute z-[40] flex flex-col-reverse items-end gap-1.5 max-w-[min(14rem,46%)]"
            style={{
              right: focusActive ? 12 : 16,
              bottom: focusActive ? 96 : 120,
            }}
            data-huddle-reactions-overlay="true"
            aria-hidden="true"
          >
            {activeReactions.map((rxn) => (
              <div
                key={rxn.id}
                className="flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 shadow-lg border animate-in fade-in zoom-in-95 duration-200"
                style={{
                  background: focusActive ? 'rgba(19, 36, 28,0.88)' : 'rgba(255,255,255,0.95)',
                  borderColor: focusActive ? 'rgba(201, 163, 90,0.35)' : 'rgba(201, 163, 90,0.35)',
                  color: focusActive ? '#f5d76e' : '#0d1a14',
                }}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {rxn.emoji}
                </span>
                <span className="text-[11px] font-bold truncate max-w-[7rem]">
                  {rxn.isLocal ? 'You' : rxn.senderName}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {focusActive ? null : (
        <div className="px-5 pt-5 pb-3 flex items-start justify-between border-b border-gray-50 shrink-0 bg-burgundy text-white">
          <div className="min-w-0 pr-3">
            <p className="text-[9px] font-black text-gold uppercase tracking-[0.25em] mb-1">
              Live Huddle
            </p>
            <h3 className="font-black uppercase tracking-tight text-lg leading-snug break-words">
              {preJoinChannelLabel}
            </h3>
            <div className="text-[11px] text-white/60 font-semibold mt-1 space-y-0.5">
              <p className="inline-flex items-center gap-1.5 flex-wrap">
                {conn === 'reconnecting' ? (
                  <WifiOff size={12} className="text-gold shrink-0" aria-hidden />
                ) : (
                  <Radio size={12} className="text-gold shrink-0" aria-hidden />
                )}
                <span>
                  {statusLabel}
                  {participantCount > 0 ? ` · ${participantCount} in huddle` : ''}
                </span>
              </p>
              {inCall && handsCount > 0 && !prayerWatch ? (
                <button
                  type="button"
                  onClick={toggleHandsPanel}
                  className="text-gold font-bold text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                  aria-live="polite"
                  aria-pressed={handsPanelOpen}
                  data-huddle-hands-header-status="true"
                >
                  {formatHandsRaisedStatus(handsCount)}
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!inCall && canViewAttendance && !prayerWatch ? (
              <button
                type="button"
                onClick={toggleAttendancePanel}
                className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  attendanceOpen
                    ? 'bg-gold text-burgundy'
                    : 'text-gold bg-white/10 hover:bg-white/15'
                }`}
                aria-pressed={attendanceOpen}
                aria-label="Huddle attendance"
                data-huddle-attendance-toggle="true"
              >
                <ClipboardList size={14} aria-hidden />
                <span className="hidden sm:inline">Attendance</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await exitPresentationFocus();
                if (inCall) await leaveHuddle();
                onClose();
              }}
              className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              aria-label="Close huddle"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        )}

        <div
          className={`relative flex flex-1 min-h-0 ${
            dockedSidePanels ? 'flex-col sm:flex-row' : 'flex-col'
          }`}
          data-huddle-main-split={
            attendanceOpen && dockedRightPanel
              ? 'attendance-video-chat'
              : attendanceOpen
                ? 'attendance-video'
                : dockedRightPanel
                  ? 'video-chat'
                  : 'video'
          }
        >
        {canViewAttendance && attendanceOpen ? (
          <aside
            className={`flex flex-col shrink-0 min-h-0 self-stretch border-t min-h-[14rem] overflow-hidden ${
              focusActive
                ? 'border-white/10 bg-[#0b0f0d]'
                : 'border-gray-200 bg-white'
            } max-sm:absolute max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[60] max-sm:max-h-[min(58dvh,26rem)] max-sm:rounded-t-2xl max-sm:border max-sm:border-b-0 max-sm:shadow-[0_-12px_40px_rgba(13, 26, 20,0.25)] sm:static sm:relative sm:w-[min(18rem,30%)] sm:min-h-0 sm:max-h-none sm:rounded-none sm:shadow-none sm:border-t-0 sm:border-r sm:order-1`}
            data-huddle-attendance-dock="true"
            data-huddle-attendance-live="true"
            aria-label="Huddle attendance"
          >
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <HuddleAttendancePanel
                channelId={channelId}
                pollMs={inCall || huddleActive ? 9000 : 0}
                embedded
                preferHistory={!huddleActive && !inCall}
                onClose={closeAttendancePanel}
              />
            </div>
          </aside>
        ) : null}

        <div
          className="flex flex-col flex-1 min-w-0 min-h-0 sm:order-2"
          data-huddle-stage-column="true"
        >
        <div
          className={`px-4 sm:px-5 py-4 overflow-y-auto overflow-x-hidden flex-1 space-y-4 min-h-0 min-w-0 ${
            focusActive ? 'flex flex-col !p-2 sm:!p-3 bg-[#0b1410]' : 'bg-[#faf7f5]'
          }`}
        >
          {conn === 'reconnecting' ? (
            <p
              className="text-[12px] font-semibold text-amber-950 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
              role="status"
            >
              Reconnecting…
            </p>
          ) : null}
          {focusActive ? null : error ? (
            <p className="text-[12px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          ) : null}
          {focusActive ? null : cameraError ? (
            <p
              className="text-[12px] font-semibold text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
              role="status"
            >
              {cameraError}
            </p>
          ) : null}
          {focusActive ? null : screenShareError ? (
            <p
              className="text-[12px] font-semibold text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
              role="status"
            >
              {screenShareError}
            </p>
          ) : null}
          {focusActive ? null : musicError ? (
            <p
              className="text-[12px] font-semibold text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
              role="status"
              data-huddle-music-error="true"
            >
              {musicError}
            </p>
          ) : null}

          {conn === 'ended' ? (
            <p className="text-[13px] text-gray-500 font-medium text-center py-6">
              This huddle was ended by a moderator.
            </p>
          ) : null}

          {inCall ? (
            <div className={`space-y-4 ${focusActive ? 'flex flex-col flex-1 min-h-0 space-y-2' : ''}`}>
              {musicActive ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div
                    className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg w-fit ${
                      focusActive ? 'bg-gold/20 text-gold' : 'bg-gold-cream text-burgundy border border-gold/20'
                    }`}
                    data-huddle-music-active="true"
                    role="status"
                  >
                    <Music size={12} aria-hidden />
                    Music playing
                  </div>
                  {musicPlaying && canPlayHuddleMusic ? (
                    <label
                      className={`inline-flex items-center gap-2 text-[11px] font-semibold ${
                        focusActive ? 'text-white/80' : 'text-gray-600'
                      }`}
                    >
                      <span className="whitespace-nowrap">Music volume</span>
                      <input
                        type="range"
                        min={0.05}
                        max={0.6}
                        step={0.01}
                        value={musicVolume}
                        onChange={(e) => setHuddleMusicVolume(Number(e.target.value))}
                        className="w-28 accent-burgundy"
                        aria-label="Music volume"
                        data-huddle-music-volume="true"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              {presenting && primaryShare && roomRef.current ? (
                <div className={`min-h-0 ${focusActive ? 'flex flex-col flex-1' : ''}`}>
                  <div
                    className={
                      focusActive
                        ? huddlePresentationFocusBoardClass(showPresentationRail)
                        : huddlePresentationBoardClass(showPresentationRail)
                    }
                    data-huddle-presentation={showPresentationRail ? 'stage-rail' : 'stage-only'}
                  >
                    <div
                      className={
                        focusActive
                          ? huddlePresentationFocusStageWrapClass()
                          : huddlePresentationStageWrapClass(showPresentationRail)
                      }
                    >
                      <ScreenShareStage room={roomRef.current} share={primaryShare} />
                      <div className="absolute bottom-2 right-2 z-[2] flex items-center gap-1.5 pointer-events-auto">
                        {focusActive && shouldShowHuddlePresentationRail(roster.length) ? (
                          <button
                            type="button"
                            onClick={() => setRailCollapsed((v) => !v)}
                            className="h-9 px-2.5 rounded-lg bg-black/65 text-white text-[9px] font-black uppercase tracking-widest border border-white/20 hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                            aria-label={railCollapsed ? 'Show participants' : 'Hide participants'}
                            aria-pressed={railCollapsed}
                          >
                            {railCollapsed ? 'Show people' : 'Hide people'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void togglePresentationFocus()}
                          className="h-9 px-2.5 rounded-lg bg-gold text-burgundy text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 border border-gold hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
                          aria-label={focusBtnLabel}
                          data-huddle-fullscreen-control="true"
                        >
                          {focusActive ? (
                            <Minimize2 size={14} aria-hidden />
                          ) : (
                            <Maximize2 size={14} aria-hidden />
                          )}
                          {focusBtnLabel}
                        </button>
                      </div>
                    </div>
                    {showPresentationRail ? (
                      <div
                        className={
                          focusActive
                            ? huddlePresentationFocusRailClass()
                            : huddlePresentationRailClass()
                        }
                        aria-label="Huddle participants"
                        data-huddle-rail="participants"
                      >
                        {railRoster.map((p) => (
                          <HuddleTile
                            key={p.identity}
                            row={p}
                            room={roomRef.current}
                            compact
                            focusCompact={focusActive}
                            showModBadge={p.isModerator}
                            showHostBadge={p.isHost}
                            canModerateMute={canModerate}
                            canManageMods={canModerate && !modActionBusy}
                            canAddMod={canAddMod}
                            onMuteRemote={muteRemote}
                            onAddMod={addHuddleMod}
                            onPassMod={passHuddleMod}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-2" data-huddle-layout="mod-stage">
                  {canModerate || galleryAll.length > 15 ? (
                    <div className="flex flex-wrap items-center gap-2" data-huddle-mod-toolbar="true">
                      <label className="relative flex-1 min-w-[10rem]">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
                        <input
                          type="search"
                          value={gallerySearch}
                          onChange={(e) => {
                            setGallerySearch(e.target.value);
                            setGalleryPage(1);
                          }}
                          placeholder="Find someone"
                          aria-label="Find someone in the huddle"
                          className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-[#0d1a14] outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
                        />
                      </label>
                      {canModerate ? (
                        <>
                          <span
                            className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg bg-gold-cream/50 text-burgundy text-[9px] font-black uppercase tracking-widest"
                            title={`Up to ${MAX_HUDDLE_MODERATORS} moderators, including the host`}
                          >
                            <ShieldCheck size={12} aria-hidden /> Mods {modCount}/{MAX_HUDDLE_MODERATORS}
                          </span>
                          <button
                            type="button"
                            onClick={() => void muteEveryone()}
                            disabled={muteAllBusy || unmutedListeners.length === 0}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-red-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                            aria-label="Mute everyone except hosts and moderators"
                            data-huddle-mute-all="true"
                          >
                            {muteAllBusy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <VolumeX size={13} aria-hidden />}
                            Mute everyone{unmutedListeners.length ? ` (${unmutedListeners.length})` : ''}
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {gallerySearch.trim() && galleryRoster.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">No one in the huddle matches “{gallerySearch.trim()}”.</p>
                  ) : null}
                  {galleryRoster.length > 0 ? (
                    <div
                      className={`grid gap-2 ${galleryGridClass} max-h-[44dvh] lg:max-h-[58dvh] overflow-y-auto overflow-x-hidden pr-0.5`}
                      data-huddle-gallery="paginated"
                      data-huddle-gallery-page={safeGalleryPage}
                      data-huddle-gallery-pages={galleryPages}
                    >
                      {galleryRoster.map((p) => (
                        <HuddleTile
                          key={p.identity}
                          row={p}
                          room={roomRef.current}
                          showModBadge={p.isModerator}
                          showHostBadge={p.isHost}
                          canModerateMute={canModerate}
                          canManageMods={canModerate && !modActionBusy}
                          canAddMod={canAddMod}
                          onMuteRemote={muteRemote}
                          onAddMod={addHuddleMod}
                          onPassMod={passHuddleMod}
                        />
                      ))}
                    </div>
                  ) : null}
                  {useGalleryPagination && galleryPages > 1 ? (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        disabled={safeGalleryPage <= 1}
                        onClick={() => setGalleryPage((p) => clampHuddleGalleryPage(p - 1, galleryPages))}
                        className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gold/25 text-[9px] font-black uppercase tracking-widest text-burgundy bg-white hover:bg-gold-cream disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        aria-label="Previous gallery page"
                      >
                        <ChevronLeft size={14} aria-hidden />
                        Prev
                      </button>
                      <p
                        className="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                        aria-label={`Page ${safeGalleryPage} of ${galleryPages}`}
                      >
                        Page {safeGalleryPage} of {galleryPages}
                      </p>
                      <button
                        type="button"
                        disabled={safeGalleryPage >= galleryPages}
                        onClick={() => setGalleryPage((p) => clampHuddleGalleryPage(p + 1, galleryPages))}
                        className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gold/25 text-[9px] font-black uppercase tracking-widest text-burgundy bg-white hover:bg-gold-cream disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        aria-label="Next gallery page"
                      >
                        Next
                        <ChevronRight size={14} aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {focusActive ? null : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} aria-hidden /> {roster.length} in huddle
                  </span>
                  <span>Camera & screen optional · same room</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyHuddleLink()}
                    disabled={inviteBusy}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gold/25 bg-gold-cream/40 text-burgundy text-[9px] font-black uppercase tracking-widest hover:bg-gold-cream disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    aria-label="Copy Huddle Link"
                    data-huddle-invite-copy="true"
                  >
                    <Link2 size={14} aria-hidden />
                    Copy Huddle Link
                  </button>
                  {shareSupported ? (
                    <button
                      type="button"
                      onClick={() => void shareHuddleLink()}
                      disabled={inviteBusy}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gold/25 bg-white text-burgundy text-[9px] font-black uppercase tracking-widest hover:bg-gold-cream disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      aria-label="Share Huddle"
                      data-huddle-invite-share="true"
                    >
                      <Share2 size={14} aria-hidden />
                      Share Huddle
                    </button>
                  ) : null}
                </div>
                {inviteStatus ? (
                  <p className="text-[11px] font-semibold text-burgundy" role="status">
                    {inviteStatus}
                  </p>
                ) : null}
              </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gold-cream border border-gold/20 flex items-center justify-center">
                <Mic size={28} className="text-gold" aria-hidden />
              </div>
              <p
                className="text-[13px] text-gray-500 font-medium px-4 leading-relaxed"
                data-huddle-prejoin-copy={openedFromInvite ? 'invite' : 'manual'}
              >
                {preJoinBody}
              </p>
            </div>
          )}
        </div>

        <div
          className={`px-3 sm:px-4 pt-3 border-t flex flex-col gap-2.5 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 ${
            focusActive
              ? 'border-white/10 bg-[#0c110f]'
              : 'border-gray-200/80 bg-white'
          }`}
          data-huddle-controls-footer="true"
        >
          {inCall ? (
            <div className="flex flex-wrap gap-1.5 sm:gap-2" role="toolbar" aria-label="Huddle controls">
              {!prayerWatch ? (
                <>
              <button
                type="button"
                onClick={toggleOwnHand}
                disabled={handBusy}
                className={`${controlBtnClass} ${
                  localHandRaised ? controlHandClass : controlIdleClass
                }`}
                aria-label={localHandRaised ? 'Lower hand' : 'Raise hand'}
                aria-pressed={localHandRaised}
              >
                <Hand size={16} aria-hidden />
                {localHandRaised ? 'Lower' : 'Hand'}
              </button>
              {handsCount > 0 || handsPanelOpen ? (
                <button
                  type="button"
                  onClick={toggleHandsPanel}
                  className={`${controlBtnClass} relative ${
                    handsPanelOpen ? controlActiveClass : controlIdleClass
                  }`}
                  aria-label={handsPanelOpen ? 'Close raised hands list' : 'Open raised hands list'}
                  aria-pressed={handsPanelOpen}
                  data-huddle-hands-control="true"
                >
                  <Users size={16} aria-hidden />
                  Hands
                  {handsCount > 0 && !handsPanelOpen ? (
                    <span
                      className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-gold text-burgundy text-[10px] font-black flex items-center justify-center"
                      aria-label={`${handsCount} raised hands`}
                    >
                      {handsCount > 99 ? '99+' : handsCount}
                    </span>
                  ) : null}
                </button>
              ) : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={toggleMute}
                className={`${controlBtnClass} ${
                  muted ? controlWarnClass : controlIdleClass
                }`}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={muted}
              >
                {muted ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              {!audioOnly ? (
                <>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                disabled={cameraBusy}
                className={`${controlBtnClass} ${
                  cameraOn ? controlActiveClass : controlIdleClass
                }`}
                aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                aria-pressed={cameraOn}
                data-huddle-camera-control="true"
              >
                {cameraBusy ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : cameraOn ? (
                  <VideoOff size={16} aria-hidden />
                ) : (
                  <Video size={16} aria-hidden />
                )}
                Video
              </button>
              {!onDaily && screenShareSupported ? (
                <button
                  type="button"
                  onClick={toggleScreenShare}
                  disabled={screenShareBusy}
                  className={`${controlBtnClass} ${
                    screenSharing ? controlActiveClass : controlIdleClass
                  }`}
                  aria-label={screenSharing ? 'Stop sharing screen' : 'Share screen'}
                  aria-pressed={screenSharing}
                >
                  {screenSharing ? <MonitorOff size={16} aria-hidden /> : <Monitor size={16} aria-hidden />}
                  {screenSharing ? 'Stop Share' : 'Share'}
                </button>
              ) : !onDaily ? (
                <button
                  type="button"
                  disabled
                  title={screenShareBlockedHint}
                  className={`${controlBtnClass} ${controlIdleClass} opacity-40 cursor-not-allowed`}
                  aria-label={screenShareBlockedHint}
                >
                  <MonitorOff size={16} aria-hidden />
                  Share
                </button>
              ) : null}
                </>
              ) : null}
              {canPlayHuddleMusic && !prayerWatch ? (
                <button
                  type="button"
                  onClick={() => void toggleHuddleMusic()}
                  disabled={musicBusy || (musicActive && !musicPlaying)}
                  className={`${controlBtnClass} ${
                    musicPlaying || musicActive ? controlActiveClass : controlIdleClass
                  }`}
                  aria-label={
                    musicPlaying
                      ? huddleMusicButtonLabel(true)
                      : musicActive
                        ? 'Music is already playing'
                        : huddleMusicButtonLabel(false)
                  }
                  aria-pressed={musicPlaying}
                  title={
                    musicActive && !musicPlaying
                      ? 'Music is already playing in this huddle'
                      : undefined
                  }
                  data-huddle-music-control="true"
                >
                  {musicBusy ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                  ) : (
                    <Music size={16} aria-hidden />
                  )}
                  {musicPlaying
                    ? huddleMusicButtonLabel(true)
                    : musicActive
                      ? 'Music On'
                      : huddleMusicButtonLabel(false)}
                </button>
              ) : null}
              {presenting ? (
                <button
                  type="button"
                  onClick={() => void togglePresentationFocus()}
                  className={`${controlBtnClass} ${
                    focusActive ? controlActiveClass : controlIdleClass
                  }`}
                  aria-label={focusBtnLabel}
                  data-huddle-fullscreen-control="true"
                >
                  {focusActive ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
                  {focusBtnLabel}
                </button>
              ) : null}
              {!prayerWatch ? (
              <div className="relative flex-1 min-w-[5.5rem] sm:flex-none sm:min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setReactionError(null);
                    setReactionPickerOpen((open) => !open);
                  }}
                  disabled={reactionBusy}
                  className={`${controlBtnClass} w-full ${
                    reactionPickerOpen ? controlActiveClass : controlIdleClass
                  }`}
                  aria-label="Open huddle reactions"
                  aria-expanded={reactionPickerOpen}
                  aria-haspopup="menu"
                  data-huddle-reaction-control="true"
                >
                  <Smile size={16} aria-hidden />
                  React
                </button>
                {reactionPickerOpen ? (
                  <div
                    role="menu"
                    aria-label="Huddle reactions"
                    className={`absolute bottom-[calc(100%+0.5rem)] left-0 right-0 sm:left-auto sm:right-0 sm:w-52 z-[50] rounded-2xl border shadow-xl p-2 ${
                      focusActive
                        ? 'bg-[#0c110f] border-white/15'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <p
                      className={`px-2 pb-1.5 text-[9px] font-black uppercase tracking-[0.2em] ${
                        focusActive ? 'text-gold' : 'text-burgundy'
                      }`}
                    >
                      Reactions
                    </p>
                    <div className="grid grid-cols-1 gap-1">
                      {HUDDLE_REACTION_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          role="menuitem"
                          disabled={reactionBusy}
                          onClick={() => void sendHuddleReaction(opt.key)}
                          className={`flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl text-left font-bold text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-40 ${
                            focusActive
                              ? 'text-white hover:bg-white/10'
                              : 'text-[#0d1a14] hover:bg-gray-50'
                          }`}
                          aria-label={opt.label}
                        >
                          <span className="text-lg leading-none" aria-hidden>
                            {opt.emoji}
                          </span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              ) : null}
              {canViewAttendance && !prayerWatch ? (
                <button
                  type="button"
                  onClick={toggleAttendancePanel}
                  className={`${controlBtnClass} ${
                    attendanceOpen ? controlActiveClass : controlIdleClass
                  }`}
                  aria-label={attendanceOpen ? 'Close huddle attendance' : 'Open huddle attendance'}
                  aria-pressed={attendanceOpen}
                  data-huddle-attendance-toggle="true"
                >
                  <ClipboardList size={16} aria-hidden />
                  Attendance
                </button>
              ) : null}
              <button
                type="button"
                onClick={toggleHuddleChat}
                className={`${controlBtnClass} relative ${
                  chatOpen ? controlActiveClass : controlIdleClass
                }`}
                aria-label={chatOpen ? 'Close huddle chat' : 'Open huddle chat'}
                aria-pressed={chatOpen}
                data-huddle-chat-control="true"
              >
                <MessageSquare size={16} aria-hidden />
                Chat
                {chatUnread > 0 && !chatOpen ? (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-gold text-burgundy text-[10px] font-black flex items-center justify-center"
                    aria-label={`${chatUnread} unread messages`}
                  >
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                ) : null}
              </button>
              {HUDDLE_MINUTES_ENABLED && canModerate && !onDaily && !prayerWatch ? (
                <button
                  type="button"
                  onClick={() => {
                    setMinutesRecorderError(null);
                    setMinutesPanelOpen((open) => !open);
                  }}
                  className={`${controlBtnClass} ${
                    minutesPanelOpen ? controlActiveClass : controlIdleClass
                  }`}
                  aria-label={minutesPanelOpen ? 'Hide minutes recorder' : 'Record meeting minutes'}
                  aria-pressed={minutesPanelOpen}
                  data-huddle-minutes-control="true"
                >
                  <ClipboardList size={16} aria-hidden />
                  Minutes
                </button>
              ) : null}
              <button
                type="button"
                onClick={leaveHuddle}
                className={`${controlBtnClass} ${controlActiveClass}`}
                aria-label="Leave huddle"
              >
                <PhoneOff size={16} aria-hidden />
                Leave
              </button>
            </div>
          ) : (
            <div className="space-y-2" data-huddle-prejoin-actions="true">
              {needsRejoin ? (
                <button
                  type="button"
                  onClick={() => void joinHuddle()}
                  disabled={conn === 'checking' || conn === 'connecting'}
                  className="w-full h-14 rounded-xl bg-gold text-burgundy font-black text-[13px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
                  data-huddle-rejoin="true"
                >
                  {conn === 'connecting' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Mic size={16} aria-hidden />}
                  Rejoin prayer
                </button>
              ) : (
              <button
                type="button"
                onClick={joinHuddle}
                disabled={conn === 'checking' || conn === 'connecting' || conn === 'ended'}
                className="w-full h-12 rounded-xl bg-gold text-burgundy font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
                data-huddle-join-cta="true"
                aria-label={conn === 'ended' ? 'Huddle ended' : ctaLabel}
              >
                {conn === 'connecting' || conn === 'checking' ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <Mic size={16} aria-hidden />
                )}
                {conn === 'ended' ? 'Huddle Ended' : ctaLabel}
              </button>
              )}
              {canModerate && huddleActive && conn !== 'ended' ? (
                <button
                  type="button"
                  disabled={ending}
                  onClick={() => void endForEveryone()}
                  className="w-full h-10 rounded-xl text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-50 border border-red-100 hover:bg-red-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  data-huddle-prejoin-end="true"
                  aria-label="End huddle for everyone"
                >
                  {ending ? 'Ending…' : 'End for everyone'}
                </button>
              ) : null}
            </div>
          )}

          {HUDDLE_MINUTES_ENABLED && inCall && canModerate && minutesPanelOpen ? (
            <div
              className={`rounded-xl border p-3 space-y-2 ${
                focusActive
                  ? 'border-white/15 bg-black/30'
                  : 'border-gold/25 bg-[#0d1a14]/[0.03]'
              }`}
              data-huddle-minutes-panel="true"
            >
              <p
                className={`text-[11px] font-semibold leading-relaxed ${
                  focusActive ? 'text-white/70' : 'text-gray-600'
                }`}
              >
                Record during the huddle (not after). Click Start recording below. When you end the
                huddle, we can open Minutes so you sign and email the PDF.
              </p>
              {minutesRecorderError ? (
                <p className="text-[11px] font-semibold text-red-500" role="alert">
                  {minutesRecorderError}
                </p>
              ) : null}
              <MinutesRecorder
                getAuthHeaders={getAuthHeaders}
                onError={(msg) => setMinutesRecorderError(msg || null)}
                onTranscribed={({ transcript, summary, audioUrl }) => {
                  saveHuddleMinutesDraft({
                    transcript,
                    summary,
                    audioUrl,
                    title: (channelName || 'Live Huddle').replace(/^#/, ''),
                  });
                }}
              />
            </div>
          ) : null}

          {phoneLayout && (inCall || needsRejoin) ? (
            <p className="text-[12px] font-medium text-gray-500 text-center">
              Keep this screen open during prayer.
            </p>
          ) : null}

          {inCall && audioBlocked ? (
            <button
              type="button"
              onClick={() => void unlockHuddleAudio()}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-[12px] font-bold text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                focusActive
                  ? 'text-amber-50 bg-amber-500/20 border border-amber-300/30'
                  : 'text-amber-950 bg-amber-50 border border-amber-200'
              }`}
              data-huddle-enable-audio="true"
            >
              Tap to enable huddle sound — browsers often block audio until you allow it.
            </button>
          ) : null}

          {inCall && reactionError ? (
            <p
              className={`text-[11px] font-semibold rounded-xl px-3 py-2 ${
                focusActive
                  ? 'text-amber-100 bg-white/5 border border-white/10'
                  : 'text-amber-900 bg-amber-50 border border-amber-100'
              }`}
              role="status"
            >
              {reactionError}
            </p>
          ) : null}

          {inCall ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {canModerate ? (
                <button
                  type="button"
                  disabled={ending}
                  onClick={endForEveryone}
                  className={`h-9 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wide disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${
                    focusActive
                      ? 'text-red-300 hover:bg-red-950/40'
                      : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  {ending ? 'Ending…' : 'End for everyone'}
                </button>
              ) : (
                <span />
              )}
              {focusActive ? null : (
                <button
                  type="button"
                  onClick={async () => {
                    await exitPresentationFocus();
                    if (inCall) await leaveHuddle();
                    onClose();
                  }}
                  className="h-9 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-burgundy hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  data-huddle-dismiss="close"
                  aria-label="Close huddle"
                >
                  Close
                </button>
              )}
            </div>
          ) : focusActive ? null : (
            <button
              type="button"
              onClick={async () => {
                await exitPresentationFocus();
                onClose();
              }}
              className="w-full h-10 text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg"
              data-huddle-dismiss="not-now"
              aria-label="Not now"
            >
              Not now
            </button>
          )}
        </div>
        </div>

        {inCall && handsPanelOpen ? (
          <aside
            className={`flex flex-col shrink-0 min-h-0 self-stretch border-t min-h-[14rem] overflow-hidden ${
              focusActive
                ? 'border-white/10 bg-[#0b0f0d]'
                : 'border-gray-200 bg-white'
            } max-sm:absolute max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[60] max-sm:max-h-[min(58dvh,26rem)] max-sm:rounded-t-2xl max-sm:border max-sm:border-b-0 max-sm:shadow-[0_-12px_40px_rgba(13, 26, 20,0.25)] sm:static sm:relative sm:w-[min(18rem,30%)] sm:min-h-0 sm:max-h-none sm:rounded-none sm:shadow-none sm:border-t-0 sm:border-l sm:order-3`}
            data-huddle-hands-panel="true"
            aria-label="Raised hands"
          >
            <div
              className={`px-3 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
                focusActive
                  ? 'border-white/10 bg-[#0c110f] text-white'
                  : 'border-gray-200 bg-white text-[#0d1a14]'
              }`}
            >
              <div className="min-w-0">
                <p
                  className={`text-[9px] font-black uppercase tracking-[0.2em] ${
                    focusActive ? 'text-gold' : 'text-burgundy'
                  }`}
                >
                  Raised Hands
                </p>
                <p
                  className={`text-[11px] font-medium truncate ${
                    focusActive ? 'text-white/60' : 'text-gray-400'
                  }`}
                >
                  {handsCount === 0
                    ? 'No hands raised'
                    : `${handsCount} waiting to speak`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeHandsPanel}
                className={`p-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  focusActive
                    ? 'text-white/60 hover:text-white hover:bg-white/10'
                    : 'text-gray-400 hover:text-burgundy hover:bg-gray-50'
                }`}
                aria-label="Close raised hands list"
              >
                <X size={16} />
              </button>
            </div>
            <div
              className={`flex-1 min-h-0 overflow-y-auto divide-y ${
                focusActive
                  ? 'divide-white/10 bg-[#0b1410]'
                  : 'divide-gold/15 bg-gold-cream/20'
              }`}
            >
              {handsCount === 0 ? (
                <p
                  className={`text-[12px] font-medium text-center py-8 px-4 ${
                    focusActive ? 'text-white/40' : 'text-gray-400'
                  }`}
                >
                  No hands raised right now.
                </p>
              ) : (
                raisedQueue.map((h) => (
                  <div
                    key={h.identity}
                    className="flex items-start gap-3 px-3 py-2.5 min-h-[48px]"
                  >
                    <div
                      className={`text-[13px] font-black shrink-0 w-5 pt-0.5 ${
                        focusActive ? 'text-gold' : 'text-gold'
                      }`}
                    >
                      {h.position}.
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div
                        className={`text-[13px] font-bold break-words whitespace-normal leading-snug ${
                          focusActive ? 'text-white' : 'text-[#0d1a14]'
                        }`}
                      >
                        ✋ {h.name}
                      </div>
                      <div
                        className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${
                          focusActive ? 'text-white/40' : 'text-gray-400'
                        }`}
                      >
                        Waiting to speak
                      </div>
                    </div>
                    {canModerate ? (
                      <button
                        type="button"
                        disabled={handBusy}
                        onClick={() => moderatorLowerHand(h.identity)}
                        className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1.5 rounded-lg border border-gold/30 text-burgundy bg-white hover:bg-gold-cream disabled:opacity-40 min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        aria-label={`Lower hand for ${h.name}`}
                      >
                        Lower Hand
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </aside>
        ) : null}

        {inCall && chatOpen ? (
            <aside
              className={`flex flex-col shrink-0 min-h-0 self-stretch border-t min-h-[14rem] ${
                focusActive
                  ? 'border-white/10 bg-[#0b0f0d]'
                  : 'border-gray-200 bg-white'
              } max-sm:absolute max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[60] max-sm:max-h-[min(58dvh,26rem)] max-sm:rounded-t-2xl max-sm:border max-sm:border-b-0 max-sm:shadow-[0_-12px_40px_rgba(13, 26, 20,0.25)] sm:static sm:relative sm:w-[min(20rem,34%)] sm:min-h-0 sm:max-h-none sm:rounded-none sm:shadow-none sm:border-t-0 sm:border-l sm:order-3`}
              data-huddle-chat-panel="true"
              aria-label="Huddle chat"
            >
              <div
                className={`px-3 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
                  focusActive
                    ? 'border-white/10 bg-[#0c110f] text-white'
                    : 'border-gray-200 bg-white text-[#0d1a14]'
                }`}
              >
                <div className="min-w-0">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${
                      focusActive ? 'text-gold' : 'text-burgundy'
                    }`}
                  >
                    Huddle Chat
                  </p>
                  <p
                    className={`text-[11px] font-medium truncate ${
                      focusActive ? 'text-white/60' : 'text-gray-400'
                    }`}
                  >
                    Live · not saved
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeHuddleChat}
                  className={`p-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    focusActive
                      ? 'text-white/60 hover:text-white hover:bg-white/10'
                      : 'text-gray-400 hover:text-burgundy hover:bg-gray-50'
                  }`}
                  aria-label="Close huddle chat"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="relative flex-1 min-h-0">
                <div
                  ref={chatListRef}
                  onScroll={onChatListScroll}
                  className={`h-full overflow-y-auto overflow-x-hidden px-3 py-2 space-y-2.5 ${
                    focusActive ? 'bg-[#0b1410]' : 'bg-[#fffaf6]'
                  }`}
                  data-huddle-chat-list="true"
                  aria-live="polite"
                  aria-relevant="additions"
                >
                  {chatMessages.length === 0 ? (
                    <p
                      className={`text-[12px] font-medium text-center py-8 px-4 ${
                        focusActive ? 'text-white/40' : 'text-gray-400'
                      }`}
                    >
                      No messages yet. Say hello to the huddle.
                    </p>
                  ) : (
                    chatMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-xl px-2.5 py-2 border ${
                          m.isLocal
                            ? focusActive
                              ? 'bg-gold/15 border-gold/30 ml-4'
                              : 'bg-gold-cream/50 border-gold/25 ml-4'
                            : focusActive
                              ? 'bg-white/5 border-white/10 mr-4'
                              : 'bg-white border-gray-100 mr-4'
                        }`}
                        data-huddle-chat-message={m.id}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-[11px] font-black truncate ${
                                focusActive ? 'text-gold' : 'text-burgundy'
                              }`}
                            >
                              {m.isLocal ? 'You' : m.senderName}
                            </span>
                            {m.showModeratorBadge ? (
                              <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-gold bg-burgundy px-1.5 py-0.5 rounded shrink-0">
                                <ShieldCheck size={9} aria-hidden /> Mod
                              </span>
                            ) : null}
                          </div>
                          <time
                            className={`text-[9px] font-semibold shrink-0 ${
                              focusActive ? 'text-white/40' : 'text-gray-400'
                            }`}
                            dateTime={new Date(m.sentAt).toISOString()}
                          >
                            {formatHuddleChatTime(m.sentAt)}
                          </time>
                        </div>
                        <p
                          className={`text-[13px] font-medium whitespace-pre-wrap break-words leading-snug ${
                            focusActive ? 'text-white/90' : 'text-[#0d1a14]'
                          }`}
                        >
                          {m.text}
                        </p>
                        {canLocallyDismissHuddleChatMessage({ localCanModerate: canModerate }) ? (
                          <button
                            type="button"
                            onClick={() => dismissChatMessageLocal(m.id)}
                            className={`mt-1 text-[9px] font-black uppercase tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded ${
                              focusActive
                                ? 'text-white/35 hover:text-red-400'
                                : 'text-gray-400 hover:text-red-600'
                            }`}
                            aria-label="Hide message from your view"
                          >
                            Hide for me
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
                {chatNewBelow ? (
                  <button
                    type="button"
                    onClick={scrollChatToBottom}
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[1] px-3 py-1.5 rounded-full bg-burgundy text-gold text-[9px] font-black uppercase tracking-widest shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    New messages
                  </button>
                ) : null}
              </div>

              <form
                className={`shrink-0 border-t p-2.5 space-y-1.5 ${
                  focusActive ? 'border-white/10 bg-[#0c110f]' : 'border-gray-100 bg-white'
                }`}
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendHuddleChat();
                }}
              >
                {chatSendError ? (
                  <p className="text-[11px] font-semibold text-amber-800" role="status">
                    {chatSendError}
                  </p>
                ) : null}
                <label htmlFor="awc-huddle-chat-input" className="sr-only">
                  Huddle chat message
                </label>
                <textarea
                  id="awc-huddle-chat-input"
                  value={chatDraft}
                  onChange={(e) => {
                    setChatDraft(e.target.value.slice(0, HUDDLE_CHAT_MAX_LENGTH + 1));
                    if (chatSendError) setChatSendError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendHuddleChat();
                    }
                  }}
                  rows={2}
                  maxLength={HUDDLE_CHAT_MAX_LENGTH}
                  placeholder="Message the huddle…"
                  className={`w-full resize-none rounded-xl border px-3 py-2 text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    focusActive
                      ? 'border-white/15 bg-black/30 text-white placeholder:text-white/30'
                      : 'border-gray-200 text-burgundy placeholder:text-gray-300'
                  }`}
                  data-huddle-chat-input="true"
                />
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-widest ${
                      focusActive ? 'text-white/30' : 'text-gray-300'
                    }`}
                  >
                    {chatDraft.trim().length}/{HUDDLE_CHAT_MAX_LENGTH}
                  </span>
                  <button
                    type="submit"
                    disabled={chatBusy || !chatDraft.trim()}
                    className="h-10 px-4 rounded-xl bg-gold text-burgundy font-black text-[10px] uppercase tracking-widest disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
                    aria-label="Send huddle chat message"
                    data-huddle-chat-send="true"
                  >
                    {chatBusy ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            </aside>
        ) : null}
        </div>
      </div>
    </div>
  );

  // Portal to body: AppShell <main overflow> traps position:fixed on iOS (pop-up mode only).
  return embedded && !focusActive ? huddleTree : createPortal(huddleTree, document.body);
};

export default VoiceHuddle;
