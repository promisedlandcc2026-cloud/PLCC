import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  Hand,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Share2,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';
import {
  Room,
  RoomEvent,
  Track,
  type LocalParticipant,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  DisconnectReason,
} from 'livekit-client';
import {
  HUDDLE_AUTO_REJOIN_DELAY_MS,
  HUDDLE_SESSION_KEEPALIVE_MS,
  huddleTokenRefreshDelayMs,
  shouldAutoRejoinHuddle,
} from '../../api/_utils/huddleKeepAlive.js';
import {
  buildScreenShareCaptureOptions,
  isScreenShareSupported,
  screenShareUnsupportedHint,
} from '../../api/_utils/huddleScreenShare.js';
import { ensureFreshAuthSession } from '../../lib/authSession';
import {
  createFamilyHuddleInvite,
  endFamilyHuddle,
  familyInviteAbsoluteUrl,
  fetchFamilyHuddleToken,
  inviteExpiryLabel,
  lockFamilyHuddleInvites,
  whatsappInviteHref,
} from '../../lib/familyHuddleClient';
import { useScreenWakeLock } from '../../lib/useScreenWakeLock';
import {
  FamilyHuddleError,
  type FamilyHuddleInvite,
  type FamilyHuddleJoinToken,
} from '../../lib/familyHuddleTypes';

/** LiveKit closed this copy on purpose (joined elsewhere, removed, or ended): do not auto-rejoin. */
function huddleDisconnectIsFinal(reason?: DisconnectReason): boolean {
  return (
    reason === DisconnectReason.DUPLICATE_IDENTITY ||
    reason === DisconnectReason.PARTICIPANT_REMOVED ||
    reason === DisconnectReason.ROOM_DELETED
  );
}

function huddleDisconnectMessage(reason?: DisconnectReason): string {
  if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
    return 'You joined this huddle somewhere else (another tab, app or device). Tap Join to bring it back here.';
  }
  if (reason === DisconnectReason.PARTICIPANT_REMOVED) return 'You were removed from the huddle.';
  return 'The huddle has ended.';
}

type ConnState = 'prejoin' | 'connecting' | 'connected' | 'error';

type Tile = {
  identity: string;
  name: string;
  isLocal: boolean;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  handRaised: boolean;
  speaking: boolean;
};

type Props = {
  mode?: 'join' | 'start';
  householdName?: string | null;
  guestToken?: FamilyHuddleJoinToken | null;
  onClose: () => void;
};

function parseHandRaised(metadata: string | undefined): boolean {
  if (!metadata) return false;
  try {
    const parsed = JSON.parse(metadata) as { handRaised?: unknown };
    return Boolean(parsed.handRaised);
  } catch {
    return false;
  }
}

function mergeHandMetadata(existing: string | undefined, handRaised: boolean): string {
  let base: Record<string, unknown> = {};
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = { ...parsed };
      }
    } catch {
      /* ignore */
    }
  }
  return JSON.stringify({
    ...base,
    v: 1,
    handRaised,
    raisedAt: handRaised ? Date.now() : null,
  });
}

function displayName(p: Participant): string {
  return (p.name || p.identity || 'Family').trim() || 'Family';
}

function ParticipantVideo({
  participant,
  isLocal,
  camOn,
}: {
  participant: Participant;
  isLocal: boolean;
  camOn: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!camOn) {
      el.srcObject = null;
      return undefined;
    }
    const pub = participant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (track && !pub.isMuted) {
      track.attach(el);
      return () => {
        track.detach(el);
      };
    }
    el.srcObject = null;
    return undefined;
  }, [participant, camOn, isLocal]);

  return (
    <video
      ref={videoRef}
      className={`absolute inset-0 h-full w-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
      playsInline
      muted={isLocal}
      autoPlay
    />
  );
}

export const FamilyVoiceHuddle: React.FC<Props> = ({
  mode = 'join',
  householdName,
  guestToken = null,
  onClose,
}) => {
  const isGuest = Boolean(guestToken);
  const [conn, setConn] = useState<ConnState>(guestToken ? 'connecting' : 'prejoin');
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [needSoundTap, setNeedSoundTap] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [title, setTitle] = useState(householdName || 'Family Huddle');
  const [canModerate, setCanModerate] = useState(!isGuest);
  const [ending, setEnding] = useState(false);
  const [invite, setInvite] = useState<FamilyHuddleInvite | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [invitesLocked, setInvitesLocked] = useState(false);
  const screenShareSupported = isScreenShareSupported();
  const screenBlockedHint = screenShareUnsupportedHint();

  useScreenWakeLock(conn === 'connected' || conn === 'connecting');

  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const joinInFlightRef = useRef(false);
  const joinRef = useRef<() => Promise<void>>(async () => {});
  const mountedRef = useRef(true);
  const autoJoinedRef = useRef(false);
  const stayInHuddleRef = useRef(false);
  const userLeftRef = useRef(false);
  const endedForEveryoneRef = useRef(false);
  const keepAliveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRejoinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearKeepAlive = useCallback(() => {
    if (keepAliveTimerRef.current) clearTimeout(keepAliveTimerRef.current);
    if (sessionKeepAliveRef.current) clearInterval(sessionKeepAliveRef.current);
    if (autoRejoinTimerRef.current) clearTimeout(autoRejoinTimerRef.current);
    keepAliveTimerRef.current = null;
    sessionKeepAliveRef.current = null;
    autoRejoinTimerRef.current = null;
  }, []);

  const startKeepAlive = useCallback(
    (expiresInSec: number) => {
      clearKeepAlive();
      if (isGuest) return;
      keepAliveTimerRef.current = setTimeout(() => {
        if (!stayInHuddleRef.current || !roomRef.current) return;
        void (async () => {
          try {
            await ensureFreshAuthSession();
            const next = await fetchFamilyHuddleToken();
            const room = roomRef.current as Room & {
              engine?: { regionUrlProvider?: { updateToken?: (token: string) => void } };
            };
            try {
              room?.engine?.regionUrlProvider?.updateToken?.(next.token);
            } catch {
              /* next reconnect remints */
            }
            startKeepAlive(next.expiresIn);
          } catch {
            /* keep current token */
          }
        })();
      }, huddleTokenRefreshDelayMs(expiresInSec));
      sessionKeepAliveRef.current = setInterval(() => {
        if (!stayInHuddleRef.current) return;
        void ensureFreshAuthSession();
      }, HUDDLE_SESSION_KEEPALIVE_MS);
    },
    [clearKeepAlive, isGuest]
  );

  const clearRemoteAudio = useCallback(() => {
    for (const el of audioElsRef.current.values()) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        /* ignore */
      }
    }
    audioElsRef.current.clear();
  }, []);

  const attachRemoteAudio = useCallback((identity: string, track: RemoteTrack) => {
    let el = audioElsRef.current.get(identity);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.style.display = 'none';
      document.body.appendChild(el);
      audioElsRef.current.set(identity, el);
    }
    track.attach(el);
    const play = el.play();
    if (play && typeof play.then === 'function') {
      play.catch(() => {
        if (mountedRef.current) setNeedSoundTap(true);
      });
    }
  }, []);

  const refreshTiles = useCallback((room: Room) => {
    if (!mountedRef.current) return;
    const speakers = new Set(room.activeSpeakers.map((p) => p.identity));
    const next: Tile[] = [];
    const push = (p: Participant, isLocal: boolean) => {
      const micPub = p.getTrackPublication(Track.Source.Microphone);
      const camPub = p.getTrackPublication(Track.Source.Camera);
      const sharePub = p.getTrackPublication(Track.Source.ScreenShare);
      next.push({
        identity: p.identity,
        name: displayName(p),
        isLocal,
        micOn: Boolean(micPub?.track && !micPub.isMuted),
        camOn: Boolean(camPub?.track && !camPub.isMuted),
        screenOn: Boolean(sharePub?.track && !sharePub.isMuted),
        handRaised: parseHandRaised(p.metadata),
        speaking: speakers.has(p.identity),
      });
    };
    push(room.localParticipant, true);
    const remotes = Array.from(room.remoteParticipants.values()).sort((a, b) =>
      displayName(a).localeCompare(displayName(b))
    );
    for (const r of remotes) push(r, false);
    setTiles(next);
  }, []);

  const disconnectRoom = useCallback(async () => {
    clearKeepAlive();
    const room = roomRef.current;
    roomRef.current = null;
    clearRemoteAudio();
    if (room) {
      try {
        await room.disconnect(true);
      } catch {
        /* ignore */
      }
    }
  }, [clearKeepAlive, clearRemoteAudio]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stayInHuddleRef.current = false;
      void disconnectRoom();
    };
  }, [disconnectRoom]);

  const enableSound = useCallback(async () => {
    let unlocked = true;
    for (const el of audioElsRef.current.values()) {
      try {
        await el.play();
      } catch {
        unlocked = false;
      }
    }
    if (unlocked) setNeedSoundTap(false);
  }, []);

  const connectWithToken = useCallback(
    async (tokenPayload: FamilyHuddleJoinToken) => {
      if (joinInFlightRef.current || roomRef.current) return;
      joinInFlightRef.current = true;
      userLeftRef.current = false;
      setConn('connecting');
      setError(null);
      try {
        if (!mountedRef.current) return;
        setTitle(tokenPayload.householdName || householdName || 'Family Huddle');
        setCanModerate(Boolean(tokenPayload.canModerate) && !tokenPayload.isGuest);

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        const onChange = () => refreshTiles(room);

        room
          .on(RoomEvent.ParticipantConnected, onChange)
          .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
            const el = audioElsRef.current.get(p.identity);
            if (el) {
              try {
                el.pause();
                el.srcObject = null;
                el.remove();
              } catch {
                /* ignore */
              }
              audioElsRef.current.delete(p.identity);
            }
            onChange();
          })
          .on(RoomEvent.ParticipantMetadataChanged, onChange)
          .on(RoomEvent.ActiveSpeakersChanged, onChange)
          .on(RoomEvent.TrackMuted, onChange)
          .on(RoomEvent.TrackUnmuted, onChange)
          .on(RoomEvent.LocalTrackPublished, onChange)
          .on(RoomEvent.LocalTrackUnpublished, onChange)
          .on(RoomEvent.TrackPublished, (pub) => {
            if (pub.source === Track.Source.ScreenShare && !pub.isSubscribed) {
              try {
                pub.setSubscribed(true);
              } catch {
                /* ignore */
              }
            }
            onChange();
          })
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
            if (track.kind === Track.Kind.Audio) {
              attachRemoteAudio(participant.identity, track);
            }
            onChange();
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant) => {
            if (track.kind === Track.Kind.Audio) {
              const el = audioElsRef.current.get(participant.identity);
              try {
                track.detach();
                if (el) el.srcObject = null;
              } catch {
                /* ignore */
              }
            }
            onChange();
          })
          .on(RoomEvent.Reconnected, () => {
            if (!mountedRef.current) return;
            refreshTiles(room);
          })
          .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
            if (!mountedRef.current) return;
            clearRemoteAudio();
            if (roomRef.current === room) roomRef.current = null;
            setConn('prejoin');
            setTiles([]);
            if (huddleDisconnectIsFinal(reason)) {
            setError(huddleDisconnectMessage(reason));
            return;
          }
          if (
              shouldAutoRejoinHuddle({
                stayInHuddle: stayInHuddleRef.current,
                endedForEveryone: endedForEveryoneRef.current,
                userInitiatedLeave: userLeftRef.current,
              })
            ) {
              autoRejoinTimerRef.current = setTimeout(() => {
                if (
                  shouldAutoRejoinHuddle({
                    stayInHuddle: stayInHuddleRef.current,
                    endedForEveryone: endedForEveryoneRef.current,
                    userInitiatedLeave: userLeftRef.current,
                  }) &&
                  !roomRef.current &&
                  !joinInFlightRef.current
                ) {
                  void joinRef.current();
                }
              }, HUDDLE_AUTO_REJOIN_DELAY_MS);
            }
          });

        await room.connect(tokenPayload.url, tokenPayload.token);
        if (!mountedRef.current) {
          await room.disconnect(true);
          return;
        }

        await room.localParticipant.setMicrophoneEnabled(micEnabled);
        if (camEnabled) {
          try {
            await room.localParticipant.setCameraEnabled(true);
          } catch {
            setError('Camera could not be enabled. You can still join with audio.');
          }
        }

        for (const p of room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            if (pub.kind === Track.Kind.Audio && pub.track) {
              attachRemoteAudio(p.identity, pub.track as RemoteTrack);
            }
            if (pub.source === Track.Source.ScreenShare && !pub.isSubscribed) {
              try {
                pub.setSubscribed(true);
              } catch {
                /* ignore */
              }
            }
          }
        }

        refreshTiles(room);
        setConn('connected');
        stayInHuddleRef.current = true;
        endedForEveryoneRef.current = false;
        if (!tokenPayload.isGuest) startKeepAlive(tokenPayload.expiresIn);
        setHandRaised(parseHandRaised(room.localParticipant.metadata));
      } catch (err) {
        stayInHuddleRef.current = false;
        await disconnectRoom();
        if (!mountedRef.current) return;
        const message =
          err instanceof FamilyHuddleError
            ? err.message
            : 'Could not join Family Huddle. Please try again.';
        setError(message);
        setConn('error');
      } finally {
        joinInFlightRef.current = false;
      }
    },
    [
      attachRemoteAudio,
      camEnabled,
      clearRemoteAudio,
      disconnectRoom,
      householdName,
      micEnabled,
      refreshTiles,
      startKeepAlive,
    ]
  );

  const join = useCallback(async () => {
    if (guestToken) {
      await connectWithToken(guestToken);
      return;
    }
    try {
      await ensureFreshAuthSession();
      const tokenPayload = await fetchFamilyHuddleToken();
      await connectWithToken(tokenPayload);
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof FamilyHuddleError
          ? err.message
          : 'Could not join Family Huddle. Please try again.';
      setError(message);
      setConn('error');
    }
  }, [connectWithToken, guestToken]);

  useEffect(() => {
    joinRef.current = join;
  }, [join]);

  useEffect(() => {
    if (!guestToken || autoJoinedRef.current) return;
    autoJoinedRef.current = true;
    void join();
  }, [guestToken, join]);

  const leave = useCallback(async () => {
    userLeftRef.current = true;
    stayInHuddleRef.current = false;
    await disconnectRoom();
    setConn('prejoin');
    setTiles([]);
    setHandRaised(false);
    onClose();
  }, [disconnectRoom, onClose]);

  const endForEveryone = useCallback(async () => {
    if (!canModerate || ending || isGuest) return;
    const ok = window.confirm(
      'End this Family Huddle for everyone? All participants will be disconnected.'
    );
    if (!ok) return;
    userLeftRef.current = true;
    stayInHuddleRef.current = false;
    endedForEveryoneRef.current = true;
    setEnding(true);
    setError(null);
    try {
      await endFamilyHuddle();
      await disconnectRoom();
      setConn('prejoin');
      setTiles([]);
      setHandRaised(false);
      onClose();
    } catch (err) {
      const message =
        err instanceof FamilyHuddleError
          ? err.message
          : 'Could not end Family Huddle. Please try again.';
      setError(message);
    } finally {
      setEnding(false);
    }
  }, [canModerate, disconnectRoom, ending, isGuest, onClose]);

  const ensureInvite = useCallback(async () => {
    if (invite || inviteBusy || isGuest) return invite;
    setInviteBusy(true);
    setError(null);
    try {
      const created = await createFamilyHuddleInvite();
      setInvite(created);
      return created;
    } catch (err) {
      const message =
        err instanceof FamilyHuddleError ? err.message : 'Could not create invite link.';
      setError(message);
      return null;
    } finally {
      setInviteBusy(false);
    }
  }, [invite, inviteBusy, isGuest]);

  const copyInvite = useCallback(async () => {
    const created = invite || (await ensureInvite());
    if (!created) return;
    const url = familyInviteAbsoluteUrl(created.path);
    try {
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      setError('Could not copy the link. Try sharing instead.');
    }
  }, [ensureInvite, invite]);

  const shareInvite = useCallback(async () => {
    const created = invite || (await ensureInvite());
    if (!created) return;
    const url = familyInviteAbsoluteUrl(created.path);
    const text = `Join our Family Huddle on PLCC Canaan (${inviteExpiryLabel(created.expiresAt)})`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Family Huddle', text, url });
        return;
      }
    } catch {
      /* fall through */
    }
    window.open(whatsappInviteHref(url, created.expiresAt), '_blank', 'noopener,noreferrer');
  }, [ensureInvite, invite]);

  const lockInvites = useCallback(async () => {
    if (lockBusy || isGuest || invitesLocked) return;
    setLockBusy(true);
    setError(null);
    try {
      await lockFamilyHuddleInvites();
      setInvitesLocked(true);
    } catch (err) {
      const message =
        err instanceof FamilyHuddleError ? err.message : 'Could not lock invites.';
      setError(message);
    } finally {
      setLockBusy(false);
    }
  }, [invitesLocked, isGuest, lockBusy]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      setMicEnabled((v) => !v);
      return;
    }
    const next = !micEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicEnabled(next);
      refreshTiles(room);
    } catch {
      setError('Could not change microphone.');
    }
  }, [micEnabled, refreshTiles]);

  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      setCamEnabled((v) => !v);
      return;
    }
    const next = !camEnabled;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setCamEnabled(next);
      refreshTiles(room);
    } catch {
      setError('Camera permission is required to turn video on.');
    }
  }, [camEnabled, refreshTiles]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!screenShareSupported) {
      setScreenShareError(screenBlockedHint);
      return;
    }
    if (!room) return;
    setScreenShareError(null);
    try {
      const next = !screenSharing;
      await room.localParticipant.setScreenShareEnabled(
        next,
        next ? buildScreenShareCaptureOptions() : undefined
      );
      setScreenSharing(next);
      refreshTiles(room);
    } catch (e) {
      setScreenShareError(
        e instanceof Error ? e.message : 'Could not share your screen.'
      );
    }
  }, [refreshTiles, screenBlockedHint, screenShareSupported, screenSharing]);

  const toggleHand = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const local: LocalParticipant = room.localParticipant;
    const next = !handRaised;
    try {
      await local.setMetadata(mergeHandMetadata(local.metadata, next));
      setHandRaised(next);
      refreshTiles(room);
    } catch {
      setError('Could not update hand raise.');
    }
  }, [handRaised, refreshTiles]);

  const participantFor = (identity: string): Participant | null => {
    const room = roomRef.current;
    if (!room) return null;
    if (room.localParticipant.identity === identity) return room.localParticipant;
    return room.remoteParticipants.get(identity) || null;
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col bg-[#0f0a0c] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Family Huddle"
    >
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 border-b border-white/10">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-gold">
            Family only · no recording
          </p>
          <h2 className="text-sm font-bold truncate">{title}</h2>
        </div>
        <button
          type="button"
          onClick={() => void leave()}
          className="min-h-[44px] min-w-[44px] rounded-full bg-white/10 flex items-center justify-center shrink-0"
          aria-label="Close Family Huddle"
        >
          <X size={20} aria-hidden />
        </button>
      </header>

      {needSoundTap ? (
        <button
          type="button"
          onClick={() => void enableSound()}
          className="mx-3 mt-2 flex items-center justify-center gap-2 rounded-2xl bg-gold text-burgundy font-bold text-sm min-h-[44px]"
        >
          <Volume2 size={18} aria-hidden />
          Enable sound
        </button>
      ) : null}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {conn === 'prejoin' || conn === 'error' ? (
          <div className="max-w-md mx-auto space-y-4 pt-6">
            <p className="text-sm text-white/70 text-center leading-relaxed">
              {mode === 'start'
                ? 'Start a private Family Huddle for household adults. Share a link for guests — dependents stay off video in this version.'
                : 'Join your family’s live room. Mute and camera controls are available.'}
            </p>
            {error ? (
              <p className="text-sm text-red-300 text-center font-medium">{error}</p>
            ) : null}
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => void toggleMic()}
                className={`min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center ${
                  micEnabled ? 'bg-white/15' : 'bg-burgundy'
                }`}
                aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {micEnabled ? <Mic size={22} /> : <MicOff size={22} />}
              </button>
              <button
                type="button"
                onClick={() => setCamEnabled((v) => !v)}
                className={`min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center ${
                  camEnabled ? 'bg-white/15' : 'bg-white/5'
                }`}
                aria-label={camEnabled ? 'Camera on at join' : 'Camera off at join'}
              >
                {camEnabled ? <Video size={22} /> : <VideoOff size={22} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void join()}
              className="w-full min-h-[48px] rounded-2xl bg-burgundy text-white font-bold text-base"
            >
              {mode === 'start' ? 'Start Family Huddle' : 'Join Family Huddle'}
            </button>
            <button
              type="button"
              onClick={() => void leave()}
              className="w-full min-h-[44px] text-sm text-white/60 font-medium"
            >
              Not now
            </button>
          </div>
        ) : null}

        {conn === 'connecting' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/70">
            <Loader2 className="animate-spin" size={28} aria-hidden />
            <p className="text-sm font-medium">
              {mode === 'start' ? 'Starting Family Huddle…' : 'Joining Family Huddle…'}
            </p>
          </div>
        ) : null}

        {conn === 'connected' ? (
          <ul className="grid grid-cols-2 gap-2">
            {tiles.map((tile) => {
              const participant = participantFor(tile.identity);
              return (
                <li
                  key={tile.identity}
                  className={`relative aspect-square rounded-xl overflow-hidden bg-white/10 border ${
                    tile.speaking ? 'border-gold' : 'border-white/10'
                  }`}
                >
                  {tile.camOn && participant ? (
                    <ParticipantVideo
                      participant={participant}
                      isLocal={tile.isLocal}
                      camOn={tile.camOn}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="w-10 h-10 rounded-full bg-burgundy/80 flex items-center justify-center text-base font-bold">
                        {(tile.name[0] || 'F').toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-[11px] font-bold truncate">
                      {tile.name}
                      {tile.isLocal ? ' (you)' : ''}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-white/80">
                      {tile.micOn ? <Mic size={12} /> : <MicOff size={12} />}
                      {tile.screenOn ? <Monitor size={12} className="text-gold" /> : null}
                      {tile.handRaised ? <Hand size={12} className="text-gold" /> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {conn === 'connected' ? (
        <footer className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 border-t border-white/10 space-y-2">
          {error ? <p className="text-xs text-red-300 text-center">{error}</p> : null}
          {screenShareError ? (
            <p className="text-xs text-amber-200 text-center">{screenShareError}</p>
          ) : null}

          {!isGuest ? (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
              <p className="text-[11px] text-white/60 leading-relaxed">
                Share a guest link (expires in 2 hours). Guests enter a name — they are not added
                to your household.
              </p>
              {invite ? (
                <p className="text-[11px] text-gold font-medium">
                  {inviteExpiryLabel(invite.expiresAt)} · up to {invite.maxUses} guests
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void shareInvite()}
                  disabled={inviteBusy}
                  className="flex-1 min-h-[40px] rounded-xl bg-gold text-burgundy text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Share2 size={14} aria-hidden />
                  Share
                </button>
                <button
                  type="button"
                  onClick={() => void copyInvite()}
                  disabled={inviteBusy}
                  className="flex-1 min-h-[40px] rounded-xl bg-white/10 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Copy size={14} />
                  {inviteCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void lockInvites()}
                disabled={lockBusy || invitesLocked}
                className="w-full min-h-[36px] text-[11px] font-bold text-white/70 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Lock size={12} aria-hidden />
                {invitesLocked ? 'Invites locked' : lockBusy ? 'Locking…' : 'Lock new guest joins'}
              </button>
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void toggleMic()}
              className={`min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center ${
                micEnabled ? 'bg-white/15' : 'bg-burgundy'
              }`}
              aria-label={micEnabled ? 'Mute' : 'Unmute'}
            >
              {micEnabled ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            <button
              type="button"
              onClick={() => void toggleCam()}
              className={`min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center ${
                camEnabled ? 'bg-white/15' : 'bg-white/5'
              }`}
              aria-label={camEnabled ? 'Turn camera off' : 'Turn camera on'}
            >
              {camEnabled ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
            <button
              type="button"
              onClick={() => void toggleScreenShare()}
              disabled={!screenShareSupported}
              title={!screenShareSupported ? screenBlockedHint : undefined}
              className={`min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center disabled:opacity-40 ${
                screenSharing ? 'bg-gold text-burgundy' : 'bg-white/10'
              }`}
              aria-label={
                screenShareSupported
                  ? screenSharing
                    ? 'Stop sharing screen'
                    : 'Share screen'
                  : screenBlockedHint
              }
            >
              {screenSharing ? <MonitorOff size={22} /> : <Monitor size={22} />}
            </button>
            <button
              type="button"
              onClick={() => void toggleHand()}
              className={`min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center ${
                handRaised ? 'bg-gold text-burgundy' : 'bg-white/10'
              }`}
              aria-label={handRaised ? 'Lower hand' : 'Raise hand'}
            >
              <Hand size={22} />
            </button>
            <button
              type="button"
              onClick={() => void leave()}
              className="min-h-[44px] min-w-[44px] rounded-2xl bg-red-600 flex items-center justify-center"
              aria-label="Leave Family Huddle"
            >
              <PhoneOff size={22} />
            </button>
          </div>
          {canModerate && !isGuest ? (
            <button
              type="button"
              onClick={() => void endForEveryone()}
              disabled={ending}
              className="w-full min-h-[40px] text-xs font-bold text-red-300/90 disabled:opacity-50"
            >
              {ending ? 'Ending…' : 'End Family Huddle for everyone'}
            </button>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
};
